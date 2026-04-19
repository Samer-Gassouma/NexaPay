use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::api::middleware::{
    auth_error_response, log_api_call, require_account_token, try_api_key,
};
use crate::api::AppState;
use crate::block::{Transaction, TxType};
use crate::crypto::{decrypt_aes256_gcm, sha256_hex, sign_hex};

#[derive(Debug, Serialize)]
pub struct AccountDetailsResponse {
    chain_address: String,
    full_name: String,
    cin: String,
    balance: u64,
    balance_display: String,
    account_number: String,
    rib: String,
    iban: String,
    card_last4: String,
    card_expiry: String,
    cvv: String,
    tx_count: u64,
    created_at: String,
}

#[derive(Debug, Serialize)]
pub struct TransactionListResponse {
    transactions: Vec<TransactionView>,
}

#[derive(Debug, Serialize)]
pub struct TransactionView {
    id: String,
    #[serde(rename = "type")]
    tx_type: String,
    direction: String,
    amount: u64,
    amount_display: String,
    from: String,
    to: String,
    memo: String,
    timestamp: String,
    block: u64,
    hash: String,
}

#[derive(Debug, Deserialize)]
pub struct TransferRequest {
    to: String,
    amount: u64,
    memo: Option<String>,
    pin: String,
}

#[derive(Debug, Deserialize)]
pub struct SearchAccountsQuery {
    q: String,
}

#[derive(Debug, Serialize)]
pub struct SearchAccountsResponse {
    results: Vec<SearchAccountItem>,
}

#[derive(Debug, Serialize)]
pub struct SearchAccountItem {
    chain_address: String,
    full_name: String,
    cin: String,
    phone: String,
}

#[derive(Debug, Serialize)]
pub struct PublicAccountResponse {
    chain_address: String,
    full_name: String,
    account_number_masked: String,
    iban_masked: String,
}

#[derive(Debug, Deserialize)]
pub struct CardWalletPayRequest {
    amount: u64,
    card_number: String,
    expiry_month: String,
    expiry_year: String,
    cvv: String,
    pin: String,
    card_holder_name: Option<String>,
    memo: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CardWalletPayResponse {
    success: bool,
    status: String,
    recipient: String,
    amount: u64,
    amount_display: String,
    tx_hash: Option<String>,
    block: Option<u64>,
    recipient_balance: Option<u64>,
    failure_reason: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TransferResponse {
    success: bool,
    tx_hash: String,
    block: u64,
    new_balance: u64,
}

pub async fn get_public_account(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Result<Json<PublicAccountResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    if !is_valid_address(&address) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid address"));
    }

    let row = sqlx::query(
        "SELECT u.full_name, b.account_number, b.iban
         FROM users u
         JOIN bank_accounts b ON b.chain_address = u.chain_address
         WHERE u.chain_address = $1
         LIMIT 1",
    )
    .bind(&address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::NOT_FOUND, "Account not found")),
    };

    Ok(Json(PublicAccountResponse {
        chain_address: address,
        full_name: row.try_get::<String, _>("full_name").unwrap_or_else(|_| "Unknown".to_string()),
        account_number_masked: mask_tail(&row.try_get::<String, _>("account_number").unwrap_or_default(), 4),
        iban_masked: mask_tail(&row.try_get::<String, _>("iban").unwrap_or_default(), 4),
    }))
}

pub async fn get_account(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<AccountDetailsResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let row = sqlx::query(
        "SELECT u.full_name, u.cin, u.created_at, b.account_number, b.rib, b.iban, c.card_number, c.expiry_month, c.expiry_year, c.cvv
         FROM users u
         JOIN bank_accounts b ON b.chain_address = u.chain_address
         JOIN cards c ON c.chain_address = u.chain_address
         WHERE u.chain_address = $1",
    )
    .bind(&address)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::NOT_FOUND, "Account not found")),
    };

    let full_name: String = row.try_get("full_name").unwrap_or_else(|_| "Unknown".to_string());
    let cin: String = row.try_get("cin").unwrap_or_default();
    let created_at: chrono::DateTime<chrono::Utc> = row
        .try_get("created_at")
        .unwrap_or_else(|_| chrono::Utc::now());
    let account_number: String = row.try_get("account_number").unwrap_or_default();
    let rib: String = row.try_get("rib").unwrap_or_default();
    let iban: String = row.try_get("iban").unwrap_or_default();
    let encrypted_card: String = row.try_get("card_number").unwrap_or_default();
    let encrypted_cvv: String = row.try_get("cvv").unwrap_or_default();
    let expiry_month: String = row.try_get("expiry_month").unwrap_or_else(|_| "01".to_string());
    let expiry_year: String = row.try_get("expiry_year").unwrap_or_else(|_| "2029".to_string());

    let card_number = decrypt_aes256_gcm(&state.encryption_key, &encrypted_card).unwrap_or_default();
    let cvv = decrypt_aes256_gcm(&state.encryption_key, &encrypted_cvv).unwrap_or_else(|_| "***".to_string());
    let card_last4 = if card_number.len() >= 4 {
        card_number[card_number.len() - 4..].to_string()
    } else {
        "0000".to_string()
    };

    let chain = state.chain.lock().await;
    let chain_account = chain
        .get_account(&address)
        .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "On-chain account not found"))?;

    log_api_call(&state, principal.as_ref(), "/accounts/:address", "GET", 200).await;

    Ok(Json(AccountDetailsResponse {
        chain_address: address,
        full_name,
        cin,
        balance: chain_account.balance,
        balance_display: format_millimes(chain_account.balance),
        account_number,
        rib,
        iban,
        card_last4,
        card_expiry: format!("{}/{}", expiry_month, &expiry_year[2..]),
        cvv,
        tx_count: chain_account.tx_count,
        created_at: created_at.to_rfc3339(),
    }))
}

pub async fn get_account_transactions(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<TransactionListResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let chain = state.chain.lock().await;
    let mut transactions = Vec::new();

    for block in chain.blocks() {
        for tx in &block.transactions {
            if tx.from == address || tx.to == address {
                transactions.push(TransactionView {
                    id: tx.id.clone(),
                    tx_type: format!("{:?}", tx.tx_type),
                    direction: if tx.to == address {
                        "credit".to_string()
                    } else {
                        "debit".to_string()
                    },
                    amount: tx.amount,
                    amount_display: format_millimes(tx.amount),
                    from: tx.from.clone(),
                    to: tx.to.clone(),
                    memo: tx.memo.clone(),
                    timestamp: ts_to_rfc3339(tx.timestamp),
                    block: block.index,
                    hash: tx.hash.clone(),
                });
            }
        }
    }

    log_api_call(&state, principal.as_ref(), "/accounts/:address/transactions", "GET", 200).await;

    Ok(Json(TransactionListResponse { transactions }))
}

pub async fn search_accounts(
    State(state): State<AppState>,
    Path(address): Path<String>,
    Query(query): Query<SearchAccountsQuery>,
    headers: HeaderMap,
) -> Result<Json<SearchAccountsResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let needle = query.q.trim();
    if needle.len() < 2 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Search query must contain at least 2 characters",
        ));
    }

    let like_pattern = format!("%{}%", needle.to_lowercase());
    let numeric_pattern = format!("%{}%", needle);

    let rows = sqlx::query(
        "SELECT chain_address, full_name, cin, phone
         FROM users
         WHERE chain_address <> $1
           AND (
               LOWER(full_name) LIKE $2
               OR cin LIKE $3
               OR phone LIKE $3
           )
         ORDER BY full_name ASC
         LIMIT 20",
    )
    .bind(&address)
    .bind(&like_pattern)
    .bind(&numeric_pattern)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let results = rows
        .into_iter()
        .map(|row| SearchAccountItem {
            chain_address: row.try_get::<String, _>("chain_address").unwrap_or_default(),
            full_name: row.try_get::<String, _>("full_name").unwrap_or_default(),
            cin: row.try_get::<String, _>("cin").unwrap_or_default(),
            phone: row.try_get::<String, _>("phone").unwrap_or_default(),
        })
        .collect::<Vec<_>>();

    log_api_call(&state, principal.as_ref(), "/accounts/:address/search", "GET", 200).await;

    Ok(Json(SearchAccountsResponse { results }))
}

pub async fn transfer(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<TransferRequest>,
) -> Result<Json<TransferResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    if !is_valid_address(&payload.to) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid recipient address"));
    }
    if payload.amount == 0 {
        return Err(api_error(StatusCode::BAD_REQUEST, "Amount must be positive"));
    }
    if payload.pin.len() != 4 || !payload.pin.chars().all(|c| c.is_ascii_digit()) {
        return Err(api_error(StatusCode::BAD_REQUEST, "PIN must be 4 digits"));
    }

    let fee = 10u64;
    let tx_hash = sha256_hex(format!("{}{}{}{}", address, payload.to, payload.amount, now_ts()).as_bytes());

    let mut chain = state.chain.lock().await;
    let from_balance = chain
        .get_account(&address)
        .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "Sender account not found"))?
        .balance;
    if chain.get_account(&payload.to).is_none() {
        return Err(api_error(StatusCode::NOT_FOUND, "Recipient account not found"));
    }
    if from_balance < payload.amount.saturating_add(fee) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Insufficient balance"));
    }

    let tx = Transaction {
        id: Uuid::new_v4().to_string(),
        tx_type: TxType::Transfer,
        from: address.clone(),
        to: payload.to.clone(),
        amount: payload.amount,
        fee,
        timestamp: now_ts(),
        signature: sign_hex(&state.system_private_key, &tx_hash).unwrap_or_default(),
        memo: payload.memo.unwrap_or_default(),
        hash: tx_hash.clone(),
    };

    chain.add_pending_transaction(tx.clone());
    let block = chain
        .mine_block(
            &state.validator_address,
            &state.validator_private_key,
            &state.validator_public_key,
        )
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to append block"))?;

    let new_balance = chain
        .get_account(&address)
        .map(|a| a.balance)
        .unwrap_or(from_balance);

    if let Some(from_acc) = chain.get_account(&address) {
        let _ = state.sqlite_state.upsert_account(
            &from_acc.address,
            from_acc.balance,
            from_acc.tx_count,
            &from_acc.account_type,
            from_acc.is_active,
            now_ts(),
        );
    }
    if let Some(to_acc) = chain.get_account(&payload.to) {
        let _ = state.sqlite_state.upsert_account(
            &to_acc.address,
            to_acc.balance,
            to_acc.tx_count,
            &to_acc.account_type,
            to_acc.is_active,
            now_ts(),
        );
    }

    let _ = state.sqlite_state.record_transaction(&tx, block.index);

    log_api_call(&state, principal.as_ref(), "/accounts/:address/transfer", "POST", 200).await;

    Ok(Json(TransferResponse {
        success: true,
        tx_hash,
        block: block.index,
        new_balance,
    }))
}

pub async fn pay_wallet_by_card(
    State(state): State<AppState>,
    Path(address): Path<String>,
    Json(payload): Json<CardWalletPayRequest>,
) -> Result<Json<CardWalletPayResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    if !is_valid_address(&address) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid recipient address"));
    }

    if payload.amount == 0 {
        return Err(api_error(StatusCode::BAD_REQUEST, "Amount must be greater than 0"));
    }

    let card_number_clean = payload.card_number.replace(' ', "");
    let card_valid = is_luhn_valid(&card_number_clean)
        && payload.cvv.len() >= 3
        && payload.pin.len() == 4
        && payload.pin.chars().all(|c| c.is_ascii_digit());

    let test_card_result = evaluate_test_card(&card_number_clean, &payload.pin);
    let approved = test_card_result.unwrap_or(
        card_valid
            && card_number_clean.len() >= 15
            && payload.pin != "0000"
            && payload
                .expiry_month
                .parse::<u32>()
                .ok()
                .map(|m| (1..=12).contains(&m))
                .unwrap_or(false)
            && payload.expiry_year.len() == 4
            && payload
                .card_holder_name
                .clone()
                .unwrap_or_default()
                .trim()
                .len()
                >= 3,
    );

    if !approved {
        return Ok(Json(CardWalletPayResponse {
            success: false,
            status: "failed".to_string(),
            recipient: address,
            amount: payload.amount,
            amount_display: format_millimes(payload.amount),
            tx_hash: None,
            block: None,
            recipient_balance: None,
            failure_reason: if test_card_result == Some(false) {
                Some("test_card_forced_decline".to_string())
            } else {
                Some("card_validation_failed_or_pin_declined".to_string())
            },
        }));
    }

    let tx_hash = sha256_hex(
        format!("{}:{}:{}:{}", address, payload.amount, payload.pin, now_ts()).as_bytes(),
    );

    let tx = Transaction {
        id: Uuid::new_v4().to_string(),
        tx_type: TxType::Transfer,
        from: "SYSTEM".to_string(),
        to: address.clone(),
        amount: payload.amount,
        fee: 0,
        timestamp: now_ts(),
        signature: sign_hex(&state.system_private_key, &tx_hash).unwrap_or_default(),
        memo: payload
            .memo
            .unwrap_or_else(|| "Wallet payment via card checkout".to_string()),
        hash: tx_hash.clone(),
    };

    let mut chain = state.chain.lock().await;
    if chain.get_account(&address).is_none() {
        return Err(api_error(StatusCode::NOT_FOUND, "Recipient account not found"));
    }

    chain.add_pending_transaction(tx.clone());
    let block = chain
        .mine_block(
            &state.validator_address,
            &state.validator_private_key,
            &state.validator_public_key,
        )
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to append block"))?;

    let recipient_balance = chain.get_account(&address).map(|a| a.balance).unwrap_or(0);

    if let Some(acc) = chain.get_account(&address) {
        let _ = state.sqlite_state.upsert_account(
            &acc.address,
            acc.balance,
            acc.tx_count,
            &acc.account_type,
            acc.is_active,
            now_ts(),
        );
    }
    let _ = state.sqlite_state.record_transaction(&tx, block.index);

    log_api_call(&state, None, "/wallets/:address/pay-by-card", "POST", 200).await;

    Ok(Json(CardWalletPayResponse {
        success: true,
        status: "succeeded".to_string(),
        recipient: address,
        amount: payload.amount,
        amount_display: format_millimes(payload.amount),
        tx_hash: Some(tx_hash),
        block: Some(block.index),
        recipient_balance: Some(recipient_balance),
        failure_reason: None,
    }))
}

fn is_valid_address(address: &str) -> bool {
    Regex::new(r"^NXP[a-f0-9]{32}$")
        .map(|re| re.is_match(address))
        .unwrap_or(false)
}

fn format_millimes(amount: u64) -> String {
    let whole = amount / 1000;
    let frac = amount % 1000;
    format!("{}.{:03} TND", whole, frac)
}

fn api_error(status: StatusCode, message: &str) -> (StatusCode, HeaderMap, Json<Value>) {
    (status, HeaderMap::new(), Json(json!({ "success": false, "error": message })))
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn ts_to_rfc3339(ts: u64) -> String {
    chrono::DateTime::<chrono::Utc>::from_timestamp(ts as i64, 0)
        .unwrap_or_else(chrono::Utc::now)
        .to_rfc3339()
}

fn evaluate_test_card(card_number: &str, pin: &str) -> Option<bool> {
    match (card_number, pin) {
        ("4242424242424242", "1234") => Some(true),
        ("5555555555554444", "1234") => Some(true),
        ("4000000000000002", "1234") => Some(false),
        _ => None,
    }
}

fn is_luhn_valid(card_number: &str) -> bool {
    if card_number.len() < 12 || !card_number.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }

    let mut sum = 0u32;
    let mut double = false;
    for ch in card_number.chars().rev() {
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

fn mask_tail(value: &str, tail: usize) -> String {
    if value.is_empty() {
        return "".to_string();
    }
    if value.len() <= tail {
        return value.to_string();
    }

    let keep = &value[value.len() - tail..];
    let stars = "*".repeat(value.len().saturating_sub(tail));
    format!("{}{}", stars, keep)
}
