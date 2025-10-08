-- Complete Banking Database Setup Script
-- Run all migrations and seed data

-- V2: Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
    account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    account_number VARCHAR(20) UNIQUE NOT NULL,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('checking', 'savings', 'credit', 'loan', 'investment')),
    account_name VARCHAR(100) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    balance DECIMAL(15, 2) DEFAULT 0.00,
    available_balance DECIMAL(15, 2) DEFAULT 0.00,
    pending_balance DECIMAL(15, 2) DEFAULT 0.00,
    credit_limit DECIMAL(15, 2),
    interest_rate DECIMAL(5, 4),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed', 'pending')),
    overdraft_protection BOOLEAN DEFAULT false,
    overdraft_limit DECIMAL(10, 2) DEFAULT 0.00,
    daily_transaction_limit DECIMAL(10, 2) DEFAULT 10000.00,
    monthly_transaction_limit DECIMAL(10, 2) DEFAULT 50000.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_account_number ON accounts(account_number);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);

-- V3: Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'transfer', 'payment', 'fee', 'interest', 'refund')),
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    balance_after DECIMAL(15, 2),
    description TEXT,
    reference_number VARCHAR(50) UNIQUE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    category VARCHAR(50),
    merchant_name VARCHAR(200),
    merchant_category VARCHAR(50),
    location VARCHAR(200),
    related_transaction_id UUID REFERENCES transactions(transaction_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- V4: Create cards table
CREATE TABLE IF NOT EXISTS cards (
    card_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    card_number VARCHAR(19) UNIQUE NOT NULL,
    card_type VARCHAR(20) NOT NULL CHECK (card_type IN ('debit', 'credit', 'prepaid', 'virtual')),
    card_holder_name VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    cvv_encrypted TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'expired', 'lost', 'stolen', 'cancelled')),
    pin_encrypted TEXT,
    daily_limit DECIMAL(10, 2) DEFAULT 5000.00,
    monthly_limit DECIMAL(10, 2) DEFAULT 20000.00,
    is_contactless BOOLEAN DEFAULT true,
    is_virtual BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMP WITH TIME ZONE,
    blocked_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_cards_account_id ON cards(account_id);
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);

-- V5: Create transfers table
CREATE TABLE IF NOT EXISTS transfers (
    transfer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_account_id UUID NOT NULL REFERENCES accounts(account_id),
    to_account_id UUID REFERENCES accounts(account_id),
    transfer_type VARCHAR(30) NOT NULL CHECK (transfer_type IN ('internal', 'external', 'wire', 'ach', 'international')),
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    exchange_rate DECIMAL(10, 6),
    fee DECIMAL(10, 2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    beneficiary_name VARCHAR(200),
    beneficiary_account VARCHAR(50),
    beneficiary_bank VARCHAR(200),
    beneficiary_swift VARCHAR(20),
    reference VARCHAR(200),
    purpose VARCHAR(500),
    scheduled_date DATE,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transfers_from_account ON transfers(from_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_account ON transfers(to_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);

-- V6: Create fraud_alerts table
CREATE TABLE IF NOT EXISTS fraud_alerts (
    alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES transactions(transaction_id),
    account_id UUID NOT NULL REFERENCES accounts(account_id),
    alert_type VARCHAR(50) NOT NULL,
    risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'confirmed', 'false_positive', 'resolved')),
    description TEXT,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_fraud_alerts_account ON fraud_alerts(account_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_status ON fraud_alerts(status);

-- V7: Create disputes table
CREATE TABLE IF NOT EXISTS disputes (
    dispute_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(transaction_id),
    account_id UUID NOT NULL REFERENCES accounts(account_id),
    user_id UUID NOT NULL REFERENCES users(user_id),
    dispute_type VARCHAR(50) NOT NULL CHECK (dispute_type IN ('unauthorized', 'fraud', 'incorrect_amount', 'duplicate', 'service_not_received', 'defective_product', 'other')),
    amount DECIMAL(15, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved', 'rejected', 'closed')),
    description TEXT NOT NULL,
    resolution TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_disputes_account ON disputes(account_id);
CREATE INDEX IF NOT EXISTS idx_disputes_user ON disputes(user_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);

-- Insert seed data for accounts
INSERT INTO accounts (user_id, account_number, account_type, account_name, balance, available_balance, status)
SELECT 
    u.user_id,
    LPAD(FLOOR(RANDOM() * 10000000000000000)::TEXT, 16, '0'),
    'checking',
    u.username || '''s Checking Account',
    ROUND(CAST(RANDOM() * 10000 + 1000 AS NUMERIC), 2),
    ROUND(CAST(RANDOM() * 10000 + 1000 AS NUMERIC), 2),
    'active'
FROM users u
WHERE u.username IN ('admin', 'manager', 'james.patterson', 'sarah.johnson', 'michael.chen')
ON CONFLICT DO NOTHING;

-- Insert savings accounts
INSERT INTO accounts (user_id, account_number, account_type, account_name, balance, available_balance, interest_rate, status)
SELECT 
    u.user_id,
    LPAD(FLOOR(RANDOM() * 10000000000000000)::TEXT, 16, '0'),
    'savings',
    u.username || '''s Savings Account',
    ROUND(CAST(RANDOM() * 50000 + 5000 AS NUMERIC), 2),
    ROUND(CAST(RANDOM() * 50000 + 5000 AS NUMERIC), 2),
    0.0250,
    'active'
FROM users u
WHERE u.username IN ('james.patterson', 'sarah.johnson', 'michael.chen')
ON CONFLICT DO NOTHING;

-- Insert sample transactions
INSERT INTO transactions (account_id, transaction_type, amount, description, status, balance_after, processed_at)
SELECT 
    a.account_id,
    'deposit',
    ROUND(CAST(RANDOM() * 1000 + 100 AS NUMERIC), 2),
    'Direct Deposit - Salary',
    'completed',
    a.balance,
    CURRENT_TIMESTAMP - INTERVAL '5 days'
FROM accounts a
LIMIT 10
ON CONFLICT DO NOTHING;

INSERT INTO transactions (account_id, transaction_type, amount, description, status, balance_after, processed_at)
SELECT 
    a.account_id,
    'withdrawal',
    ROUND(CAST(RANDOM() * 200 + 20 AS NUMERIC), 2),
    'ATM Withdrawal',
    'completed',
    a.balance - ROUND(CAST(RANDOM() * 200 + 20 AS NUMERIC), 2),
    CURRENT_TIMESTAMP - INTERVAL '3 days'
FROM accounts a
LIMIT 8
ON CONFLICT DO NOTHING;

-- Insert sample cards
INSERT INTO cards (account_id, user_id, card_number, card_type, card_holder_name, expiry_date, status, activated_at)
SELECT 
    a.account_id,
    a.user_id,
    '4532' || LPAD(FLOOR(RANDOM() * 1000000000000)::TEXT, 12, '0'),
    'debit',
    UPPER(u.username),
    CURRENT_DATE + INTERVAL '3 years',
    'active',
    CURRENT_TIMESTAMP - INTERVAL '180 days'
FROM accounts a
JOIN users u ON a.user_id = u.user_id
WHERE a.account_type = 'checking'
LIMIT 10
ON CONFLICT DO NOTHING;

-- Insert sample transfers
INSERT INTO transfers (from_account_id, to_account_id, transfer_type, amount, status, processed_at)
SELECT 
    a1.account_id,
    a2.account_id,
    'internal',
    ROUND(CAST(RANDOM() * 500 + 50 AS NUMERIC), 2),
    'completed',
    CURRENT_TIMESTAMP - INTERVAL '2 days'
FROM accounts a1
CROSS JOIN accounts a2
WHERE a1.account_id != a2.account_id
LIMIT 5
ON CONFLICT DO NOTHING;

-- Update account balances based on transactions
UPDATE accounts a
SET 
    balance = COALESCE((
        SELECT SUM(CASE 
            WHEN t.transaction_type IN ('deposit', 'refund', 'interest') THEN t.amount
            WHEN t.transaction_type IN ('withdrawal', 'payment', 'fee') THEN -t.amount
            ELSE 0
        END)
        FROM transactions t
        WHERE t.account_id = a.account_id AND t.status = 'completed'
    ), 0) + 5000,
    available_balance = balance;

COMMIT;
