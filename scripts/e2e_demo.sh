#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8088}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for this script. Install jq and retry." >&2
  exit 1
fi

echo "[1/9] Register developer key"
STAMP=$(date +%s)
DEV_RES=$(curl -sS -X POST "$API_URL/dev/register" \
  -H "Content-Type: application/json" \
  -d "{\"company_name\":\"Demo Integrator\",\"contact_name\":\"API Owner\",\"email\":\"demo.dev.$STAMP@nexapay.tn\",\"plan\":\"free\"}")
DEV_KEY=$(echo "$DEV_RES" | jq -r '.api_key')

if [[ -z "$DEV_KEY" || "$DEV_KEY" == "null" ]]; then
  echo "Developer registration failed: $DEV_RES" >&2
  exit 1
fi

echo "Developer key prefix: $(echo "$DEV_KEY" | cut -c1-12)..."

U1_CIN=$(printf '%08d' $(( (RANDOM % 90000000) + 10000000 )))
U2_CIN=$(printf '%08d' $(( (RANDOM % 90000000) + 10000000 )))
U1_PHONE="216$(printf '%08d' $(( (RANDOM % 90000000) + 10000000 )) )"
U2_PHONE="216$(printf '%08d' $(( (RANDOM % 90000000) + 10000000 )) )"

echo "[2/9] Register user A through developer key"
U1_RES=$(curl -sS -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $DEV_KEY" \
  -d "{
    \"full_name\":\"Mohamed Ben Ali\",
    \"cin\":\"$U1_CIN\",
    \"date_of_birth\":\"1995-03-15\",
    \"phone\":\"$U1_PHONE\",
    \"email\":\"u1.$STAMP@example.com\",
    \"address_line\":\"Rue de la Liberte\",
    \"city\":\"Tunis\",
    \"governorate\":\"Tunis\"
  }")
U1_ADDR=$(echo "$U1_RES" | jq -r '.chain_address')

if [[ -z "$U1_ADDR" || "$U1_ADDR" == "null" ]]; then
  echo "User A registration failed: $U1_RES" >&2
  exit 1
fi

echo "[3/9] Register user B through developer key"
U2_RES=$(curl -sS -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $DEV_KEY" \
  -d "{
    \"full_name\":\"Sami Trabelsi\",
    \"cin\":\"$U2_CIN\",
    \"date_of_birth\":\"1991-11-09\",
    \"phone\":\"$U2_PHONE\",
    \"email\":\"u2.$STAMP@example.com\",
    \"address_line\":\"Avenue Habib Bourguiba\",
    \"city\":\"Sfax\",
    \"governorate\":\"Sfax\"
  }")
U2_ADDR=$(echo "$U2_RES" | jq -r '.chain_address')

if [[ -z "$U2_ADDR" || "$U2_ADDR" == "null" ]]; then
  echo "User B registration failed: $U2_RES" >&2
  exit 1
fi

echo "User A: $U1_ADDR"
echo "User B: $U2_ADDR"

echo "[4/9] Login users"
U1_TOKEN=$(curl -sS -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"cin\":\"$U1_CIN\",\"phone\":\"$U1_PHONE\"}" | jq -r '.token')
U2_TOKEN=$(curl -sS -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"cin\":\"$U2_CIN\",\"phone\":\"$U2_PHONE\"}" | jq -r '.token')

if [[ -z "$U1_TOKEN" || "$U1_TOKEN" == "null" ]]; then
  echo "User A login failed" >&2
  exit 1
fi

if [[ -z "$U2_TOKEN" || "$U2_TOKEN" == "null" ]]; then
  echo "User B login failed" >&2
  exit 1
fi

echo "[5/9] Read wallet details (protected)"
curl -sS "$API_URL/accounts/$U1_ADDR" \
  -H "X-API-Key: $DEV_KEY" \
  -H "X-Account-Token: $U1_TOKEN" | jq

echo "[6/9] Transfer 50.000 TND from A to B"
TRANSFER=$(curl -sS -X POST "$API_URL/accounts/$U1_ADDR/transfer" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $DEV_KEY" \
  -H "X-Account-Token: $U1_TOKEN" \
  -d "{\"to\":\"$U2_ADDR\",\"amount\":50000,\"memo\":\"April rent\",\"pin\":\"1234\"}")
echo "$TRANSFER" | jq

echo "[7/9] Request loan for user A"
LOAN=$(curl -sS -X POST "$API_URL/loans/request" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $DEV_KEY" \
  -H "X-Account-Token: $U1_TOKEN" \
  -d "{\"borrower\":\"$U1_ADDR\",\"amount\":1000000,\"purpose\":\"Business working capital\"}")
echo "$LOAN" | jq

echo "[8/9] Chain stats (public) and blocks (protected)"
curl -sS "$API_URL/chain/stats" | jq
curl -sS "$API_URL/chain/blocks?page=1&limit=5" \
  -H "X-API-Key: $DEV_KEY" | jq

echo "[9/9] Developer usage snapshot"
DEV_PREFIX=$(echo "$DEV_KEY" | cut -c1-8)
psql "${NEXAPAY_DATABASE_URL:-postgresql://nexapay:nexapay_secret@localhost:5433/nexapay}" -c "select api_key_prefix, monthly_calls from developers where api_key_prefix='${DEV_PREFIX}';" || true

echo "E2E demo completed"
