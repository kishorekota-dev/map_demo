-- Migration: V5__Generate_time_series_data.sql
-- Description: Generate comprehensive time-series data with realistic patterns for analytics and fraud detection

-- Create a temporary function to generate random transaction patterns
DO $$
DECLARE
    user_rec RECORD;
    card_id_var UUID;
    day_offset INTEGER;
    hour_offset INTEGER;
    merchant_names TEXT[] := ARRAY[
        'Amazon', 'Walmart', 'Target', 'Costco', 'Best Buy',
        'Home Depot', 'Starbucks', 'McDonalds', 'Subway', 'Chipotle',
        'Shell', 'Chevron', 'Exxon', 'BP', 'Mobil',
        'Whole Foods', 'Kroger', 'Safeway', 'Trader Joes', 'Albertsons',
        'Netflix', 'Spotify', 'Apple iTunes', 'Google Play', 'Microsoft',
        'Uber', 'Lyft', 'DoorDash', 'Grubhub', 'Postmates',
        'Hotel Marriott', 'Hilton', 'Airbnb', 'Booking.com', 'Expedia',
        'Nike', 'Adidas', 'Zara', 'H&M', 'Gap'
    ];
    categories TEXT[] := ARRAY[
        'Online Retail', 'Grocery', 'Gas Station', 'Restaurant', 'Electronics',
        'Department Store', 'Coffee Shop', 'Fast Food', 'Streaming Service', 'Transportation',
        'Travel', 'Clothing', 'Home Improvement', 'Pharmacy', 'Entertainment'
    ];
    locations TEXT[][] := ARRAY[
        ARRAY['New York', 'NY'], ARRAY['Los Angeles', 'CA'], ARRAY['Chicago', 'IL'],
        ARRAY['Houston', 'TX'], ARRAY['Phoenix', 'AZ'], ARRAY['Philadelphia', 'PA'],
        ARRAY['San Antonio', 'TX'], ARRAY['San Diego', 'CA'], ARRAY['Dallas', 'TX'],
        ARRAY['San Jose', 'CA'], ARRAY['Austin', 'TX'], ARRAY['Jacksonville', 'FL'],
        ARRAY['San Francisco', 'CA'], ARRAY['Columbus', 'OH'], ARRAY['Fort Worth', 'TX'],
        ARRAY['Indianapolis', 'IN'], ARRAY['Charlotte', 'NC'], ARRAY['Seattle', 'WA'],
        ARRAY['Denver', 'CO'], ARRAY['Washington', 'DC']
    ];
    txn_counter INTEGER := 1000;
BEGIN
    -- Generate transactions for each active user over the last 90 days
    FOR user_rec IN 
        SELECT u.id as user_id, a.id as account_id, a.credit_limit
        FROM users u 
        JOIN accounts a ON u.id = a.user_id 
        WHERE u.status = 'ACTIVE' AND a.status = 'ACTIVE'
    LOOP
        -- Get the primary card for this account
        SELECT id INTO card_id_var FROM cards 
        WHERE account_id = user_rec.account_id AND is_primary = true LIMIT 1;
        
        -- Generate 1-3 transactions per day for the last 90 days
        FOR day_offset IN 1..90 LOOP
            FOR hour_offset IN 0..(1 + random() * 2)::int LOOP
                
                -- Generate transaction with realistic patterns
                INSERT INTO transactions (
                    account_id, card_id, user_id, transaction_id, amount, currency,
                    transaction_type, status, merchant_name, merchant_category, description,
                    location_city, location_state, is_international, is_online, created_at
                ) VALUES (
                    user_rec.account_id,
                    card_id_var,
                    user_rec.user_id,
                    'TXN_AUTO_' || txn_counter,
                    -- Amount based on time patterns and account type
                    CASE 
                        WHEN EXTRACT(dow FROM (CURRENT_DATE - day_offset)) IN (0, 6) THEN
                            -- Weekend spending (higher amounts)
                            -(20 + random() * (user_rec.credit_limit / 100))::numeric(10,2)
                        WHEN hour_offset BETWEEN 11 AND 13 OR hour_offset BETWEEN 18 AND 20 THEN
                            -- Meal times
                            -(8 + random() * 50)::numeric(10,2)
                        ELSE
                            -- Regular spending
                            -(5 + random() * (user_rec.credit_limit / 200))::numeric(10,2)
                    END,
                    'USD',
                    'PURCHASE',
                    CASE 
                        WHEN random() < 0.02 THEN 'FAILED'    -- 2% failed rate
                        WHEN random() < 0.01 THEN 'PENDING'   -- 1% pending
                        ELSE 'COMPLETED'                       -- 97% completed
                    END,
                    merchant_names[1 + (random() * (array_length(merchant_names, 1) - 1))::int],
                    categories[1 + (random() * (array_length(categories, 1) - 1))::int],
                    'Transaction ' || txn_counter,
                    locations[1 + (random() * (array_length(locations, 1) - 1))::int][1],
                    locations[1 + (random() * (array_length(locations, 1) - 1))::int][2],
                    random() < 0.05, -- 5% international
                    random() < 0.4,  -- 40% online
                    CURRENT_TIMESTAMP - (day_offset * INTERVAL '1 day') + (hour_offset * INTERVAL '1 hour') + (random() * INTERVAL '45 minutes')
                );
                
                txn_counter := txn_counter + 1;
            END LOOP;
        END LOOP;
    END LOOP;
END $$;

-- Generate monthly payment patterns for each account
INSERT INTO transactions (
    account_id, card_id, user_id, transaction_id, amount, currency,
    transaction_type, status, merchant_name, merchant_category, description,
    location_city, location_state, is_international, is_online, created_at
)
SELECT 
    a.id,
    null,
    a.user_id,
    'PAY_AUTO_' || uuid_generate_v4()::text,
    CASE 
        WHEN a.credit_limit > 20000 THEN (800 + random() * 2000)::numeric(10,2)
        WHEN a.credit_limit > 10000 THEN (400 + random() * 800)::numeric(10,2)
        ELSE (100 + random() * 300)::numeric(10,2)
    END,
    'USD',
    'PAYMENT',
    'COMPLETED',
    'Bank Transfer',
    'Payment',
    'Monthly payment',
    null,
    null,
    false,
    true,
    CURRENT_DATE - (month_num * INTERVAL '1 month') + (random() * INTERVAL '3 days')
FROM accounts a
CROSS JOIN generate_series(0, 2) month_num
WHERE a.status = 'ACTIVE';

-- Generate realistic balance transfer scenarios
INSERT INTO balance_transfers (
    id, from_account_id, to_account_id, user_id, transfer_id, amount,
    fee, status, requested_date, completed_date, created_at
)
SELECT 
    uuid_generate_v4(),
    a1.id,
    a2.id,
    a1.user_id,
    'BT_' || EXTRACT(epoch FROM NOW())::bigint || '_' || row_number() OVER(),
    (500 + random() * 2000)::numeric(10,2),
    (15 + random() * 50)::numeric(10,2),
    CASE 
        WHEN random() < 0.8 THEN 'COMPLETED'
        WHEN random() < 0.9 THEN 'PENDING'
        ELSE 'FAILED'
    END,
    CURRENT_TIMESTAMP - (random() * INTERVAL '60 days'),
    CURRENT_TIMESTAMP - (random() * INTERVAL '58 days'),
    CURRENT_TIMESTAMP - (random() * INTERVAL '60 days')
FROM accounts a1
JOIN accounts a2 ON a1.user_id != a2.user_id
WHERE a1.status = 'ACTIVE' AND a2.status = 'ACTIVE'
ORDER BY random()
LIMIT 15;

-- Generate suspicious activity patterns for fraud detection
-- Scenario 1: Multiple small transactions in short timeframe (card testing)
DO $$
DECLARE 
    suspicious_card_id UUID;
    suspicious_account_id UUID;
    suspicious_user_id UUID;
    txn_time TIMESTAMP;
BEGIN
    -- Pick a random active card
    SELECT c.id, c.account_id, a.user_id 
    INTO suspicious_card_id, suspicious_account_id, suspicious_user_id
    FROM cards c
    JOIN accounts a ON c.account_id = a.id
    WHERE c.status = 'ACTIVE'
    ORDER BY random()
    LIMIT 1;
    
    txn_time := CURRENT_TIMESTAMP - INTERVAL '2 hours';
    
    -- Generate 10 small transactions within 30 minutes
    FOR i IN 1..10 LOOP
        INSERT INTO transactions (
            account_id, card_id, user_id, transaction_id, amount, currency,
            transaction_type, status, merchant_name, merchant_category, description,
            location_city, location_state, is_international, is_online, created_at
        ) VALUES (
            suspicious_account_id,
            suspicious_card_id,
            suspicious_user_id,
            'TXN_SUSPICIOUS_SMALL_' || i,
            -(1.00 + random() * 9.99)::numeric(10,2),
            'USD',
            'PURCHASE',
            CASE WHEN random() < 0.3 THEN 'FAILED' ELSE 'COMPLETED' END,
            'Online Merchant ' || i,
            'Online Retail',
            'Card testing transaction',
            'Unknown',
            'XX',
            true,
            true,
            txn_time + (i * INTERVAL '3 minutes')
        );
    END LOOP;
END $$;

-- Scenario 2: Geographic anomaly (transactions in different countries within hours)
DO $$
DECLARE 
    anomaly_card_id UUID;
    anomaly_account_id UUID;
    anomaly_user_id UUID;
    base_time TIMESTAMP;
BEGIN
    -- Pick another random active card
    SELECT c.id, c.account_id, a.user_id 
    INTO anomaly_card_id, anomaly_account_id, anomaly_user_id
    FROM cards c
    JOIN accounts a ON c.account_id = a.id
    WHERE c.status = 'ACTIVE'
    ORDER BY random()
    LIMIT 1;
    
    base_time := CURRENT_TIMESTAMP - INTERVAL '6 hours';
    
    -- Transaction in New York
    INSERT INTO transactions (
        account_id, card_id, user_id, transaction_id, amount, currency,
        transaction_type, status, merchant_name, merchant_category, description,
        location_city, location_state, is_international, is_online, created_at
    ) VALUES (
        anomaly_account_id, anomaly_card_id, anomaly_user_id,
        'TXN_GEO_ANOMALY_1', -156.78, 'USD', 'PURCHASE', 'COMPLETED',
        'Starbucks NYC', 'Coffee Shop', 'Coffee purchase',
        'New York', 'NY', false, false, base_time
    );
    
    -- Transaction in London 3 hours later (impossible travel time)
    INSERT INTO transactions (
        account_id, card_id, user_id, transaction_id, amount, currency,
        transaction_type, status, merchant_name, merchant_category, description,
        location_city, location_state, is_international, is_online, created_at
    ) VALUES (
        anomaly_account_id, anomaly_card_id, anomaly_user_id,
        'TXN_GEO_ANOMALY_2', -89.50, 'GBP', 'PURCHASE', 'COMPLETED',
        'Harrods London', 'Department Store', 'Shopping',
        'London', null, true, false, base_time + INTERVAL '3 hours'
    );
END $$;

-- Generate fraud cases for the suspicious transactions
INSERT INTO fraud_cases (
    id, user_id, transaction_id, case_id, case_type, status, severity,
    fraud_score, amount_involved, description, created_at
)
SELECT 
    uuid_generate_v4(),
    t.user_id,
    t.id,
    'FRAUD_AUTO_' || EXTRACT(epoch FROM t.created_at)::bigint,
    CASE 
        WHEN t.transaction_id LIKE 'TXN_SUSPICIOUS_SMALL_%' THEN 'CARD_FRAUD'
        WHEN t.transaction_id LIKE 'TXN_GEO_ANOMALY_%' THEN 'SUSPICIOUS_ACTIVITY'
        ELSE 'SUSPICIOUS_ACTIVITY'
    END,
    CASE 
        WHEN random() < 0.3 THEN 'RESOLVED'
        WHEN random() < 0.6 THEN 'INVESTIGATING'
        ELSE 'OPEN'
    END,
    CASE 
        WHEN ABS(t.amount) > 1000 THEN 'HIGH'
        WHEN ABS(t.amount) > 100 THEN 'MEDIUM'
        ELSE 'LOW'
    END,
    random()::numeric(3,2),
    ABS(t.amount),
    'Automatically flagged suspicious transaction',
    t.created_at + INTERVAL '5 minutes'
FROM transactions t
WHERE t.transaction_id LIKE 'TXN_SUSPICIOUS_%' OR t.transaction_id LIKE 'TXN_GEO_ANOMALY_%';

-- Customer service interactions table doesn't exist in current schema
-- Skipping customer service interactions generation

-- Update account balances based on recent transactions
UPDATE accounts 
SET current_balance = COALESCE(balance_calc.new_balance, current_balance),
    available_credit = credit_limit - COALESCE(balance_calc.new_balance, current_balance)
FROM (
    SELECT 
        t.account_id,
        SUM(CASE WHEN t.transaction_type = 'PURCHASE' THEN ABS(t.amount) ELSE -t.amount END) as new_balance
    FROM transactions t
    WHERE t.status = 'COMPLETED'
      AND t.created_at > CURRENT_DATE - INTERVAL '90 days'
    GROUP BY t.account_id
) balance_calc
WHERE accounts.id = balance_calc.account_id;

-- Account analytics table doesn't exist in current schema
-- Skipping account analytics generation

COMMIT;
