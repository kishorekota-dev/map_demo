-- Seed test transactions

-- John Doe's transactions
INSERT INTO transactions (transaction_id, account_id, transaction_type, amount, description, category, status, reference_number, balance_after, created_at) VALUES
('770e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001', 'deposit', 5000.00, 'Direct Deposit - Salary', 'income', 'completed', 'TXN202501150001', 15000.00, CURRENT_TIMESTAMP - INTERVAL '30 days'),
('770e8400-e29b-41d4-a716-446655440002', '660e8400-e29b-41d4-a716-446655440001', 'payment', -125.50, 'Electric Bill Payment', 'utilities', 'completed', 'TXN202501150002', 14874.50, CURRENT_TIMESTAMP - INTERVAL '25 days'),
('770e8400-e29b-41d4-a716-446655440003', '660e8400-e29b-41d4-a716-446655440001', 'purchase', -89.99, 'Amazon Purchase', 'shopping', 'completed', 'TXN202501150003', 14784.51, CURRENT_TIMESTAMP - INTERVAL '20 days'),
('770e8400-e29b-41d4-a716-446655440004', '660e8400-e29b-41d4-a716-446655440001', 'atm_withdrawal', -200.00, 'ATM Withdrawal', 'cash', 'completed', 'TXN202501150004', 14584.51, CURRENT_TIMESTAMP - INTERVAL '15 days'),
('770e8400-e29b-41d4-a716-446655440005', '660e8400-e29b-41d4-a716-446655440002', 'interest', 104.17, 'Monthly Interest', 'interest', 'completed', 'TXN202501150005', 50104.17, CURRENT_TIMESTAMP - INTERVAL '10 days'),

-- Jane Smith's transactions
('770e8400-e29b-41d4-a716-446655440006', '660e8400-e29b-41d4-a716-446655440004', 'deposit', 3500.00, 'Direct Deposit - Salary', 'income', 'completed', 'TXN202501150006', 8500.00, CURRENT_TIMESTAMP - INTERVAL '28 days'),
('770e8400-e29b-41d4-a716-446655440007', '660e8400-e29b-41d4-a716-446655440004', 'purchase', -75.00, 'Grocery Store', 'groceries', 'completed', 'TXN202501150007', 8425.00, CURRENT_TIMESTAMP - INTERVAL '22 days'),
('770e8400-e29b-41d4-a716-446655440008', '660e8400-e29b-41d4-a716-446655440004', 'payment', -1200.00, 'Rent Payment', 'housing', 'completed', 'TXN202501150008', 7225.00, CURRENT_TIMESTAMP - INTERVAL '18 days'),
('770e8400-e29b-41d4-a716-446655440009', '660e8400-e29b-41d4-a716-446655440005', 'deposit', 1000.00, 'Transfer from Checking', 'transfer', 'completed', 'TXN202501150009', 76000.00, CURRENT_TIMESTAMP - INTERVAL '12 days'),

-- Bob Johnson's transactions
('770e8400-e29b-41d4-a716-446655440010', '660e8400-e29b-41d4-a716-446655440006', 'deposit', 2500.00, 'Freelance Payment', 'income', 'completed', 'TXN202501150010', 3200.00, CURRENT_TIMESTAMP - INTERVAL '26 days'),
('770e8400-e29b-41d4-a716-446655440011', '660e8400-e29b-41d4-a716-446655440006', 'purchase', -45.00, 'Gas Station', 'transportation', 'completed', 'TXN202501150011', 3155.00, CURRENT_TIMESTAMP - INTERVAL '19 days'),
('770e8400-e29b-41d4-a716-446655440012', '660e8400-e29b-41d4-a716-446655440006', 'payment', -550.00, 'Insurance Premium', 'insurance', 'completed', 'TXN202501150012', 2605.00, CURRENT_TIMESTAMP - INTERVAL '14 days'),

-- Alice Williams's transactions
('770e8400-e29b-41d4-a716-446655440013', '660e8400-e29b-41d4-a716-446655440008', 'deposit', 8000.00, 'Direct Deposit - Salary', 'income', 'completed', 'TXN202501150013', 22000.00, CURRENT_TIMESTAMP - INTERVAL '27 days'),
('770e8400-e29b-41d4-a716-446655440014', '660e8400-e29b-41d4-a716-446655440008', 'purchase', -156.75, 'Restaurant', 'dining', 'completed', 'TXN202501150014', 21843.25, CURRENT_TIMESTAMP - INTERVAL '16 days'),
('770e8400-e29b-41d4-a716-446655440015', '660e8400-e29b-41d4-a716-446655440009', 'deposit', 5000.00, 'Investment Contribution', 'investment', 'completed', 'TXN202501150015', 155000.00, CURRENT_TIMESTAMP - INTERVAL '11 days'),

-- Charlie Brown's transactions
('770e8400-e29b-41d4-a716-446655440016', '660e8400-e29b-41d4-a716-446655440010', 'deposit', 1500.00, 'Initial Deposit', 'deposit', 'completed', 'TXN202501150016', 1500.00, CURRENT_TIMESTAMP - INTERVAL '90 days'),

-- Pending transactions
('770e8400-e29b-41d4-a716-446655440017', '660e8400-e29b-41d4-a716-446655440001', 'payment', -500.00, 'Pending Bill Payment', 'utilities', 'pending', 'TXN202501150017', 14084.51, CURRENT_TIMESTAMP - INTERVAL '1 day'),
('770e8400-e29b-41d4-a716-446655440018', '660e8400-e29b-41d4-a716-446655440004', 'purchase', -300.00, 'Pending Purchase', 'shopping', 'pending', 'TXN202501150018', 7925.00, CURRENT_TIMESTAMP - INTERVAL '2 hours');

-- Recent high-value transactions for fraud detection testing
INSERT INTO transactions (transaction_id, account_id, transaction_type, amount, description, category, merchant_name, status, reference_number, balance_after, location, created_at) VALUES
('770e8400-e29b-41d4-a716-446655440019', '660e8400-e29b-41d4-a716-446655440001', 'purchase', -5500.00, 'Large Electronics Purchase', 'shopping', 'Best Buy', 'completed', 'TXN202501150019', 8584.51, 'New York, NY', CURRENT_TIMESTAMP - INTERVAL '5 days'),
('770e8400-e29b-41d4-a716-446655440020', '660e8400-e29b-41d4-a716-446655440004', 'purchase', -3200.00, 'Jewelry Store', 'shopping', 'Tiffany & Co', 'completed', 'TXN202501150020', 5225.00, 'Los Angeles, CA', CURRENT_TIMESTAMP - INTERVAL '3 days');
