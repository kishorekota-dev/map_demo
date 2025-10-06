-- Create transfers table
CREATE TABLE IF NOT EXISTS transfers (
    transfer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_account_id UUID NOT NULL REFERENCES accounts(account_id),
    to_account_id UUID REFERENCES accounts(account_id),
    from_user_id UUID NOT NULL REFERENCES users(user_id),
    to_user_id UUID REFERENCES users(user_id),
    transfer_type VARCHAR(50) NOT NULL CHECK (transfer_type IN (
        'internal', 'external', 'wire', 'ach', 'p2p', 'international'
    )),
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'USD',
    fee DECIMAL(10, 2) DEFAULT 0.00,
    total_amount DECIMAL(15, 2) NOT NULL,
    exchange_rate DECIMAL(10, 6),
    recipient_name VARCHAR(200),
    recipient_account_number VARCHAR(100),
    recipient_bank_name VARCHAR(200),
    recipient_routing_number VARCHAR(50),
    recipient_swift_code VARCHAR(20),
    recipient_iban VARCHAR(50),
    purpose TEXT,
    reference_number VARCHAR(100) UNIQUE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed'
    )),
    scheduled_date DATE,
    initiated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_transfers_from_account ON transfers(from_account_id);
CREATE INDEX idx_transfers_to_account ON transfers(to_account_id);
CREATE INDEX idx_transfers_from_user ON transfers(from_user_id);
CREATE INDEX idx_transfers_status ON transfers(status);
CREATE INDEX idx_transfers_type ON transfers(transfer_type);
CREATE INDEX idx_transfers_reference ON transfers(reference_number);
CREATE INDEX idx_transfers_created_at ON transfers(created_at DESC);
CREATE INDEX idx_transfers_scheduled ON transfers(scheduled_date) WHERE status = 'pending';

-- Apply updated_at trigger
CREATE TRIGGER update_transfers_updated_at BEFORE UPDATE ON transfers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
