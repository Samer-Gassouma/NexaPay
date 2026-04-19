ALTER TABLE cards
    ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(128),
    ADD COLUMN IF NOT EXISTS failed_pin_attempts INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type VARCHAR(16) NOT NULL,
    owner_id UUID,
    name VARCHAR(96) NOT NULL,
    key_hash VARCHAR(128) UNIQUE NOT NULL,
    prefix VARCHAR(32) NOT NULL,
    checksum VARCHAR(16) NOT NULL,
    format_version SMALLINT NOT NULL DEFAULT 1,
    permissions TEXT NOT NULL,
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
    daily_limit INTEGER NOT NULL DEFAULT 10000,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    rotated_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys (status);

CREATE TABLE IF NOT EXISTS merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_code VARCHAR(32) UNIQUE NOT NULL,
    owner_type VARCHAR(16) NOT NULL,
    owner_id UUID,
    name VARCHAR(255) NOT NULL,
    business_name VARCHAR(255),
    support_email VARCHAR(255) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchants_owner ON merchants (owner_type, owner_id);

CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_id VARCHAR(40) UNIQUE NOT NULL,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    currency VARCHAR(8) NOT NULL DEFAULT 'TND',
    status VARCHAR(24) NOT NULL,
    description TEXT,
    customer_email VARCHAR(255),
    customer_name VARCHAR(255),
    metadata JSONB,
    idempotency_key VARCHAR(128),
    card_last4 VARCHAR(4),
    card_brand VARCHAR(24),
    payment_method VARCHAR(24),
    failure_reason TEXT,
    confirm_attempts INTEGER NOT NULL DEFAULT 0,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_merchant ON payment_intents (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents (status);

CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_id VARCHAR(40) UNIQUE NOT NULL,
    intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    reason TEXT,
    status VARCHAR(24) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_merchant ON refunds (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refunds_intent ON refunds (intent_id);

CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    event_types TEXT NOT NULL,
    signing_secret VARCHAR(128) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_merchant ON webhooks (merchant_id, is_active);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    request_signature VARCHAR(128),
    response_status INTEGER,
    response_body TEXT,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    attempt INTEGER NOT NULL DEFAULT 1,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries (webhook_id, delivered_at DESC);

CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id VARCHAR(40) UNIQUE NOT NULL,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    destination VARCHAR(255) NOT NULL,
    status VARCHAR(24) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payouts_merchant ON payouts (merchant_id, created_at DESC);
