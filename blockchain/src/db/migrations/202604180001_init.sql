CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_address VARCHAR(64) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    cin VARCHAR(20) UNIQUE NOT NULL,
    date_of_birth DATE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    address_line TEXT,
    city VARCHAR(100),
    governorate VARCHAR(100),
    kyc_status VARCHAR(20) DEFAULT 'verified',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_address VARCHAR(64) UNIQUE NOT NULL,
    card_number VARCHAR(256) NOT NULL,
    card_holder_name VARCHAR(255) NOT NULL,
    expiry_month VARCHAR(2) NOT NULL,
    expiry_year VARCHAR(4) NOT NULL,
    cvv VARCHAR(256) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_address VARCHAR(64) UNIQUE NOT NULL,
    account_number VARCHAR(20) UNIQUE NOT NULL,
    rib VARCHAR(24) UNIQUE NOT NULL,
    iban VARCHAR(32) UNIQUE NOT NULL,
    bic VARCHAR(11) DEFAULT 'NXPYTNTT',
    currency VARCHAR(3) DEFAULT 'TND',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS banks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    chain_address VARCHAR(64) UNIQUE NOT NULL,
    api_key VARCHAR(64) UNIQUE NOT NULL,
    api_key_prefix VARCHAR(8) NOT NULL,
    subscription_status VARCHAR(20) DEFAULT 'active',
    bank_code VARCHAR(10) UNIQUE NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    joined_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS developers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    api_key VARCHAR(64) UNIQUE NOT NULL,
    api_key_prefix VARCHAR(8) NOT NULL,
    plan VARCHAR(20) DEFAULT 'free',
    monthly_calls INTEGER DEFAULT 0,
    call_limit INTEGER DEFAULT 1000,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_prefix VARCHAR(8),
    endpoint VARCHAR(255),
    method VARCHAR(10),
    status_code INTEGER,
    called_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id UUID UNIQUE NOT NULL,
    borrower_address VARCHAR(64) NOT NULL,
    amount BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    interest_rate VARCHAR(16) NOT NULL,
    due_date DATE NOT NULL,
    contract_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    repaid_at TIMESTAMPTZ
);
