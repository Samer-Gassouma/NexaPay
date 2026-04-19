ALTER TABLE loans
    ADD COLUMN IF NOT EXISTS purpose TEXT,
    ADD COLUMN IF NOT EXISTS duration_months INTEGER,
    ADD COLUMN IF NOT EXISTS requested_amount BIGINT,
    ADD COLUMN IF NOT EXISTS contract_terms TEXT,
    ADD COLUMN IF NOT EXISTS contract_version VARCHAR(32),
    ADD COLUMN IF NOT EXISTS contract_signed_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS contract_signature_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS contract_signed_at TIMESTAMPTZ;
