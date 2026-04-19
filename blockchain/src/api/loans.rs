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
    duration_months: Option<i32>,
    annual_interest_rate: Option<f64>,
    requested_amount: Option<u64>,
    contract_hash: Option<String>,
    contract_terms: Option<String>,
    contract_version: Option<String>,
    contract_signed_by: Option<String>,
    contract_signature_data_url: Option<String>,
    contract_password: Option<String>,
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
    purpose: Option<String>,
    duration_months: Option<i32>,
    contract_hash: String,
    contract_signed_by: Option<String>,
    contract_signed_at: Option<String>,
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

    let duration_months = payload.duration_months.unwrap_or(36).clamp(1, 360);
    let annual_interest_rate = payload.annual_interest_rate.unwrap_or(0.12);
    if !(0.0..=1.0).contains(&annual_interest_rate) {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "annual_interest_rate must be between 0 and 1",
        ));
    }

    let (tx_count, account_age_days, balance, public_key) = {
        let chain = state.chain.lock().await;
        let acc = chain
            .get_account(&payload.borrower)
            .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "Borrower account not found"))?;
        let age_days = (now_ts().saturating_sub(acc.created_at)) / 86_400;
        (acc.tx_count, age_days, acc.balance, acc.public_key.clone())
    };

    let user_row = sqlx::query(
        "SELECT full_name, cin, password_hash FROM users WHERE chain_address = $1 LIMIT 1",
    )
    .bind(&payload.borrower)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let user_row =
        user_row.ok_or_else(|| api_error(StatusCode::NOT_FOUND, "Borrower profile not found"))?;
    let borrower_full_name: String = user_row.try_get("full_name").unwrap_or_default();
    let borrower_cin: String = user_row.try_get("cin").unwrap_or_default();
    let borrower_password_hash: Option<String> = user_row.try_get("password_hash").ok();

    let signer_name = payload
        .contract_signed_by
        .as_ref()
        .map(|name| name.trim())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "Contract signer name is required"))?;

    if !signer_name.eq_ignore_ascii_case(borrower_full_name.trim()) {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Contract signer name must match the account holder name",
        ));
    }

    let contract_password = payload
        .contract_password
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "Contract password signature is required"))?;

    let stored_password_hash = borrower_password_hash
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "Password signature is not enabled for this account"))?;

    let provided_password_hash = hash_password(contract_password, &borrower_cin, &state.encryption_key);
    if provided_password_hash != stored_password_hash {
        return Err(api_error(
            StatusCode::UNAUTHORIZED,
            "Invalid password signature for loan contract",
        ));
    }

    let contract_signature_data_url = payload
        .contract_signature_data_url
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "Drawn electronic signature is required"))?;

    if !contract_signature_data_url.starts_with("data:image/") {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Electronic signature must be an image data URL",
        ));
    }

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
    let due_date = (chrono::Utc::now() + chrono::Duration::days((duration_months as i64) * 30)).date_naive();
    let contract_signed_at = chrono::Utc::now();
    let contract_version = payload
        .contract_version
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "loan-contract-v1".to_string());
    let requested_amount = payload.requested_amount.unwrap_or(payload.amount);
    let contract_terms = payload
        .contract_terms
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            build_loan_contract_terms(
                &loan_id,
                &payload.borrower,
                &public_key,
                &borrower_full_name,
                &borrower_cin,
                requested_amount,
                payload.amount,
                duration_months,
                annual_interest_rate,
                &payload.purpose,
                &due_date.to_string(),
                &contract_version,
                signer_name,
                contract_signature_data_url,
                &contract_signed_at.to_rfc3339(),
            )
        });
    let expected_contract_hash = sha256_hex(contract_terms.as_bytes());
    let contract_hash = payload
        .contract_hash
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| expected_contract_hash.clone());

    if contract_hash != expected_contract_hash {
        return Err(api_error(StatusCode::BAD_REQUEST, "Loan contract hash mismatch"));
    }

    let contract_terms_json: Value = serde_json::from_str(&contract_terms)
        .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Loan contract payload must be valid JSON"))?;
    validate_contract_terms(
        &contract_terms_json,
        signer_name,
        &payload.borrower,
        &borrower_full_name,
        &borrower_cin,
        payload.amount,
        duration_months,
        annual_interest_rate,
        contract_signature_data_url,
    )?;

    let contract_signature_hash = sha256_hex(
        format!(
            "{}:{}:{}:{}:{}",
            contract_hash,
            payload.borrower,
            signer_name,
            stored_password_hash,
            contract_signature_data_url
        )
        .as_bytes(),
    );

    let _ = sqlx::query(
        "INSERT INTO loans (
            loan_id, borrower_address, amount, status, interest_rate, due_date, contract_hash,
            purpose, duration_months, requested_amount, contract_terms, contract_version,
            contract_signed_by, contract_signature_hash, contract_signed_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)",
    )
    .bind(Uuid::parse_str(&loan_id).map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Loan ID error"))?)
    .bind(&payload.borrower)
    .bind(payload.amount as i64)
    .bind("approved")
    .bind(format!("{:.2}%", annual_interest_rate * 100.0))
    .bind(due_date)
    .bind(&contract_hash)
    .bind(&payload.purpose)
    .bind(duration_months)
    .bind(requested_amount as i64)
    .bind(&contract_terms)
    .bind(&contract_version)
    .bind(signer_name)
    .bind(&contract_signature_hash)
    .bind(contract_signed_at)
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
        interest_rate: format!("{:.2}%", annual_interest_rate * 100.0),
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
        "SELECT loan_id, amount, status, interest_rate, due_date, purpose, duration_months,
                contract_hash, contract_signed_by, contract_signed_at, created_at
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
            purpose: row.try_get::<String, _>("purpose").ok(),
            duration_months: row.try_get::<i32, _>("duration_months").ok(),
            contract_hash: row.try_get::<String, _>("contract_hash").unwrap_or_default(),
            contract_signed_by: row.try_get::<String, _>("contract_signed_by").ok(),
            contract_signed_at: row
                .try_get::<chrono::DateTime<chrono::Utc>, _>("contract_signed_at")
                .map(|d| d.to_rfc3339())
                .ok(),
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

fn hash_password(password: &str, cin: &str, pepper: &str) -> String {
    sha256_hex(format!("pwd:{}:{}:{}", cin, password, pepper).as_bytes())
}

fn build_loan_contract_terms(
    loan_id: &str,
    borrower_address: &str,
    borrower_public_key: &str,
    borrower_name: &str,
    borrower_cin: &str,
    requested_amount: u64,
    approved_amount: u64,
    duration_months: i32,
    annual_interest_rate: f64,
    purpose: &str,
    due_date: &str,
    contract_version: &str,
    signer_name: &str,
    contract_signature_data_url: &str,
    contract_signed_at: &str,
) -> String {
    let approved_amount_tnd = approved_amount as f64 / 1000.0;
    let monthly_installment_tnd = if duration_months > 0 {
        approved_amount_tnd * (1.0 + annual_interest_rate) / duration_months as f64
    } else {
        0.0
    };
    let total_repayment_tnd = monthly_installment_tnd * duration_months as f64;

    serde_json::json!({
        "contract_version": contract_version,
        "contract_reference": format!("NXP-CTR-{}", loan_id),
        "contract_type": "consumer-loan-agreement",
        "lender_name": "NexaPay Bank",
        "lender_branch": "Digital Lending Division",
        "loan_id": loan_id,
        "borrower_address": borrower_address,
        "borrower_public_key": borrower_public_key,
        "borrower_name": borrower_name,
        "borrower_cin": borrower_cin,
        "purpose": purpose,
        "requested_amount": requested_amount,
        "requested_amount_millimes": requested_amount,
        "approved_amount": approved_amount,
        "approved_amount_millimes": approved_amount,
        "duration_months": duration_months,
        "annual_interest_rate": annual_interest_rate,
        "monthly_installment": monthly_installment_tnd,
        "total_repayment": total_repayment_tnd,
        "issue_date": chrono::Utc::now().date_naive().to_string(),
        "due_date": due_date,
        "settlement_asset": "TND",
        "signature_rule": "Borrower must sign with legal name and account password before disbursement",
        "clauses": build_default_contract_clauses(approved_amount, duration_months, annual_interest_rate, purpose, due_date),
        "signature": {
            "signer_name": signer_name,
            "drawn_signature_data_url": contract_signature_data_url,
            "signed_at": contract_signed_at,
            "consent_statement": "Borrower accepted the loan amount, repayment obligations, and disbursement authorization.",
            "password_attestation": "Borrower confirmed identity with the protected account password."
        }
    })
    .to_string()
}

fn build_default_contract_clauses(
    approved_amount: u64,
    duration_months: i32,
    annual_interest_rate: f64,
    purpose: &str,
    due_date: &str,
) -> Vec<Value> {
    vec![
        json!({
            "title": "Repayment obligation",
            "body": format!(
                "The borrower must repay {} together with interest at {:.2}% per annum over {} months, with the final due date on {}.",
                format_millimes(approved_amount),
                annual_interest_rate * 100.0,
                duration_months,
                due_date
            )
        }),
        json!({
            "title": "Timely installments",
            "body": "The borrower must pay each installment on time and in full. Late, partial, or missed payments may trigger collection, recovery, and internal risk actions permitted by law."
        }),
        json!({
            "title": "Purpose and declarations",
            "body": format!(
                "This loan is granted for {}. The borrower confirms that all information submitted to the bank is accurate, complete, and not misleading.",
                purpose
            )
        }),
        json!({
            "title": "Electronic execution",
            "body": "The borrower agrees that the handwritten electronic signature and password confirmation form a binding electronic contract that may be stored and produced as evidence."
        }),
    ]
}

fn validate_contract_terms(
    contract_terms: &Value,
    signer_name: &str,
    borrower_address: &str,
    borrower_full_name: &str,
    borrower_cin: &str,
    approved_amount: u64,
    duration_months: i32,
    annual_interest_rate: f64,
    contract_signature_data_url: &str,
) -> Result<(), (StatusCode, HeaderMap, Json<Value>)> {
    let contract_borrower_name = contract_terms
        .get("borrower_name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if !contract_borrower_name.eq_ignore_ascii_case(borrower_full_name.trim()) {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Contract borrower name does not match the account holder",
        ));
    }

    let contract_borrower_cin = contract_terms
        .get("borrower_cin")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if contract_borrower_cin != borrower_cin.trim() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Contract borrower CIN does not match the account holder",
        ));
    }

    let contract_borrower_address = contract_terms
        .get("borrower_address")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if contract_borrower_address != borrower_address {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Contract borrower address does not match the request",
        ));
    }

    let contract_approved_amount = contract_terms
        .get("approved_amount_millimes")
        .and_then(Value::as_u64)
        .or_else(|| {
            contract_terms
                .get("approved_amount")
                .and_then(Value::as_f64)
                .map(|value| (value * 1000.0).round() as u64)
        })
        .unwrap_or(0);
    if contract_approved_amount != approved_amount {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Contract approved amount does not match the loan amount",
        ));
    }

    let contract_duration = contract_terms
        .get("duration_months")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    if contract_duration != duration_months as i64 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Contract duration does not match the requested duration",
        ));
    }

    let contract_interest = contract_terms
        .get("annual_interest_rate")
        .and_then(Value::as_f64)
        .unwrap_or(-1.0);
    if (contract_interest - annual_interest_rate).abs() > 1e-9 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Contract interest rate does not match the approved rate",
        ));
    }

    let clauses_count = contract_terms
        .get("clauses")
        .and_then(Value::as_array)
        .map(|items| items.len())
        .unwrap_or(0);
    if clauses_count == 0 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Contract legal clauses are required",
        ));
    }

    let signature = contract_terms
        .get("signature")
        .and_then(Value::as_object)
        .ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "Contract signature block is required"))?;

    let contract_signer_name = signature
        .get("signer_name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if !contract_signer_name.eq_ignore_ascii_case(signer_name) {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Contract signature name does not match the signer name",
        ));
    }

    let contract_signature_image = signature
        .get("drawn_signature_data_url")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if contract_signature_image != contract_signature_data_url {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Contract signature image does not match the submitted e-signature",
        ));
    }

    let signed_at = signature
        .get("signed_at")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if signed_at.is_empty() {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "Contract signature timestamp is required",
        ));
    }

    Ok(())
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
