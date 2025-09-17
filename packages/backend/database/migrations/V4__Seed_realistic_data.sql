-- Migration: V4__Seed_realistic_data.sql
-- Description: Seed comprehensive realistic banking data with time-series patterns

-- Insert more customer users with diverse profiles
INSERT INTO users (
    id, email, password_hash, first_name, last_name, phone, 
    date_of_birth, address_line1, address_line2, city, state, zip_code, 
    role, status, created_at, email_verified, phone_verified
) VALUES 
    -- Premium customers
    (
        '00000000-0000-0000-0000-000000000007',
        'sarah.johnson@gmail.com',
        '$2a$10$AiH8I6JBMSj5BH/SWzij2eHyVlrN49HkPPZi52JnsX8Zoj4TLiUl.', -- 'password123'
        'Sarah',
        'Johnson',
        '+1-555-0005',
        '1985-03-15',
        '1250 Park Avenue',
        'Suite 4B',
        'New York',
        'NY',
        '10128',
        'CUSTOMER',
        'ACTIVE',
        CURRENT_TIMESTAMP - INTERVAL '180 days',
        true,
        true
    ),
    (
        '00000000-0000-0000-0000-000000000008',
        'michael.chen@hotmail.com',
        '$2a$10$AiH8I6JBMSj5BH/SWzij2eHyVlrN49HkPPZi52JnsX8Zoj4TLiUl.', -- 'password123'
        'Michael',
        'Chen',
        '+1-555-0006',
        '1992-07-22',
        '3421 Sunset Boulevard',
        NULL,
        'Los Angeles',
        'CA',
        '90028',
        'CUSTOMER',
        'ACTIVE',
        CURRENT_TIMESTAMP - INTERVAL '95 days',
        true,
        true
    ),
    -- Young professionals
    (
        '00000000-0000-0000-0000-000000000009',
        'emily.davis@yahoo.com',
        '$2a$10$AiH8I6JBMSj5BH/SWzij2eHyVlrN49HkPPZi52JnsX8Zoj4TLiUl.', -- 'password123'
        'Emily',
        'Davis',
        '+1-555-0007',
        '1996-11-08',
        '875 Market Street',
        'Apt 12',
        'San Francisco',
        'CA',
        '94103',
        'CUSTOMER',
        'ACTIVE',
        CURRENT_TIMESTAMP - INTERVAL '45 days',
        true,
        false
    ),
    (
        '00000000-0000-0000-0000-000000000010',
        'david.wilson@outlook.com',
        '$2a$10$AiH8I6JBMSj5BH/SWzij2eHyVlrN49HkPPZi52JnsX8Zoj4TLiUl.', -- 'password123'
        'David',
        'Wilson',
        '+1-555-0008',
        '1993-12-03',
        '456 Michigan Avenue',
        NULL,
        'Chicago',
        'IL',
        '60611',
        'CUSTOMER',
        'ACTIVE',
        CURRENT_TIMESTAMP - INTERVAL '120 days',
        true,
        true
    ),
    -- Business owner
    (
        '00000000-0000-0000-0000-000000000011',
        'lisa.martinez@business.com',
        '$2a$10$AiH8I6JBMSj5BH/SWzij2eHyVlrN49HkPPZi52JnsX8Zoj4TLiUl.', -- 'password123'
        'Lisa',
        'Martinez',
        '+1-555-0009',
        '1980-05-20',
        '2100 Commerce Drive',
        'Building A',
        'Austin',
        'TX',
        '78701',
        'CUSTOMER',
        'ACTIVE',
        CURRENT_TIMESTAMP - INTERVAL '240 days',
        true,
        true
    );

-- Insert diverse account types with realistic credit limits and balances
INSERT INTO accounts (
    id, user_id, account_number, account_type, status, credit_limit, 
    current_balance, available_credit, minimum_payment, payment_due_date,
    interest_rate, created_at, last_statement_date, next_statement_date
) VALUES 
    -- Sarah Johnson - Premium account
    (
        '10000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000007',
        '4532987654321005',
        'CREDIT',
        'ACTIVE',
        25000.00,
        4567.89,
        20432.11,
        150.00,
        CURRENT_DATE + INTERVAL '15 days',
        0.1599,
        CURRENT_TIMESTAMP - INTERVAL '180 days',
        CURRENT_DATE - INTERVAL '5 days',
        CURRENT_DATE + INTERVAL '25 days'
    ),
    -- Michael Chen - Standard account
    (
        '10000000-0000-0000-0000-000000000006',
        '00000000-0000-0000-0000-000000000008',
        '4532987654321006',
        'CREDIT',
        'ACTIVE',
        8000.00,
        1234.50,
        6765.50,
        35.00,
        CURRENT_DATE + INTERVAL '22 days',
        0.1999,
        CURRENT_TIMESTAMP - INTERVAL '95 days',
        CURRENT_DATE - INTERVAL '12 days',
        CURRENT_DATE + INTERVAL '18 days'
    ),
    -- Emily Davis - Starter account
    (
        '10000000-0000-0000-0000-000000000007',
        '00000000-0000-0000-0000-000000000009',
        '4532987654321007',
        'CREDIT',
        'ACTIVE',
        2500.00,
        789.45,
        1710.55,
        25.00,
        CURRENT_DATE + INTERVAL '8 days',
        0.2299,
        CURRENT_TIMESTAMP - INTERVAL '45 days',
        CURRENT_DATE - INTERVAL '3 days',
        CURRENT_DATE + INTERVAL '27 days'
    ),
    -- David Wilson - Standard account
    (
        '10000000-0000-0000-0000-000000000008',
        '00000000-0000-0000-0000-000000000010',
        '4532987654321008',
        'CREDIT',
        'ACTIVE',
        12000.00,
        3456.78,
        8543.22,
        85.00,
        CURRENT_DATE + INTERVAL '18 days',
        0.1899,
        CURRENT_TIMESTAMP - INTERVAL '120 days',
        CURRENT_DATE - INTERVAL '8 days',
        CURRENT_DATE + INTERVAL '22 days'
    ),
    -- Lisa Martinez - Business account
    (
        '10000000-0000-0000-0000-000000000009',
        '00000000-0000-0000-0000-000000000011',
        '4532987654321009',
        'CREDIT',
        'ACTIVE',
        50000.00,
        15678.90,
        34321.10,
        450.00,
        CURRENT_DATE + INTERVAL '12 days',
        0.1299,
        CURRENT_TIMESTAMP - INTERVAL '240 days',
        CURRENT_DATE - INTERVAL '15 days',
        CURRENT_DATE + INTERVAL '15 days'
    );

-- Insert corresponding cards
INSERT INTO cards (
    id, account_id, user_id, card_number, card_type, card_brand,
    expiry_month, expiry_year, cvv, status, is_primary, 
    daily_limit, monthly_limit, created_at, last_used
) VALUES 
    (
        '20000000-0000-0000-0000-000000000005',
        '10000000-0000-0000-0000-000000000005',
        '00000000-0000-0000-0000-000000000007',
        '4532987654321005',
        'CREDIT',
        'VISA',
        8,
        2028,
        '567',
        'ACTIVE',
        true,
        2500.00,
        25000.00,
        CURRENT_TIMESTAMP - INTERVAL '180 days',
        CURRENT_TIMESTAMP - INTERVAL '2 hours'
    ),
    (
        '20000000-0000-0000-0000-000000000006',
        '10000000-0000-0000-0000-000000000006',
        '00000000-0000-0000-0000-000000000008',
        '4532987654321006',
        'CREDIT',
        'MASTERCARD',
        4,
        2027,
        '890',
        'ACTIVE',
        true,
        800.00,
        8000.00,
        CURRENT_TIMESTAMP - INTERVAL '95 days',
        CURRENT_TIMESTAMP - INTERVAL '5 hours'
    ),
    (
        '20000000-0000-0000-0000-000000000007',
        '10000000-0000-0000-0000-000000000007',
        '00000000-0000-0000-0000-000000000009',
        '4532987654321007',
        'CREDIT',
        'VISA',
        11,
        2026,
        '234',
        'ACTIVE',
        true,
        500.00,
        2500.00,
        CURRENT_TIMESTAMP - INTERVAL '45 days',
        CURRENT_TIMESTAMP - INTERVAL '1 day'
    ),
    (
        '20000000-0000-0000-0000-000000000008',
        '10000000-0000-0000-0000-000000000008',
        '00000000-0000-0000-0000-000000000010',
        '4532987654321008',
        'CREDIT',
        'AMEX',
        7,
        2029,
        '6789',
        'ACTIVE',
        true,
        1500.00,
        15000.00,
        CURRENT_TIMESTAMP - INTERVAL '120 days',
        CURRENT_TIMESTAMP - INTERVAL '3 hours'
    ),
    (
        '20000000-0000-0000-0000-000000000009',
        '10000000-0000-0000-0000-000000000009',
        '00000000-0000-0000-0000-000000000011',
        '4532987654321009',
        'CREDIT',
        'VISA',
        2,
        2030,
        '012',
        'ACTIVE',
        true,
        5000.00,
        50000.00,
        CURRENT_TIMESTAMP - INTERVAL '240 days',
        CURRENT_TIMESTAMP - INTERVAL '30 minutes'
    );

-- Generate realistic transaction patterns for the last 30 days
-- Sarah Johnson - Premium customer with high-end purchases
INSERT INTO transactions (
    account_id, card_id, user_id, transaction_id, amount, currency,
    transaction_type, status, merchant_name, merchant_category, description,
    location_city, location_state, is_international, is_online, created_at
) VALUES 
    -- Recent luxury purchases
    ('10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000005', 
     '00000000-0000-0000-0000-000000000007', 'TXN_SJ_001', -2456.78, 'USD',
     'PURCHASE', 'COMPLETED', 'Nordstrom', 'Retail', 'Designer clothing',
     'New York', 'NY', false, false, CURRENT_TIMESTAMP - INTERVAL '2 hours'),
    
    ('10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000005', 
     '00000000-0000-0000-0000-000000000007', 'TXN_SJ_002', -189.50, 'USD',
     'PURCHASE', 'COMPLETED', 'Le Bernardin', 'Restaurant', 'Fine dining',
     'New York', 'NY', false, false, CURRENT_TIMESTAMP - INTERVAL '1 day'),
     
    ('10000000-0000-0000-0000-000000000005', null, 
     '00000000-0000-0000-0000-000000000007', 'TXN_SJ_003', 1500.00, 'USD',
     'PAYMENT', 'COMPLETED', 'Online Banking', 'Payment', 'Credit card payment',
     null, null, false, true, CURRENT_TIMESTAMP - INTERVAL '3 days'),

-- Michael Chen - Tech-savvy millennial with online purchases
    ('10000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000006', 
     '00000000-0000-0000-0000-000000000008', 'TXN_MC_001', -1299.99, 'USD',
     'PURCHASE', 'COMPLETED', 'Apple Store', 'Electronics', 'MacBook Pro',
     'Los Angeles', 'CA', false, true, CURRENT_TIMESTAMP - INTERVAL '5 hours'),
     
    ('10000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000006', 
     '00000000-0000-0000-0000-000000000008', 'TXN_MC_002', -67.89, 'USD',
     'PURCHASE', 'COMPLETED', 'Uber Eats', 'Food Delivery', 'Dinner order',
     'Los Angeles', 'CA', false, true, CURRENT_TIMESTAMP - INTERVAL '1 day'),

-- Emily Davis - Young professional with budget-conscious spending
    ('10000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000007', 
     '00000000-0000-0000-0000-000000000009', 'TXN_ED_001', -45.67, 'USD',
     'PURCHASE', 'COMPLETED', 'Target', 'Retail', 'Household items',
     'San Francisco', 'CA', false, false, CURRENT_TIMESTAMP - INTERVAL '1 day'),
     
    ('10000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000007', 
     '00000000-0000-0000-0000-000000000009', 'TXN_ED_002', -28.50, 'USD',
     'PURCHASE', 'COMPLETED', 'Safeway', 'Grocery', 'Weekly groceries',
     'San Francisco', 'CA', false, false, CURRENT_TIMESTAMP - INTERVAL '2 days'),

-- David Wilson - Regular urban professional
    ('10000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000008', 
     '00000000-0000-0000-0000-000000000010', 'TXN_DW_001', -156.78, 'USD',
     'PURCHASE', 'COMPLETED', 'Shell Gas Station', 'Gas', 'Fuel purchase',
     'Chicago', 'IL', false, false, CURRENT_TIMESTAMP - INTERVAL '3 hours'),
     
    ('10000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000008', 
     '00000000-0000-0000-0000-000000000010', 'TXN_DW_002', -89.99, 'USD',
     'PURCHASE', 'COMPLETED', 'Amazon', 'Online Retail', 'Office supplies',
     'Seattle', 'WA', false, true, CURRENT_TIMESTAMP - INTERVAL '1 day'),

-- Lisa Martinez - Business expenses
    ('10000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000009', 
     '00000000-0000-0000-0000-000000000011', 'TXN_LM_001', -2890.45, 'USD',
     'PURCHASE', 'COMPLETED', 'Office Depot', 'Business Supplies', 'Office furniture',
     'Austin', 'TX', false, false, CURRENT_TIMESTAMP - INTERVAL '30 minutes'),
     
    ('10000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000009', 
     '00000000-0000-0000-0000-000000000011', 'TXN_LM_002', -567.89, 'USD',
     'PURCHASE', 'COMPLETED', 'United Airlines', 'Travel', 'Business flight',
     'Austin', 'TX', false, true, CURRENT_TIMESTAMP - INTERVAL '2 days');

-- Generate historical transactions for pattern analysis (last 30 days)
-- This creates a more realistic transaction history with various patterns

-- Weekly grocery shopping pattern for Emily
INSERT INTO transactions (
    account_id, card_id, user_id, transaction_id, amount, currency,
    transaction_type, status, merchant_name, merchant_category, description,
    location_city, location_state, is_international, is_online, created_at
) 
SELECT 
    '10000000-0000-0000-0000-000000000007',
    '20000000-0000-0000-0000-000000000007',
    '00000000-0000-0000-0000-000000000009',
    'TXN_ED_GROCERY_' || i,
    -(25.00 + (random() * 35)::numeric(10,2)),
    'USD',
    'PURCHASE',
    'COMPLETED',
    CASE (i % 3)
        WHEN 0 THEN 'Safeway'
        WHEN 1 THEN 'Whole Foods'
        ELSE 'Trader Joes'
    END,
    'Grocery',
    'Weekly groceries',
    'San Francisco',
    'CA',
    false,
    false,
    CURRENT_TIMESTAMP - (i * INTERVAL '7 days') - (INTERVAL '2 hours' * random())
FROM generate_series(3, 8) i;

-- Daily coffee purchases for Michael
INSERT INTO transactions (
    account_id, card_id, user_id, transaction_id, amount, currency,
    transaction_type, status, merchant_name, merchant_category, description,
    location_city, location_state, is_international, is_online, created_at
) 
SELECT 
    '10000000-0000-0000-0000-000000000006',
    '20000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000008',
    'TXN_MC_COFFEE_' || i,
    -(4.50 + (random() * 3)::numeric(10,2)),
    'USD',
    'PURCHASE',
    'COMPLETED',
    CASE (i % 4)
        WHEN 0 THEN 'Starbucks'
        WHEN 1 THEN 'Blue Bottle Coffee'
        WHEN 2 THEN 'Philz Coffee'
        ELSE 'Local Cafe'
    END,
    'Coffee Shop',
    'Coffee purchase',
    'Los Angeles',
    'CA',
    false,
    false,
    CURRENT_TIMESTAMP - (i * INTERVAL '1 day') - (INTERVAL '8 hours') + (INTERVAL '2 hours' * random())
FROM generate_series(3, 20) i;

-- Business expense patterns for Lisa
INSERT INTO transactions (
    account_id, card_id, user_id, transaction_id, amount, currency,
    transaction_type, status, merchant_name, merchant_category, description,
    location_city, location_state, is_international, is_online, created_at
) 
SELECT 
    '10000000-0000-0000-0000-000000000009',
    '20000000-0000-0000-0000-000000000009',
    '00000000-0000-0000-0000-000000000011',
    'TXN_LM_BIZ_' || i,
    -(100.00 + (random() * 500)::numeric(10,2)),
    'USD',
    'PURCHASE',
    'COMPLETED',
    CASE (i % 5)
        WHEN 0 THEN 'AWS'
        WHEN 1 THEN 'Google Workspace'
        WHEN 2 THEN 'Microsoft'
        WHEN 3 THEN 'Adobe'
        ELSE 'Business Services Inc'
    END,
    'Business Services',
    'Monthly subscription',
    'Austin',
    'TX',
    false,
    true,
    CURRENT_TIMESTAMP - (i * INTERVAL '3 days') - (INTERVAL '4 hours' * random())
FROM generate_series(3, 10) i;

-- Add some payment transactions for each account
INSERT INTO transactions (
    account_id, card_id, user_id, transaction_id, amount, currency,
    transaction_type, status, merchant_name, merchant_category, description,
    location_city, location_state, is_international, is_online, created_at
) VALUES 
    -- Payments
    ('10000000-0000-0000-0000-000000000006', null, '00000000-0000-0000-0000-000000000008', 
     'PAY_MC_001', 500.00, 'USD', 'PAYMENT', 'COMPLETED', 'Bank Transfer', 'Payment', 
     'Credit card payment', null, null, false, true, CURRENT_TIMESTAMP - INTERVAL '7 days'),
     
    ('10000000-0000-0000-0000-000000000007', null, '00000000-0000-0000-0000-000000000009', 
     'PAY_ED_001', 200.00, 'USD', 'PAYMENT', 'COMPLETED', 'Bank Transfer', 'Payment', 
     'Credit card payment', null, null, false, true, CURRENT_TIMESTAMP - INTERVAL '14 days'),
     
    ('10000000-0000-0000-0000-000000000008', null, '00000000-0000-0000-0000-000000000010', 
     'PAY_DW_001', 800.00, 'USD', 'PAYMENT', 'COMPLETED', 'Bank Transfer', 'Payment', 
     'Credit card payment', null, null, false, true, CURRENT_TIMESTAMP - INTERVAL '10 days'),
     
    ('10000000-0000-0000-0000-000000000009', null, '00000000-0000-0000-0000-000000000011', 
     'PAY_LM_001', 2500.00, 'USD', 'PAYMENT', 'COMPLETED', 'Bank Transfer', 'Payment', 
     'Credit card payment', null, null, false, true, CURRENT_TIMESTAMP - INTERVAL '12 days');

-- Add some sample disputes
INSERT INTO disputes (
    id, transaction_id, user_id, dispute_id, dispute_type, status, amount,
    reason, description, created_at
) 
SELECT 
    uuid_generate_v4(),
    t.id,
    t.user_id,
    'DISP_' || EXTRACT(epoch FROM t.created_at)::text,
    'UNAUTHORIZED',
    'OPEN',
    ABS(t.amount),
    'Unauthorized transaction',
    'I did not make this purchase',
    t.created_at + INTERVAL '2 days'
FROM transactions t 
WHERE t.merchant_name = 'Unknown Merchant' 
   OR t.amount < -1000
LIMIT 2;

-- Add some fraud cases for high-value transactions
INSERT INTO fraud_cases (
    id, user_id, transaction_id, case_id, case_type, status, severity,
    fraud_score, amount_involved, description, created_at
)
SELECT 
    uuid_generate_v4(),
    t.user_id,
    t.id,
    'FRAUD_' || EXTRACT(epoch FROM t.created_at)::text,
    'SUSPICIOUS_ACTIVITY',
    'INVESTIGATING',
    'MEDIUM',
    0.75,
    ABS(t.amount),
    'High-value transaction flagged for review',
    t.created_at + INTERVAL '1 hour'
FROM transactions t 
WHERE ABS(t.amount) > 1000
   AND t.transaction_type = 'PURCHASE'
LIMIT 3;

-- Add audit log entries for login activities
INSERT INTO audit_logs (
    user_id, action, resource_type, resource_id, 
    ip_address, user_agent, timestamp, status
)
SELECT 
    u.id,
    'LOGIN',
    'USER',
    u.id,
    ('192.168.1.' || (1 + random() * 254)::int)::inet,
    CASE (random() * 4)::int
        WHEN 0 THEN 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)'
        WHEN 1 THEN 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
        WHEN 2 THEN 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        ELSE 'Mozilla/5.0 (Android 11; Mobile; rv:68.0)'
    END,
    CURRENT_TIMESTAMP - (random() * INTERVAL '30 days'),
    'SUCCESS'
FROM users u 
WHERE u.role = 'CUSTOMER'
ORDER BY random()
LIMIT 50;
