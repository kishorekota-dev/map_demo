-- Seed test cards

INSERT INTO cards (card_id, account_id, user_id, card_number_encrypted, card_number_last4, card_type, card_brand, cardholder_name, expiry_month, expiry_year, cvv_encrypted, status, daily_limit, is_contactless, is_international, billing_city, billing_state, billing_zip_code, activation_date) VALUES
-- John Doe's cards
('880e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'ENCRYPTED_4532123456781234', '1234', 'debit', 'visa', 'John Doe', 12, 2027, 'ENCRYPTED_123', 'active', 2000.00, true, true, 'New York', 'NY', '10001', CURRENT_TIMESTAMP - INTERVAL '2 years'),
('880e8400-e29b-41d4-a716-446655440002', '660e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001', 'ENCRYPTED_5432123456785678', '5678', 'credit', 'mastercard', 'John Doe', 9, 2028, 'ENCRYPTED_456', 'active', 10000.00, true, true, 'New York', 'NY', '10001', CURRENT_TIMESTAMP - INTERVAL '1 year'),

-- Jane Smith's cards
('880e8400-e29b-41d4-a716-446655440003', '660e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440002', 'ENCRYPTED_4532234567891234', '1234', 'debit', 'visa', 'Jane Smith', 6, 2026, 'ENCRYPTED_789', 'active', 2000.00, true, false, 'Los Angeles', 'CA', '90001', CURRENT_TIMESTAMP - INTERVAL '1 year'),
('880e8400-e29b-41d4-a716-446655440004', '660e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440002', 'ENCRYPTED_4532234567899999', '9999', 'virtual', 'visa', 'Jane Smith', 3, 2026, 'ENCRYPTED_321', 'active', 1000.00, false, false, 'Los Angeles', 'CA', '90001', CURRENT_TIMESTAMP - INTERVAL '6 months'),

-- Bob Johnson's cards
('880e8400-e29b-41d4-a716-446655440005', '660e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440003', 'ENCRYPTED_4532345678901234', '1234', 'debit', 'visa', 'Bob Johnson', 11, 2027, 'ENCRYPTED_654', 'active', 2000.00, true, true, 'Chicago', 'IL', '60601', CURRENT_TIMESTAMP - INTERVAL '3 years'),

-- Alice Williams's cards
('880e8400-e29b-41d4-a716-446655440006', '660e8400-e29b-41d4-a716-446655440008', '550e8400-e29b-41d4-a716-446655440004', 'ENCRYPTED_3782345678901234', '1234', 'credit', 'amex', 'Alice Williams', 4, 2029, 'ENCRYPTED_987', 'active', 5000.00, true, true, 'Houston', 'TX', '77001', CURRENT_TIMESTAMP - INTERVAL '6 months'),
('880e8400-e29b-41d4-a716-446655440007', '660e8400-e29b-41d4-a716-446655440008', '550e8400-e29b-41d4-a716-446655440004', 'ENCRYPTED_4532456789015678', '5678', 'debit', 'visa', 'Alice Williams', 8, 2027, 'ENCRYPTED_147', 'active', 2000.00, true, false, 'Houston', 'TX', '77001', CURRENT_TIMESTAMP - INTERVAL '6 months'),

-- Charlie Brown's cards
('880e8400-e29b-41d4-a716-446655440008', '660e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440005', 'ENCRYPTED_4532567890121234', '1234', 'debit', 'visa', 'Charlie Brown', 2, 2026, 'ENCRYPTED_258', 'active', 1000.00, true, false, 'Phoenix', 'AZ', '85001', CURRENT_TIMESTAMP - INTERVAL '3 months'),

-- Blocked card for testing
('880e8400-e29b-41d4-a716-446655440009', '660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'ENCRYPTED_4532123456789999', '9999', 'debit', 'visa', 'John Doe', 5, 2025, 'ENCRYPTED_369', 'blocked', 2000.00, true, true, 'New York', 'NY', '10001', CURRENT_TIMESTAMP - INTERVAL '4 years');

-- Update last_used_at for active cards
UPDATE cards SET last_used_at = CURRENT_TIMESTAMP - INTERVAL '5 days' WHERE card_id = '880e8400-e29b-41d4-a716-446655440001';
UPDATE cards SET last_used_at = CURRENT_TIMESTAMP - INTERVAL '3 days' WHERE card_id = '880e8400-e29b-41d4-a716-446655440002';
UPDATE cards SET last_used_at = CURRENT_TIMESTAMP - INTERVAL '10 days' WHERE card_id = '880e8400-e29b-41d4-a716-446655440003';
UPDATE cards SET last_used_at = CURRENT_TIMESTAMP - INTERVAL '7 days' WHERE card_id = '880e8400-e29b-41d4-a716-446655440005';
UPDATE cards SET last_used_at = CURRENT_TIMESTAMP - INTERVAL '2 days' WHERE card_id = '880e8400-e29b-41d4-a716-446655440006';
