-- Create cards table
CREATE TABLE IF NOT EXISTS cards (
    card_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    card_number_encrypted VARCHAR(255) NOT NULL,
    card_number_last4 VARCHAR(4) NOT NULL,
    card_type VARCHAR(20) NOT NULL CHECK (card_type IN ('debit', 'credit', 'prepaid', 'virtual')),
    card_brand VARCHAR(20) CHECK (card_brand IN ('visa', 'mastercard', 'amex', 'discover')),
    cardholder_name VARCHAR(200) NOT NULL,
    expiry_month INTEGER NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
    expiry_year INTEGER NOT NULL CHECK (expiry_year >= EXTRACT(YEAR FROM CURRENT_DATE)),
    cvv_encrypted VARCHAR(255) NOT NULL,
    pin_hash VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'expired', 'cancelled', 'lost', 'stolen')),
    daily_limit DECIMAL(10, 2) DEFAULT 2000.00,
    monthly_limit DECIMAL(10, 2) DEFAULT 20000.00,
    is_contactless BOOLEAN DEFAULT true,
    is_international BOOLEAN DEFAULT false,
    is_virtual BOOLEAN DEFAULT false,
    billing_address_line1 VARCHAR(255),
    billing_address_line2 VARCHAR(255),
    billing_city VARCHAR(100),
    billing_state VARCHAR(50),
    billing_zip_code VARCHAR(20),
    billing_country VARCHAR(100) DEFAULT 'USA',
    activation_date TIMESTAMP WITH TIME ZONE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    blocked_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_cards_account_id ON cards(account_id);
CREATE INDEX idx_cards_user_id ON cards(user_id);
CREATE INDEX idx_cards_last4 ON cards(card_number_last4);
CREATE INDEX idx_cards_status ON cards(status);
CREATE INDEX idx_cards_type ON cards(card_type);
CREATE INDEX idx_cards_expiry ON cards(expiry_year, expiry_month);

-- Apply updated_at trigger
CREATE TRIGGER update_cards_updated_at BEFORE UPDATE ON cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
