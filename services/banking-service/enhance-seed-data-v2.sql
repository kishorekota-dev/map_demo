-- ========================================
-- POC Banking Service - Enhanced Seed Data (Schema-Corrected)
-- ========================================

-- Add more cards for existing accounts
INSERT INTO cards (
    account_id, user_id, card_number_encrypted, card_number_last4,
    card_type, card_brand, cardholder_name, 
    expiry_month, expiry_year, cvv_encrypted, status, daily_limit
)
SELECT 
    a.account_id,
    a.user_id,
    '4532' || LPAD((1000000000000 + (RANDOM() * 8999999999999)::BIGINT)::TEXT, 12, '0'), -- encrypted placeholder
    LPAD((RANDOM() * 9999)::INT::TEXT, 4, '0'),
    CASE 
        WHEN a.account_type = 'credit' THEN 'credit'
        ELSE 'debit'
    END,
    'Visa',
    COALESCE(NULLIF(u.username, ''), 'Card Holder'),
    (1 + (RANDOM() * 11)::INT),
    2027,
    'CVV' || LPAD((100 + (RANDOM() * 899)::INT)::TEXT, 3, '0'), -- encrypted placeholder
    'active',
    (500 + RANDOM() * 1500)::NUMERIC(10,2)
FROM accounts a
JOIN users u ON a.user_id = u.user_id
WHERE NOT EXISTS (
    SELECT 1 FROM cards c WHERE c.account_id = a.account_id
)
AND u.username IS NOT NULL
LIMIT 15
ON CONFLICT DO NOTHING;

-- Add more transactions
INSERT INTO transactions (
    account_id, transaction_type, amount, balance_after, 
    description, merchant_name, merchant_category, category, status,
    reference_number
)
SELECT 
    a.account_id,
    (ARRAY['purchase', 'withdrawal', 'deposit', 'transfer', 'payment', 'refund'])[1 + (RANDOM() * 5)::INT],
    ((RANDOM() * 500) + 10)::NUMERIC(15,2) * CASE WHEN RANDOM() > 0.3 THEN -1 ELSE 1 END,
    a.balance + ((RANDOM() * 100 - 50))::NUMERIC(15,2),
    (ARRAY[
        'Coffee Shop Purchase',
        'Grocery Store',
        'Online Shopping',
        'ATM Withdrawal',
        'Salary Deposit',
        'Utility Bill Payment',
        'Restaurant Dining',
        'Gas Station',
        'Insurance Payment',
        'Subscription Service',
        'Mobile Recharge',
        'Internet Bill',
        'Credit Card Payment',
        'Loan EMI Payment',
        'Medical Expense'
    ])[1 + (RANDOM() * 14)::INT],
    (ARRAY[
        'Starbucks', 'Whole Foods', 'Amazon', 'ATM Network',
        'Employer Inc', 'Electric Company', 'Olive Garden',
        'Shell Gas', 'State Farm', 'Netflix', 'T-Mobile',
        'Comcast', 'Chase Bank', 'ABC Bank', 'City Hospital'
    ])[1 + (RANDOM() * 14)::INT],
    (ARRAY['food_and_dining', 'groceries', 'shopping', 'cash', 'income', 'utilities', 'entertainment', 'transportation', 'healthcare', 'bills'])[1 + (RANDOM() * 9)::INT],
    (ARRAY['food_and_dining', 'groceries', 'shopping', 'cash', 'salary', 'utilities', 'dining', 'fuel', 'insurance', 'subscription'])[1 + (RANDOM() * 9)::INT],
    (ARRAY['completed', 'pending', 'completed', 'completed'])[1 + (RANDOM() * 3)::INT],
    'TXN' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD((RANDOM() * 999999)::INT::TEXT, 6, '0')
FROM accounts a
JOIN users u ON a.user_id = u.user_id
WHERE u.username IS NOT NULL
ORDER BY RANDOM()
LIMIT 50
ON CONFLICT (reference_number) DO NOTHING;

-- Add internal transfers
INSERT INTO transfers (
    from_account_id, to_account_id, amount, currency,
    transfer_type, status, reference_number
)
SELECT 
    a1.account_id,
    a2.account_id,
    (50 + RANDOM() * 450)::NUMERIC(15,2),
    'USD',
    'internal',
    (ARRAY['completed', 'completed', 'pending', 'completed'])[1 + (RANDOM() * 3)::INT],
    'TFRINT' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD((RANDOM() * 99999)::INT::TEXT, 5, '0')
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
ON CONFLICT (reference_number) DO NOTHING;

-- Add external transfers  
INSERT INTO transfers (
    from_account_id, to_account_id, amount, currency,
    transfer_type, status, reference_number,
    beneficiary_name, beneficiary_account_number
)
SELECT 
    a.account_id,
    NULL,
    (100 + RANDOM() * 900)::NUMERIC(15,2),
    'USD',
    'external',
    (ARRAY['completed', 'pending', 'completed'])[1 + (RANDOM() * 2)::INT],
    'TFREXT' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD((RANDOM() * 99999)::INT::TEXT, 5, '0'),
    (ARRAY['John Smith', 'ABC Company', 'XYZ Corp', 'Jane Doe', 'Vendor LLC', 'Service Provider'])[1 + (RANDOM() * 5)::INT],
    '9876543210' || LPAD((RANDOM() * 999999)::INT::TEXT, 6, '0')
FROM accounts a
JOIN users u ON a.user_id = u.user_id
WHERE u.username IS NOT NULL
ORDER BY RANDOM()
LIMIT 10
ON CONFLICT (reference_number) DO NOTHING;

-- Add P2P transfers
INSERT INTO transfers (
    from_account_id, to_account_id, amount, currency,
    transfer_type, status, reference_number,
    beneficiary_name, beneficiary_phone, beneficiary_email
)
SELECT 
    a1.account_id,
    a2.account_id,
    (20 + RANDOM() * 280)::NUMERIC(15,2),
    'USD',
    'p2p',
    (ARRAY['completed', 'completed', 'pending'])[1 + (RANDOM() * 2)::INT],
    'P2P' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD((RANDOM() * 99999)::INT::TEXT, 5, '0'),
    COALESCE(u2.username, 'Friend'),
    '+1555' || LPAD((1000000 + (RANDOM() * 8999999)::INT)::TEXT, 7, '0'),
    COALESCE(u2.email, 'friend@example.com')
FROM accounts a1
CROSS JOIN LATERAL (
    SELECT a.account_id, u.username, u.email
    FROM accounts a
    JOIN users u ON a.user_id = u.user_id
    WHERE a.user_id != a1.user_id
    ORDER BY RANDOM()
    LIMIT 1
) a2(account_id, username, email)
JOIN users u2 ON a2.account_id IN (SELECT account_id FROM accounts WHERE user_id = u2.user_id)
WHERE EXISTS (
    SELECT 1 FROM users u WHERE u.user_id = a1.user_id AND u.username IS NOT NULL
)
LIMIT 10
ON CONFLICT (reference_number) DO NOTHING;

-- Add fraud alerts
INSERT INTO fraud_alerts (
    account_id, user_id, alert_type, severity, status, risk_score
)
SELECT 
    a.account_id,
    a.user_id,
    (ARRAY['unusual_location', 'high_amount', 'velocity_check', 'merchant_risk', 'device_mismatch', 'pattern_anomaly'])[1 + (RANDOM() * 5)::INT],
    (ARRAY['low', 'medium', 'high', 'critical'])[1 + (RANDOM() * 3)::INT],
    (ARRAY['open', 'investigating', 'resolved', 'false_positive'])[1 + (RANDOM() * 3)::INT],
    (30 + RANDOM() * 70)::NUMERIC(5,2)
FROM accounts a
JOIN users u ON a.user_id = u.user_id
WHERE u.username IS NOT NULL
ORDER BY RANDOM()
LIMIT 20
ON CONFLICT DO NOTHING;

-- Add disputes
INSERT INTO disputes (
    transaction_id, account_id, user_id, dispute_reason, status,
    disputed_amount, dispute_description
)
SELECT 
    t.transaction_id,
    t.account_id,
    a.user_id,
    (ARRAY['unauthorized', 'duplicate_charge', 'not_received', 'incorrect_amount', 'fraud', 'canceled_transaction'])[1 + (RANDOM() * 5)::INT],
    (ARRAY['open', 'investigating', 'resolved', 'closed'])[1 + (RANDOM() * 3)::INT],
    ABS(t.amount),
    (ARRAY[
        'Did not authorize this transaction',
        'Charged twice for the same purchase',
        'Product/service never received',
        'Wrong amount was charged',
        'Fraudulent transaction detected',
        'Transaction was canceled but charged'
    ])[1 + (RANDOM() * 5)::INT]
FROM transactions t
JOIN accounts a ON t.account_id = a.account_id
JOIN users u ON a.user_id = u.user_id
WHERE u.username IS NOT NULL
AND t.amount < 0
AND t.status = 'completed'
ORDER BY RANDOM()
LIMIT 15
ON CONFLICT DO NOTHING;

-- Add customer records for users without them
INSERT INTO customers (customer_number, first_name, last_name, email, phone, date_of_birth, kyc_status, kyc_verified_at)
SELECT 
    'CUST' || LPAD((100000 + ROW_NUMBER() OVER (ORDER BY u.created_at))::TEXT, 8, '0'),
    SPLIT_PART(COALESCE(u.username, 'User'), '.', 1),
    COALESCE(NULLIF(SPLIT_PART(u.username, '.', 2), ''), 'Account'),
    u.email,
    '+1555' || LPAD((1000000 + (RANDOM() * 8999999)::INT)::TEXT, 7, '0'),
    (CURRENT_DATE - INTERVAL '25 years' - (RANDOM() * 365 * 15)::INT * INTERVAL '1 day')::DATE,
    'verified',
    NOW() - (RANDOM() * 365)::INT * INTERVAL '1 day'
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM customers c WHERE c.email = u.email
)
AND u.username IS NOT NULL
ON CONFLICT DO NOTHING;

-- Update table statistics
ANALYZE accounts;
ANALYZE cards;
ANALYZE transactions;
ANALYZE transfers;
ANALYZE fraud_alerts;
ANALYZE disputes;
ANALYZE customers;

-- Display summary
SELECT 
    '=== ENHANCED DATA SUMMARY ===' as info,
    (SELECT COUNT(*) FROM users WHERE username IS NOT NULL) as named_users,
    (SELECT COUNT(*) FROM accounts) as accounts,
    (SELECT COUNT(*) FROM cards) as cards,
    (SELECT COUNT(*) FROM transactions) as transactions,
    (SELECT COUNT(*) FROM transfers) as transfers,
    (SELECT COUNT(*) FROM fraud_alerts) as fraud_alerts,
    (SELECT COUNT(*) FROM disputes) as disputes,
    (SELECT COUNT(*) FROM customers) as customers;

-- Show user-account mapping
SELECT 
    '=== USER ACCOUNTS ===' as info,
    u.username,
    COUNT(a.account_id) as account_count,
    STRING_AGG(a.account_type, ', ') as account_types,
    SUM(a.balance)::NUMERIC(15,2) as total_balance
FROM users u
LEFT JOIN accounts a ON u.user_id = a.user_id
WHERE u.username IS NOT NULL
GROUP BY u.user_id, u.username
ORDER BY u.username;
