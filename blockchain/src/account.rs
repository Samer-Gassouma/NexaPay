use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum AccountType {
    User,
    Bank,
    Developer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainAccount {
    pub address: String,
    pub public_key: String,
    pub balance: u64,
    pub tx_count: u64,
    pub account_type: AccountType,
    pub created_at: u64,
    pub is_active: bool,
    pub kyc_hash: String,
}
