-- Create accounts table
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

-- Create indexes
CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_accounts_account_number ON accounts(account_number);
CREATE INDEX idx_accounts_status ON accounts(status);
CREATE INDEX idx_accounts_type ON accounts(account_type);

-- Apply updated_at trigger
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate unique account numbers
CREATE OR REPLACE FUNCTION generate_account_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    new_account_number VARCHAR(20);
    account_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate a 16-digit account number
        new_account_number := LPAD(FLOOR(RANDOM() * 10000000000000000)::TEXT, 16, '0');
        
        -- Check if it already exists
        SELECT EXISTS(SELECT 1 FROM accounts WHERE account_number = new_account_number) INTO account_exists;
        
        EXIT WHEN NOT account_exists;
    END LOOP;
    
    RETURN new_account_number;
END;
$$ LANGUAGE plpgsql;
