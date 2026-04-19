use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::api::middleware::{
    api_principal_kind, auth_error_response, create_structured_api_key, has_permission,
    log_api_call, permissions_to_csv, require_api_key, try_api_key, ApiPrincipal,
};
use crate::api::AppState;
use crate::crypto::sha256_hex;

#[derive(Debug, Deserialize)]
pub struct RegisterMerchantRequest {
    pub name: String,
    pub business_name: Option<String>,
    pub support_email: String,
    pub webhook_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateIntentRequest {
    pub amount: u64,
    pub currency: Option<String>,
    pub description: Option<String>,
    pub customer_email: Option<String>,
    pub customer_name: Option<String>,
    pub metadata: Option<Value>,
    pub idempotency_key: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ConfirmIntentRequest {
    pub card_number: String,
    pub expiry_month: String,
    pub expiry_year: String,
    pub cvv: String,
    pub pin: String,
    pub card_holder_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RefundRequest {
    pub intent_id: String,
    pub amount: Option<u64>,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PayoutRequest {
    pub amount: u64,
    pub destination: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateWebhookRequest {
    pub url: String,
    pub event_types: Option<Vec<String>>,
}

pub async fn register_merchant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RegisterMerchantRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if matches!(principal, ApiPrincipal::Merchant { .. }) {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "Merchant keys cannot register new merchants",
        ));
    }

    if !has_permission(&principal, "merchant:register") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This API key cannot register merchants",
        ));
    }

    if payload.name.trim().is_empty() || payload.support_email.trim().is_empty() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "name and support_email are required",
        ));
    }

    let merchant_uuid = Uuid::new_v4();
    let merchant_code = format!("mrc_{}", &sha256_hex(merchant_uuid.as_bytes())[..12]);
    let owner_type = api_principal_kind(&principal).to_string();
    let owner_id = crate::api::middleware::api_principal_owner_id(&principal);

    sqlx::query(
        "INSERT INTO merchants (id, merchant_code, owner_type, owner_id, name, business_name, support_email, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')",
    )
    .bind(merchant_uuid)
    .bind(&merchant_code)
    .bind(&owner_type)
    .bind(owner_id)
    .bind(&payload.name)
    .bind(&payload.business_name)
    .bind(&payload.support_email)
    .execute(&state.pg_pool)
    .await
    .map_err(|e| api_error(StatusCode::BAD_REQUEST, &format!("merchant registration failed: {e}")))?;

    let (merchant_key, merchant_hash, merchant_prefix, checksum) = create_structured_api_key("merchant");
    let permissions = vec![
        "intents:write".to_string(),
        "intents:read".to_string(),
        "refunds:write".to_string(),
        "balance:read".to_string(),
        "transactions:read".to_string(),
        "payouts:write".to_string(),
        "webhooks:manage".to_string(),
        "api_keys:manage".to_string(),
    ];

    sqlx::query(
        "INSERT INTO api_keys (owner_type, owner_id, name, key_hash, prefix, checksum, permissions, rate_limit_per_minute, daily_limit, status)
         VALUES ('merchant', $1, 'primary', $2, $3, $4, $5, 90, 30000, 'active')",
    )
    .bind(merchant_uuid)
    .bind(&merchant_hash)
    .bind(&merchant_prefix)
    .bind(&checksum)
    .bind(permissions_to_csv(&permissions))
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "failed to store merchant API key"))?;

    if let Some(webhook_url) = payload.webhook_url {
        if !webhook_url.trim().is_empty() {
            let secret = format!("whsec_{}", &sha256_hex(format!("{}:{}", merchant_code, now_ts()).as_bytes())[..24]);
            let event_types = "payment_intent.succeeded,payment_intent.failed,payment_intent.refunded,payout.created";
            let _ = sqlx::query(
                "INSERT INTO webhooks (merchant_id, url, event_types, signing_secret, is_active)
                 VALUES ($1, $2, $3, $4, TRUE)",
            )
            .bind(merchant_uuid)
            .bind(&webhook_url)
            .bind(event_types)
            .bind(secret)
            .execute(&state.pg_pool)
            .await;
        }
    }

    log_api_call(&state, Some(&principal), "/gateway/v1/merchants/register", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "merchant_id": merchant_code,
        "merchant_uuid": merchant_uuid,
        "api_key": merchant_key,
        "api_key_prefix": merchant_prefix,
        "checkout_base_url": format!("{}/checkout", state.portal_base_url),
        "status": "active"
    })))
}

pub async fn merchant_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    let merchant_id = merchant_id_from_principal(&principal)?;

    let successful = scalar_by_uuid(
        &state,
        "SELECT COUNT(*) AS count FROM payment_intents WHERE merchant_id = $1 AND status IN ('succeeded', 'partially_refunded', 'refunded')",
        merchant_id,
    )
    .await;
    let failed = scalar_by_uuid(
        &state,
        "SELECT COUNT(*) AS count FROM payment_intents WHERE merchant_id = $1 AND status = 'failed'",
        merchant_id,
    )
    .await;
    let pending = scalar_by_uuid(
        &state,
        "SELECT COUNT(*) AS count FROM payment_intents WHERE merchant_id = $1 AND status = 'requires_confirmation'",
        merchant_id,
    )
    .await;

    let gross = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payment_intents WHERE merchant_id = $1 AND status IN ('succeeded', 'partially_refunded', 'refunded')",
        merchant_id,
    )
    .await;
    let refunded = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM refunds WHERE merchant_id = $1 AND status = 'succeeded'",
        merchant_id,
    )
    .await;
    let payouts = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payouts WHERE merchant_id = $1 AND status IN ('queued', 'processing', 'paid')",
        merchant_id,
    )
    .await;

    log_api_call(&state, Some(&principal), "/gateway/v1/merchants/stats", "GET", 200).await;

    Ok(Json(json!({
        "success": true,
        "payments": {
            "succeeded": successful,
            "failed": failed,
            "pending": pending
        },
        "totals": {
            "gross": gross,
            "refunded": refunded,
            "available": (gross - refunded - payouts).max(0)
        }
    })))
}

pub async fn create_intent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateIntentRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "intents:write") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot create intents",
        ));
    }

    let merchant_id = merchant_id_from_principal(&principal)?;

    if payload.amount == 0 {
        return Err(api_error(StatusCode::BAD_REQUEST, "Amount must be greater than 0"));
    }

    if let Some(idempotency_key) = payload.idempotency_key.as_ref() {
        if let Ok(Some(row)) = sqlx::query(
            "SELECT intent_id, amount, currency, status, description, created_at
             FROM payment_intents WHERE merchant_id = $1 AND idempotency_key = $2 LIMIT 1",
        )
        .bind(merchant_id)
        .bind(idempotency_key)
        .fetch_optional(&state.pg_pool)
        .await
        {
            let intent_id: String = row.try_get("intent_id").unwrap_or_default();
            let amount: i64 = row.try_get("amount").unwrap_or(0);
            let currency: String = row.try_get("currency").unwrap_or_else(|_| "TND".to_string());
            let status: String = row.try_get("status").unwrap_or_else(|_| "requires_confirmation".to_string());
            let description: Option<String> = row.try_get("description").ok();

            return Ok(Json(json!({
                "success": true,
                "intent_id": intent_id,
                "amount": amount,
                "currency": currency,
                "status": status,
                "description": description,
                "checkout_url": format!("{}/checkout/{}", state.portal_base_url, intent_id),
                "reused": true
            })));
        }
    }

    let intent_id = format!("pi_{}", &sha256_hex(format!("{}:{}", Uuid::new_v4(), now_ts()).as_bytes())[..16]);
    let currency = payload.currency.unwrap_or_else(|| "TND".to_string()).to_uppercase();

    sqlx::query(
        "INSERT INTO payment_intents (intent_id, merchant_id, amount, currency, status, description, customer_email, customer_name, metadata, idempotency_key, payment_method)
         VALUES ($1, $2, $3, $4, 'requires_confirmation', $5, $6, $7, $8, $9, 'card')",
    )
    .bind(&intent_id)
    .bind(merchant_id)
    .bind(payload.amount as i64)
    .bind(&currency)
    .bind(payload.description)
    .bind(payload.customer_email)
    .bind(payload.customer_name)
    .bind(payload.metadata)
    .bind(payload.idempotency_key)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create payment intent"))?;

    log_api_call(&state, Some(&principal), "/gateway/v1/intents", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "intent_id": intent_id,
        "status": "requires_confirmation",
        "amount": payload.amount,
        "currency": currency,
        "checkout_url": format!("{}/checkout/{}", state.portal_base_url, intent_id),
        "client_secret": sha256_hex(format!("{}:{}", intent_id, merchant_id).as_bytes())
    })))
}

pub async fn get_intent(
    State(state): State<AppState>,
    Path(intent_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "intents:read") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot read intents",
        ));
    }

    let merchant_id = merchant_id_from_principal(&principal)?;

    let row = sqlx::query(
        "SELECT intent_id, amount, currency, status, description, customer_email, customer_name, card_last4, card_brand, failure_reason, created_at, confirmed_at
         FROM payment_intents WHERE intent_id = $1 AND merchant_id = $2 LIMIT 1",
    )
    .bind(&intent_id)
    .bind(merchant_id)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::NOT_FOUND, "Payment intent not found")),
    };

    log_api_call(&state, Some(&principal), "/gateway/v1/intents/:intent_id", "GET", 200).await;

    Ok(Json(json!({
        "success": true,
        "intent_id": row.try_get::<String, _>("intent_id").unwrap_or_default(),
        "amount": row.try_get::<i64, _>("amount").unwrap_or(0),
        "currency": row.try_get::<String, _>("currency").unwrap_or_else(|_| "TND".to_string()),
        "status": row.try_get::<String, _>("status").unwrap_or_else(|_| "unknown".to_string()),
        "description": row.try_get::<Option<String>, _>("description").ok().flatten(),
        "customer_email": row.try_get::<Option<String>, _>("customer_email").ok().flatten(),
        "customer_name": row.try_get::<Option<String>, _>("customer_name").ok().flatten(),
        "card_last4": row.try_get::<Option<String>, _>("card_last4").ok().flatten(),
        "card_brand": row.try_get::<Option<String>, _>("card_brand").ok().flatten(),
        "failure_reason": row.try_get::<Option<String>, _>("failure_reason").ok().flatten(),
        "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").map(|v| v.to_rfc3339()).ok(),
        "confirmed_at": row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("confirmed_at").ok().flatten().map(|v| v.to_rfc3339())
    })))
}

pub async fn confirm_intent(
    State(state): State<AppState>,
    Path(intent_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<ConfirmIntentRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let optional_principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    let request_ip = extract_request_ip(&headers);
    enforce_confirm_attempt_limit(&state, &request_ip).await?;

    let row = sqlx::query(
        "SELECT id, merchant_id, amount, currency, status, description, customer_email
         FROM payment_intents WHERE intent_id = $1 LIMIT 1",
    )
    .bind(&intent_id)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::NOT_FOUND, "Payment intent not found")),
    };

    let intent_uuid: Uuid = row
        .try_get("id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid intent row"))?;
    let merchant_id: Uuid = row
        .try_get("merchant_id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid intent owner"))?;
    let status: String = row
        .try_get("status")
        .unwrap_or_else(|_| "requires_confirmation".to_string());

    if let Some(principal) = optional_principal.as_ref() {
        if let ApiPrincipal::Merchant {
            merchant_id: principal_merchant,
            ..
        } = principal
        {
            if principal_merchant != &merchant_id {
                return Err(api_error(StatusCode::FORBIDDEN, "Intent does not belong to this merchant"));
            }
        }
    }

    if status == "succeeded" {
        return Ok(Json(json!({
            "success": true,
            "intent_id": intent_id,
            "status": status,
            "redirect_url": format!("{}/payment/success?intent_id={}&status=succeeded", state.portal_base_url, intent_id)
        })));
    }

    if status == "refunded" {
        return Err(api_error(StatusCode::BAD_REQUEST, "Intent already refunded"));
    }

    let card_number_clean = payload.card_number.replace(' ', "");
    let card_valid = is_luhn_valid(&card_number_clean)
        && payload.cvv.len() >= 3
        && payload.pin.len() == 4
        && payload.pin.chars().all(|c| c.is_ascii_digit());

    let card_last4 = card_number_clean
        .chars()
        .rev()
        .take(4)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();

    let card_brand = if card_number_clean.starts_with('4') {
        "visa"
    } else if card_number_clean.starts_with('5') {
        "mastercard"
    } else {
        "unknown"
    };

    let test_card_result = evaluate_test_card(&card_number_clean, &payload.pin);
    let approved = test_card_result.unwrap_or(
        card_valid
            && card_number_clean.len() >= 15
            && payload.pin != "0000"
            && payload.expiry_month.parse::<u32>().ok().map(|m| (1..=12).contains(&m)).unwrap_or(false)
            && payload.expiry_year.len() == 4
            && payload.card_holder_name.clone().unwrap_or_default().trim().len() >= 3,
    );

    let final_status = if approved { "succeeded" } else { "failed" };
    let failure_reason = if approved {
        None
    } else {
        if test_card_result == Some(false) {
            Some("test_card_forced_decline")
        } else {
            Some("card_validation_failed_or_pin_declined")
        }
    };

    sqlx::query(
        "UPDATE payment_intents
         SET status = $1,
             card_last4 = $2,
             card_brand = $3,
             failure_reason = $4,
             confirm_attempts = confirm_attempts + 1,
             confirmed_at = CASE WHEN $1 = 'succeeded' THEN NOW() ELSE confirmed_at END,
             updated_at = NOW()
         WHERE id = $5",
    )
    .bind(final_status)
    .bind(card_last4)
    .bind(card_brand)
    .bind(failure_reason)
    .bind(intent_uuid)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update intent"))?;

    let event_type = if approved {
        "payment_intent.succeeded"
    } else {
        "payment_intent.failed"
    };

    let payload_json = json!({
        "id": intent_id,
        "event": event_type,
        "status": final_status,
        "merchant_id": merchant_id,
        "amount": row.try_get::<i64, _>("amount").unwrap_or(0),
        "currency": row.try_get::<String, _>("currency").unwrap_or_else(|_| "TND".to_string()),
        "description": row.try_get::<Option<String>, _>("description").ok().flatten(),
        "customer_email": row.try_get::<Option<String>, _>("customer_email").ok().flatten()
    });

    dispatch_webhooks(&state, merchant_id, event_type, payload_json).await;

    let endpoint = "/gateway/v1/intents/:intent_id/confirm";
    log_api_call(
        &state,
        optional_principal.as_ref(),
        endpoint,
        "POST",
        if approved { 200 } else { 402 },
    )
    .await;

    let redirect_status = if approved { "succeeded" } else { "failed" };

    Ok(Json(json!({
        "success": approved,
        "intent_id": intent_id,
        "status": final_status,
        "failure_reason": failure_reason,
        "redirect_url": format!("{}/payment/success?intent_id={}&status={}", state.portal_base_url, intent_id, redirect_status)
    })))
}

pub async fn create_refund(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RefundRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "refunds:write") {
        return Err(api_error(StatusCode::FORBIDDEN, "This key cannot issue refunds"));
    }

    let merchant_id = merchant_id_from_principal(&principal)?;

    let row = sqlx::query(
        "SELECT id, amount, status FROM payment_intents WHERE intent_id = $1 AND merchant_id = $2 LIMIT 1",
    )
    .bind(&payload.intent_id)
    .bind(merchant_id)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::NOT_FOUND, "Intent not found")),
    };

    let intent_uuid: Uuid = row
        .try_get("id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Intent row error"))?;
    let original_amount = row.try_get::<i64, _>("amount").unwrap_or(0).max(0) as u64;
    let status: String = row.try_get("status").unwrap_or_default();

    if status != "succeeded" && status != "partially_refunded" {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Only succeeded intents can be refunded",
        ));
    }

    let already_refunded = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM refunds WHERE intent_id = $1::uuid AND status = 'succeeded'",
        intent_uuid,
    )
    .await
    .max(0) as u64;

    let refundable = original_amount.saturating_sub(already_refunded);
    if refundable == 0 {
        return Err(api_error(StatusCode::BAD_REQUEST, "Intent is fully refunded"));
    }

    let refund_amount = payload.amount.unwrap_or(refundable);
    if refund_amount == 0 || refund_amount > refundable {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Refund amount exceeds refundable balance",
        ));
    }

    let refund_id = format!("rf_{}", &sha256_hex(format!("{}:{}", payload.intent_id, now_ts()).as_bytes())[..16]);

    sqlx::query(
        "INSERT INTO refunds (refund_id, intent_id, merchant_id, amount, reason, status)
         VALUES ($1, $2, $3, $4, $5, 'succeeded')",
    )
    .bind(&refund_id)
    .bind(intent_uuid)
    .bind(merchant_id)
    .bind(refund_amount as i64)
    .bind(payload.reason)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create refund"))?;

    let new_total_refunded = already_refunded + refund_amount;
    let new_status = if new_total_refunded >= original_amount {
        "refunded"
    } else {
        "partially_refunded"
    };

    sqlx::query("UPDATE payment_intents SET status = $1, updated_at = NOW() WHERE id = $2")
        .bind(new_status)
        .bind(intent_uuid)
        .execute(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update intent status"))?;

    dispatch_webhooks(
        &state,
        merchant_id,
        "payment_intent.refunded",
        json!({
            "intent_id": payload.intent_id,
            "refund_id": refund_id,
            "amount": refund_amount,
            "status": new_status
        }),
    )
    .await;

    log_api_call(&state, Some(&principal), "/gateway/v1/refunds", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "refund_id": refund_id,
        "intent_id": payload.intent_id,
        "amount": refund_amount,
        "status": "succeeded",
        "intent_status": new_status
    })))
}

pub async fn gateway_balance(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "balance:read") {
        return Err(api_error(StatusCode::FORBIDDEN, "This key cannot read balance"));
    }

    let merchant_id = merchant_id_from_principal(&principal)?;

    let gross = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payment_intents WHERE merchant_id = $1 AND status IN ('succeeded', 'partially_refunded', 'refunded')",
        merchant_id,
    )
    .await;
    let refunded = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM refunds WHERE merchant_id = $1 AND status = 'succeeded'",
        merchant_id,
    )
    .await;
    let payouts = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payouts WHERE merchant_id = $1 AND status IN ('queued', 'processing', 'paid')",
        merchant_id,
    )
    .await;

    let pending = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payment_intents WHERE merchant_id = $1 AND status = 'requires_confirmation'",
        merchant_id,
    )
    .await;

    log_api_call(&state, Some(&principal), "/gateway/v1/balance", "GET", 200).await;

    Ok(Json(json!({
        "success": true,
        "currency": "TND",
        "gross": gross,
        "refunded": refunded,
        "payouts": payouts,
        "pending": pending,
        "available": (gross - refunded - payouts).max(0)
    })))
}

pub async fn gateway_transactions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "transactions:read") && !has_permission(&principal, "intents:read") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot read transactions",
        ));
    }

    let merchant_id = merchant_id_from_principal(&principal)?;

    let intents_rows = sqlx::query(
        "SELECT intent_id, amount, currency, status, description, created_at
         FROM payment_intents
         WHERE merchant_id = $1
         ORDER BY created_at DESC
         LIMIT 50",
    )
    .bind(merchant_id)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let intents = intents_rows
        .into_iter()
        .map(|row| {
            json!({
                "type": "intent",
                "id": row.try_get::<String, _>("intent_id").unwrap_or_default(),
                "amount": row.try_get::<i64, _>("amount").unwrap_or(0),
                "currency": row.try_get::<String, _>("currency").unwrap_or_else(|_| "TND".to_string()),
                "status": row.try_get::<String, _>("status").unwrap_or_else(|_| "unknown".to_string()),
                "description": row.try_get::<Option<String>, _>("description").ok().flatten(),
                "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").map(|d| d.to_rfc3339()).ok()
            })
        })
        .collect::<Vec<_>>();

    let refunds_rows = sqlx::query(
        "SELECT refund_id, amount, status, reason, created_at
         FROM refunds
         WHERE merchant_id = $1
         ORDER BY created_at DESC
         LIMIT 50",
    )
    .bind(merchant_id)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let refunds = refunds_rows
        .into_iter()
        .map(|row| {
            json!({
                "type": "refund",
                "id": row.try_get::<String, _>("refund_id").unwrap_or_default(),
                "amount": row.try_get::<i64, _>("amount").unwrap_or(0),
                "status": row.try_get::<String, _>("status").unwrap_or_else(|_| "unknown".to_string()),
                "reason": row.try_get::<Option<String>, _>("reason").ok().flatten(),
                "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").map(|d| d.to_rfc3339()).ok()
            })
        })
        .collect::<Vec<_>>();

    log_api_call(&state, Some(&principal), "/gateway/v1/transactions", "GET", 200).await;

    Ok(Json(json!({
        "success": true,
        "intents": intents,
        "refunds": refunds
    })))
}

pub async fn gateway_payout(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<PayoutRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "payouts:write") {
        return Err(api_error(StatusCode::FORBIDDEN, "This key cannot create payouts"));
    }

    let merchant_id = merchant_id_from_principal(&principal)?;

    if payload.amount == 0 || payload.destination.trim().is_empty() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "amount and destination are required",
        ));
    }

    let gross = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payment_intents WHERE merchant_id = $1 AND status IN ('succeeded', 'partially_refunded', 'refunded')",
        merchant_id,
    )
    .await;
    let refunded = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM refunds WHERE merchant_id = $1 AND status = 'succeeded'",
        merchant_id,
    )
    .await;
    let pending_payouts = sum_amount_by_uuid(
        &state,
        "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payouts WHERE merchant_id = $1 AND status IN ('queued', 'processing', 'paid')",
        merchant_id,
    )
    .await;
    let available = (gross - refunded - pending_payouts).max(0) as u64;

    if payload.amount > available {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Insufficient available balance for payout",
        ));
    }

    let payout_id = format!("po_{}", &sha256_hex(format!("{}:{}", merchant_id, now_ts()).as_bytes())[..16]);

    sqlx::query(
        "INSERT INTO payouts (payout_id, merchant_id, amount, destination, status)
         VALUES ($1, $2, $3, $4, 'queued')",
    )
    .bind(&payout_id)
    .bind(merchant_id)
    .bind(payload.amount as i64)
    .bind(&payload.destination)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create payout"))?;

    dispatch_webhooks(
        &state,
        merchant_id,
        "payout.created",
        json!({
            "payout_id": payout_id,
            "amount": payload.amount,
            "destination": payload.destination,
            "status": "queued"
        }),
    )
    .await;

    log_api_call(&state, Some(&principal), "/gateway/v1/payout", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "payout_id": payout_id,
        "status": "queued",
        "amount": payload.amount
    })))
}

pub async fn create_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateWebhookRequest>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "webhooks:manage") {
        return Err(api_error(StatusCode::FORBIDDEN, "This key cannot manage webhooks"));
    }

    let merchant_id = merchant_id_from_principal(&principal)?;

    if !payload.url.starts_with("http://") && !payload.url.starts_with("https://") {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "webhook URL must start with http:// or https://",
        ));
    }

    let event_types = payload
        .event_types
        .unwrap_or_else(|| {
            vec![
                "payment_intent.succeeded".to_string(),
                "payment_intent.failed".to_string(),
                "payment_intent.refunded".to_string(),
                "payout.created".to_string(),
            ]
        })
        .join(",");

    let secret = format!(
        "whsec_{}",
        &sha256_hex(format!("{}:{}:{}", merchant_id, payload.url, now_ts()).as_bytes())[..24]
    );

    let row = sqlx::query(
        "INSERT INTO webhooks (merchant_id, url, event_types, signing_secret, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING id",
    )
    .bind(merchant_id)
    .bind(&payload.url)
    .bind(&event_types)
    .bind(&secret)
    .fetch_one(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create webhook"))?;

    let webhook_id: Uuid = row
        .try_get("id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to parse webhook ID"))?;

    log_api_call(&state, Some(&principal), "/gateway/v1/webhooks", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "id": webhook_id,
        "url": payload.url,
        "event_types": event_types.split(',').collect::<Vec<_>>(),
        "signing_secret": secret
    })))
}

pub async fn list_webhooks(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "webhooks:manage") {
        return Err(api_error(StatusCode::FORBIDDEN, "This key cannot view webhooks"));
    }

    let merchant_id = merchant_id_from_principal(&principal)?;

    let rows = sqlx::query(
        "SELECT id, url, event_types, is_active, created_at
         FROM webhooks
         WHERE merchant_id = $1
         ORDER BY created_at DESC",
    )
    .bind(merchant_id)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let webhooks = rows
        .into_iter()
        .map(|row| {
            json!({
                "id": row.try_get::<Uuid, _>("id").map(|v| v.to_string()).unwrap_or_default(),
                "url": row.try_get::<String, _>("url").unwrap_or_default(),
                "event_types": row.try_get::<String, _>("event_types").unwrap_or_default().split(',').map(|s| s.to_string()).collect::<Vec<_>>(),
                "is_active": row.try_get::<bool, _>("is_active").unwrap_or(false),
                "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").map(|v| v.to_rfc3339()).ok()
            })
        })
        .collect::<Vec<_>>();

    log_api_call(&state, Some(&principal), "/gateway/v1/webhooks", "GET", 200).await;

    Ok(Json(json!({
        "success": true,
        "webhooks": webhooks
    })))
}

pub async fn webhook_deliveries(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "webhooks:manage") {
        return Err(api_error(StatusCode::FORBIDDEN, "This key cannot view webhook deliveries"));
    }

    let merchant_id = merchant_id_from_principal(&principal)?;
    let webhook_uuid = Uuid::parse_str(&id)
        .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Invalid webhook ID"))?;

    ensure_webhook_ownership(&state, merchant_id, webhook_uuid).await?;

    let rows = sqlx::query(
        "SELECT event_type, response_status, response_body, success, attempt, delivered_at
         FROM webhook_deliveries
         WHERE webhook_id = $1
         ORDER BY delivered_at DESC
         LIMIT 100",
    )
    .bind(webhook_uuid)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let deliveries = rows
        .into_iter()
        .map(|row| {
            json!({
                "event_type": row.try_get::<String, _>("event_type").unwrap_or_default(),
                "response_status": row.try_get::<Option<i32>, _>("response_status").ok().flatten(),
                "response_body": row.try_get::<Option<String>, _>("response_body").ok().flatten(),
                "success": row.try_get::<bool, _>("success").unwrap_or(false),
                "attempt": row.try_get::<i32, _>("attempt").unwrap_or(1),
                "delivered_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("delivered_at").map(|v| v.to_rfc3339()).ok()
            })
        })
        .collect::<Vec<_>>();

    log_api_call(
        &state,
        Some(&principal),
        "/gateway/v1/webhooks/:id/deliveries",
        "GET",
        200,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "deliveries": deliveries
    })))
}

pub async fn test_webhook(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "webhooks:manage") {
        return Err(api_error(StatusCode::FORBIDDEN, "This key cannot test webhooks"));
    }

    let merchant_id = merchant_id_from_principal(&principal)?;
    let webhook_uuid = Uuid::parse_str(&id)
        .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Invalid webhook ID"))?;

    let webhook = sqlx::query(
        "SELECT id, url, signing_secret FROM webhooks WHERE id = $1 AND merchant_id = $2 AND is_active = TRUE LIMIT 1",
    )
    .bind(webhook_uuid)
    .bind(merchant_id)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let webhook = match webhook {
        Some(row) => row,
        None => return Err(api_error(StatusCode::NOT_FOUND, "Webhook not found")),
    };

    let url: String = webhook.try_get("url").unwrap_or_default();
    let signing_secret: String = webhook.try_get("signing_secret").unwrap_or_default();

    let event_payload = json!({
        "id": format!("evt_{}", &sha256_hex(format!("{}:{}", webhook_uuid, now_ts()).as_bytes())[..12]),
        "event": "webhook.test",
        "created_at": chrono::Utc::now().to_rfc3339(),
        "message": "NexaPay webhook test delivery"
    });

    let delivery = send_webhook(
        &state,
        webhook_uuid,
        &url,
        "webhook.test",
        &signing_secret,
        &event_payload,
    )
    .await;

    log_api_call(&state, Some(&principal), "/gateway/v1/webhooks/:id/test", "POST", 200).await;

    Ok(Json(json!({
        "success": true,
        "delivery": delivery
    })))
}

pub async fn delete_webhook(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "webhooks:manage") {
        return Err(api_error(StatusCode::FORBIDDEN, "This key cannot delete webhooks"));
    }

    let merchant_id = merchant_id_from_principal(&principal)?;
    let webhook_uuid = Uuid::parse_str(&id)
        .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Invalid webhook ID"))?;

    let affected = sqlx::query(
        "UPDATE webhooks SET is_active = FALSE WHERE id = $1 AND merchant_id = $2",
    )
    .bind(webhook_uuid)
    .bind(merchant_id)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
    .rows_affected();

    if affected == 0 {
        return Err(api_error(StatusCode::NOT_FOUND, "Webhook not found"));
    }

    log_api_call(
        &state,
        Some(&principal),
        "/gateway/v1/webhooks/:id",
        "DELETE",
        200,
    )
    .await;

    Ok(Json(json!({
        "success": true,
        "deleted": id
    })))
}

pub async fn dev_docs_snippets(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    if !has_permission(&principal, "dev:docs") && !has_permission(&principal, "merchant:register") {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "This key cannot access developer snippets",
        ));
    }

    log_api_call(&state, Some(&principal), "/dev/docs/snippets", "GET", 200).await;

    Ok(Json(json!({
        "success": true,
        "snippets": {
            "create_intent_curl": "curl -X POST '$API/gateway/v1/intents' -H 'X-API-Key: <merchant_key>' -H 'Content-Type: application/json' -d '{\"amount\":42000,\"currency\":\"TND\",\"description\":\"Order #42\"}'",
            "confirm_intent_curl": "curl -X POST '$API/gateway/v1/intents/pi_xxx/confirm' -H 'Content-Type: application/json' -d '{\"card_number\":\"4242424242424242\",\"expiry_month\":\"12\",\"expiry_year\":\"2029\",\"cvv\":\"123\",\"pin\":\"1234\",\"card_holder_name\":\"Nexa Customer\"}'",
            "test_cards": [
                {
                    "card_number": "4242424242424242",
                    "pin": "1234",
                    "result": "success"
                },
                {
                    "card_number": "5555555555554444",
                    "pin": "1234",
                    "result": "success"
                },
                {
                    "card_number": "4000000000000002",
                    "pin": "1234",
                    "result": "declined"
                }
            ],
            "webhook_signature_note": "Verify signature with SHA256(secret + '.' + raw_body) and compare with X-NexaPay-Signature",
            "checkout_url_pattern": format!("{}/checkout/{{intent_id}}", state.portal_base_url)
        }
    })))
}

fn evaluate_test_card(card_number: &str, pin: &str) -> Option<bool> {
    if card_number == "4242424242424242" {
        return Some(pin == "1234");
    }
    if card_number == "5555555555554444" {
        return Some(pin == "1234");
    }
    if card_number == "4000000000000002" {
        return Some(false);
    }
    None
}

fn merchant_id_from_principal(principal: &ApiPrincipal) -> Result<Uuid, (StatusCode, HeaderMap, Json<Value>)> {
    match principal {
        ApiPrincipal::Merchant { merchant_id, .. } => Ok(*merchant_id),
        _ => Err(api_error(
            StatusCode::FORBIDDEN,
            "Merchant API key required",
        )),
    }
}

async fn ensure_webhook_ownership(
    state: &AppState,
    merchant_id: Uuid,
    webhook_id: Uuid,
) -> Result<(), (StatusCode, HeaderMap, Json<Value>)> {
    let row = sqlx::query("SELECT 1 FROM webhooks WHERE id = $1 AND merchant_id = $2 LIMIT 1")
        .bind(webhook_id)
        .bind(merchant_id)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    if row.is_none() {
        return Err(api_error(StatusCode::NOT_FOUND, "Webhook not found"));
    }

    Ok(())
}

async fn dispatch_webhooks(state: &AppState, merchant_id: Uuid, event_type: &str, payload: Value) {
    let rows = sqlx::query(
        "SELECT id, url, signing_secret FROM webhooks WHERE merchant_id = $1 AND is_active = TRUE",
    )
    .bind(merchant_id)
    .fetch_all(&state.pg_pool)
    .await;

    let Ok(rows) = rows else {
        return;
    };

    for row in rows {
        let webhook_id: Uuid = match row.try_get("id") {
            Ok(v) => v,
            Err(_) => continue,
        };
        let url: String = row.try_get("url").unwrap_or_default();
        let secret: String = row.try_get("signing_secret").unwrap_or_default();
        let _ = send_webhook(state, webhook_id, &url, event_type, &secret, &payload).await;
    }
}

async fn send_webhook(
    state: &AppState,
    webhook_id: Uuid,
    url: &str,
    event_type: &str,
    secret: &str,
    payload: &Value,
) -> Value {
    let body = serde_json::to_string(payload).unwrap_or_else(|_| "{}".to_string());
    let signature = sha256_hex(format!("{}.{}", secret, body).as_bytes());

    let result = state
        .http_client
        .post(url)
        .header("content-type", "application/json")
        .header("x-nexapay-event", event_type)
        .header("x-nexapay-signature", &signature)
        .body(body.clone())
        .send()
        .await;

    let (response_status, response_body, success) = match result {
        Ok(response) => {
            let status = response.status().as_u16() as i32;
            let text = response
                .text()
                .await
                .unwrap_or_else(|_| "<unable to read response body>".to_string());
            let ok = (200..300).contains(&status);
            (Some(status), Some(truncate_response(&text)), ok)
        }
        Err(err) => (None, Some(truncate_response(&err.to_string())), false),
    };

    let _ = sqlx::query(
        "INSERT INTO webhook_deliveries (webhook_id, event_type, payload, request_signature, response_status, response_body, success, attempt)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1)",
    )
    .bind(webhook_id)
    .bind(event_type)
    .bind(payload)
    .bind(&signature)
    .bind(response_status)
    .bind(response_body.clone())
    .bind(success)
    .execute(&state.pg_pool)
    .await;

    json!({
        "event_type": event_type,
        "response_status": response_status,
        "response_body": response_body,
        "success": success
    })
}

fn truncate_response(raw: &str) -> String {
    if raw.len() <= 1000 {
        return raw.to_string();
    }
    format!("{}...", &raw[..1000])
}

fn extract_request_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .or_else(|| headers.get("x-real-ip"))
        .and_then(|value| value.to_str().ok())
        .and_then(|raw| raw.split(',').next())
        .map(|ip| ip.trim().to_string())
        .filter(|ip| !ip.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

async fn enforce_confirm_attempt_limit(
    state: &AppState,
    ip: &str,
) -> Result<(), (StatusCode, HeaderMap, Json<Value>)> {
    let now = chrono::Utc::now().timestamp();
    let mut map = state.confirm_ip_attempts.lock().await;
    let entry = map.entry(ip.to_string()).or_default();
    entry.retain(|ts| now - *ts <= 300);

    if entry.len() >= 20 {
        return Err(api_error(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many confirmation attempts from this IP",
        ));
    }

    entry.push(now);
    Ok(())
}

async fn scalar_by_uuid(state: &AppState, query: &str, merchant_id: Uuid) -> i64 {
    sqlx::query(query)
        .bind(merchant_id)
        .fetch_one(&state.pg_pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("count").ok())
        .unwrap_or(0)
}

async fn sum_amount_by_uuid(state: &AppState, query: &str, merchant_id: Uuid) -> i64 {
    sqlx::query(query)
        .bind(merchant_id)
        .fetch_one(&state.pg_pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("amount").ok())
        .unwrap_or(0)
}

fn is_luhn_valid(number: &str) -> bool {
    if number.len() < 12 || !number.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }

    let mut sum = 0u32;
    let mut double = false;
    for ch in number.chars().rev() {
        let mut digit = ch.to_digit(10).unwrap_or(0);
        if double {
            digit *= 2;
            if digit > 9 {
                digit -= 9;
            }
        }
        sum += digit;
        double = !double;
    }

    sum % 10 == 0
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn api_error(status: StatusCode, message: &str) -> (StatusCode, HeaderMap, Json<Value>) {
    (
        status,
        HeaderMap::new(),
        Json(json!({ "success": false, "error": message })),
    )
}
