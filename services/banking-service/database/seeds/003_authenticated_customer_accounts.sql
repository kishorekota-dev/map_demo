-- Deterministic accounts for the documented authenticated demo customers.
-- Keep these separate from the anonymous legacy fixtures in 01_seed_users_and_accounts.sql.

WITH demo_accounts (
    username,
    account_id,
    account_number,
    account_name,
    balance,
    available_balance,
    daily_transaction_limit,
    monthly_transaction_limit
) AS (
    VALUES
        ('james.patterson',  '660e8400-e29b-41d4-a716-446655449001'::UUID, '9000000000001001', 'James Patterson Checking', 25000.00::NUMERIC, 24750.00::NUMERIC, 25000.00::NUMERIC, 100000.00::NUMERIC),
        ('sarah.martinez',   '660e8400-e29b-41d4-a716-446655449002'::UUID, '9000000000001002', 'Sarah Martinez Checking', 18000.00::NUMERIC, 17500.00::NUMERIC, 20000.00::NUMERIC,  80000.00::NUMERIC),
        ('michael.chen',     '660e8400-e29b-41d4-a716-446655449003'::UUID, '9000000000001003', 'Michael Chen Checking',    8500.00::NUMERIC,  8250.00::NUMERIC, 10000.00::NUMERIC,  50000.00::NUMERIC),
        ('robert.thompson',  '660e8400-e29b-41d4-a716-446655449004'::UUID, '9000000000001004', 'Robert Thompson Checking', 42000.00::NUMERIC, 42000.00::NUMERIC, 15000.00::NUMERIC,  75000.00::NUMERIC),
        ('yuki.tanaka',      '660e8400-e29b-41d4-a716-446655449005'::UUID, '9000000000001005', 'Yuki Tanaka Checking',     12000.00::NUMERIC, 11800.00::NUMERIC, 10000.00::NUMERIC,  50000.00::NUMERIC)
)
INSERT INTO accounts (
    account_id,
    user_id,
    account_number,
    account_type,
    account_name,
    currency,
    balance,
    available_balance,
    status,
    interest_rate,
    daily_transaction_limit,
    monthly_transaction_limit,
    created_at,
    updated_at
)
SELECT
    da.account_id,
    u.user_id,
    da.account_number,
    'checking',
    da.account_name,
    'USD',
    da.balance,
    da.available_balance,
    'active',
    0.0010,
    da.daily_transaction_limit,
    da.monthly_transaction_limit,
    TIMESTAMPTZ '2025-01-01 00:00:00+00',
    TIMESTAMPTZ '2025-01-01 00:00:00+00'
FROM demo_accounts da
JOIN users u ON u.username = da.username
ON CONFLICT (account_id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    account_number = EXCLUDED.account_number,
    account_type = EXCLUDED.account_type,
    account_name = EXCLUDED.account_name,
    currency = EXCLUDED.currency,
    status = EXCLUDED.status
WHERE (
    accounts.user_id,
    accounts.account_number,
    accounts.account_type,
    accounts.account_name,
    accounts.currency,
    accounts.status
) IS DISTINCT FROM (
    EXCLUDED.user_id,
    EXCLUDED.account_number,
    EXCLUDED.account_type,
    EXCLUDED.account_name,
    EXCLUDED.currency,
    EXCLUDED.status
);

-- Fail the seed transaction if an expected authenticated customer is missing a usable account.
DO $$
DECLARE
    invalid_users TEXT;
BEGIN
    SELECT STRING_AGG(expected.username, ', ' ORDER BY expected.username)
    INTO invalid_users
    FROM (
        VALUES
            ('james.patterson', '660e8400-e29b-41d4-a716-446655449001'::UUID),
            ('sarah.martinez', '660e8400-e29b-41d4-a716-446655449002'::UUID),
            ('michael.chen', '660e8400-e29b-41d4-a716-446655449003'::UUID),
            ('robert.thompson', '660e8400-e29b-41d4-a716-446655449004'::UUID),
            ('yuki.tanaka', '660e8400-e29b-41d4-a716-446655449005'::UUID)
    ) AS expected(username, account_id)
    LEFT JOIN users u ON u.username = expected.username
    LEFT JOIN accounts a
        ON a.account_id = expected.account_id
       AND a.user_id = u.user_id
       AND a.account_type = 'checking'
       AND a.status = 'active'
    WHERE u.user_id IS NULL OR a.account_id IS NULL;

    IF invalid_users IS NOT NULL THEN
        RAISE EXCEPTION 'Authenticated demo account seed verification failed for: %', invalid_users;
    END IF;
END $$;
