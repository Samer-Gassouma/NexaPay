mod account;
mod api;
mod block;
mod chain;
mod consensus;
mod crypto;
mod db;
mod generator;
mod scoring;
mod storage;

use std::env;
use std::collections::HashMap;
use std::sync::Arc;

use axum::http::Method;
use jwt_simple::prelude::HS256Key;
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::api::{build_router, AppState};
use crate::chain::Blockchain;
use crate::consensus::start_consensus;
use crate::crypto::{address_from_public_key, generate_keypair};
use crate::db::postgres::{connect, run_migrations};
use crate::db::sqlite::SqliteState;
use crate::storage::BlockStorage;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let database_url = env::var("NEXAPAY_DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://nexapay:nexapay_secret@localhost:5432/nexapay".to_string());
    let jwt_secret = env::var("NEXAPAY_JWT_SECRET")
        .unwrap_or_else(|_| "change_this_in_production_64_chars_minimum_change_this_in_production".to_string());
    let encryption_key = env::var("NEXAPAY_ENCRYPTION_KEY").unwrap_or_else(|_| {
        "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff".to_string()
    });
    let port = env::var("NEXAPAY_PORT").unwrap_or_else(|_| "8080".to_string());
    let portal_base_url = env::var("NEXAPAY_PORTAL_URL")
        .unwrap_or_else(|_| "http://localhost:3001".to_string());
    let twilio_account_sid = env::var("TWILIO_ACCOUNT_SID").ok().filter(|v| !v.trim().is_empty());
    let twilio_auth_token = env::var("TWILIO_AUTH_TOKEN").ok().filter(|v| !v.trim().is_empty());
    let twilio_phone_number = env::var("TWILIO_PHONE_NUMBER").ok().filter(|v| !v.trim().is_empty());
    let otp_fallback_code = env::var("OTP_FALLBACK_CODE")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

    let pool = connect(&database_url).await?;
    run_migrations(&pool).await?;
    let sqlite_state = SqliteState::open("./nexapay_state.sqlite")?;

    let system_private_key = env::var("NEXAPAY_SYSTEM_PRIVATE_KEY").unwrap_or_else(|_| {
        let (sk, _pk) = generate_keypair();
        sk
    });

    let (validator_private_key, validator_public_key) = generate_keypair();
    let validator_address = address_from_public_key(&validator_public_key);

    let storage = BlockStorage::open("./chain_data")?;
    let chain = Blockchain::new(storage)?;
    let chain = Arc::new(Mutex::new(chain));

    start_consensus(
        chain.clone(),
        validator_address.clone(),
        validator_private_key.clone(),
        validator_public_key.clone(),
    );

    let state = AppState {
        chain,
        pg_pool: pool,
        sqlite_state,
        http_client: reqwest::Client::new(),
        portal_base_url,
        auth_failures: Arc::new(Mutex::new(HashMap::new())),
        confirm_ip_attempts: Arc::new(Mutex::new(HashMap::new())),
        jwt_key: HS256Key::from_bytes(jwt_secret.as_bytes()),
        encryption_key,
        system_private_key,
        validator_address,
        validator_private_key,
        validator_public_key,
        twilio_account_sid,
        twilio_auth_token,
        twilio_phone_number,
        otp_fallback_code,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    let app = build_router(state).layer(cors).layer(TraceLayer::new_for_http());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;

    println!("NexaPay node listening on 0.0.0.0:{port}");
    axum::serve(listener, app).await?;

    Ok(())
}
