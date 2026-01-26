-- Create disputes table
CREATE TABLE IF NOT EXISTS disputes (
    dispute_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(transaction_id) ON DELETE SET NULL,
    card_id UUID REFERENCES cards(card_id) ON DELETE SET NULL,
    dispute_type VARCHAR(50) NOT NULL CHECK (dispute_type IN (
        'unauthorized_transaction', 'incorrect_amount', 'duplicate_charge',
        'service_not_received', 'product_not_received', 'defective_product',
        'cancelled_service', 'fraudulent_charge', 'billing_error', 'other'
    )),
    dispute_category VARCHAR(50) CHECK (dispute_category IN (
        'fraud', 'billing', 'service', 'quality', 'other'
    )),
    amount_disputed DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    merchant_name VARCHAR(255),
    transaction_date DATE,
    description TEXT NOT NULL,
    evidence_provided TEXT[],
    evidence_documents JSONB,
    status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN (
        'submitted', 'under_review', 'pending_merchant', 'pending_customer',
        'resolved_in_favor', 'resolved_against', 'partially_resolved', 'withdrawn', 'escalated'
    )),
    resolution VARCHAR(50) CHECK (resolution IN (
        'full_refund', 'partial_refund', 'no_refund', 'chargeback',
        'merchant_credit', 'account_adjustment', 'withdrawn', 'pending'
    )),
    refund_amount DECIMAL(15, 2),
    case_number VARCHAR(50) UNIQUE,
    assigned_to VARCHAR(100),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    customer_notes TEXT,
    internal_notes TEXT,
    resolution_notes TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    deadline_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_disputes_user_id ON disputes(user_id);
CREATE INDEX idx_disputes_account_id ON disputes(account_id);
CREATE INDEX idx_disputes_transaction_id ON disputes(transaction_id);
CREATE INDEX idx_disputes_status ON disputes(status);
CREATE INDEX idx_disputes_type ON disputes(dispute_type);
CREATE INDEX idx_disputes_case_number ON disputes(case_number);
CREATE INDEX idx_disputes_created_at ON disputes(created_at DESC);
CREATE INDEX idx_disputes_priority ON disputes(priority);

-- Apply updated_at trigger
CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON disputes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate unique case numbers
CREATE OR REPLACE FUNCTION generate_case_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    new_case_number VARCHAR(50);
    case_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate case number: CASE + YYYYMM + random 8 digits
        new_case_number := 'CASE' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMM') || LPAD(FLOOR(RANDOM() * 100000000)::TEXT, 8, '0');
        
        SELECT EXISTS(SELECT 1 FROM disputes WHERE case_number = new_case_number) INTO case_exists;
        
        EXIT WHEN NOT case_exists;
    END LOOP;
    
    RETURN new_case_number;
END;
$$ LANGUAGE plpgsql;
