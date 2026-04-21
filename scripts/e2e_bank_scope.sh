#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:8080}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for this script. Install jq and retry." >&2
  exit 1
fi

register_bank() {
  local name="$1"
  local code="$2"
  local email="$3"

  curl -sS -X POST "$API_URL/network/banks/register" \
    -H "Content-Type: application/json" \
    -d "{\"bank_name\":\"$name\",\"bank_code\":\"$code\",\"contact_email\":\"$email\",\"contact_name\":\"API Admin\"}" \
    | jq -r '.api_key'
}

register_user_with_bank_key() {
  local api_key="$1"
  local full_name="$2"
  local cin="$3"
  local phone="$4"

  curl -sS -X POST "$API_URL/auth/register" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $api_key" \
    -d "{\"full_name\":\"$full_name\",\"cin\":\"$cin\",\"date_of_birth\":\"1994-01-01\",\"phone\":\"$phone\",\"email\":\"$cin@example.com\",\"address_line\":\"N/A\",\"city\":\"Tunis\",\"governorate\":\"Tunis\"}" >/dev/null
}

echo "Registering two banks"
BANK1_KEY=$(register_bank "Bank One" "11" "bank1@nexapay.space")
BANK2_KEY=$(register_bank "Bank Two" "12" "bank2@nexapay.space")

echo "Register users under each bank key"
register_user_with_bank_key "$BANK1_KEY" "Bank One User" "11112222" "21611112222"
register_user_with_bank_key "$BANK2_KEY" "Bank Two User" "33334444" "21633334444"

echo "Bank One scoped accounts"
B1=$(curl -sS "$API_URL/network/banks/accounts" -H "X-API-Key: $BANK1_KEY")
echo "$B1" | jq

echo "Bank Two scoped accounts"
B2=$(curl -sS "$API_URL/network/banks/accounts" -H "X-API-Key: $BANK2_KEY")
echo "$B2" | jq

echo "Bank scope check completed"
