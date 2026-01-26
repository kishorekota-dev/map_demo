-- Create fraud_alerts table
CREATE TABLE IF NOT EXISTS fraud_alerts (
    alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(account_id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(transaction_id) ON DELETE SET NULL,
    card_id UUID REFERENCES cards(card_id) ON DELETE SET NULL,
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
        'unusual_activity', 'high_value_transaction', 'multiple_failed_attempts',
        'location_mismatch', 'velocity_check', 'suspicious_merchant', 
        'card_not_present', 'account_takeover', 'identity_theft'
    )),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
    description TEXT NOT NULL,
    details JSONB,
    amount DECIMAL(15, 2),
    location VARCHAR(255),
    ip_address INET,
    device_fingerprint VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'investigating', 'confirmed', 'false_positive', 'resolved'
    )),
    action_taken VARCHAR(50) CHECK (action_taken IN (
        'none', 'blocked_transaction', 'blocked_card', 'frozen_account',
        'notified_user', 'manual_review', 'escalated'
    )),
    resolved_by UUID REFERENCES users(user_id),
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX idx_fraud_alerts_user_id ON fraud_alerts(user_id);
CREATE INDEX idx_fraud_alerts_account_id ON fraud_alerts(account_id);
CREATE INDEX idx_fraud_alerts_transaction_id ON fraud_alerts(transaction_id);
CREATE INDEX idx_fraud_alerts_type ON fraud_alerts(alert_type);
CREATE INDEX idx_fraud_alerts_severity ON fraud_alerts(severity);
CREATE INDEX idx_fraud_alerts_status ON fraud_alerts(status);
CREATE INDEX idx_fraud_alerts_created_at ON fraud_alerts(created_at DESC);
CREATE INDEX idx_fraud_alerts_risk_score ON fraud_alerts(risk_score DESC);

-- Apply updated_at trigger
CREATE TRIGGER update_fraud_alerts_updated_at BEFORE UPDATE ON fraud_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
