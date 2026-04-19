use std::sync::Arc;

use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio::time::{interval, Duration};

use crate::chain::Blockchain;

pub fn start_consensus(
    chain: Arc<Mutex<Blockchain>>,
    validator_address: String,
    validator_private_key: String,
    validator_public_key: String,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut ticker = interval(Duration::from_secs(5));
        loop {
            ticker.tick().await;
            let mut guard = chain.lock().await;
            let _ = guard.mine_block(
                &validator_address,
                &validator_private_key,
                &validator_public_key,
            );
        }
    })
}
