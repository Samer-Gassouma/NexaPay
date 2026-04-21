# NexaPay Curl Walkthrough

## Prerequisites

- API running on https://backend.nexapay.space
- jq installed

## 1) Register a Developer

```bash
DEV=$(curl -s -X POST https://backend.nexapay.space/dev/register \
  -H 'Content-Type: application/json' \
  -d '{"company_name":"Startup XYZ","contact_name":"Founder","email":"dev@startup.tn","plan":"free"}')
DEV_KEY=$(echo "$DEV" | jq -r '.api_key')
```

## 2) Register a User (with API key attribution)

```bash
REG=$(curl -s -X POST https://backend.nexapay.space/auth/register \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $DEV_KEY" \
  -d '{
    "full_name":"Mohamed Ben Ali",
    "cin":"12345678",
    "date_of_birth":"1995-03-15",
    "phone":"21612345678",
    "email":"user@example.com",
    "address_line":"Rue de la Liberte",
    "city":"Tunis",
    "governorate":"Tunis"
  }')
ADDR=$(echo "$REG" | jq -r '.chain_address')
```

## 3) Login and get account token

```bash
TOKEN=$(curl -s -X POST https://backend.nexapay.space/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"cin":"12345678","phone":"21612345678"}' | jq -r '.token')
```

## 4) Call protected user endpoints (needs both headers)

```bash
curl -s https://backend.nexapay.space/accounts/$ADDR \
  -H "X-API-Key: $DEV_KEY" \
  -H "X-Account-Token: $TOKEN" | jq
```

## 5) Request a loan (needs both headers)

```bash
curl -s -X POST https://backend.nexapay.space/loans/request \
  -H 'Content-Type: application/json' \
  -H "X-API-Key: $DEV_KEY" \
  -H "X-Account-Token: $TOKEN" \
  -d "{\"borrower\":\"$ADDR\",\"amount\":1000000,\"purpose\":\"Working capital\"}" | jq
```

## 6) Chain endpoints

- Public: /chain/stats
- Protected: /chain/blocks, /chain/blocks/:index, /chain/transactions/:hash

```bash
curl -s https://backend.nexapay.space/chain/stats | jq
curl -s 'https://backend.nexapay.space/chain/blocks?page=1&limit=5' -H "X-API-Key: $DEV_KEY" | jq
```
