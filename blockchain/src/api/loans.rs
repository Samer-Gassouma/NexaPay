use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{Path, State};
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
use crate::crypto::{sha256_hex, sign_hex};
use crate::scoring::{score_account, score_to_limit, DatabaseScoring};

#[derive(Debug, Deserialize)]
pub struct LoanRequest {
    borrower: String,
    amount: u64,
    purpose: String,
}

#[derive(Debug, Serialize)]
pub struct LoanScoreBreakdown {
    base: i32,
    transaction_history: i32,
    account_age: i32,
    balance_score: i32,
}

#[derive(Debug, Serialize)]
pub struct LoanRequestResponse {
    loan_id: String,
    score: u8,
    score_breakdown: LoanScoreBreakdown,
    status: String,
    amount: u64,
    amount_display: String,
    interest_rate: String,
    due_date: String,
    contract_hash: String,
    message: String,
}

#[derive(Debug, Serialize)]
pub struct LoansResponse {
    loans: Vec<LoanListItem>,
}

#[derive(Debug, Serialize)]
pub struct LoanListItem {
    loan_id: String,
    amount: i64,
    status: String,
    interest_rate: String,
    due_date: String,
    contract_hash: String,
    created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct RepayRequest {
    amount: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct RepayResponse {
    success: bool,
    loan_id: String,
    amount_repaid: u64,
    tx_hash: String,
    status: String,
}

struct SnapshotScore {
    tx_count: u64,
    account_age_days: u64,
    balance: u64,
    has_repaid_loan: bool,
}

impl DatabaseScoring for SnapshotScore {
    fn get_tx_count(&self, _address: &str) -> u64 {
        self.tx_count
    }

    fn get_account_age_days(&self, _address: &str) -> u64 {
        self.account_age_days
    }

    fn get_balance(&self, _address: &str) -> u64 {
        self.balance
    }

    fn has_repaid_loan(&self, _address: &str) -> bool {
        self.has_repaid_loan
    }
}

pub async fn request_loan(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<LoanRequest>,
) -> Result<Json<LoanRequestResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &payload.borrower)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    if !is_valid_address(&payload.borrower) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid borrower address"));
    }

    if payload.amount == 0 {
        return Err(api_error(StatusCode::BAD_REQUEST, "Amount must be positive"));
    }

    let (tx_count, account_age_days, balance) = {
        let chain = state.chain.lock().await;
        let acc = chain
            .get_account(&payload.borrower)
            .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "Borrower account not found"))?;
        let age_days = (now_ts().saturating_sub(acc.created_at)) / 86_400;
        (acc.tx_count, age_days, acc.balance)
    };

    let has_repaid_loan = sqlx::query(
        "SELECT EXISTS(SELECT 1 FROM loans WHERE borrower_address = $1 AND status = 'repaid') AS repaid",
    )
    .bind(&payload.borrower)
    .fetch_one(&state.pg_pool)
    .await
    .map(|row| row.try_get::<bool, _>("repaid").unwrap_or(false))
    .unwrap_or(false);

    let snapshot = SnapshotScore {
        tx_count,
        account_age_days,
        balance,
        has_repaid_loan,
    };

    let score = score_account(&payload.borrower, &snapshot);
    let limit = score_to_limit(score);

    let tx_component = i32::min((tx_count as i32) * 2, 30);
    let age_component = i32::min(account_age_days as i32, 15);
    let balance_component = if balance > 10_000_000 {
        10
    } else if balance > 1_000_000 {
        7
    } else if balance > 100_000 {
        4
    } else if balance > 0 {
        2
    } else {
        0
    };

    let _limit = limit;
    let loan_id = Uuid::new_v4().to_string();
    let due_date = (chrono::Utc::now() + chrono::Duration::days(30)).date_naive();
    let contract_hash = sha256_hex(
        format!(
            "{}:{}:{}:{}:{}",
            loan_id, payload.borrower, payload.amount, due_date, payload.purpose
        )
        .as_bytes(),
    );

    let _ = sqlx::query(
        "INSERT INTO loans (loan_id, borrower_address, amount, status, interest_rate, due_date, contract_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(Uuid::parse_str(&loan_id).map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Loan ID error"))?)
    .bind(&payload.borrower)
    .bind(payload.amount as i64)
    .bind("approved")
    .bind("2.5%")
    .bind(due_date)
    .bind(&contract_hash)
    .execute(&state.pg_pool)
    .await;

    let tx_hash = sha256_hex(format!("{}:{}:loan", payload.borrower, loan_id).as_bytes());
    let tx = Transaction {
        id: Uuid::new_v4().to_string(),
        tx_type: TxType::LoanDisburse,
        from: "SYSTEM".to_string(),
        to: payload.borrower.clone(),
        amount: payload.amount,
        fee: 0,
        timestamp: now_ts(),
        signature: sign_hex(&state.system_private_key, &tx_hash).unwrap_or_default(),
        memo: format!("Loan disbursement {}", loan_id),
        hash: tx_hash,
    };

    let mut chain = state.chain.lock().await;
    chain.add_pending_transaction(tx.clone());
    if let Ok(block) = chain.mine_block(
        &state.validator_address,
        &state.validator_private_key,
        &state.validator_public_key,
    ) {
        let _ = state.sqlite_state.record_transaction(&tx, block.index);
    }

    if let Some(acc) = chain.get_account(&payload.borrower) {
        let _ = state.sqlite_state.upsert_account(
            &acc.address,
            acc.balance,
            acc.tx_count,
            &acc.account_type,
            acc.is_active,
            now_ts(),
        );
    }

    let _ = state.sqlite_state.upsert_loan_snapshot(
        &loan_id,
        &payload.borrower,
        payload.amount,
        "approved",
        &due_date.to_string(),
        &contract_hash,
        now_ts(),
    );

    log_api_call(&state, principal.as_ref(), "/loans/request", "POST", 200).await;

    Ok(Json(LoanRequestResponse {
        loan_id,
        score,
        score_breakdown: LoanScoreBreakdown {
            base: 40,
            transaction_history: tx_component,
            account_age: age_component,
            balance_score: balance_component,
        },
        status: "approved".to_string(),
        amount: payload.amount,
        amount_display: format_millimes(payload.amount),
        interest_rate: "2.5%".to_string(),
        due_date: due_date.to_string(),
        contract_hash,
        message: "Loan approved and disbursed to your account".to_string(),
    }))
}

pub async fn get_loans(
    State(state): State<AppState>,
    Path(address): Path<String>,
    headers: HeaderMap,
) -> Result<Json<LoansResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    require_account_token(&state, &headers, &address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    if !is_valid_address(&address) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid address"));
    }

    let rows = sqlx::query(
        "SELECT loan_id, amount, status, interest_rate, due_date, contract_hash, created_at
         FROM loans WHERE borrower_address = $1 ORDER BY created_at DESC",
    )
    .bind(&address)
    .fetch_all(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let loans = rows
        .into_iter()
        .map(|row| LoanListItem {
            loan_id: row
                .try_get::<uuid::Uuid, _>("loan_id")
                .map(|u| u.to_string())
                .unwrap_or_default(),
            amount: row.try_get::<i64, _>("amount").unwrap_or(0),
            status: row.try_get::<String, _>("status").unwrap_or_default(),
            interest_rate: row
                .try_get::<String, _>("interest_rate")
                .unwrap_or_else(|_| "2.5%".to_string()),
            due_date: row
                .try_get::<chrono::NaiveDate, _>("due_date")
                .map(|d| d.to_string())
                .unwrap_or_default(),
            contract_hash: row.try_get::<String, _>("contract_hash").unwrap_or_default(),
            created_at: row
                .try_get::<chrono::DateTime<chrono::Utc>, _>("created_at")
                .map(|d| d.to_rfc3339())
                .unwrap_or_default(),
        })
        .collect::<Vec<_>>();

    log_api_call(&state, principal.as_ref(), "/loans/:address", "GET", 200).await;

    Ok(Json(LoansResponse { loans }))
}

pub async fn repay_loan(
    State(state): State<AppState>,
    Path(loan_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<RepayRequest>,
) -> Result<Json<RepayResponse>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    let loan_uuid = Uuid::parse_str(&loan_id)
        .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Invalid loan ID"))?;

    let row = sqlx::query(
        "SELECT borrower_address, amount, status FROM loans WHERE loan_id = $1 LIMIT 1",
    )
    .bind(loan_uuid)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::NOT_FOUND, "Loan not found")),
    };

    let borrower_address: String = row.try_get("borrower_address").unwrap_or_default();
    require_account_token(&state, &headers, &borrower_address)
        .await
        .map_err(|_| api_error(StatusCode::UNAUTHORIZED, "Unauthorized"))?;

    let status: String = row.try_get("status").unwrap_or_default();
    if status == "repaid" {
        return Err(api_error(StatusCode::BAD_REQUEST, "Loan already repaid"));
    }

    let amount_due = row.try_get::<i64, _>("amount").unwrap_or(0).max(0) as u64;
    let repay_amount = payload.amount.unwrap_or(amount_due);
    if repay_amount == 0 {
        return Err(api_error(StatusCode::BAD_REQUEST, "Repay amount must be positive"));
    }

    let tx_hash = sha256_hex(format!("{}:{}:repay", loan_id, repay_amount).as_bytes());
    let tx = Transaction {
        id: Uuid::new_v4().to_string(),
        tx_type: TxType::LoanRepay,
        from: borrower_address.clone(),
        to: "SYSTEM".to_string(),
        amount: repay_amount,
        fee: 0,
        timestamp: now_ts(),
        signature: sign_hex(&state.system_private_key, &tx_hash).unwrap_or_default(),
        memo: format!("Loan repayment {}", loan_id),
        hash: tx_hash.clone(),
    };

    {
        let mut chain = state.chain.lock().await;
        chain.add_pending_transaction(tx.clone());
        let mined = chain.mine_block(
            &state.validator_address,
            &state.validator_private_key,
            &state.validator_public_key,
        );

        if let Ok(block) = mined {
            let _ = state.sqlite_state.record_transaction(&tx, block.index);
        }

        if let Some(acc) = chain.get_account(&borrower_address) {
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

    sqlx::query("UPDATE loans SET status = 'repaid', repaid_at = NOW() WHERE loan_id = $1")
        .bind(loan_uuid)
        .execute(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to update loan"))?;

    let _ = state.sqlite_state.upsert_loan_snapshot(
        &loan_id,
        &borrower_address,
        repay_amount,
        "repaid",
        &chrono::Utc::now().date_naive().to_string(),
        &tx_hash,
        now_ts(),
    );

    log_api_call(&state, principal.as_ref(), "/loans/:loan_id/repay", "POST", 200).await;

    Ok(Json(RepayResponse {
        success: true,
        loan_id,
        amount_repaid: repay_amount,
        tx_hash,
        status: "repaid".to_string(),
    }))
}

fn format_millimes(amount: u64) -> String {
    let whole = amount / 1000;
    let frac = amount % 1000;
    format!("{}.{:03} TND", whole, frac)
}

fn api_error(status: StatusCode, message: &str) -> (StatusCode, HeaderMap, Json<Value>) {
    (status, HeaderMap::new(), Json(json!({ "success": false, "error": message })))
}

fn is_valid_address(address: &str) -> bool {
    Regex::new(r"^NXP[a-f0-9]{32}$")
        .map(|re| re.is_match(address))
        .unwrap_or(false)
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
