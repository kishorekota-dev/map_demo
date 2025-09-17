-- Migration: V3__Seed_initial_data.sql
-- Description: Seed initial test users and sample data

-- Insert initial admin users
INSERT INTO users (
    id, email, password_hash, first_name, last_name, role, status, 
    created_at, email_verified
) VALUES 
    (
        '00000000-0000-0000-0000-000000000001',
        'admin@creditcard.com',
        '$2a$12$7BXqTGZV8F9wbZbZ6ZQ0W.rX9pR5vL4cZxGmKl3qP7tQ2jN8rD6eS', -- 'admin123'
        'System',
        'Administrator',
        'ADMIN',
        'ACTIVE',
        CURRENT_TIMESTAMP,
        true
    ),
    (
        '00000000-0000-0000-0000-000000000002',
        'superadmin@creditcard.com',
        '$2a$12$7BXqTGZV8F9wbZbZ6ZQ0W.rX9pR5vL4cZxGmKl3qP7tQ2jN8rD6eS', -- 'admin123'
        'Super',
        'Admin',
        'SUPER_ADMIN',
        'ACTIVE',
        CURRENT_TIMESTAMP,
        true
    );

-- Insert test customer users
INSERT INTO users (
    id, email, password_hash, first_name, last_name, phone, 
    address_line1, city, state, zip_code, role, status, 
    created_at, email_verified
) VALUES 
    (
        '00000000-0000-0000-0000-000000000003',
        'john.doe@example.com',
        '$2a$10$AiH8I6JBMSj5BH/SWzij2eHyVlrN49HkPPZi52JnsX8Zoj4TLiUl.', -- 'password123'
        'John',
        'Doe',
        '+1-555-0001',
        '123 Main St',
        'New York',
        'NY',
        '10001',
        'CUSTOMER',
        'ACTIVE',
        CURRENT_TIMESTAMP,
        true
    ),
    (
        '00000000-0000-0000-0000-000000000004',
        'john.doe@email.com',
        '$2a$12$7BXqTGZV8F9wbZbZ6ZQ0W.rX9pR5vL4cZxGmKl3qP7tQ2jN8rD6eS', -- 'admin123'
        'John',
        'Doe',
        '+1-555-0002',
        '456 Oak Ave',
        'Los Angeles',
        'CA',
        '90210',
        'CUSTOMER',
        'ACTIVE',
        CURRENT_TIMESTAMP,
        true
    ),
    (
        '00000000-0000-0000-0000-000000000005',
        'jane.smith@email.com',
        '$2a$12$7BXqTGZV8F9wbZbZ6ZQ0W.rX9pR5vL4cZxGmKl3qP7tQ2jN8rD6eS', -- 'admin123'
        'Jane',
        'Smith',
        '+1-555-0003',
        '789 Pine St',
        'Chicago',
        'IL',
        '60601',
        'CUSTOMER',
        'ACTIVE',
        CURRENT_TIMESTAMP,
        true
    ),
    (
        '00000000-0000-0000-0000-000000000006',
        'demo@example.com',
        '$2a$12$7BXqTGZV8F9wbZbZ6ZQ0W.rX9pR5vL4cZxGmKl3qP7tQ2jN8rD6eS', -- 'admin123'
        'Demo',
        'User',
        '+1-555-0004',
        '321 Demo Blvd',
        'Demo City',
        'TX',
        '12345',
        'CUSTOMER',
        'ACTIVE',
        CURRENT_TIMESTAMP,
        true
    );

-- Insert sample accounts for test users
INSERT INTO accounts (
    id, user_id, account_number, account_type, status, credit_limit, 
    current_balance, available_credit, interest_rate, created_at
) VALUES 
    (
        '10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        '4532123456789001',
        'CREDIT',
        'ACTIVE',
        5000.00,
        1234.56,
        3765.44,
        0.1999,
        CURRENT_TIMESTAMP
    ),
    (
        '10000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000004',
        '4532123456789002',
        'CREDIT',
        'ACTIVE',
        3000.00,
        567.89,
        2432.11,
        0.1999,
        CURRENT_TIMESTAMP
    ),
    (
        '10000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000005',
        '4532123456789003',
        'CREDIT',
        'ACTIVE',
        7500.00,
        2100.75,
        5399.25,
        0.1899,
        CURRENT_TIMESTAMP
    ),
    (
        '10000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000006',
        '4532123456789004',
        'CREDIT',
        'ACTIVE',
        2000.00,
        0.00,
        2000.00,
        0.2099,
        CURRENT_TIMESTAMP
    );

-- Insert sample cards for accounts
INSERT INTO cards (
    id, account_id, user_id, card_number, card_type, card_brand,
    expiry_month, expiry_year, cvv, status, is_primary, created_at
) VALUES 
    (
        '20000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        '4532123456789001',
        'CREDIT',
        'VISA',
        12,
        2027,
        '123',
        'ACTIVE',
        true,
        CURRENT_TIMESTAMP
    ),
    (
        '20000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000004',
        '4532123456789002',
        'CREDIT',
        'VISA',
        6,
        2026,
        '456',
        'ACTIVE',
        true,
        CURRENT_TIMESTAMP
    ),
    (
        '20000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000005',
        '4532123456789003',
        'CREDIT',
        'VISA',
        9,
        2028,
        '789',
        'ACTIVE',
        true,
        CURRENT_TIMESTAMP
    ),
    (
        '20000000-0000-0000-0000-000000000004',
        '10000000-0000-0000-0000-000000000004',
        '00000000-0000-0000-0000-000000000006',
        '4532123456789004',
        'CREDIT',
        'VISA',
        3,
        2029,
        '321',
        'ACTIVE',
        true,
        CURRENT_TIMESTAMP
    );

-- Insert sample transactions
INSERT INTO transactions (
    id, account_id, card_id, user_id, transaction_id, amount, 
    transaction_type, status, merchant_name, description, created_at
) VALUES 
    (
        uuid_generate_v4(),
        '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        'TXN001',
        -89.99,
        'PURCHASE',
        'COMPLETED',
        'Amazon',
        'Online purchase',
        CURRENT_TIMESTAMP - INTERVAL '2 days'
    ),
    (
        uuid_generate_v4(),
        '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        'TXN002',
        -45.67,
        'PURCHASE',
        'COMPLETED',
        'Starbucks',
        'Coffee purchase',
        CURRENT_TIMESTAMP - INTERVAL '1 day'
    ),
    (
        uuid_generate_v4(),
        '10000000-0000-0000-0000-000000000001',
        null,
        '00000000-0000-0000-0000-000000000003',
        'TXN003',
        200.00,
        'PAYMENT',
        'COMPLETED',
        'Bank Transfer',
        'Credit card payment',
        CURRENT_TIMESTAMP - INTERVAL '3 hours'
    );
