-- Customer Service Database Schema
-- BIAN Service Domain: Party Reference Data Management

-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_number VARCHAR(20) UNIQUE NOT NULL,
    title VARCHAR(10),
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(20),
    nationality VARCHAR(3),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    
    -- Address information
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(3),
    
    -- KYC Information
    kyc_status VARCHAR(20) DEFAULT 'PENDING' CHECK (kyc_status IN ('PENDING', 'IN_PROGRESS', 'VERIFIED', 'REJECTED')),
    kyc_verified_at TIMESTAMP,
    kyc_verified_by VARCHAR(100),
    risk_rating VARCHAR(20) DEFAULT 'MEDIUM' CHECK (risk_rating IN ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH')),
    
    -- Identity documents
    id_type VARCHAR(50),
    id_number VARCHAR(100),
    id_expiry_date DATE,
    id_issuing_country VARCHAR(3),
    
    -- Account status
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED')),
    customer_segment VARCHAR(50) DEFAULT 'RETAIL',
    preferred_language VARCHAR(10) DEFAULT 'en',
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

-- Create customer contacts table (additional contact methods)
CREATE TABLE IF NOT EXISTS customer_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    contact_type VARCHAR(20) NOT NULL CHECK (contact_type IN ('EMAIL', 'PHONE', 'MOBILE', 'FAX', 'ADDRESS')),
    contact_purpose VARCHAR(50) CHECK (contact_purpose IN ('PRIMARY', 'WORK', 'HOME', 'EMERGENCY', 'OTHER')),
    contact_value TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create customer relationships table (family, business connections)
CREATE TABLE IF NOT EXISTS customer_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    related_customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN ('SPOUSE', 'PARENT', 'CHILD', 'SIBLING', 'BUSINESS_PARTNER', 'GUARANTOR', 'BENEFICIARY')),
    relationship_status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (relationship_status IN ('ACTIVE', 'INACTIVE', 'TERMINATED')),
    start_date DATE,
    end_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create customer preferences table
CREATE TABLE IF NOT EXISTS customer_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
    
    -- Communication preferences
    email_notifications BOOLEAN DEFAULT TRUE,
    sms_notifications BOOLEAN DEFAULT TRUE,
    push_notifications BOOLEAN DEFAULT TRUE,
    marketing_emails BOOLEAN DEFAULT FALSE,
    
    -- Statement preferences
    statement_frequency VARCHAR(20) DEFAULT 'MONTHLY' CHECK (statement_frequency IN ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY')),
    statement_delivery VARCHAR(20) DEFAULT 'EMAIL' CHECK (statement_delivery IN ('EMAIL', 'POST', 'BOTH')),
    
    -- Security preferences
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    biometric_enabled BOOLEAN DEFAULT FALSE,
    
    -- Other preferences
    preferred_branch VARCHAR(100),
    preferred_currency VARCHAR(3) DEFAULT 'USD',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_customer_number ON customers(customer_number);
CREATE INDEX idx_customers_kyc_status ON customers(kyc_status);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customer_contacts_customer_id ON customer_contacts(customer_id);
CREATE INDEX idx_customer_relationships_customer_id ON customer_relationships(customer_id);
CREATE INDEX idx_customer_relationships_related_customer_id ON customer_relationships(related_customer_id);

-- Create function to generate customer number
CREATE OR REPLACE FUNCTION generate_customer_number()
RETURNS VARCHAR(20) AS $$
DECLARE
    new_number VARCHAR(20);
    max_number INTEGER;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(customer_number FROM 4) AS INTEGER)), 0)
    INTO max_number
    FROM customers
    WHERE customer_number LIKE 'CUS%';
    
    new_number := 'CUS' || LPAD((max_number + 1)::TEXT, 10, '0');
    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate customer number
CREATE OR REPLACE FUNCTION set_customer_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.customer_number IS NULL THEN
        NEW.customer_number := generate_customer_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_customer_number
    BEFORE INSERT ON customers
    FOR EACH ROW
    EXECUTE FUNCTION set_customer_number();

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_contacts_updated_at
    BEFORE UPDATE ON customer_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_relationships_updated_at
    BEFORE UPDATE ON customer_relationships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_preferences_updated_at
    BEFORE UPDATE ON customer_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert comment for documentation
COMMENT ON TABLE customers IS 'BIAN Party Reference Data Management - Customer master data';
COMMENT ON TABLE customer_contacts IS 'Additional contact methods for customers';
COMMENT ON TABLE customer_relationships IS 'Relationships between customers';
COMMENT ON TABLE customer_preferences IS 'Customer communication and service preferences';
