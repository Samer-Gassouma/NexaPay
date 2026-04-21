use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use jwt_simple::algorithms::MACLike;
use jwt_simple::prelude::{Claims, Duration};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::account::{AccountType, ChainAccount};
use crate::api::middleware::{
    api_principal_prefix, auth_error_response, create_structured_api_key, default_permissions,
    log_api_call, permissions_to_csv, require_bank_api_key, require_api_key,
};
use crate::api::AppState;
use crate::block::{Transaction, TxType};
use crate::crypto::{address_from_public_key, generate_keypair, sha256_hex, sign_hex};

#[derive(Debug, Deserialize)]
pub struct RegisterBankRequest {
    bank_name: String,
    bank_code: String,
    contact_email: String,
    contact_name: String,
}

#[derive(Debug, Serialize)]
pub struct RegisterBankResponse {
    bank_id: String,
    chain_address: String,
    api_key: String,
    api_key_prefix: String,
    subscription: String,
    message: String,
}

#[derive(Debug, Serialize)]
pub struct AccountsThroughBankResponse {
    accounts: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct BankTransactionsResponse {
    transactions: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct NetworkStatsResponse {
    total_accounts: i64,
    total_banks: i64,
    total_developers: i64,
    total_transactions: usize,
    total_volume_tnd: String,
    chain_height: u64,
    network_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DeveloperSessionClaims {
    developer_id: String,
    email: String,
}

#[derive(Debug, Serialize)]
pub struct DeveloperPortalProfile {
    developer_id: String,
    company_name: String,
    contact_name: String,
    email: String,
    phone: Option<String>,
    plan: String,
    call_limit: i32,
    monthly_calls: i32,
    created_at: String,
}

#[derive(Debug, Serialize)]
pub struct DeveloperWorkspaceMetrics {
    merchant_count: usize,
    gross_volume: i64,
    available_balance: i64,
    today_calls: i64,
    failed_calls: i64,
}

#[derive(Debug, Serialize)]
pub struct DeveloperMerchantSummary {
    merchant_uuid: String,
    merchant_id: String,
    name: String,
    business_name: Option<String>,
    support_email: String,
    status: String,
    created_at: String,
    successful_payments: i64,
    gross_volume: i64,
    refunded_volume: i64,
    pending_volume: i64,
    available_balance: i64,
}

#[derive(Debug, Serialize)]
pub struct RegisterDeveloperResponse {
    api_key: String,
    api_key_prefix: String,
    plan: String,
    call_limit: i32,
    docs_url: String,
    session_token: String,
    developer: DeveloperPortalProfile,
}

#[derive(Debug, Serialize)]
pub struct LoginDeveloperResponse {
    success: bool,
    session_token: String,
    api_key_prefix: String,
    developer: DeveloperPortalProfile,
}

#[derive(Debug, Serialize)]
pub struct DeveloperPortalOverviewResponse {
    success: bool,
    developer: DeveloperPortalProfile,
    workspace: DeveloperWorkspaceMetrics,
    merchants: Vec<DeveloperMerchantSummary>,
}

#[derive(Debug, Serialize)]
pub struct DeveloperPortalRotateResponse {
    success: bool,
    api_key: String,
    api_key_prefix: String,
    message: String,
}

#[derive(Debug, Serialize)]
pub struct DeveloperPortalMerchantResponse {
    success: bool,
    merchant_id: String,
    merchant_uuid: String,
    api_key: String,
    api_key_prefix: String,
    checkout_base_url: String,
    status: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterDeveloperRequest {
    company_name: String,
    contact_name: String,
    email: String,
    phone: Option<String>,
    password: Option<String>,
    plan: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginDeveloperRequest {
    identifier: String,
    password: String,
}

#[derive(Debug, Deserialize)]
pub struct DeveloperPortalRegisterMerchantRequest {
    name: String,
    business_name: Option<String>,
    support_email: String,
    webhook_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DeveloperPortalRotateKeyRequest {
    name: Option<String>,
}

pub async fn register_bank(
    State(state): State<AppState>,
    Json(payload): Json<RegisterBankRequest>,
) -> Result<Json<RegisterBankResponse>, (StatusCode, Json<Value>)> {
    if payload.bank_code.len() != 2 || !payload.bank_code.chars().all(|c| c.is_ascii_digit()) {
        return Err(api_error(StatusCode::BAD_REQUEST, "bank_code must be 2 digits"));
    }

    let bank_uuid = Uuid::new_v4();
    let bank_id = bank_uuid.to_string();
    let (api_key, api_key_hash, prefix, checksum) = create_structured_api_key("bank");
    let legacy_prefix = prefix.chars().take(8).collect::<String>();
    let (_sk, pk) = generate_keypair();
    let chain_address = address_from_public_key(&pk);

    sqlx::query(
        "INSERT INTO banks (id, name, chain_address, api_key, api_key_prefix, subscription_status, bank_code, contact_email)
         VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)",
    )
    .bind(bank_uuid)
    .bind(&payload.bank_name)
    .bind(&chain_address)
    .bind(&api_key_hash)
    .bind(&legacy_prefix)
    .bind(&payload.bank_code)
    .bind(&payload.contact_email)
    .execute(&state.pg_pool)
    .await
    .map_err(|e| api_error(StatusCode::BAD_REQUEST, &format!("Bank registration failed: {e}")))?;

    let _ = sqlx::query(
        "INSERT INTO api_keys (owner_type, owner_id, name, key_hash, prefix, checksum, permissions, rate_limit_per_minute, daily_limit, status)
         VALUES ('bank', $1, 'primary', $2, $3, $4, $5, 120, 200000, 'active')",
    )
    .bind(bank_uuid)
    .bind(&api_key_hash)
    .bind(&prefix)
    .bind(&checksum)
    .bind(permissions_to_csv(&default_permissions("bank")))
    .execute(&state.pg_pool)
    .await;

    {
        let mut chain = state.chain.lock().await;
        chain.create_account(ChainAccount {
            address: chain_address.clone(),
            public_key: pk,
            balance: 0,
            tx_count: 0,
            account_type: AccountType::Bank,
            created_at: now_ts(),
            is_active: true,
            kyc_hash: sha256_hex(payload.contact_email.as_bytes()),
        });

        let tx = Transaction {
            id: Uuid::new_v4().to_string(),
            tx_type: TxType::BankJoin,
            from: "SYSTEM".to_string(),
            to: chain_address.clone(),
            amount: 0,
            fee: 0,
            timestamp: now_ts(),
            signature: sign_hex(&state.system_private_key, &chain_address).unwrap_or_default(),
            memo: format!("Bank joined: {} ({})", payload.bank_name, payload.contact_name),
            hash: sha256_hex(format!("bank:{}:{}", bank_id, now_ts()).as_bytes()),
        };
        chain.add_pending_transaction(tx.clone());
        if let Ok(block) = chain.mine_block(
            &state.validator_address,
            &state.validator_private_key,
            &state.validator_public_key,
        ) {
            let _ = state.sqlite_state.record_transaction(&tx, block.index);
        }

        if let Some(acc) = chain.get_account(&chain_address) {
            let _ = state.sqlite_state.upsert_account(
                &acc.address,
                acc.balance,
                acc.tx_count,
                &acc.account_type,
                acc.is_active,
                now_ts(),
            );
        }
    }

    log_api_call(&state, None, "/network/banks/register", "POST", 200).await;

    Ok(Json(RegisterBankResponse {
        bank_id,
        chain_address,
        api_key,
        api_key_prefix: prefix,
        subscription: "active".to_string(),
        message: "Welcome to NexaPay Network".to_string(),
    }))
}

pub async fn bank_accounts(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AccountsThroughBankResponse>, (StatusCode, Json<Value>)> {
    let principal = require_bank_api_key(&state, &headers)
        .await
        .map_err(|e| {
            let (status, _headers, body) = auth_error_response(e, "Bank API key required");
            (status, body)
        })?;

    let bank_prefix = api_principal_prefix(&principal);

    let rows = sqlx::query(
        "SELECT u.chain_address, u.full_name, b.account_number, b.iban, b.rib, u.created_at
         FROM users u
         JOIN bank_accounts b ON b.chain_address = u.chain_address
         WHERE u.created_by_api_key_prefix = $1 AND u.created_by_principal_type = 'bank'
         ORDER BY u.created_at DESC",
    )
    .bind(&bank_prefix)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let mut accounts = Vec::new();
    for row in rows {
        accounts.push(json!({
            "chain_address": row.try_get::<String, _>("chain_address").unwrap_or_default(),
            "full_name": row.try_get::<String, _>("full_name").unwrap_or_default(),
            "account_number": row.try_get::<String, _>("account_number").unwrap_or_default(),
            "iban": row.try_get::<String, _>("iban").unwrap_or_default(),
            "rib": row.try_get::<String, _>("rib").unwrap_or_default(),
            "created_at": row.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").map(|v| v.to_rfc3339()).unwrap_or_default(),
        }));
    }

    log_api_call(&state, Some(&principal), "/network/banks/accounts", "GET", 200).await;

    Ok(Json(AccountsThroughBankResponse { accounts }))
}

pub async fn bank_transactions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<BankTransactionsResponse>, (StatusCode, Json<Value>)> {
    let principal = require_bank_api_key(&state, &headers)
        .await
        .map_err(|e| {
            let (status, _headers, body) = auth_error_response(e, "Bank API key required");
            (status, body)
        })?;

    let bank_prefix = api_principal_prefix(&principal);
    let scoped_accounts = sqlx::query(
        "SELECT chain_address FROM users WHERE created_by_api_key_prefix = $1 AND created_by_principal_type = 'bank'",
    )
    .bind(&bank_prefix)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
    .into_iter()
    .filter_map(|row| row.try_get::<String, _>("chain_address").ok())
    .collect::<std::collections::HashSet<_>>();

    let chain = state.chain.lock().await;
    let mut transactions = Vec::new();
    for block in chain.blocks() {
        for tx in &block.transactions {
            if !scoped_accounts.contains(&tx.from) && !scoped_accounts.contains(&tx.to) {
                continue;
            }

            transactions.push(json!({
                "id": tx.id,
                "type": format!("{:?}", tx.tx_type),
                "from": tx.from,
                "to": tx.to,
                "amount": tx.amount,
                "memo": tx.memo,
                "timestamp": tx.timestamp,
                "block": block.index,
                "hash": tx.hash,
            }));
        }
    }

    log_api_call(
        &state,
        Some(&principal),
        "/network/banks/transactions",
        "GET",
        200,
    )
    .await;

    Ok(Json(BankTransactionsResponse { transactions }))
}

pub async fn network_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<NetworkStatsResponse>, (StatusCode, Json<Value>)> {
    let principal = require_bank_api_key(&state, &headers)
        .await
        .map_err(|e| {
            let (status, _headers, body) = auth_error_response(e, "Bank API key required");
            (status, body)
        })?;

    let total_accounts = scalar_count(&state.pg_pool, "SELECT COUNT(*) AS count FROM users").await;
    let total_banks = scalar_count(&state.pg_pool, "SELECT COUNT(*) AS count FROM banks").await;
    let total_developers =
        scalar_count(&state.pg_pool, "SELECT COUNT(*) AS count FROM developers").await;

    let chain = state.chain.lock().await;
    let total_transactions = chain.total_tx_count();
    let chain_height = chain.chain_height();

    let total_volume_millimes = chain
        .blocks()
        .iter()
        .flat_map(|b| b.transactions.iter())
        .filter(|tx| tx.tx_type == TxType::Transfer)
        .map(|tx| tx.amount)
        .sum::<u64>();

    log_api_call(&state, Some(&principal), "/network/stats", "GET", 200).await;

    Ok(Json(NetworkStatsResponse {
        total_accounts,
        total_banks,
        total_developers,
        total_transactions,
        total_volume_tnd: format_millimes(total_volume_millimes),
        chain_height,
        network_status: "healthy".to_string(),
    }))
}

pub async fn register_developer(
    State(state): State<AppState>,
    Json(payload): Json<RegisterDeveloperRequest>,
) -> Result<Json<RegisterDeveloperResponse>, (StatusCode, Json<Value>)> {
    let email = payload.email.trim().to_lowercase();
    if payload.company_name.trim().is_empty()
        || payload.contact_name.trim().is_empty()
        || email.is_empty()
    {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "company_name, contact_name, and email are required",
        ));
    }

    let phone = payload
        .phone
        .as_deref()
        .and_then(normalize_phone)
        .filter(|value| !value.is_empty());

    let password = payload.password.unwrap_or_default();
    if password.len() < 8 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "password must be at least 8 characters",
        ));
    }

    let plan = normalize_plan(payload.plan.as_deref());
    let call_limit = developer_call_limit(&plan);
    let password_hash = hash_developer_password(&password, &email, &state.encryption_key);

    let (api_key, api_key_hash, prefix, checksum) = create_structured_api_key("developer");
    let legacy_prefix = prefix.chars().take(8).collect::<String>();

    let dev_row = sqlx::query(
        "INSERT INTO developers (company_name, contact_name, email, phone, password_hash, api_key, api_key_prefix, plan, call_limit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id",
    )
    .bind(payload.company_name.trim())
    .bind(payload.contact_name.trim())
    .bind(&email)
    .bind(phone.as_deref())
    .bind(&password_hash)
    .bind(&api_key_hash)
    .bind(&legacy_prefix)
    .bind(&plan)
    .bind(call_limit)
    .fetch_one(&state.pg_pool)
    .await
    .map_err(|e| api_error(StatusCode::BAD_REQUEST, &format!("Developer registration failed: {e}")))?;

    let dev_id: Uuid = dev_row
        .try_get("id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Developer ID parse error"))?;

    let _ = sqlx::query(
        "INSERT INTO api_keys (owner_type, owner_id, name, key_hash, prefix, checksum, permissions, rate_limit_per_minute, daily_limit, status)
         VALUES ('developer', $1, 'primary', $2, $3, $4, $5, 60, $6, 'active')",
    )
    .bind(dev_id)
    .bind(&api_key_hash)
    .bind(&prefix)
    .bind(&checksum)
    .bind(permissions_to_csv(&default_permissions("developer")))
    .bind(call_limit.max(1000))
    .execute(&state.pg_pool)
    .await;

    let (_sk, pk) = generate_keypair();
    let dev_address = address_from_public_key(&pk);
    {
        let mut chain = state.chain.lock().await;
        chain.create_account(ChainAccount {
            address: dev_address.clone(),
            public_key: pk,
            balance: 0,
            tx_count: 0,
            account_type: AccountType::Developer,
            created_at: now_ts(),
            is_active: true,
            kyc_hash: sha256_hex(email.as_bytes()),
        });

        let tx = Transaction {
            id: Uuid::new_v4().to_string(),
            tx_type: TxType::DevRegister,
            from: "SYSTEM".to_string(),
            to: dev_address.clone(),
            amount: 0,
            fee: 0,
            timestamp: now_ts(),
            signature: sign_hex(&state.system_private_key, &email).unwrap_or_default(),
            memo: format!("Developer registered: {}", payload.company_name.trim()),
            hash: sha256_hex(format!("dev:{}:{}", email, now_ts()).as_bytes()),
        };
        chain.add_pending_transaction(tx.clone());
        if let Ok(block) = chain.mine_block(
            &state.validator_address,
            &state.validator_private_key,
            &state.validator_public_key,
        ) {
            let _ = state.sqlite_state.record_transaction(&tx, block.index);
        }

        if let Some(acc) = chain.get_account(&dev_address) {
            let _ = state.sqlite_state.upsert_account(
                &acc.address,
                acc.balance,
                acc.tx_count,
                &acc.account_type,
                acc.is_active,
                now_ts(),
            );
        }
    }

    let developer = load_developer_profile(&state, dev_id).await?;
    let session_token = issue_developer_session_token(&state, dev_id, &email)?;

    log_api_call(&state, None, "/dev/register", "POST", 200).await;

    Ok(Json(RegisterDeveloperResponse {
        api_key,
        api_key_prefix: prefix,
        plan,
        call_limit,
        docs_url: "https://docs.nexapay.tn".to_string(),
        session_token,
        developer,
    }))
}

pub async fn login_developer(
    State(state): State<AppState>,
    Json(payload): Json<LoginDeveloperRequest>,
) -> Result<Json<LoginDeveloperResponse>, (StatusCode, Json<Value>)> {
    let identifier = payload.identifier.trim();
    if identifier.is_empty() || payload.password.trim().is_empty() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "identifier and password are required",
        ));
    }

    let normalized_phone = normalize_phone(identifier);
    let row = sqlx::query(
        "SELECT id, email, password_hash
         FROM developers
         WHERE is_active = TRUE
           AND (LOWER(email) = LOWER($1) OR ($2::varchar IS NOT NULL AND phone = $2))
         LIMIT 1",
    )
    .bind(identifier)
    .bind(normalized_phone.as_deref())
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = row.ok_or_else(|| api_error(StatusCode::UNAUTHORIZED, "Invalid developer login"))?;
    let developer_id: Uuid = row
        .try_get("id")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Developer ID parse error"))?;
    let email: String = row
        .try_get("email")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Developer email parse error"))?;
    let stored_password_hash: Option<String> = row.try_get("password_hash").ok();

    if stored_password_hash.as_deref().unwrap_or_default().is_empty() {
        return Err(api_error(
            StatusCode::FORBIDDEN,
            "Password login is not configured for this developer",
        ));
    }

    let provided_hash =
        hash_developer_password(payload.password.trim(), &email, &state.encryption_key);
    if stored_password_hash.unwrap_or_default() != provided_hash {
        return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid developer login"));
    }

    let developer = load_developer_profile(&state, developer_id).await?;
    let session_token = issue_developer_session_token(&state, developer_id, &email)?;
    let api_key_prefix = active_developer_api_key_prefix(&state, developer_id).await;

    Ok(Json(LoginDeveloperResponse {
        success: true,
        session_token,
        api_key_prefix,
        developer,
    }))
}

pub async fn developer_portal_overview(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DeveloperPortalOverviewResponse>, (StatusCode, Json<Value>)> {
    let (developer_id, prefix) = require_developer_session(&state, &headers).await?;
    let developer = load_developer_profile(&state, developer_id).await?;

    let rows = sqlx::query(
        "SELECT id, merchant_code, name, business_name, support_email, status, created_at
         FROM merchants
         WHERE owner_type = 'developer' AND owner_id = $1
         ORDER BY created_at DESC",
    )
    .bind(developer_id)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let mut merchants = Vec::new();
    let mut gross_total = 0i64;
    let mut available_total = 0i64;

    for row in rows {
        let merchant_uuid: Uuid = row
            .try_get("id")
            .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Merchant row error"))?;

        let gross_volume = sum_amount_by_uuid(
            &state.pg_pool,
            "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payment_intents WHERE merchant_id = $1 AND status IN ('succeeded', 'partially_refunded', 'refunded')",
            merchant_uuid,
        )
        .await;
        let refunded_volume = sum_amount_by_uuid(
            &state.pg_pool,
            "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM refunds WHERE merchant_id = $1 AND status = 'succeeded'",
            merchant_uuid,
        )
        .await;
        let pending_volume = sum_amount_by_uuid(
            &state.pg_pool,
            "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payment_intents WHERE merchant_id = $1 AND status = 'requires_confirmation'",
            merchant_uuid,
        )
        .await;
        let payouts = sum_amount_by_uuid(
            &state.pg_pool,
            "SELECT COALESCE(SUM(amount), 0)::BIGINT AS amount FROM payouts WHERE merchant_id = $1 AND status IN ('queued', 'processing', 'paid')",
            merchant_uuid,
        )
        .await;
        let successful_payments = scalar_count_by_uuid(
            &state.pg_pool,
            "SELECT COUNT(*) AS count FROM payment_intents WHERE merchant_id = $1 AND status = 'succeeded'",
            merchant_uuid,
        )
        .await;

        let available_balance = (gross_volume - refunded_volume - payouts).max(0);
        gross_total += gross_volume;
        available_total += available_balance;

        merchants.push(DeveloperMerchantSummary {
            merchant_uuid: merchant_uuid.to_string(),
            merchant_id: row.try_get::<String, _>("merchant_code").unwrap_or_default(),
            name: row.try_get::<String, _>("name").unwrap_or_default(),
            business_name: row.try_get::<Option<String>, _>("business_name").ok().flatten(),
            support_email: row.try_get::<String, _>("support_email").unwrap_or_default(),
            status: row
                .try_get::<String, _>("status")
                .unwrap_or_else(|_| "active".to_string()),
            created_at: row
                .try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")
                .map(|value| value.to_rfc3339())
                .unwrap_or_default(),
            successful_payments,
            gross_volume,
            refunded_volume,
            pending_volume,
            available_balance,
        });
    }

    let today_calls = scalar_count_by_prefix(
        &state.pg_pool,
        "SELECT COUNT(*) AS count FROM api_logs WHERE api_key_prefix = $1 AND called_at::date = NOW()::date",
        &prefix,
    )
    .await;
    let failed_calls = scalar_count_by_prefix(
        &state.pg_pool,
        "SELECT COUNT(*) AS count FROM api_logs WHERE api_key_prefix = $1 AND status_code >= 400 AND called_at::date = NOW()::date",
        &prefix,
    )
    .await;

    Ok(Json(DeveloperPortalOverviewResponse {
        success: true,
        developer,
        workspace: DeveloperWorkspaceMetrics {
            merchant_count: merchants.len(),
            gross_volume: gross_total,
            available_balance: available_total,
            today_calls,
            failed_calls,
        },
        merchants,
    }))
}

pub async fn developer_portal_register_merchant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<DeveloperPortalRegisterMerchantRequest>,
) -> Result<Json<DeveloperPortalMerchantResponse>, (StatusCode, Json<Value>)> {
    let (developer_id, _prefix) = require_developer_session(&state, &headers).await?;

    if payload.name.trim().is_empty() || payload.support_email.trim().is_empty() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "name and support_email are required",
        ));
    }

    let merchant_uuid = Uuid::new_v4();
    let merchant_code = format!("mrc_{}", &sha256_hex(merchant_uuid.as_bytes())[..12]);
    let (merchant_key, merchant_hash, merchant_prefix, checksum) =
        create_structured_api_key("merchant");

    sqlx::query(
        "INSERT INTO merchants (id, merchant_code, owner_type, owner_id, name, business_name, support_email, status)
         VALUES ($1, $2, 'developer', $3, $4, $5, $6, 'active')",
    )
    .bind(merchant_uuid)
    .bind(&merchant_code)
    .bind(developer_id)
    .bind(payload.name.trim())
    .bind(payload.business_name.as_deref())
    .bind(payload.support_email.trim())
    .execute(&state.pg_pool)
    .await
    .map_err(|e| api_error(StatusCode::BAD_REQUEST, &format!("merchant registration failed: {e}")))?;

    sqlx::query(
        "INSERT INTO api_keys (owner_type, owner_id, name, key_hash, prefix, checksum, permissions, rate_limit_per_minute, daily_limit, status)
         VALUES ('merchant', $1, 'primary', $2, $3, $4, $5, 90, 30000, 'active')",
    )
    .bind(merchant_uuid)
    .bind(&merchant_hash)
    .bind(&merchant_prefix)
    .bind(&checksum)
    .bind(permissions_to_csv(&default_permissions("merchant")))
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "failed to store merchant API key"))?;

    if let Some(webhook_url) = payload.webhook_url {
        if !webhook_url.trim().is_empty() {
            let secret = format!(
                "whsec_{}",
                &sha256_hex(format!("{}:{}", merchant_code, now_ts()).as_bytes())[..24]
            );
            let _ = sqlx::query(
                "INSERT INTO webhooks (merchant_id, url, event_types, signing_secret, is_active)
                 VALUES ($1, $2, $3, $4, TRUE)",
            )
            .bind(merchant_uuid)
            .bind(webhook_url.trim())
            .bind("payment_intent.succeeded,payment_intent.failed,payment_intent.refunded,payout.created")
            .bind(secret)
            .execute(&state.pg_pool)
            .await;
        }
    }

    Ok(Json(DeveloperPortalMerchantResponse {
        success: true,
        merchant_id: merchant_code,
        merchant_uuid: merchant_uuid.to_string(),
        api_key: merchant_key,
        api_key_prefix: merchant_prefix,
        checkout_base_url: format!("{}/checkout", state.portal_base_url),
        status: "active".to_string(),
    }))
}

pub async fn developer_portal_rotate_key(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<DeveloperPortalRotateKeyRequest>,
) -> Result<Json<DeveloperPortalRotateResponse>, (StatusCode, Json<Value>)> {
    let (developer_id, _prefix) = require_developer_session(&state, &headers).await?;
    let (new_key, new_hash, new_prefix, checksum) = create_structured_api_key("developer");
    let legacy_prefix = new_prefix.chars().take(8).collect::<String>();
    let key_name = payload.name.unwrap_or_else(|| "primary".to_string());
    let call_limit = load_developer_call_limit(&state, developer_id).await;

    let _ = sqlx::query(
        "UPDATE api_keys
         SET status = 'revoked', revoked_at = NOW(), rotated_at = NOW()
         WHERE owner_type = 'developer' AND owner_id = $1 AND status = 'active'",
    )
    .bind(developer_id)
    .execute(&state.pg_pool)
    .await;

    sqlx::query(
        "INSERT INTO api_keys (owner_type, owner_id, name, key_hash, prefix, checksum, permissions, rate_limit_per_minute, daily_limit, status)
         VALUES ('developer', $1, $2, $3, $4, $5, $6, 60, $7, 'active')",
    )
    .bind(developer_id)
    .bind(&key_name)
    .bind(&new_hash)
    .bind(&new_prefix)
    .bind(&checksum)
    .bind(permissions_to_csv(&default_permissions("developer")))
    .bind(call_limit.max(1000))
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to rotate developer API key"))?;

    let _ = sqlx::query("UPDATE developers SET api_key = $1, api_key_prefix = $2 WHERE id = $3")
        .bind(&new_hash)
        .bind(&legacy_prefix)
        .bind(developer_id)
        .execute(&state.pg_pool)
        .await;

    Ok(Json(DeveloperPortalRotateResponse {
        success: true,
        api_key: new_key,
        api_key_prefix: new_prefix,
        message: "Developer API key rotated successfully".to_string(),
    }))
}

#[derive(Debug, Deserialize)]
pub struct RepairAccountRequest {
    pub address: String,
    pub balance: Option<u64>,
}

pub async fn repair_account(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(payload): Json<RepairAccountRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let app_env = std::env::var("APP_ENV").unwrap_or_default();
    if app_env != "development" {
        if let Ok(principal) = require_api_key(&state, &headers).await {
            if !matches!(principal, crate::api::middleware::ApiPrincipal::Developer { .. }) {
                return Err((StatusCode::FORBIDDEN, Json(json!({"success": false, "error": "Forbidden"}))));
            }
        } else {
            return Err((StatusCode::FORBIDDEN, Json(json!({"success": false, "error": "Forbidden"}))));
        }
    }

    if payload.address.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, Json(json!({"success": false, "error": "address required"}))));
    }

    let initial = payload.balance.unwrap_or(0u64);

    {
        let mut chain = state.chain.lock().await;
        chain.create_account(ChainAccount {
            address: payload.address.clone(),
            public_key: String::new(),
            balance: initial,
            tx_count: 0,
            account_type: AccountType::User,
            created_at: now_ts(),
            is_active: true,
            kyc_hash: String::new(),
        });

        let tx = Transaction {
            id: Uuid::new_v4().to_string(),
            tx_type: TxType::AccountCreate,
            from: "SYSTEM".to_string(),
            to: payload.address.clone(),
            amount: initial,
            fee: 0,
            timestamp: now_ts(),
            signature: sign_hex(&state.system_private_key, &payload.address).unwrap_or_default(),
            memo: "Repair account created by dev tool".to_string(),
            hash: sha256_hex(format!("repair:{}:{}", payload.address, now_ts()).as_bytes()),
        };

        chain.add_pending_transaction(tx.clone());
        if let Ok(block) = chain.mine_block(
            &state.validator_address,
            &state.validator_private_key,
            &state.validator_public_key,
        ) {
            let _ = state.sqlite_state.record_transaction(&tx, block.index);
        }

        if let Some(acc) = chain.get_account(&payload.address) {
            let _ = state.sqlite_state.upsert_account(
                &acc.address,
                acc.balance,
                acc.tx_count,
                &acc.account_type,
                acc.is_active,
                now_ts(),
            );
        }
    }

    log_api_call(&state, None, "/dev/repair_account", "POST", 200).await;

    Ok(Json(json!({"success": true, "address": payload.address})))
}

async fn require_developer_session(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<(Uuid, String), (StatusCode, Json<Value>)> {
    let token = headers
        .get("X-Developer-Token")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string())
        .ok_or_else(|| api_error(StatusCode::UNAUTHORIZED, "X-Developer-Token header is required"))?;

    let claims = state
        .jwt_key
        .verify_token::<DeveloperSessionClaims>(&token, None)
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Invalid developer session"))?;

    let developer_id = Uuid::parse_str(&claims.custom.developer_id)
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Invalid developer session"))?;

    let prefix = active_developer_api_key_prefix(state, developer_id).await;
    Ok((developer_id, prefix))
}

fn issue_developer_session_token(
    state: &AppState,
    developer_id: Uuid,
    email: &str,
) -> Result<String, (StatusCode, Json<Value>)> {
    let claims = Claims::with_custom_claims(
        DeveloperSessionClaims {
            developer_id: developer_id.to_string(),
            email: email.to_string(),
        },
        Duration::from_hours(24 * 14),
    );

    state
        .jwt_key
        .authenticate(claims)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to issue developer session"))
}

async fn load_developer_profile(
    state: &AppState,
    developer_id: Uuid,
) -> Result<DeveloperPortalProfile, (StatusCode, Json<Value>)> {
    let row = sqlx::query(
        "SELECT id, company_name, contact_name, email, phone, plan, call_limit, monthly_calls, created_at
         FROM developers
         WHERE id = $1 AND is_active = TRUE
         LIMIT 1",
    )
    .bind(developer_id)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?
    .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "Developer not found"))?;

    Ok(DeveloperPortalProfile {
        developer_id: row.try_get::<Uuid, _>("id").map(|value| value.to_string()).unwrap_or_default(),
        company_name: row.try_get::<String, _>("company_name").unwrap_or_default(),
        contact_name: row.try_get::<String, _>("contact_name").unwrap_or_default(),
        email: row.try_get::<String, _>("email").unwrap_or_default(),
        phone: row.try_get::<Option<String>, _>("phone").ok().flatten(),
        plan: row.try_get::<String, _>("plan").unwrap_or_else(|_| "free".to_string()),
        call_limit: row.try_get::<i32, _>("call_limit").unwrap_or(1000),
        monthly_calls: row.try_get::<i32, _>("monthly_calls").unwrap_or(0),
        created_at: row
            .try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")
            .map(|value| value.to_rfc3339())
            .unwrap_or_default(),
    })
}

async fn active_developer_api_key_prefix(state: &AppState, developer_id: Uuid) -> String {
    sqlx::query(
        "SELECT prefix
         FROM api_keys
         WHERE owner_type = 'developer' AND owner_id = $1 AND status = 'active'
         ORDER BY created_at DESC
         LIMIT 1",
    )
    .bind(developer_id)
    .fetch_optional(&state.pg_pool)
    .await
    .ok()
    .flatten()
    .and_then(|row| row.try_get::<String, _>("prefix").ok())
    .unwrap_or_else(|| "nxp_developer".to_string())
}

async fn load_developer_call_limit(state: &AppState, developer_id: Uuid) -> i32 {
    sqlx::query("SELECT call_limit FROM developers WHERE id = $1 LIMIT 1")
        .bind(developer_id)
        .fetch_optional(&state.pg_pool)
        .await
        .ok()
        .flatten()
        .and_then(|row| row.try_get::<i32, _>("call_limit").ok())
        .unwrap_or(1000)
}

async fn scalar_count(pool: &sqlx::PgPool, query: &str) -> i64 {
    sqlx::query(query)
        .fetch_one(pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("count").ok())
        .unwrap_or(0)
}

async fn scalar_count_by_prefix(pool: &sqlx::PgPool, query: &str, prefix: &str) -> i64 {
    sqlx::query(query)
        .bind(prefix)
        .fetch_one(pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("count").ok())
        .unwrap_or(0)
}

async fn scalar_count_by_uuid(pool: &sqlx::PgPool, query: &str, owner_id: Uuid) -> i64 {
    sqlx::query(query)
        .bind(owner_id)
        .fetch_one(pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("count").ok())
        .unwrap_or(0)
}

async fn sum_amount_by_uuid(pool: &sqlx::PgPool, query: &str, owner_id: Uuid) -> i64 {
    sqlx::query(query)
        .bind(owner_id)
        .fetch_one(pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("amount").ok())
        .unwrap_or(0)
}

fn normalize_phone(raw: &str) -> Option<String> {
    let digits = raw.chars().filter(|c| c.is_ascii_digit()).collect::<String>();
    if digits.len() == 8 {
        return Some(format!("216{digits}"));
    }
    if (10..=15).contains(&digits.len()) {
        return Some(digits);
    }
    None
}

fn normalize_plan(raw: Option<&str>) -> String {
    match raw.unwrap_or("starter").trim().to_lowercase().as_str() {
        "pro" => "pro".to_string(),
        "free" => "free".to_string(),
        _ => "starter".to_string(),
    }
}

fn developer_call_limit(plan: &str) -> i32 {
    if plan == "pro" {
        1_000_000
    } else if plan == "starter" {
        10_000
    } else {
        1_000
    }
}

fn hash_developer_password(password: &str, email: &str, pepper: &str) -> String {
    sha256_hex(
        format!("developer-password:{}:{}:{}", email.trim().to_lowercase(), password, pepper)
            .as_bytes(),
    )
}

fn api_error(status: StatusCode, message: &str) -> (StatusCode, Json<Value>) {
    (status, Json(json!({ "success": false, "error": message })))
}

fn format_millimes(amount: u64) -> String {
    let whole = amount / 1000;
    let frac = amount % 1000;
    format!("{whole}.{frac:03}")
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
