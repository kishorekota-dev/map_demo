-- ========================================
-- POC Banking Service - Enhanced Seed Data
-- This script adds comprehensive test data for all endpoints
-- ========================================

-- Add accounts for existing named users (admin, manager, customer, etc.)
INSERT INTO accounts (user_id, account_number, account_type, account_name, currency, balance, available_balance, status)
SELECT 
    user_id,
    '100000' || LPAD((ROW_NUMBER() OVER (ORDER BY username))::TEXT, 10, '0'),
    CASE 
        WHEN username IN ('admin', 'manager') THEN 'checking'
        WHEN username = 'support' THEN 'savings'
        ELSE (ARRAY['checking', 'savings', 'credit'])[1 + (RANDOM() * 2)::INT]
    END,
    username || '''s ' || 
    CASE 
        WHEN ROW_NUMBER() OVER (PARTITION BY username ORDER BY username) = 1 THEN 'Primary Account'
        ELSE 'Secondary Account'
    END,
    'USD',
    (1000 + RANDOM() * 99000)::NUMERIC(15,2),
    (1000 + RANDOM() * 99000)::NUMERIC(15,2),
    'active'
FROM users 
WHERE username IS NOT NULL 
AND username NOT IN ('auditor') -- Auditor shouldn't have personal accounts
AND NOT EXISTS (
    SELECT 1 FROM accounts a WHERE a.user_id = users.user_id
)
ON CONFLICT DO NOTHING;

-- Add a second account for some users
INSERT INTO accounts (user_id, account_number, account_type, account_name, currency, balance, available_balance, status)
SELECT 
    user_id,
    '200000' || LPAD((ROW_NUMBER() OVER (ORDER BY username))::TEXT, 10, '0'),
    CASE 
        WHEN account_type = 'checking' THEN 'savings'
        WHEN account_type = 'savings' THEN 'credit'
        ELSE 'checking'
    END,
    username || '''s Savings Account',
    'USD',
    (5000 + RANDOM() * 45000)::NUMERIC(15,2),
    (5000 + RANDOM() * 45000)::NUMERIC(15,2),
    'active'
FROM (
    SELECT DISTINCT ON (u.user_id) u.user_id, u.username, a.account_type
    FROM users u
    JOIN accounts a ON u.user_id = a.user_id
    WHERE u.username IN ('admin', 'manager', 'customer', 'michael.chen', 'sarah.martinez')
) sub
ON CONFLICT DO NOTHING;

-- Add more cards for testing
INSERT INTO cards (account_id, card_number, card_type, cardholder_name, expiry_date, status, credit_limit, daily_limit)
SELECT 
    a.account_id,
    '4532' || LPAD((1000000000000 + (RANDOM() * 8999999999999)::BIGINT)::TEXT, 12, '0'),
    CASE 
        WHEN a.account_type = 'credit' THEN 'credit'
        WHEN a.account_type = 'checking' THEN 'debit'
        ELSE 'debit'
    END,
    COALESCE(NULLIF(u.username, ''), 'Card Holder ' || SUBSTRING(a.account_number, 1, 4)),
    (CURRENT_DATE + INTERVAL '2 years')::DATE,
    'active',
    CASE WHEN a.account_type = 'credit' THEN 5000.00 ELSE NULL END,
    1000.00
FROM accounts a
JOIN users u ON a.user_id = u.user_id
WHERE NOT EXISTS (
    SELECT 1 FROM cards c WHERE c.account_id = a.account_id
)
LIMIT 15
ON CONFLICT DO NOTHING;

-- Add more transactions across different accounts
INSERT INTO transactions (
    account_id, transaction_type, amount, balance_after, 
    description, merchant_name, merchant_category, status, 
    authorization_code
)
SELECT 
    a.account_id,
    (ARRAY['purchase', 'withdrawal', 'deposit', 'transfer', 'payment', 'refund'])[1 + (RANDOM() * 5)::INT],
    ((RANDOM() * 500) + 10)::NUMERIC(15,2) * CASE WHEN RANDOM() > 0.3 THEN -1 ELSE 1 END,
    a.balance,
    (ARRAY[
        'Coffee Shop Purchase',
        'Grocery Store',
        'Online Shopping',
        'ATM Withdrawal',
        'Salary Deposit',
        'Utility Bill Payment',
        'Restaurant',
        'Gas Station',
        'Insurance Payment',
        'Subscription Service'
    ])[1 + (RANDOM() * 9)::INT],
    (ARRAY[
        'Starbucks', 'Whole Foods', 'Amazon', 'ATM Network',
        'Employer Inc', 'Electric Company', 'Local Restaurant',
        'Shell Gas', 'State Farm', 'Netflix'
    ])[1 + (RANDOM() * 9)::INT],
    (ARRAY['food', 'groceries', 'shopping', 'cash', 'income', 'utilities', 'entertainment', 'transportation'])[1 + (RANDOM() * 7)::INT],
    (ARRAY['completed', 'pending', 'completed', 'completed'])[1 + (RANDOM() * 3)::INT],
    'AUTH' || LPAD((100000 + (RANDOM() * 899999)::INT)::TEXT, 6, '0')
FROM accounts a
JOIN users u ON a.user_id = u.user_id
WHERE u.username IS NOT NULL
ORDER BY RANDOM()
LIMIT 50
ON CONFLICT DO NOTHING;

-- Add internal transfers between accounts
INSERT INTO transfers (
    from_account_id, to_account_id, amount, currency,
    transfer_type, status, description, reference_number
)
SELECT 
    a1.account_id as from_account,
    a2.account_id as to_account,
    (50 + RANDOM() * 450)::NUMERIC(15,2),
    'USD',
    'internal',
    (ARRAY['completed', 'completed', 'pending', 'completed'])[1 + (RANDOM() * 3)::INT],
    'Internal transfer between accounts',
    'TRF' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD((RANDOM() * 99999)::INT::TEXT, 5, '0')
FROM accounts a1
CROSS JOIN LATERAL (
    SELECT account_id 
    FROM accounts a2 
    WHERE a2.account_id != a1.account_id 
    AND a2.user_id = a1.user_id
    ORDER BY RANDOM() 
    LIMIT 1
) a2
WHERE EXISTS (
    SELECT 1 FROM accounts a3 WHERE a3.user_id = a1.user_id AND a3.account_id != a1.account_id
)
LIMIT 15
ON CONFLICT DO NOTHING;

-- Add external transfers
INSERT INTO transfers (
    from_account_id, to_account_id, amount, currency,
    transfer_type, status, description, reference_number,
    beneficiary_name, beneficiary_account
)
SELECT 
    a.account_id,
    NULL, -- External transfer
    (100 + RANDOM() * 900)::NUMERIC(15,2),
    'USD',
    'external',
    (ARRAY['completed', 'pending', 'completed'])[1 + (RANDOM() * 2)::INT],
    (ARRAY['Rent Payment', 'Vendor Payment', 'Invoice Payment', 'Friend Transfer'])[1 + (RANDOM() * 3)::INT],
    'EXT' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD((RANDOM() * 99999)::INT::TEXT, 5, '0'),
    (ARRAY['John Smith', 'ABC Company', 'XYZ Corp', 'Jane Doe'])[1 + (RANDOM() * 3)::INT],
    '9876543210' || LPAD((RANDOM() * 999999)::INT::TEXT, 6, '0')
FROM accounts a
JOIN users u ON a.user_id = u.user_id
WHERE u.username IS NOT NULL
ORDER BY RANDOM()
LIMIT 10
ON CONFLICT DO NOTHING;

-- Add fraud alerts
INSERT INTO fraud_alerts (
    account_id, alert_type, severity, status,
    description, risk_score, triggered_by
)
SELECT 
    a.account_id,
    (ARRAY['unusual_location', 'high_amount', 'velocity', 'merchant_risk', 'device_change'])[1 + (RANDOM() * 4)::INT],
    (ARRAY['low', 'medium', 'high', 'critical'])[1 + (RANDOM() * 3)::INT],
    (ARRAY['new', 'investigating', 'resolved', 'false_positive'])[1 + (RANDOM() * 3)::INT],
    (ARRAY[
        'Transaction from unusual location detected',
        'High value transaction alert',
        'Multiple transactions in short time',
        'High-risk merchant category',
        'New device detected'
    ])[1 + (RANDOM() * 4)::INT],
    (30 + RANDOM() * 70)::INT,
    (ARRAY['system', 'ml_model', 'rule_engine', 'manual'])[1 + (RANDOM() * 3)::INT]
FROM accounts a
JOIN users u ON a.user_id = u.user_id
WHERE u.username IS NOT NULL
ORDER BY RANDOM()
LIMIT 20
ON CONFLICT DO NOTHING;

-- Add disputes
INSERT INTO disputes (
    transaction_id, account_id, reason, status,
    amount, description, customer_impact
)
SELECT 
    t.transaction_id,
    t.account_id,
    (ARRAY['unauthorized_transaction', 'duplicate_charge', 'product_not_received', 'incorrect_amount', 'fraud'])[1 + (RANDOM() * 4)::INT],
    (ARRAY['pending', 'investigating', 'resolved', 'closed'])[1 + (RANDOM() * 3)::INT],
    ABS(t.amount),
    (ARRAY[
        'Did not authorize this transaction',
        'Charged twice for the same purchase',
        'Product never arrived',
        'Wrong amount charged',
        'Fraudulent transaction'
    ])[1 + (RANDOM() * 4)::INT],
    (ARRAY['financial', 'service', 'both'])[1 + (RANDOM() * 2)::INT]
FROM transactions t
JOIN accounts a ON t.account_id = a.account_id
JOIN users u ON a.user_id = u.user_id
WHERE u.username IS NOT NULL
AND t.amount < 0
ORDER BY RANDOM()
LIMIT 15
ON CONFLICT DO NOTHING;

-- Add customer records for users who don't have them
INSERT INTO customers (user_id, customer_number, first_name, last_name, date_of_birth, phone_number, kyc_status)
SELECT 
    u.user_id,
    'CUST' || LPAD((100000 + ROW_NUMBER() OVER (ORDER BY u.created_at))::TEXT, 8, '0'),
    SPLIT_PART(COALESCE(u.username, 'User'), '.', 1),
    COALESCE(SPLIT_PART(u.username, '.', 2), 'Account'),
    (CURRENT_DATE - INTERVAL '25 years' - (RANDOM() * 365 * 15)::INT * INTERVAL '1 day')::DATE,
    '+1555' || LPAD((1000000 + (RANDOM() * 8999999)::INT)::TEXT, 7, '0'),
    'verified'
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM customers c WHERE c.user_id = u.user_id
)
AND u.username IS NOT NULL
ON CONFLICT DO NOTHING;

-- Update statistics
ANALYZE accounts;
ANALYZE cards;
ANALYZE transactions;
ANALYZE transfers;
ANALYZE fraud_alerts;
ANALYZE disputes;
ANALYZE customers;

-- Summary of enhanced data
SELECT 
    'Enhanced Seed Data Summary' as summary,
    (SELECT COUNT(*) FROM users WHERE username IS NOT NULL) as users_with_username,
    (SELECT COUNT(*) FROM accounts) as total_accounts,
    (SELECT COUNT(*) FROM cards) as total_cards,
    (SELECT COUNT(*) FROM transactions) as total_transactions,
    (SELECT COUNT(*) FROM transfers) as total_transfers,
    (SELECT COUNT(*) FROM fraud_alerts) as total_fraud_alerts,
    (SELECT COUNT(*) FROM disputes) as total_disputes,
    (SELECT COUNT(*) FROM customers) as total_customers;
