-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN (
        'deposit', 'withdrawal', 'transfer', 'payment', 'fee', 
        'interest', 'refund', 'adjustment', 'purchase', 'atm_withdrawal'
    )),
    amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    balance_after DECIMAL(15, 2),
    description TEXT,
    category VARCHAR(50),
    merchant_name VARCHAR(255),
    merchant_category VARCHAR(100),
    reference_number VARCHAR(100) UNIQUE,
    related_account_id UUID REFERENCES accounts(account_id),
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled', 'reversed')),
    location VARCHAR(255),
    device_id VARCHAR(100),
    ip_address INET,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for better query performance
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX idx_transactions_reference ON transactions(reference_number);
CREATE INDEX idx_transactions_related_account ON transactions(related_account_id);
CREATE INDEX idx_transactions_category ON transactions(category);

-- Apply updated_at trigger
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate unique reference numbers
CREATE OR REPLACE FUNCTION generate_reference_number()
RETURNS VARCHAR(100) AS $$
DECLARE
    new_reference VARCHAR(100);
    ref_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate reference: TXN + timestamp + random 6 digits
        new_reference := 'TXN' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDDHH24MISS') || LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
        
        SELECT EXISTS(SELECT 1 FROM transactions WHERE reference_number = new_reference) INTO ref_exists;
        
        EXIT WHEN NOT ref_exists;
    END LOOP;
    
    RETURN new_reference;
END;
$$ LANGUAGE plpgsql;
