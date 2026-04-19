use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Utc;
use rand::Rng;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::account::{AccountType, ChainAccount};
use crate::api::middleware::{
    api_principal_kind, api_principal_prefix, issue_session_token, log_api_call, try_api_key,
    AuthError,
};
use crate::api::AppState;
use crate::block::{Transaction, TxType};
use crate::crypto::{
    address_from_public_key, encrypt_aes256_gcm, generate_keypair, kyc_hash, sha256_hex, sign_hex,
};
use crate::generator::{
    format_card_display, generate_account_number, generate_card_number, generate_cvv, generate_expiry,
    generate_iban, generate_rib,
};

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub full_name: String,
    pub cin: String,
    pub date_of_birth: String,
    pub phone: String,
    pub password: Option<String>,
    pub email: Option<String>,
    pub address_line: Option<String>,
    pub city: Option<String>,
    pub governorate: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RegisterResponse {
    success: bool,
    chain_address: String,
    account: AccountResponse,
    card: CardResponse,
    private_key: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    phone_hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dev_otp: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AccountResponse {
    account_number: String,
    rib: String,
    iban: String,
    bic: String,
    currency: String,
}

#[derive(Debug, Serialize)]
pub struct CardResponse {
    card_number: String,
    card_holder: String,
    expiry: String,
    cvv: String,
    #[serde(rename = "type")]
    card_type: String,
}

#[derive(Debug, Deserialize)]
pub struct PasswordLoginRequest {
    pub cin: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RequestOtpLoginRequest {
    pub cin: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyOtpLoginRequest {
    pub cin: String,
    pub otp: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    token: String,
    chain_address: String,
}

#[derive(Debug, Serialize)]
pub struct RequestOtpLoginResponse {
    success: bool,
    message: String,
    phone_hint: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    dev_otp: Option<String>,
}

pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<RegisterResponse>, (StatusCode, Json<Value>)> {
    let principal = try_api_key(&state, &headers)
        .await
        .map_err(|e| api_error(auth_status_code(e), "Invalid API key"))?;

    if !is_valid_cin(&payload.cin) {
        return Err(api_error(StatusCode::BAD_REQUEST, "CIN must be 8 digits"));
    }
    // normalize and validate phone (accept 8-digit local or full 216...)
    let normalized_phone = normalize_phone(&payload.phone)
        .ok_or_else(|| api_error(StatusCode::BAD_REQUEST, "Phone must be 8 digits or start with 216"))?;
    if let Some(password) = payload.password.as_ref() {
        if password.trim().len() < 6 {
            return Err(api_error(
                StatusCode::BAD_REQUEST,
                "Password must contain at least 6 characters",
            ));
        }
    }

    let dob = chrono::NaiveDate::parse_from_str(&payload.date_of_birth, "%Y-%m-%d")
        .map_err(|_| api_error(StatusCode::BAD_REQUEST, "Invalid date_of_birth format"))?;

    let (private_key, public_key) = generate_keypair();
    let chain_address = address_from_public_key(&public_key);
    let holder_name = payload.full_name.to_uppercase();

    let kyc_digest = kyc_hash(&payload.cin, &payload.full_name, &payload.date_of_birth);

    let card_number = generate_card_number("99");
    let (expiry_month, expiry_year) = generate_expiry();
    let cvv = generate_cvv(
        &card_number,
        &expiry_month,
        &expiry_year,
        &state.encryption_key,
    );
    let encrypted_card = encrypt_aes256_gcm(&state.encryption_key, &card_number)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Card encryption failed"))?;
    let encrypted_cvv = encrypt_aes256_gcm(&state.encryption_key, &cvv)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "CVV encryption failed"))?;

    let account_number = generate_account_number();
    let (rib, _) = generate_rib("99", "000");
    let iban = generate_iban(&rib);
    let card_last4 = card_number
        .chars()
        .rev()
        .take(4)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();

    let created_by_api_key_prefix = principal.as_ref().map(api_principal_prefix);
    let created_by_principal_type = principal
        .as_ref()
        .map(|p| api_principal_kind(p).to_string());
    let password_hash = payload
        .password
        .as_ref()
        .map(|pwd| hash_password(pwd, &payload.cin, &state.encryption_key));

    sqlx::query(
        "INSERT INTO users (chain_address, full_name, cin, date_of_birth, phone, email, address_line, city, governorate, created_by_api_key_prefix, created_by_principal_type, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
    )
    .bind(&chain_address)
    .bind(&payload.full_name)
    .bind(&payload.cin)
    .bind(dob)
    .bind(&normalized_phone)
    .bind(&payload.email)
    .bind(&payload.address_line)
    .bind(&payload.city)
    .bind(&payload.governorate)
    .bind(&created_by_api_key_prefix)
    .bind(&created_by_principal_type)
    .bind(&password_hash)
    .execute(&state.pg_pool)
    .await
    .map_err(|e| api_error(StatusCode::BAD_REQUEST, &format!("User creation failed: {e}")))?;

    sqlx::query(
        "INSERT INTO cards (chain_address, card_number, card_holder_name, expiry_month, expiry_year, cvv)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(&chain_address)
    .bind(&encrypted_card)
    .bind(&holder_name)
    .bind(&expiry_month)
    .bind(&expiry_year)
    .bind(&encrypted_cvv)
    .execute(&state.pg_pool)
    .await
    .map_err(|e| api_error(StatusCode::BAD_REQUEST, &format!("Card creation failed: {e}")))?;

    sqlx::query(
        "INSERT INTO bank_accounts (chain_address, account_number, rib, iban, bic, currency)
         VALUES ($1, $2, $3, $4, 'NXPYTNTT', 'TND')",
    )
    .bind(&chain_address)
    .bind(&account_number)
    .bind(&rib)
    .bind(&iban)
    .execute(&state.pg_pool)
    .await
    .map_err(|e| api_error(StatusCode::BAD_REQUEST, &format!("Bank account creation failed: {e}")))?;

    let mut mined_block_index = 0u64;
    let account_create_tx: Transaction;
    {
        let mut chain = state.chain.lock().await;
        chain.create_account(ChainAccount {
            address: chain_address.clone(),
            public_key: public_key.clone(),
            balance: 150_000,
            tx_count: 0,
            account_type: AccountType::User,
            created_at: now_ts(),
            is_active: true,
            kyc_hash: kyc_digest,
        });

        let tx = Transaction {
            id: Uuid::new_v4().to_string(),
            tx_type: TxType::AccountCreate,
            from: "SYSTEM".to_string(),
            to: chain_address.clone(),
            amount: 0,
            fee: 0,
            timestamp: now_ts(),
            signature: sign_hex(&state.system_private_key, &chain_address)
                .unwrap_or_else(|_| String::new()),
            memo: "Account created".to_string(),
            hash: sha256_hex(format!("{}{}", chain_address, now_ts()).as_bytes()),
        };
        account_create_tx = tx.clone();
        chain.add_pending_transaction(tx);
        if let Ok(block) = chain.mine_block(
            &state.validator_address,
            &state.validator_private_key,
            &state.validator_public_key,
        ) {
            mined_block_index = block.index;
        }

        if let Some(account) = chain.get_account(&chain_address) {
            let _ = state.sqlite_state.upsert_account(
                &account.address,
                account.balance,
                account.tx_count,
                &account.account_type,
                account.is_active,
                now_ts(),
            );
        }
    }

    let _ = state
        .sqlite_state
        .record_transaction(&account_create_tx, mined_block_index);
    let _ = state.sqlite_state.upsert_card_ref(
        &chain_address,
        &card_last4,
        &expiry_month,
        &expiry_year,
        now_ts(),
    );

    // Generate and send an OTP for phone verification during registration.
    let otp = generate_otp_code();
    let otp_hash = hash_otp(&payload.cin, &otp, &state.encryption_key);

    let _ = sqlx::query(
        "UPDATE users
         SET otp_code_hash = $1,
             otp_expires_at = NOW() + INTERVAL '5 minutes',
             otp_attempts = 0
         WHERE cin = $2",
    )
    .bind(&otp_hash)
    .bind(&payload.cin)
    .execute(&state.pg_pool)
    .await;

    let mut dev_otp: Option<String> = None;
    match send_otp_sms(&state, &normalized_phone, &otp).await {
        Ok(_) => {}
        Err(_) => {
            let app_env = std::env::var("APP_ENV").unwrap_or_default();
            let dev_show = std::env::var("DEV_SHOW_OTP").unwrap_or_default();
            if app_env == "development" || dev_show == "true" {
                dev_otp = Some(otp.clone());
                println!("[dev] registration OTP for CIN {} is {}", payload.cin, otp);
            }
        }
    }

    log_api_call(&state, principal.as_ref(), "/auth/register", "POST", 200).await;

    Ok(Json(RegisterResponse {
        success: true,
        chain_address,
        account: AccountResponse {
            account_number,
            rib,
            iban,
            bic: "NXPYTNTT".to_string(),
            currency: "TND".to_string(),
        },
        card: CardResponse {
            card_number: format_card_display(&card_number),
            card_holder: holder_name,
            expiry: format!("{}/{}", expiry_month, &expiry_year[2..]),
            cvv,
            card_type: "VISA".to_string(),
        },
        private_key,
        message: "Keep your private key safe. It will never be shown again.".to_string(),
        phone_hint: Some(mask_phone(&normalized_phone)),
        dev_otp,
    }))
}

pub async fn login_with_password(
    State(state): State<AppState>,
    Json(payload): Json<PasswordLoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, Json<Value>)> {
    if !is_valid_cin(&payload.cin) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid CIN"));
    }
    if payload.password.trim().is_empty() {
        return Err(api_error(StatusCode::BAD_REQUEST, "Password is required"));
    }

    let row = sqlx::query(
        "SELECT chain_address, cin, password_hash FROM users WHERE cin = $1 LIMIT 1",
    )
    .bind(&payload.cin)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid credentials")),
    };

    let chain_address: String = row
        .try_get("chain_address")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let cin: String = row
        .try_get("cin")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let stored_hash: Option<String> = row.try_get("password_hash").ok();

    let stored_hash = match stored_hash {
        Some(v) if !v.trim().is_empty() => v,
        _ => {
            return Err(api_error(
                StatusCode::BAD_REQUEST,
                "Password login is not enabled for this account. Use OTP login.",
            ));
        }
    };

    let provided_hash = hash_password(&payload.password, &payload.cin, &state.encryption_key);
    if provided_hash != stored_hash {
        return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid credentials"));
    }

    let token = issue_session_token(&state, &chain_address, &sha256_hex(cin.as_bytes()))
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Token creation failed"))?;

    log_api_call(&state, None, "/auth/login/password", "POST", 200).await;

    Ok(Json(LoginResponse {
        token,
        chain_address,
    }))
}

pub async fn request_login_otp(
    State(state): State<AppState>,
    Json(payload): Json<RequestOtpLoginRequest>,
) -> Result<Json<RequestOtpLoginResponse>, (StatusCode, Json<Value>)> {
    if !is_valid_cin(&payload.cin) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid CIN"));
    }

    let row = sqlx::query("SELECT phone FROM users WHERE cin = $1 LIMIT 1")
        .bind(&payload.cin)
        .fetch_optional(&state.pg_pool)
        .await
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid credentials")),
    };

    let phone: String = row
        .try_get("phone")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;

    let otp = generate_otp_code();
    let otp_hash = hash_otp(&payload.cin, &otp, &state.encryption_key);

    sqlx::query(
        "UPDATE users
         SET otp_code_hash = $1,
             otp_expires_at = NOW() + INTERVAL '5 minutes',
             otp_attempts = 0
         WHERE cin = $2",
    )
    .bind(&otp_hash)
    .bind(&payload.cin)
    .execute(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to save OTP"))?;

    // Attempt to send via Twilio. If it fails and we're in development or
    // `DEV_SHOW_OTP=true` we return the OTP in the response for local testing.
    let mut dev_otp: Option<String> = None;
    match send_otp_sms(&state, &phone, &otp).await {
        Ok(_) => {}
        Err(e) => {
            let app_env = std::env::var("APP_ENV").unwrap_or_default();
            let dev_show = std::env::var("DEV_SHOW_OTP").unwrap_or_default();
            if app_env == "development" || dev_show == "true" {
                // expose OTP only in dev mode
                dev_otp = Some(otp.clone());
                // best-effort log so developers can see it in container logs
                println!("[dev] OTP for CIN {} is {}", payload.cin, otp);
            } else {
                return Err(e);
            }
        }
    }

    log_api_call(&state, None, "/auth/login/otp/request", "POST", 200).await;

    Ok(Json(RequestOtpLoginResponse {
        success: true,
        message: "OTP sent successfully".to_string(),
        phone_hint: mask_phone(&phone),
        dev_otp,
    }))
}

pub async fn verify_login_otp(
    State(state): State<AppState>,
    Json(payload): Json<VerifyOtpLoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, Json<Value>)> {
    if !is_valid_cin(&payload.cin) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Invalid CIN"));
    }
    if !is_valid_otp(&payload.otp) {
        return Err(api_error(StatusCode::BAD_REQUEST, "OTP must be 6 digits"));
    }

    let row = sqlx::query(
        "SELECT chain_address, cin, otp_code_hash, otp_expires_at, otp_attempts
         FROM users WHERE cin = $1 LIMIT 1",
    )
    .bind(&payload.cin)
    .fetch_optional(&state.pg_pool)
    .await
    .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    let row = match row {
        Some(r) => r,
        None => return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid credentials")),
    };

    let chain_address: String = row
        .try_get("chain_address")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let cin: String = row
        .try_get("cin")
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Invalid row data"))?;
    let otp_hash: Option<String> = row.try_get("otp_code_hash").ok();
    let otp_expires_at: Option<chrono::DateTime<chrono::Utc>> = row.try_get("otp_expires_at").ok();
    let otp_attempts: i32 = row.try_get("otp_attempts").unwrap_or(0);

    if otp_attempts >= 5 {
        return Err(api_error(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many OTP attempts. Request a new OTP.",
        ));
    }

    let is_expired = otp_expires_at
        .map(|exp| exp <= Utc::now())
        .unwrap_or(true);

    let stored_hash = match otp_hash {
        Some(v) if !v.is_empty() && !is_expired => v,
        _ => {
            return Err(api_error(
                StatusCode::UNAUTHORIZED,
                "OTP expired or not requested",
            ));
        }
    };

    let provided_hash = hash_otp(&payload.cin, &payload.otp, &state.encryption_key);
    if provided_hash != stored_hash {
        let _ = sqlx::query("UPDATE users SET otp_attempts = otp_attempts + 1 WHERE cin = $1")
            .bind(&payload.cin)
            .execute(&state.pg_pool)
            .await;

        return Err(api_error(StatusCode::UNAUTHORIZED, "Invalid OTP"));
    }

    let _ = sqlx::query(
        "UPDATE users
         SET otp_code_hash = NULL,
             otp_expires_at = NULL,
             otp_attempts = 0
         WHERE cin = $1",
    )
    .bind(&payload.cin)
    .execute(&state.pg_pool)
    .await;

    let token = issue_session_token(&state, &chain_address, &sha256_hex(cin.as_bytes()))
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Token creation failed"))?;

    log_api_call(&state, None, "/auth/login/otp/verify", "POST", 200).await;

    Ok(Json(LoginResponse {
        token,
        chain_address,
    }))
}

fn is_valid_cin(cin: &str) -> bool {
    Regex::new(r"^\d{8}$")
        .map(|re| re.is_match(cin))
        .unwrap_or(false)
}

fn is_valid_phone(phone: &str) -> bool {
    normalize_phone(phone).is_some()
}

fn normalize_phone(phone: &str) -> Option<String> {
    // Accept formats: 8 digits (local), 216XXXXXXXX, +216XXXXXXXX
    let digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() == 8 {
        Some(format!("216{}", digits))
    } else if digits.len() == 11 && digits.starts_with("216") {
        Some(digits)
    } else {
        None
    }
}

fn is_valid_otp(otp: &str) -> bool {
    Regex::new(r"^\d{6}$")
        .map(|re| re.is_match(otp))
        .unwrap_or(false)
}

fn generate_otp_code() -> String {
    let mut rng = rand::thread_rng();
    format!("{:06}", rng.gen_range(0..1_000_000))
}

fn mask_phone(phone: &str) -> String {
    if phone.len() < 4 {
        return "***".to_string();
    }
    let suffix = &phone[phone.len() - 2..];
    format!("***{}", suffix)
}

fn hash_password(password: &str, cin: &str, pepper: &str) -> String {
    sha256_hex(format!("pwd:{}:{}:{}", cin, password, pepper).as_bytes())
}

fn hash_otp(cin: &str, otp: &str, pepper: &str) -> String {
    sha256_hex(format!("otp:{}:{}:{}", cin, otp, pepper).as_bytes())
}

async fn send_otp_sms(
    state: &AppState,
    to: &str,
    otp: &str,
) -> Result<(), (StatusCode, Json<Value>)> {
    let sid = state
        .twilio_account_sid
        .clone()
        .ok_or_else(|| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Twilio account SID is not configured"))?;
    let token = state
        .twilio_auth_token
        .clone()
        .ok_or_else(|| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Twilio auth token is not configured"))?;
    let from = state
        .twilio_phone_number
        .clone()
        .ok_or_else(|| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Twilio phone number is not configured"))?;

    let endpoint = format!("https://api.twilio.com/2010-04-01/Accounts/{}/Messages.json", sid);
    let body = format!("Your NexaPay verification code is: {}. It expires in 5 minutes.", otp);
    let to_e164 = if to.starts_with('+') {
        to.to_string()
    } else {
        format!("+{}", to)
    };

    let response = state
        .http_client
        .post(endpoint)
        .basic_auth(&sid, Some(&token))
        .form(&[("To", to_e164.as_str()), ("From", from.as_str()), ("Body", body.as_str())])
        .send()
        .await
        .map_err(|_| api_error(StatusCode::BAD_GATEWAY, "Failed to reach Twilio service"))?;

    if !response.status().is_success() {
        let details = response.text().await.unwrap_or_else(|_| "unknown error".to_string());
        return Err(api_error(
            StatusCode::BAD_GATEWAY,
            &format!("Twilio rejected OTP delivery request: {}", details),
        ));
    }

    Ok(())
}

fn api_error(status: StatusCode, message: &str) -> (StatusCode, Json<Value>) {
    (status, Json(json!({ "success": false, "error": message })))
}

fn auth_status_code(err: AuthError) -> StatusCode {
    match err {
        AuthError::Unauthorized => StatusCode::UNAUTHORIZED,
        AuthError::Forbidden => StatusCode::FORBIDDEN,
        AuthError::TooManyRequests { .. } => StatusCode::TOO_MANY_REQUESTS,
        AuthError::Internal => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
