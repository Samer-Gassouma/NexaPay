ALTER TABLE developers
ADD COLUMN IF NOT EXISTS phone VARCHAR(32);

ALTER TABLE developers
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS idx_developers_phone_unique
ON developers (phone)
WHERE phone IS NOT NULL;
