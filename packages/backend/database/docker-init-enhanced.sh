#!/bin/bash
set -e

echo "🏦 Initializing Enterprise Banking Database..."

# Apply enhanced schema
echo "📋 Creating enhanced BIAN-compliant database schema..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" < /docker-entrypoint-initdb.d/enhanced-schema.sql

# Create admin users table for backend administration
echo "👥 Creating admin users table..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'ADMIN',
        permissions JSONB DEFAULT '["read", "write", "admin"]',
        is_active BOOLEAN DEFAULT true,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
    CREATE INDEX IF NOT EXISTS idx_admin_users_active ON admin_users(is_active);

    -- Insert default admin user (password: AdminPass123!)
    INSERT INTO admin_users (email, password_hash, role, permissions) 
    VALUES (
        'admin@enterprise-banking.com',
        '\$2b\$12\$LQv3c1yqBw2TcNJJnNQjP.Oc.92qp.YdXbL8cL8cL8cL8cL8cL8cL',
        'SUPER_ADMIN',
        '["read", "write", "admin", "super_admin", "customer_management", "fraud_investigation"]'
    ) ON CONFLICT (email) DO NOTHING;

    -- Create audit log table for enhanced security
    CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        admin_user_id INTEGER REFERENCES admin_users(id),
        action VARCHAR(100) NOT NULL,
        details JSONB,
        performed_by VARCHAR(255),
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_customer_id ON audit_logs(customer_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

    -- Create transaction authorizations table
    CREATE TABLE IF NOT EXISTS transaction_authorizations (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES credit_accounts(id),
        card_id INTEGER REFERENCES credit_cards(id),
        authorization_code VARCHAR(20) UNIQUE NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        merchant_name VARCHAR(255),
        merchant_id VARCHAR(50),
        authorization_status VARCHAR(20) DEFAULT 'PENDING',
        authorized_amount DECIMAL(15,2),
        available_credit_impact DECIMAL(15,2),
        authorized_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        captured_at TIMESTAMP,
        transaction_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_transaction_authorizations_code ON transaction_authorizations(authorization_code);
    CREATE INDEX IF NOT EXISTS idx_transaction_authorizations_account ON transaction_authorizations(account_id);
    CREATE INDEX IF NOT EXISTS idx_transaction_authorizations_status ON transaction_authorizations(authorization_status);

    -- Add missing indexes for performance
    CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
    CREATE INDEX IF NOT EXISTS idx_customers_customer_number ON customers(customer_number);
    CREATE INDEX IF NOT EXISTS idx_customers_kyc_status ON customers(kyc_status);
    CREATE INDEX IF NOT EXISTS idx_customers_account_status ON customers(account_status);
    
    CREATE INDEX IF NOT EXISTS idx_credit_accounts_customer_id ON credit_accounts(customer_id);
    CREATE INDEX IF NOT EXISTS idx_credit_accounts_status ON credit_accounts(account_status);
    CREATE INDEX IF NOT EXISTS idx_credit_accounts_account_number ON credit_accounts(account_number);
    
    CREATE INDEX IF NOT EXISTS idx_credit_cards_account_id ON credit_cards(account_id);
    CREATE INDEX IF NOT EXISTS idx_credit_cards_customer_id ON credit_cards(customer_id);
    CREATE INDEX IF NOT EXISTS idx_credit_cards_status ON credit_cards(card_status);
    
    CREATE INDEX IF NOT EXISTS idx_credit_transactions_account_id ON credit_transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_credit_transactions_customer_id ON credit_transactions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_credit_transactions_date ON credit_transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_credit_transactions_status ON credit_transactions(processing_status);
    
    CREATE INDEX IF NOT EXISTS idx_payments_account_id ON payments(account_id);
    CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON payments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(payment_status);
    CREATE INDEX IF NOT EXISTS idx_payments_scheduled_date ON payments(scheduled_date);

    -- Create triggers for updated_at timestamps
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS \$\$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    \$\$ language 'plpgsql';

    -- Apply triggers to tables that need updated_at maintenance
    DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
    CREATE TRIGGER update_customers_updated_at 
        BEFORE UPDATE ON customers 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_admin_users_updated_at ON admin_users;
    CREATE TRIGGER update_admin_users_updated_at 
        BEFORE UPDATE ON admin_users 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_credit_accounts_updated_at ON credit_accounts;
    CREATE TRIGGER update_credit_accounts_updated_at 
        BEFORE UPDATE ON credit_accounts 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_credit_cards_updated_at ON credit_cards;
    CREATE TRIGGER update_credit_cards_updated_at 
        BEFORE UPDATE ON credit_cards 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
    CREATE TRIGGER update_payments_updated_at 
        BEFORE UPDATE ON payments 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_transaction_authorizations_updated_at ON transaction_authorizations;
    CREATE TRIGGER update_transaction_authorizations_updated_at 
        BEFORE UPDATE ON transaction_authorizations 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EOSQL

echo "✅ Enhanced enterprise database initialization completed!"
echo "🔐 Default admin user created: admin@enterprise-banking.com"
echo "📊 All indexes and triggers configured for optimal performance"
echo "🛡️ Security features and audit logging enabled"
