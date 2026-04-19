pub mod accounts;
pub mod auth;
pub mod chain;
pub mod gateway;
pub mod key_management;
pub mod loans;
pub mod middleware;
pub mod network;

use std::collections::HashMap;
use std::sync::Arc;

use axum::routing::{get, post};
use axum::Router;
use jwt_simple::prelude::HS256Key;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tokio::sync::Mutex;

use crate::chain::Blockchain;
use crate::db::sqlite::SqliteState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoanRecord {
    pub loan_id: String,
    pub borrower_address: String,
    pub amount: u64,
    pub status: String,
    pub interest_rate: String,
    pub due_date: String,
    pub contract_hash: String,
}

#[derive(Clone)]
pub struct AppState {
    pub chain: Arc<Mutex<Blockchain>>,
    pub pg_pool: PgPool,
    pub sqlite_state: SqliteState,
    pub http_client: reqwest::Client,
    pub portal_base_url: String,
    pub auth_failures: Arc<Mutex<HashMap<String, (u32, i64)>>>,
    pub confirm_ip_attempts: Arc<Mutex<HashMap<String, Vec<i64>>>>,
    pub jwt_key: HS256Key,
    pub encryption_key: String,
    pub system_private_key: String,
    pub validator_address: String,
    pub validator_private_key: String,
    pub validator_public_key: String,
    pub twilio_account_sid: Option<String>,
    pub twilio_auth_token: Option<String>,
    pub twilio_phone_number: Option<String>,
}

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/auth/register", post(auth::register))
        .route("/auth/login", post(auth::login_with_password))
        .route("/auth/login/password", post(auth::login_with_password))
        .route("/auth/login/otp/request", post(auth::request_login_otp))
        .route("/auth/login/otp/verify", post(auth::verify_login_otp))
        .route("/accounts/:address", get(accounts::get_account))
        .route("/accounts/:address/public", get(accounts::get_public_account))
        .route("/accounts/:address/search", get(accounts::search_accounts))
        .route(
            "/accounts/:address/transactions",
            get(accounts::get_account_transactions),
        )
        .route("/accounts/:address/transfer", post(accounts::transfer))
        .route("/wallets/:address/pay-by-card", post(accounts::pay_wallet_by_card))
        .route("/loans/request", post(loans::request_loan))
        .route("/loans/:address", get(loans::get_loans))
        .route("/loans/:loan_id/repay", post(loans::repay_loan))
        .route("/network/banks/register", post(network::register_bank))
        .route("/network/banks/accounts", get(network::bank_accounts))
        .route(
            "/network/banks/transactions",
            get(network::bank_transactions),
        )
        .route("/network/stats", get(network::network_stats))
        .route("/dev/register", post(network::register_developer))
        .route("/dev/repair_account", post(network::repair_account))
        .route("/api-keys/rotate", post(key_management::rotate_api_key))
        .route("/api-keys/revoke", post(key_management::revoke_api_key))
        .route("/api-keys/usage", get(key_management::api_key_usage))
        .route(
            "/api-keys/permissions",
            post(key_management::update_api_key_permissions),
        )
        .route("/dev/docs/snippets", get(gateway::dev_docs_snippets))
        .route(
            "/gateway/v1/merchants/register",
            post(gateway::register_merchant),
        )
        .route("/gateway/v1/merchants/stats", get(gateway::merchant_stats))
        .route("/gateway/v1/intents", post(gateway::create_intent))
        .route("/gateway/v1/intents/:intent_id", get(gateway::get_intent))
        .route(
            "/gateway/v1/intents/:intent_id/confirm",
            post(gateway::confirm_intent),
        )
        .route("/gateway/v1/refunds", post(gateway::create_refund))
        .route("/gateway/v1/balance", get(gateway::gateway_balance))
        .route(
            "/gateway/v1/transactions",
            get(gateway::gateway_transactions),
        )
        .route("/gateway/v1/payout", post(gateway::gateway_payout))
        .route("/gateway/v1/webhooks", post(gateway::create_webhook))
        .route("/gateway/v1/webhooks", get(gateway::list_webhooks))
        .route(
            "/gateway/v1/webhooks/:id/deliveries",
            get(gateway::webhook_deliveries),
        )
        .route(
            "/gateway/v1/webhooks/:id/test",
            post(gateway::test_webhook),
        )
        .route(
            "/gateway/v1/webhooks/:id",
            axum::routing::delete(gateway::delete_webhook),
        )
        .route("/chain/stats", get(chain::chain_stats))
        .route("/chain/blocks", get(chain::list_blocks))
        .route("/chain/blocks/:index", get(chain::get_block))
        .route(
            "/chain/transactions/:hash",
            get(chain::get_transaction_by_hash),
        )
        .with_state(state)
}
