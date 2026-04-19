ALTER TABLE users
    ADD COLUMN IF NOT EXISTS created_by_api_key_prefix VARCHAR(8);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS created_by_principal_type VARCHAR(16);

CREATE INDEX IF NOT EXISTS idx_users_created_by_prefix
    ON users (created_by_api_key_prefix);
