-- ========================================
-- POC Banking Service - Final Enhanced Seed Data
-- Properly matches all table schemas
-- ========================================

-- Add more cards (with correct brand values)
INSERT INTO cards (
    account_id, user_id, card_number_encrypted, card_number_last4,
    card_type, card_brand, cardholder_name, 
    expiry_month, expiry_year, cvv_encrypted, status, daily_limit
)
SELECT 
    a.account_id,
    a.user_id,
    '4532' || LPAD((1000000000000 + (RANDOM() * 8999999999999)::BIGINT)::TEXT, 12, '0'),
    LPAD((RANDOM() * 9999)::INT::TEXT, 4, '0'),
    CASE 
        WHEN a.account_type = 'credit' THEN 'credit'
        ELSE 'debit'
    END,
    (ARRAY['visa', 'mastercard', 'amex'])[1 + (RANDOM() * 2)::INT], -- lowercase as per constraint
    COALESCE(NULLIF(u.username, ''), 'Card Holder'),
    (1 + (RANDOM() * 11)::INT),
    (2026 + (RANDOM() * 3)::INT),
    'CVV' || LPAD((100 + (RANDOM() * 899)::INT)::TEXT, 3, '0'),
    'active',
    (500 + RANDOM() * 1500)::NUMERIC(10,2)
FROM accounts a
JOIN users u ON a.user_id = u.user_id
WHERE NOT EXISTS (
    SELECT 1 FROM cards c WHERE c.account_id = a.account_id
)
AND u.username IS NOT NULL
LIMIT 15;

-- Add more transactions with all required fields
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
        'Online Shopping - Electronics',
        'ATM Withdrawal Cash',
        'Monthly Salary Deposit',
        'Utility Bill Payment - Electric',
        'Restaurant Dining Experience',
        'Gas Station Fuel Purchase',
        'Insurance Premium Payment',
        'Streaming Subscription Service',
        'Mobile Phone Recharge',
        'Internet Service Bill',
        'Credit Card Payment Processing',
        'Loan EMI Payment Installment',
        'Medical Consultation Expense',
        'Book Store Purchase',
        'Pharmacy Medicine Purchase',
        'Parking Fee Payment',
        'Public Transport Fare',
        'Movie Theater Tickets'
    ])[1 + (RANDOM() * 19)::INT],
    (ARRAY[
        'Starbucks Coffee', 'Whole Foods Market', 'Amazon.com', 'Chase ATM',
        'ABC Corporation', 'City Electric Utility', 'Olive Garden Restaurant',
        'Shell Gas Station', 'State Farm Insurance', 'Netflix Inc', 'T-Mobile USA',
        'Comcast Cable', 'American Express', 'Wells Fargo Bank', 'City Hospital',
        'Barnes & Noble', 'CVS Pharmacy', 'ParkingLot Inc', 'Metro Transit', 'AMC Theaters'
    ])[1 + (RANDOM() * 19)::INT],
    (ARRAY['food_and_dining', 'groceries', 'shopping', 'cash_and_atm', 'income', 'utilities', 'entertainment', 'transportation', 'healthcare', 'bills_and_utilities'])[1 + (RANDOM() * 9)::INT],
    (ARRAY['food', 'groceries', 'shopping', 'cash', 'salary', 'utilities', 'dining', 'fuel', 'insurance', 'subscription', 'mobile', 'internet', 'credit_payment', 'loan', 'healthcare', 'books', 'pharmacy', 'parking', 'transport', 'entertainment'])[1 + (RANDOM() * 19)::INT],
    (ARRAY['completed', 'pending', 'completed', 'completed'])[1 + (RANDOM() * 3)::INT],
    'TXN' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD((100000 + (RANDOM() * 899999)::INT)::TEXT, 6, '0')
FROM accounts a
JOIN users u ON a.user_id = u.user_id
WHERE u.username IS NOT NULL
ORDER BY RANDOM()
LIMIT 50
ON CONFLICT (reference_number) DO NOTHING;

-- Add internal transfers with required from_user_id
INSERT INTO transfers (
    from_account_id, to_account_id, from_user_id, to_user_id,
    amount, currency, transfer_type, status, reference_number
)
SELECT 
    a1.account_id,
    a2.account_id,
    a1.user_id,
    a2.user_id,
    (50 + RANDOM() * 950)::NUMERIC(15,2),
    'USD',
    'internal',
    (ARRAY['completed', 'completed', 'pending', 'completed'])[1 + (RANDOM() * 3)::INT],
    'TFRINT' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD((10000 + (RANDOM() * 89999)::INT)::TEXT, 5, '0')
FROM accounts a1
CROSS JOIN LATERAL (
    SELECT account_id, user_id
    FROM accounts a2 
    WHERE a2.account_id != a1.account_id 
    AND a2.user_id = a1.user_id
    ORDER BY RANDOM() 
    LIMIT 1
) a2
WHERE EXISTS (
    SELECT 1 FROM accounts a3 
    WHERE a3.user_id = a1.user_id 
    AND a3.account_id != a1.account_id
)
LIMIT 20
ON CONFLICT (reference_number) DO NOTHING;

-- Add external transfers
INSERT INTO transfers (
    from_account_id, from_user_id,
    amount, currency, transfer_type, status, reference_number
)
SELECT 
    a.account_id,
    a.user_id,
    (100 + RANDOM() * 1900)::NUMERIC(15,2),
    'USD',
    'external',
    (ARRAY['completed', 'pending', 'completed'])[1 + (RANDOM() * 2)::INT],
    'TFREXT' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD((10000 + (RANDOM() * 89999)::INT)::TEXT, 5, '0')
FROM accounts a
JOIN users u ON a.user_id = u.user_id
WHERE u.username IS NOT NULL
ORDER BY RANDOM()
LIMIT 15
ON CONFLICT (reference_number) DO NOTHING;

-- Add P2P transfers
INSERT INTO transfers (
    from_account_id, to_account_id, from_user_id, to_user_id,
    amount, currency, transfer_type, status, reference_number
)
SELECT 
    a1.account_id,
    a2.account_id,
    a1.user_id,
    a2.user_id,
    (20 + RANDOM() * 480)::NUMERIC(15,2),
    'USD',
    'p2p',
    (ARRAY['completed', 'completed', 'pending'])[1 + (RANDOM() * 2)::INT],
    'P2P' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD((10000 + (RANDOM() * 89999)::INT)::TEXT, 5, '0')
FROM accounts a1
CROSS JOIN LATERAL (
    SELECT a.account_id, a.user_id
    FROM accounts a
    WHERE a.user_id != a1.user_id
    ORDER BY RANDOM()
    LIMIT 1
) a2
JOIN users u1 ON a1.user_id = u1.user_id
WHERE u1.username IS NOT NULL
ORDER BY RANDOM()
LIMIT 15
ON CONFLICT (reference_number) DO NOTHING;

-- Add fraud alerts with description
INSERT INTO fraud_alerts (
    account_id, user_id, alert_type, severity, status, 
    risk_score, description
)
SELECT 
    a.account_id,
    a.user_id,
    (ARRAY['unusual_location', 'high_amount', 'velocity_check', 'merchant_risk', 'device_mismatch', 'pattern_anomaly'])[1 + (RANDOM() * 5)::INT],
    (ARRAY['low', 'medium', 'high', 'critical'])[1 + (RANDOM() * 3)::INT],
    (ARRAY['open', 'investigating', 'resolved', 'false_positive'])[1 + (RANDOM() * 3)::INT],
    (30 + RANDOM() * 70)::NUMERIC(5,2),
    (ARRAY[
        'Transaction detected from unusual geographic location',
        'High value transaction exceeds normal pattern',
        'Multiple rapid transactions detected',
        'Transaction with high-risk merchant category',
        'Login from new unrecognized device',
        'Transaction pattern deviates from baseline behavior',
        'Suspected card testing activity',
        'Velocity limits exceeded on account',
        'IP address flagged in fraud database',
        'Card used in multiple locations simultaneously'
    ])[1 + (RANDOM() * 9)::INT]
FROM accounts a
JOIN users u ON a.user_id = u.user_id
WHERE u.username IS NOT NULL
ORDER BY RANDOM()
LIMIT 25
ON CONFLICT DO NOTHING;

-- Add disputes with correct column names
INSERT INTO disputes (
    transaction_id, account_id, user_id, 
    dispute_type, amount_disputed, description, status
)
SELECT 
    t.transaction_id,
    t.account_id,
    a.user_id,
    (ARRAY['unauthorized', 'billing_error', 'service_dispute', 'fraud', 'duplicate_charge', 'canceled_transaction'])[1 + (RANDOM() * 5)::INT],
    ABS(t.amount),
    (ARRAY[
        'I did not authorize this transaction and believe it may be fraudulent',
        'I was charged twice for the same purchase - duplicate transaction',
        'The product or service I paid for was never received or delivered',
        'The amount charged is incorrect and does not match the agreement',
        'This appears to be a fraudulent transaction on my account',
        'I canceled this transaction but was still charged for it',
        'The merchant did not provide the service as promised',
        'Card was stolen and used without my knowledge',
        'Billing error - charged wrong amount by merchant',
        'Subscription was canceled but I was still billed'
    ])[1 + (RANDOM() * 9)::INT],
    (ARRAY['submitted', 'investigating', 'resolved', 'closed'])[1 + (RANDOM() * 3)::INT]
FROM transactions t
JOIN accounts a ON t.account_id = a.account_id
JOIN users u ON a.user_id = u.user_id
WHERE u.username IS NOT NULL
AND t.amount < 0
AND t.status = 'completed'
ORDER BY RANDOM()
LIMIT 20
ON CONFLICT DO NOTHING;

-- Add customer records
INSERT INTO customers (
    customer_number, first_name, last_name, email, phone, 
    date_of_birth, kyc_status, kyc_verified_at
)
SELECT 
    'CUST' || LPAD((200000 + ROW_NUMBER() OVER (ORDER BY u.created_at))::TEXT, 8, '0'),
    INITCAP(SPLIT_PART(COALESCE(u.username, 'User'), '.', 1)),
    INITCAP(COALESCE(NULLIF(SPLIT_PART(u.username, '.', 2), ''), 'Account')),
    u.email,
    '+1555' || LPAD((2000000 + (RANDOM() * 7999999)::INT)::TEXT, 7, '0'),
    (CURRENT_DATE - INTERVAL '25 years' - (RANDOM() * 365 * 20)::INT * INTERVAL '1 day')::DATE,
    'verified',
    NOW() - (RANDOM() * 365 * 2)::INT * INTERVAL '1 day'
FROM users u
WHERE NOT EXISTS (
    SELECT 1 FROM customers c WHERE c.email = u.email
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

-- Final Summary Report
SELECT '═══════════════════════════════════════════' as "═══════════════════════════════════════";
SELECT '   ENHANCED SEED DATA - FINAL SUMMARY' as "   POC BANKING SERVICE";
SELECT '═══════════════════════════════════════════' as "═══════════════════════════════════════";

SELECT 
    'Named Users' as "Category",
    COUNT(*)::TEXT as "Count"
FROM users WHERE username IS NOT NULL
UNION ALL
SELECT 'Total Accounts', COUNT(*)::TEXT FROM accounts
UNION ALL
SELECT 'Total Cards', COUNT(*)::TEXT FROM cards
UNION ALL
SELECT 'Total Transactions', COUNT(*)::TEXT FROM transactions
UNION ALL
SELECT 'Total Transfers', COUNT(*)::TEXT FROM transfers
UNION ALL
SELECT 'Total Fraud Alerts', COUNT(*)::TEXT FROM fraud_alerts
UNION ALL
SELECT 'Total Disputes', COUNT(*)::TEXT FROM disputes
UNION ALL
SELECT 'Total Customers', COUNT(*)::TEXT FROM customers;

SELECT '═══════════════════════════════════════════' as "═══════════════════════════════════════";
SELECT '   USER ACCOUNT DISTRIBUTION' as "   DETAILED BREAKDOWN";
SELECT '═══════════════════════════════════════════' as "═══════════════════════════════════════";

SELECT 
    u.username as "Username",
    COUNT(DISTINCT a.account_id)::TEXT as "Accounts",
    COUNT(DISTINCT c.card_id)::TEXT as "Cards",
    COUNT(DISTINCT t.transaction_id)::TEXT as "Transactions",
    COALESCE(SUM(a.balance)::NUMERIC(12,2)::TEXT, '0.00') as "Total Balance"
FROM users u
LEFT JOIN accounts a ON u.user_id = a.user_id
LEFT JOIN cards c ON a.account_id = c.account_id
LEFT JOIN transactions t ON a.account_id = t.account_id
WHERE u.username IS NOT NULL
GROUP BY u.user_id, u.username
ORDER BY u.username;

SELECT '═══════════════════════════════════════════' as "═══════════════════════════════════════";
SELECT '   ✅ COMPREHENSIVE TEST DATA READY' as "   STATUS";
SELECT '═══════════════════════════════════════════' as "═══════════════════════════════════════";
