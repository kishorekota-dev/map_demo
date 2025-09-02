-- Credit Card Enterprise Database Schema
-- PostgreSQL Database Setup

-- Create database (run this as postgres user)
-- CREATE DATABASE credit_card_enterprise;
-- \c credit_card_enterprise;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (customers, agents, admins)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    date_of_birth DATE,
    ssn VARCHAR(11), -- encrypted/hashed
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(10),
    country VARCHAR(50) DEFAULT 'US',
    role VARCHAR(20) NOT NULL CHECK (role IN ('CUSTOMER', 'AGENT', 'MANAGER', 'ADMIN', 'SUPER_ADMIN')),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    account_locked_until TIMESTAMP,
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE
);

-- Accounts table
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_number VARCHAR(20) UNIQUE NOT NULL,
    account_type VARCHAR(20) DEFAULT 'CREDIT' CHECK (account_type IN ('CREDIT', 'DEBIT', 'SAVINGS')),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED')),
    credit_limit DECIMAL(15,2) DEFAULT 0,
    current_balance DECIMAL(15,2) DEFAULT 0,
    available_credit DECIMAL(15,2) DEFAULT 0,
    minimum_payment DECIMAL(15,2) DEFAULT 0,
    payment_due_date DATE,
    interest_rate DECIMAL(5,4) DEFAULT 0.1999, -- 19.99%
    late_fee DECIMAL(10,2) DEFAULT 25.00,
    overlimit_fee DECIMAL(10,2) DEFAULT 35.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_statement_date DATE,
    next_statement_date DATE
);

-- Cards table
CREATE TABLE cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_number VARCHAR(19) UNIQUE NOT NULL, -- encrypted
    card_type VARCHAR(20) DEFAULT 'CREDIT' CHECK (card_type IN ('CREDIT', 'DEBIT')),
    card_brand VARCHAR(20) DEFAULT 'VISA' CHECK (card_brand IN ('VISA', 'MASTERCARD', 'AMEX', 'DISCOVER')),
    expiry_month INTEGER NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
    expiry_year INTEGER NOT NULL CHECK (expiry_year >= EXTRACT(YEAR FROM CURRENT_DATE)),
    cvv VARCHAR(4) NOT NULL, -- encrypted
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED', 'EXPIRED', 'LOST', 'STOLEN', 'CANCELLED')),
    is_primary BOOLEAN DEFAULT FALSE,
    daily_limit DECIMAL(10,2) DEFAULT 1000.00,
    monthly_limit DECIMAL(10,2) DEFAULT 10000.00,
    international_enabled BOOLEAN DEFAULT TRUE,
    contactless_enabled BOOLEAN DEFAULT TRUE,
    online_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used TIMESTAMP,
    pin_attempts INTEGER DEFAULT 0,
    pin_locked_until TIMESTAMP
);

-- Transactions table
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id VARCHAR(50) UNIQUE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('PURCHASE', 'PAYMENT', 'TRANSFER', 'WITHDRAWAL', 'DEPOSIT', 'FEE', 'REFUND', 'ADJUSTMENT')),
    status VARCHAR(20) DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'DISPUTED')),
    merchant_name VARCHAR(255),
    merchant_category VARCHAR(100),
    merchant_id VARCHAR(50),
    description TEXT,
    authorization_code VARCHAR(20),
    reference_number VARCHAR(50),
    location_city VARCHAR(100),
    location_state VARCHAR(50),
    location_country VARCHAR(50),
    is_international BOOLEAN DEFAULT FALSE,
    is_online BOOLEAN DEFAULT FALSE,
    processing_fee DECIMAL(10,2) DEFAULT 0,
    exchange_rate DECIMAL(10,6) DEFAULT 1.0,
    original_amount DECIMAL(15,2),
    original_currency VARCHAR(3),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    settled_at TIMESTAMP,
    fraud_score DECIMAL(3,2) DEFAULT 0.0,
    risk_level VARCHAR(10) DEFAULT 'LOW' CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

-- Balance Transfers table
CREATE TABLE balance_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    to_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transfer_id VARCHAR(50) UNIQUE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    fee DECIMAL(10,2) DEFAULT 0,
    promotional_rate DECIMAL(5,4),
    promotional_period_months INTEGER,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED')),
    reason TEXT,
    requested_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_date TIMESTAMP,
    completed_date TIMESTAMP,
    rejected_date TIMESTAMP,
    approved_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Disputes table
CREATE TABLE disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dispute_id VARCHAR(50) UNIQUE NOT NULL,
    dispute_type VARCHAR(50) NOT NULL CHECK (dispute_type IN ('UNAUTHORIZED', 'BILLING_ERROR', 'PRODUCT_SERVICE', 'DUPLICATE_CHARGE', 'CREDIT_NOT_PROCESSED', 'OTHER')),
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED', 'APPEALED')),
    amount DECIMAL(15,2) NOT NULL,
    reason TEXT NOT NULL,
    description TEXT,
    evidence TEXT,
    merchant_response TEXT,
    resolution TEXT,
    temporary_credit BOOLEAN DEFAULT FALSE,
    temporary_credit_amount DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    assigned_to UUID REFERENCES users(id),
    priority VARCHAR(10) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT'))
);

-- Fraud Cases table
CREATE TABLE fraud_cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    case_id VARCHAR(50) UNIQUE NOT NULL,
    case_type VARCHAR(50) NOT NULL CHECK (case_type IN ('IDENTITY_THEFT', 'CARD_FRAUD', 'ACCOUNT_TAKEOVER', 'SUSPICIOUS_ACTIVITY', 'PHISHING', 'OTHER')),
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED', 'FALSE_POSITIVE')),
    severity VARCHAR(10) DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    fraud_score DECIMAL(3,2) NOT NULL,
    amount_involved DECIMAL(15,2) DEFAULT 0,
    description TEXT NOT NULL,
    investigation_notes TEXT,
    resolution TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    assigned_to UUID REFERENCES users(id),
    risk_indicators JSONB,
    evidence JSONB
);

-- Audit Log table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'SUCCESS' CHECK (status IN ('SUCCESS', 'FAILED', 'ERROR'))
);

-- Sessions table for JWT token management
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    device_info TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);

CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_accounts_account_number ON accounts(account_number);
CREATE INDEX idx_accounts_status ON accounts(status);

CREATE INDEX idx_cards_account_id ON cards(account_id);
CREATE INDEX idx_cards_user_id ON cards(user_id);
CREATE INDEX idx_cards_card_number ON cards(card_number);
CREATE INDEX idx_cards_status ON cards(status);

CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_card_id ON transactions(card_id);
CREATE INDEX idx_transactions_transaction_id ON transactions(transaction_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);

CREATE INDEX idx_balance_transfers_from_account ON balance_transfers(from_account_id);
CREATE INDEX idx_balance_transfers_to_account ON balance_transfers(to_account_id);
CREATE INDEX idx_balance_transfers_user_id ON balance_transfers(user_id);
CREATE INDEX idx_balance_transfers_status ON balance_transfers(status);

CREATE INDEX idx_disputes_transaction_id ON disputes(transaction_id);
CREATE INDEX idx_disputes_user_id ON disputes(user_id);
CREATE INDEX idx_disputes_dispute_id ON disputes(dispute_id);
CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_disputes_created_at ON disputes(created_at);

CREATE INDEX idx_fraud_cases_user_id ON fraud_cases(user_id);
CREATE INDEX idx_fraud_cases_transaction_id ON fraud_cases(transaction_id);
CREATE INDEX idx_fraud_cases_case_id ON fraud_cases(case_id);
CREATE INDEX idx_fraud_cases_status ON fraud_cases(status);
CREATE INDEX idx_fraud_cases_severity ON fraud_cases(severity);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX idx_sessions_expires_at ON user_sessions(expires_at);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_balance_transfers_updated_at BEFORE UPDATE ON balance_transfers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON disputes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fraud_cases_updated_at BEFORE UPDATE ON fraud_cases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
