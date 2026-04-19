# NexaPay API Reference

This document contains a concise reference for the most-used NexaPay HTTP API endpoints (development & production). Include the required headers and example requests/responses.

## Authentication headers

- `X-API-Key`: Developer/Bank API key (required for bank/developer-only endpoints).
- `X-Account-Token`: JWT session token for normal users (issued after OTP/password login).

---

## POST /auth/register

Create a new user account. The server will normalize local 8-digit phone numbers (prepend `216`) and will send an OTP to verify the phone number. In development, the response may include `dev_otp`.

Request JSON:

```json
{
  "full_name": "Samer Gassouma",
  "cin": "14045739",
  "date_of_birth": "1990-01-01",
  "phone": "21612345678",
  "password": "secret123",
  "email": "user@example.local"
}
```

Response (success):

```json
{
  "success": true,
  "chain_address": "NXP...",
  "account": { "account_number": "...", "rib": "...", "iban": "..." },
  "card": { "card_number": "•••• •••• •••• 1234", "cvv": "123", "expiry": "04/30" },
  "private_key": "<private_key>",
  "message": "Keep your private key safe...",
  "phone_hint": "***78",
  "dev_otp": "123456"   // only in dev fallback
}
```

Notes:
- The server stores an OTP hash on the user row and attempts to deliver via Twilio. If delivery fails and `APP_ENV=development` (or `DEV_SHOW_OTP=true`) the `dev_otp` is returned for local testing.
- The UI typically hides the private key until phone OTP verification.

---

## POST /auth/login/password

Login using CIN + password.

Request:

```json
{ "cin": "14045739", "password": "secret123" }
```

Response (success):

```json
{ "token": "<X-Account-Token>", "chain_address": "NXP..." }
```

---

## POST /auth/login/otp/request

Request an OTP for the given CIN.

Request:

```json
{ "cin": "14045739" }
```

Response:

```json
{ "success": true, "message": "OTP sent successfully", "phone_hint": "***78", "dev_otp": "123456" }
```

---

## POST /auth/login/otp/verify

Verify OTP and receive a session token.

Request:

```json
{ "cin": "14045739", "otp": "123456" }
```

Response:

```json
{ "token": "<X-Account-Token>", "chain_address": "NXP..." }
```

---

## GET /accounts/:address

Get account details for the given `chain_address`.

Headers: `X-Account-Token` required (user must match `:address`). `X-API-Key` may be omitted for normal user flows.

Response example:

```json
{
  "chain_address": "NXP...",
  "full_name": "Samer Gassouma",
  "balance": 0,
  "balance_display": "0.000 TND",
  "account_number": "...",
  "rib": "...",
  "iban": "...",
  "card_last4": "1234",
  "card_expiry": "04/30",
  "tx_count": 10,
  "created_at": "2026-04-18T..."
}
```

Errors:
- 401 Unauthorized: missing/invalid `X-Account-Token`.
- 404 Not Found: account not present (on-chain account may need repair).

---

## GET /accounts/:address/transactions

List transactions for `:address`. Requires `X-Account-Token` (or developer API key for bank scope).

Response: `{ "transactions": [ { id, type, from, to, amount, memo, timestamp, block, hash }, ... ] }`

---

## Loans endpoints (example)

- `GET /loans/:address` — retrieve loan details (accepts account-token or developer API key via `try_api_key`).
- `POST /loans/request` — create loan request (requires auth; schema varies).

Refer to server `blockchain/src/api/loans.rs` for full fields.

---

## Developer endpoints (dev/admin)

### POST /dev/register

Create a developer API key (used for testing and calling admin endpoints).

Request:

```json
{ "company_name": "local-debug", "contact_name": "me", "email": "dev@example.local", "plan": "free" }
```

Response contains `api_key` and `api_key_prefix`.

### POST /dev/repair_account

Create or repair an on-chain account (dev only).

Headers: When `APP_ENV!=development` you MUST provide a valid Developer `X-API-Key`.

Request:

```json
{ "address": "NXP...", "balance": 0 }
```

Response:

```json
{ "success": true, "address": "NXP..." }
```

---

## Notes & testing tips

- For local development, set `APP_ENV=development` or `DEV_SHOW_OTP=true` to get OTP values in responses instead of relying on Twilio delivery.
- Normal users should not need `X-API-Key`; user flows use `X-Account-Token` (JWT) issued after OTP/password verification.
- For full API reference, consult the server sources in `blockchain/src/api/*.rs`.

---

If you'd like, I can expand this file with full request/response schemas and examples for every endpoint (loans, payments, bank APIs). Reply which areas to expand.
