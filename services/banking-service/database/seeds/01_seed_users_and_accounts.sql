-- Seed test users
-- Password for all test users is 'Test123!' hashed with bcrypt

INSERT INTO users (user_id, email, password_hash, first_name, last_name, phone_number, date_of_birth, address_line1, city, state, zip_code, status, kyc_status) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'john.doe@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIiXuxKfHK', 'John', 'Doe', '+1-555-0101', '1985-03-15', '123 Main St', 'New York', 'NY', '10001', 'active', 'verified'),
('550e8400-e29b-41d4-a716-446655440002', 'jane.smith@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIiXuxKfHK', 'Jane', 'Smith', '+1-555-0102', '1990-07-22', '456 Oak Ave', 'Los Angeles', 'CA', '90001', 'active', 'verified'),
('550e8400-e29b-41d4-a716-446655440003', 'bob.johnson@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIiXuxKfHK', 'Bob', 'Johnson', '+1-555-0103', '1978-11-30', '789 Pine Rd', 'Chicago', 'IL', '60601', 'active', 'verified'),
('550e8400-e29b-41d4-a716-446655440004', 'alice.williams@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIiXuxKfHK', 'Alice', 'Williams', '+1-555-0104', '1995-01-18', '321 Elm St', 'Houston', 'TX', '77001', 'active', 'verified'),
('550e8400-e29b-41d4-a716-446655440005', 'charlie.brown@example.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYIiXuxKfHK', 'Charlie', 'Brown', '+1-555-0105', '1988-09-25', '654 Maple Dr', 'Phoenix', 'AZ', '85001', 'active', 'pending');

-- Seed test accounts
INSERT INTO accounts (account_id, user_id, account_number, account_type, account_name, balance, available_balance, status, interest_rate, daily_transaction_limit) VALUES
-- John Doe's accounts
('660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '1234567890123456', 'checking', 'John''s Checking', 15000.00, 14500.00, 'active', 0.0010, 10000.00),
('660e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', '1234567890123457', 'savings', 'John''s Savings', 50000.00, 50000.00, 'active', 0.0250, 5000.00),
('660e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001', '4532567890123456', 'credit', 'John''s Credit Card', -2500.00, 7500.00, 'active', 0.1899, 10000.00),

-- Jane Smith's accounts
('660e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440002', '2234567890123456', 'checking', 'Jane''s Checking', 8500.00, 8200.00, 'active', 0.0010, 10000.00),
('660e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440002', '2234567890123457', 'savings', 'Jane''s Savings', 75000.00, 75000.00, 'active', 0.0250, 5000.00),

-- Bob Johnson's accounts
('660e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440003', '3234567890123456', 'checking', 'Bob''s Checking', 3200.00, 3000.00, 'active', 0.0010, 10000.00),
('660e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440003', '3234567890123457', 'savings', 'Bob''s Savings', 12000.00, 12000.00, 'active', 0.0250, 5000.00),

-- Alice Williams's accounts
('660e8400-e29b-41d4-a716-446655440008', '550e8400-e29b-41d4-a716-446655440004', '4234567890123456', 'checking', 'Alice''s Checking', 22000.00, 21500.00, 'active', 0.0010, 10000.00),
('660e8400-e29b-41d4-a716-446655440009', '550e8400-e29b-41d4-a716-446655440004', '4234567890123457', 'investment', 'Alice''s Investment', 150000.00, 150000.00, 'active', 0.0650, 50000.00),

-- Charlie Brown's accounts
('660e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440005', '5234567890123456', 'checking', 'Charlie''s Checking', 1500.00, 1500.00, 'active', 0.0010, 10000.00);

-- Update account numbers with created_at timestamps for realism
UPDATE accounts SET created_at = CURRENT_TIMESTAMP - INTERVAL '2 years' WHERE user_id = '550e8400-e29b-41d4-a716-446655440001';
UPDATE accounts SET created_at = CURRENT_TIMESTAMP - INTERVAL '1 year' WHERE user_id = '550e8400-e29b-41d4-a716-446655440002';
UPDATE accounts SET created_at = CURRENT_TIMESTAMP - INTERVAL '3 years' WHERE user_id = '550e8400-e29b-41d4-a716-446655440003';
UPDATE accounts SET created_at = CURRENT_TIMESTAMP - INTERVAL '6 months' WHERE user_id = '550e8400-e29b-41d4-a716-446655440004';
UPDATE accounts SET created_at = CURRENT_TIMESTAMP - INTERVAL '3 months' WHERE user_id = '550e8400-e29b-41d4-a716-446655440005';
