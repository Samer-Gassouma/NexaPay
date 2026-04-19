use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
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

#[derive(Debug, Deserialize)]
pub struct RegisterDeveloperRequest {
    company_name: String,
    contact_name: String,
    email: String,
    plan: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RegisterDeveloperResponse {
    api_key: String,
    api_key_prefix: String,
    plan: String,
    call_limit: i32,
    docs_url: String,
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
    let total_developers = scalar_count(&state.pg_pool, "SELECT COUNT(*) AS count FROM developers").await;

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
    let plan = payload.plan.unwrap_or_else(|| "free".to_string());
    let call_limit = if plan == "starter" {
        10_000
    } else if plan == "pro" {
        1_000_000
    } else {
        1_000
    };

    let (api_key, api_key_hash, prefix, checksum) = create_structured_api_key("developer");
    let legacy_prefix = prefix.chars().take(8).collect::<String>();

    let dev_row = sqlx::query(
        "INSERT INTO developers (company_name, contact_name, email, api_key, api_key_prefix, plan, call_limit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id",
    )
    .bind(&payload.company_name)
    .bind(&payload.contact_name)
    .bind(&payload.email)
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
            kyc_hash: sha256_hex(payload.email.as_bytes()),
        });

        let tx = Transaction {
            id: Uuid::new_v4().to_string(),
            tx_type: TxType::DevRegister,
            from: "SYSTEM".to_string(),
            to: dev_address.clone(),
            amount: 0,
            fee: 0,
            timestamp: now_ts(),
            signature: sign_hex(&state.system_private_key, &payload.email).unwrap_or_default(),
            memo: format!("Developer registered: {}", payload.company_name),
            hash: sha256_hex(format!("dev:{}:{}", payload.email, now_ts()).as_bytes()),
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

    log_api_call(&state, None, "/dev/register", "POST", 200).await;

    Ok(Json(RegisterDeveloperResponse {
        api_key,
        api_key_prefix: prefix,
        plan,
        call_limit,
        docs_url: "https://docs.nexapay.tn".to_string(),
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
    // Allow when running in development OR when a valid developer API key is provided.
        // Allow only in development or when a valid Developer API key is provided via header.
        let app_env = std::env::var("APP_ENV").unwrap_or_default();
        if app_env != "development" {
            // header must contain a valid developer API key
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

async fn scalar_count(pool: &sqlx::PgPool, query: &str) -> i64 {
    sqlx::query(query)
        .fetch_one(pool)
        .await
        .ok()
        .and_then(|row| row.try_get::<i64, _>("count").ok())
        .unwrap_or(0)
}

fn api_error(status: StatusCode, message: &str) -> (StatusCode, Json<Value>) {
    (status, Json(json!({ "success": false, "error": message })))
}

fn format_millimes(amount: u64) -> String {
    let whole = amount / 1000;
    let frac = amount % 1000;
    let raw = format!("{}.{:03}", whole, frac);
    format!("{}", raw)
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
