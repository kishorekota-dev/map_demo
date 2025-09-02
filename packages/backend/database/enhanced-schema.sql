-- Enhanced Credit Card Enterprise Database Schema
-- Following BIAN (Banking Industry Architecture Network) Standards
-- PostgreSQL Database Setup for Enterprise Banking

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===============================================
-- CUSTOMER INFORMATION MANAGEMENT (BIAN Domain)
-- ===============================================

-- Enhanced Users/Customers table with comprehensive PII and KYC data
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Core Identity Information
    customer_reference VARCHAR(20) UNIQUE NOT NULL, -- CIF (Customer Information File) number
    legal_entity_type VARCHAR(20) DEFAULT 'INDIVIDUAL' CHECK (legal_entity_type IN ('INDIVIDUAL', 'BUSINESS', 'TRUST', 'PARTNERSHIP')),
    
    -- Personal Information
    title VARCHAR(10) CHECK (title IN ('Mr', 'Mrs', 'Ms', 'Dr', 'Prof')),
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    maiden_name VARCHAR(100),
    preferred_name VARCHAR(100),
    suffix VARCHAR(10),
    gender VARCHAR(10) CHECK (gender IN ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY')),
    date_of_birth DATE NOT NULL,
    place_of_birth VARCHAR(100),
    nationality VARCHAR(50),
    citizenship_status VARCHAR(50),
    
    -- Government Identification
    ssn_encrypted TEXT, -- Social Security Number (encrypted)
    ein_encrypted TEXT, -- Employer Identification Number (for business)
    drivers_license_number VARCHAR(50),
    drivers_license_state VARCHAR(2),
    drivers_license_expiry DATE,
    passport_number VARCHAR(50),
    passport_country VARCHAR(3),
    passport_expiry DATE,
    
    -- Contact Information
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMP,
    phone_primary VARCHAR(20) NOT NULL,
    phone_secondary VARCHAR(20),
    phone_verified BOOLEAN DEFAULT FALSE,
    phone_verified_at TIMESTAMP,
    preferred_contact_method VARCHAR(20) DEFAULT 'EMAIL' CHECK (preferred_contact_method IN ('EMAIL', 'PHONE', 'SMS', 'MAIL')),
    language_preference VARCHAR(10) DEFAULT 'EN',
    
    -- Address Information (Primary)
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(50) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(3) DEFAULT 'USA',
    address_type VARCHAR(20) DEFAULT 'RESIDENTIAL' CHECK (address_type IN ('RESIDENTIAL', 'BUSINESS', 'MAILING')),
    address_verified BOOLEAN DEFAULT FALSE,
    address_verified_at TIMESTAMP,
    
    -- Employment Information
    employment_status VARCHAR(30) CHECK (employment_status IN ('EMPLOYED', 'SELF_EMPLOYED', 'UNEMPLOYED', 'RETIRED', 'STUDENT', 'HOMEMAKER')),
    employer_name VARCHAR(255),
    job_title VARCHAR(100),
    work_phone VARCHAR(20),
    employment_start_date DATE,
    annual_income DECIMAL(15,2),
    income_source VARCHAR(50),
    income_verified BOOLEAN DEFAULT FALSE,
    income_verification_date DATE,
    
    -- Financial Information
    credit_score INTEGER CHECK (credit_score BETWEEN 300 AND 850),
    credit_score_date DATE,
    credit_bureau VARCHAR(20),
    net_worth DECIMAL(15,2),
    liquid_assets DECIMAL(15,2),
    monthly_expenses DECIMAL(15,2),
    debt_to_income_ratio DECIMAL(5,2),
    
    -- Risk and Compliance
    risk_rating VARCHAR(20) DEFAULT 'MEDIUM' CHECK (risk_rating IN ('LOW', 'MEDIUM', 'HIGH', 'PROHIBITED')),
    kyc_status VARCHAR(20) DEFAULT 'PENDING' CHECK (kyc_status IN ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED')),
    kyc_completion_date DATE,
    aml_status VARCHAR(20) DEFAULT 'CLEAR' CHECK (aml_status IN ('CLEAR', 'PENDING', 'FLAGGED', 'BLOCKED')),
    cip_completed BOOLEAN DEFAULT FALSE, -- Customer Identification Program
    ofac_checked BOOLEAN DEFAULT FALSE, -- Office of Foreign Assets Control
    pep_status BOOLEAN DEFAULT FALSE, -- Politically Exposed Person
    
    -- Marketing and Preferences
    marketing_consent BOOLEAN DEFAULT FALSE,
    data_sharing_consent BOOLEAN DEFAULT FALSE,
    credit_monitoring_consent BOOLEAN DEFAULT FALSE,
    paperless_statements BOOLEAN DEFAULT TRUE,
    
    -- Account Status and Security
    customer_status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (customer_status IN ('PROSPECT', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED', 'DECEASED')),
    password_hash VARCHAR(255) NOT NULL,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    security_questions_set BOOLEAN DEFAULT FALSE,
    failed_login_attempts INTEGER DEFAULT 0,
    account_locked_until TIMESTAMP,
    last_password_change TIMESTAMP,
    password_expiry TIMESTAMP,
    
    -- Audit Trail
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID,
    last_login TIMESTAMP,
    last_profile_update TIMESTAMP,
    
    -- Data retention and privacy
    data_retention_date DATE,
    gdpr_consent BOOLEAN DEFAULT FALSE,
    ccpa_opt_out BOOLEAN DEFAULT FALSE
);

-- Additional addresses table for multiple addresses
CREATE TABLE customer_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    address_type VARCHAR(20) NOT NULL CHECK (address_type IN ('RESIDENTIAL', 'BUSINESS', 'MAILING', 'PREVIOUS')),
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state VARCHAR(50) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(3) DEFAULT 'USA',
    is_primary BOOLEAN DEFAULT FALSE,
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP,
    valid_from DATE NOT NULL,
    valid_to DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer documents for KYC/AML compliance
CREATE TABLE customer_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('DRIVERS_LICENSE', 'PASSPORT', 'SSN_CARD', 'BIRTH_CERTIFICATE', 'UTILITY_BILL', 'BANK_STATEMENT', 'PAY_STUB', 'TAX_RETURN', 'OTHER')),
    document_number VARCHAR(100),
    issuing_authority VARCHAR(100),
    issue_date DATE,
    expiry_date DATE,
    document_status VARCHAR(20) DEFAULT 'PENDING' CHECK (document_status IN ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED')),
    file_path TEXT, -- Encrypted file storage path
    file_hash VARCHAR(64), -- For integrity verification
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP,
    verified_by UUID,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===============================================
-- PRODUCT PORTFOLIO MANAGEMENT (BIAN Domain)
-- ===============================================

-- Credit card products configuration
CREATE TABLE credit_card_products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_code VARCHAR(20) UNIQUE NOT NULL,
    product_name VARCHAR(100) NOT NULL,
    product_category VARCHAR(50) CHECK (product_category IN ('STANDARD', 'PREMIUM', 'REWARDS', 'CASHBACK', 'BUSINESS', 'SECURED')),
    card_network VARCHAR(20) CHECK (card_network IN ('VISA', 'MASTERCARD', 'AMEX', 'DISCOVER')),
    
    -- Credit terms
    base_apr DECIMAL(5,4) NOT NULL, -- Annual Percentage Rate
    promotional_apr DECIMAL(5,4),
    promotional_period_months INTEGER,
    cash_advance_apr DECIMAL(5,4),
    penalty_apr DECIMAL(5,4),
    
    -- Fees structure
    annual_fee DECIMAL(10,2) DEFAULT 0,
    late_payment_fee DECIMAL(10,2) DEFAULT 25.00,
    overlimit_fee DECIMAL(10,2) DEFAULT 35.00,
    cash_advance_fee_percentage DECIMAL(5,2) DEFAULT 3.00,
    cash_advance_fee_minimum DECIMAL(10,2) DEFAULT 10.00,
    foreign_transaction_fee DECIMAL(5,2) DEFAULT 0.00,
    balance_transfer_fee DECIMAL(5,2) DEFAULT 3.00,
    
    -- Credit limits
    minimum_credit_limit DECIMAL(15,2) DEFAULT 500,
    maximum_credit_limit DECIMAL(15,2) DEFAULT 50000,
    
    -- Eligibility criteria
    minimum_credit_score INTEGER DEFAULT 650,
    minimum_income DECIMAL(15,2) DEFAULT 25000,
    maximum_dti_ratio DECIMAL(5,2) DEFAULT 40.00, -- Debt-to-income ratio
    
    -- Rewards and benefits
    rewards_program BOOLEAN DEFAULT FALSE,
    cashback_rate DECIMAL(5,2) DEFAULT 0.00,
    signup_bonus DECIMAL(10,2) DEFAULT 0,
    signup_bonus_spend_requirement DECIMAL(10,2),
    
    -- Product status
    product_status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (product_status IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED')),
    launch_date DATE,
    discontinue_date DATE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===============================================
-- CREDIT ACCOUNT LIFECYCLE (BIAN Domain)
-- ===============================================

-- Enhanced accounts table with BIAN-compliant structure
CREATE TABLE credit_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES credit_card_products(id) ON DELETE RESTRICT,
    
    -- Account identification
    account_number VARCHAR(20) UNIQUE NOT NULL,
    account_reference VARCHAR(50) UNIQUE NOT NULL, -- Internal reference
    external_account_id VARCHAR(50), -- For third-party integrations
    
    -- Account terms and limits
    credit_limit DECIMAL(15,2) NOT NULL,
    cash_advance_limit DECIMAL(15,2),
    available_credit DECIMAL(15,2) NOT NULL,
    current_balance DECIMAL(15,2) DEFAULT 0,
    pending_charges DECIMAL(15,2) DEFAULT 0,
    
    -- Interest and fees
    current_apr DECIMAL(5,4) NOT NULL,
    cash_advance_apr DECIMAL(5,4),
    penalty_apr DECIMAL(5,4),
    promotional_apr DECIMAL(5,4),
    promotional_end_date DATE,
    
    -- Payment information
    minimum_payment_amount DECIMAL(15,2) DEFAULT 0,
    payment_due_date DATE,
    last_payment_date DATE,
    last_payment_amount DECIMAL(15,2),
    late_payment_count INTEGER DEFAULT 0,
    
    -- Statement information
    statement_cycle_day INTEGER CHECK (statement_cycle_day BETWEEN 1 AND 31),
    last_statement_date DATE,
    last_statement_balance DECIMAL(15,2),
    current_statement_balance DECIMAL(15,2),
    
    -- Account status and lifecycle
    account_status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (account_status IN ('APPLICATION', 'ACTIVE', 'SUSPENDED', 'CLOSED', 'CHARGED_OFF', 'COLLECTIONS')),
    account_sub_status VARCHAR(50),
    reason_code VARCHAR(20),
    closure_reason VARCHAR(100),
    
    -- Risk and monitoring
    overlimit_opt_in BOOLEAN DEFAULT FALSE,
    overlimit_count INTEGER DEFAULT 0,
    fraud_alerts_enabled BOOLEAN DEFAULT TRUE,
    travel_notice_countries TEXT[],
    spending_controls JSONB, -- JSON object for various spending controls
    
    -- Compliance and regulatory
    reg_cc_compliant BOOLEAN DEFAULT TRUE, -- Regulation CC compliance
    tila_disclosures_sent BOOLEAN DEFAULT FALSE, -- Truth in Lending Act
    
    -- Audit trail
    opened_date DATE NOT NULL DEFAULT CURRENT_DATE,
    closed_date DATE,
    last_maintenance_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID
);

-- Credit cards issued on accounts
CREATE TABLE credit_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    
    -- Card identification
    card_number_encrypted TEXT NOT NULL, -- PCI DSS compliant encryption
    card_number_masked VARCHAR(19) NOT NULL, -- Masked for display (****-****-****-1234)
    card_reference VARCHAR(50) UNIQUE NOT NULL,
    
    -- Card details
    card_type VARCHAR(20) DEFAULT 'PRIMARY' CHECK (card_type IN ('PRIMARY', 'ADDITIONAL', 'REPLACEMENT', 'TEMPORARY')),
    card_brand VARCHAR(20) NOT NULL CHECK (card_brand IN ('VISA', 'MASTERCARD', 'AMEX', 'DISCOVER')),
    card_tier VARCHAR(20) DEFAULT 'STANDARD' CHECK (card_tier IN ('STANDARD', 'GOLD', 'PLATINUM', 'SIGNATURE', 'INFINITE')),
    
    -- Expiry and security
    expiry_month INTEGER NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
    expiry_year INTEGER NOT NULL CHECK (expiry_year >= EXTRACT(YEAR FROM CURRENT_DATE)),
    cvv_encrypted TEXT NOT NULL, -- Encrypted CVV
    pin_encrypted TEXT, -- Encrypted PIN
    pin_set BOOLEAN DEFAULT FALSE,
    
    -- Card status and controls
    card_status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (card_status IN ('ORDERED', 'SHIPPED', 'ACTIVE', 'BLOCKED', 'LOST', 'STOLEN', 'EXPIRED', 'CANCELLED', 'DAMAGED')),
    activation_required BOOLEAN DEFAULT TRUE,
    activated_at TIMESTAMP,
    
    -- Usage controls and limits
    daily_purchase_limit DECIMAL(10,2) DEFAULT 5000.00,
    daily_cash_advance_limit DECIMAL(10,2) DEFAULT 1000.00,
    monthly_limit DECIMAL(10,2),
    international_usage_enabled BOOLEAN DEFAULT TRUE,
    contactless_enabled BOOLEAN DEFAULT TRUE,
    online_usage_enabled BOOLEAN DEFAULT TRUE,
    atm_usage_enabled BOOLEAN DEFAULT TRUE,
    
    -- Security features
    chip_enabled BOOLEAN DEFAULT TRUE,
    magstripe_enabled BOOLEAN DEFAULT TRUE,
    two_factor_auth_required BOOLEAN DEFAULT FALSE,
    velocity_controls JSONB, -- JSON for velocity checking rules
    
    -- Manufacturing and delivery
    manufacture_date DATE,
    issued_date DATE DEFAULT CURRENT_DATE,
    shipped_date DATE,
    delivery_method VARCHAR(20) DEFAULT 'STANDARD_MAIL' CHECK (delivery_method IN ('STANDARD_MAIL', 'EXPEDITED', 'BRANCH_PICKUP', 'SECURE_DELIVERY')),
    tracking_number VARCHAR(50),
    
    -- Usage tracking
    first_use_date DATE,
    last_usage_date TIMESTAMP,
    usage_count INTEGER DEFAULT 0,
    
    -- PIN management
    pin_change_required BOOLEAN DEFAULT FALSE,
    pin_attempts_count INTEGER DEFAULT 0,
    pin_locked_until TIMESTAMP,
    last_pin_change DATE,
    
    -- Audit trail
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID,
    replaced_card_id UUID REFERENCES credit_cards(id),
    replacement_reason VARCHAR(100)
);

-- ===============================================
-- TRANSACTION PROCESSING (BIAN Domain)
-- ===============================================

-- Enhanced transactions table with comprehensive transaction data
CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
    card_id UUID REFERENCES credit_cards(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    
    -- Transaction identification
    transaction_id VARCHAR(50) UNIQUE NOT NULL,
    external_transaction_id VARCHAR(50), -- From payment processor
    authorization_code VARCHAR(20),
    reference_number VARCHAR(50),
    retrieval_reference_number VARCHAR(12), -- ARN (Acquirer Reference Number)
    
    -- Transaction details
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('PURCHASE', 'CASH_ADVANCE', 'BALANCE_TRANSFER', 'PAYMENT', 'FEE', 'INTEREST', 'REFUND', 'ADJUSTMENT', 'DISPUTE_ADJUSTMENT')),
    transaction_subtype VARCHAR(50),
    
    -- Amount information
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    original_amount DECIMAL(15,2), -- For foreign transactions
    original_currency VARCHAR(3),
    exchange_rate DECIMAL(10,6) DEFAULT 1.0,
    
    -- Processing information
    processing_status VARCHAR(20) DEFAULT 'PENDING' CHECK (processing_status IN ('PENDING', 'AUTHORIZED', 'CAPTURED', 'SETTLED', 'DECLINED', 'CANCELLED', 'REVERSED', 'DISPUTED')),
    decline_reason VARCHAR(100),
    
    -- Merchant information
    merchant_name VARCHAR(255),
    merchant_id VARCHAR(50),
    merchant_category_code VARCHAR(4), -- MCC code
    merchant_category_description VARCHAR(100),
    merchant_address JSONB, -- Store merchant location details
    
    -- Transaction location and channel
    transaction_channel VARCHAR(30) CHECK (transaction_channel IN ('POS', 'ATM', 'ONLINE', 'PHONE', 'MAIL', 'MOBILE_APP', 'BRANCH')),
    pos_entry_mode VARCHAR(20), -- How card data was entered
    pos_condition_code VARCHAR(10),
    card_present BOOLEAN,
    cardholder_present BOOLEAN,
    
    -- Geographic information
    location_city VARCHAR(100),
    location_state VARCHAR(50),
    location_country VARCHAR(3),
    location_zip VARCHAR(20),
    terminal_id VARCHAR(50),
    
    -- International transaction details
    is_international BOOLEAN DEFAULT FALSE,
    cross_border_fee DECIMAL(10,2) DEFAULT 0,
    
    -- Risk and fraud
    fraud_score DECIMAL(5,2) DEFAULT 0.0,
    risk_level VARCHAR(20) DEFAULT 'LOW' CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'BLOCKED')),
    fraud_indicators TEXT[],
    velocity_check_result VARCHAR(20),
    
    -- Processing fees
    interchange_fee DECIMAL(10,2) DEFAULT 0,
    processing_fee DECIMAL(10,2) DEFAULT 0,
    network_fee DECIMAL(10,2) DEFAULT 0,
    
    -- Dispute information
    disputable BOOLEAN DEFAULT TRUE,
    dispute_deadline DATE,
    chargeback_liability VARCHAR(20),
    
    -- Timestamps
    transaction_date TIMESTAMP NOT NULL,
    authorization_date TIMESTAMP,
    capture_date TIMESTAMP,
    settlement_date TIMESTAMP,
    posting_date TIMESTAMP,
    
    -- Audit trail
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID,
    
    -- Additional metadata
    metadata JSONB, -- For additional transaction-specific data
    processor_response_code VARCHAR(10),
    processor_response_message TEXT
);

-- Transaction authorizations (separate from completed transactions)
CREATE TABLE transaction_authorizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
    card_id UUID REFERENCES credit_cards(id) ON DELETE SET NULL,
    
    authorization_code VARCHAR(20) UNIQUE NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    merchant_name VARCHAR(255),
    merchant_id VARCHAR(50),
    
    authorization_status VARCHAR(20) DEFAULT 'PENDING' CHECK (authorization_status IN ('PENDING', 'APPROVED', 'DECLINED', 'EXPIRED', 'REVERSED')),
    authorized_amount DECIMAL(15,2),
    available_credit_impact DECIMAL(15,2),
    
    expires_at TIMESTAMP,
    authorized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    captured_at TIMESTAMP,
    transaction_id UUID REFERENCES credit_transactions(id),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===============================================
-- PAYMENT PROCESSING (BIAN Domain)
-- ===============================================

-- Payment processing table
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    
    -- Payment identification
    payment_reference VARCHAR(50) UNIQUE NOT NULL,
    external_payment_id VARCHAR(50),
    confirmation_number VARCHAR(50),
    
    -- Payment details
    payment_amount DECIMAL(15,2) NOT NULL,
    payment_type VARCHAR(30) CHECK (payment_type IN ('MINIMUM', 'STATEMENT_BALANCE', 'CURRENT_BALANCE', 'CUSTOM', 'AUTO_PAY')),
    payment_method VARCHAR(30) CHECK (payment_method IN ('ACH', 'WIRE', 'CHECK', 'ONLINE', 'PHONE', 'MOBILE_APP', 'BRANCH', 'ATM')),
    
    -- Source of payment
    source_account_type VARCHAR(20) CHECK (source_account_type IN ('CHECKING', 'SAVINGS', 'MONEY_MARKET')),
    source_routing_number VARCHAR(9),
    source_account_number_encrypted TEXT,
    source_bank_name VARCHAR(100),
    
    -- Payment processing
    payment_status VARCHAR(20) DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PROCESSING', 'POSTED', 'RETURNED', 'CANCELLED', 'FAILED')),
    return_reason VARCHAR(100),
    return_code VARCHAR(10),
    
    -- Scheduling
    scheduled_date DATE,
    processing_date DATE,
    posted_date DATE,
    effective_date DATE,
    
    -- Autopay configuration
    is_autopay BOOLEAN DEFAULT FALSE,
    autopay_type VARCHAR(20),
    autopay_amount DECIMAL(15,2),
    
    -- Audit trail
    initiated_by UUID REFERENCES customers(id),
    initiated_channel VARCHAR(30),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Additional processing details
    processor_name VARCHAR(50),
    processor_reference VARCHAR(50),
    processing_fee DECIMAL(10,2) DEFAULT 0
);

-- Create indexes for performance
CREATE INDEX idx_customers_customer_reference ON customers(customer_reference);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_ssn ON customers(ssn_encrypted);
CREATE INDEX idx_customers_status ON customers(customer_status);
CREATE INDEX idx_customers_kyc_status ON customers(kyc_status);

CREATE INDEX idx_credit_accounts_customer_id ON credit_accounts(customer_id);
CREATE INDEX idx_credit_accounts_account_number ON credit_accounts(account_number);
CREATE INDEX idx_credit_accounts_status ON credit_accounts(account_status);

CREATE INDEX idx_credit_cards_account_id ON credit_cards(account_id);
CREATE INDEX idx_credit_cards_customer_id ON credit_cards(customer_id);
CREATE INDEX idx_credit_cards_status ON credit_cards(card_status);
CREATE INDEX idx_credit_cards_masked ON credit_cards(card_number_masked);

CREATE INDEX idx_credit_transactions_account_id ON credit_transactions(account_id);
CREATE INDEX idx_credit_transactions_customer_id ON credit_transactions(customer_id);
CREATE INDEX idx_credit_transactions_date ON credit_transactions(transaction_date);
CREATE INDEX idx_credit_transactions_status ON credit_transactions(processing_status);
CREATE INDEX idx_credit_transactions_type ON credit_transactions(transaction_type);
CREATE INDEX idx_credit_transactions_merchant ON credit_transactions(merchant_id);

CREATE INDEX idx_payments_account_id ON payments(account_id);
CREATE INDEX idx_payments_customer_id ON payments(customer_id);
CREATE INDEX idx_payments_status ON payments(payment_status);
CREATE INDEX idx_payments_scheduled_date ON payments(scheduled_date);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_accounts_updated_at BEFORE UPDATE ON credit_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_cards_updated_at BEFORE UPDATE ON credit_cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_transactions_updated_at BEFORE UPDATE ON credit_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
