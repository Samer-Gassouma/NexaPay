use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::api::middleware::{auth_error_response, log_api_call, require_api_key};
use crate::api::AppState;

#[derive(Debug, Deserialize)]
pub struct BlocksQuery {
    page: Option<usize>,
    limit: Option<usize>,
}

pub async fn chain_stats(State(state): State<AppState>) -> Json<serde_json::Value> {
    let chain = state.chain.lock().await;
    let stats = chain.get_stats();
    Json(json!({
        "chain_height": stats.chain_height,
        "total_transactions": stats.total_transactions,
        "total_accounts": stats.total_accounts,
        "network_status": stats.network_status,
    }))
}

pub async fn list_blocks(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<BlocksQuery>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(10).clamp(1, 100);

    let chain = state.chain.lock().await;
    let blocks = chain
        .paginated_blocks(page, limit)
        .map_err(|_| api_error(StatusCode::INTERNAL_SERVER_ERROR, "Failed to read blocks"))?;

    log_api_call(&state, Some(&principal), "/chain/blocks", "GET", 200).await;

    Ok(Json(json!({
        "page": page,
        "limit": limit,
        "blocks": blocks,
    })))
}

pub async fn get_block(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(index): Path<u64>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    let chain = state.chain.lock().await;
    let block = chain.blocks().iter().find(|b| b.index == index).cloned();

    match block {
        Some(b) => {
            log_api_call(&state, Some(&principal), "/chain/blocks/:index", "GET", 200).await;
            Ok(Json(json!(b)))
        }
        None => Err(api_error(StatusCode::NOT_FOUND, "Block not found")),
    }
}

pub async fn get_transaction_by_hash(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(hash): Path<String>,
) -> Result<Json<Value>, (StatusCode, HeaderMap, Json<Value>)> {
    let principal = require_api_key(&state, &headers)
        .await
        .map_err(|e| auth_error_response(e, "Invalid API key"))?;

    let chain = state.chain.lock().await;
    if let Some((index, tx)) = chain.find_transaction(&hash) {
        log_api_call(
            &state,
            Some(&principal),
            "/chain/transactions/:hash",
            "GET",
            200,
        )
        .await;

        return Ok(Json(json!({
            "transaction": tx,
            "block": index,
        })));
    }

    Err(api_error(StatusCode::NOT_FOUND, "Transaction not found"))
}

fn api_error(status: StatusCode, message: &str) -> (StatusCode, HeaderMap, Json<Value>) {
    (status, HeaderMap::new(), Json(json!({ "success": false, "error": message })))
}
