-- Seed disputes

INSERT INTO disputes (dispute_id, user_id, account_id, transaction_id, card_id, dispute_type, dispute_category, amount_disputed, merchant_name, transaction_date, description, status, resolution, case_number, priority, submitted_at) VALUES
-- Unauthorized transaction dispute (John Doe)
('bb0e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440019', '880e8400-e29b-41d4-a716-446655440001', 'unauthorized_transaction', 'fraud', 5500.00, 'Best Buy', CURRENT_DATE - INTERVAL '5 days', 'I did not authorize this purchase. My card was in my possession at the time.', 'under_review', 'pending', 'CASE20250100000001', 'high', CURRENT_TIMESTAMP - INTERVAL '4 days'),

-- Duplicate charge dispute (Jane Smith)
('bb0e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', '660e8400-e29b-41d4-a716-446655440004', '770e8400-e29b-41d4-a716-446655440007', '880e8400-e29b-41d4-a716-446655440003', 'duplicate_charge', 'billing', 75.00, 'Whole Foods', CURRENT_DATE - INTERVAL '22 days', 'This charge appears twice on my statement for the same transaction.', 'resolved_in_favor', 'full_refund', 'CASE20250100000002', 'normal', CURRENT_TIMESTAMP - INTERVAL '20 days'),

-- Service not received (Bob Johnson)
('bb0e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003', '660e8400-e29b-41d4-a716-446655440006', '770e8400-e29b-41d4-a716-446655440012', NULL, 'service_not_received', 'service', 550.00, 'Premium Insurance Co', CURRENT_DATE - INTERVAL '14 days', 'Policy was cancelled but I was still charged the premium.', 'pending_merchant', 'pending', 'CASE20250100000003', 'normal', CURRENT_TIMESTAMP - INTERVAL '10 days'),

-- Incorrect amount dispute (Alice Williams)
('bb0e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440004', '660e8400-e29b-41d4-a716-446655440008', '770e8400-e29b-41d4-a716-446655440014', '880e8400-e29b-41d4-a716-446655440006', 'incorrect_amount', 'billing', 156.75, 'The Capital Grille', CURRENT_DATE - INTERVAL '16 days', 'I was charged $156.75 but my receipt shows $126.75. Overcharged by $30.', 'resolved_in_favor', 'partial_refund', 'CASE20250100000004', 'normal', CURRENT_TIMESTAMP - INTERVAL '15 days'),

-- Product not received (Jane Smith)
('bb0e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440002', '660e8400-e29b-41d4-a716-446655440004', '770e8400-e29b-41d4-a716-446655440018', '880e8400-e29b-41d4-a716-446655440004', 'product_not_received', 'service', 300.00, 'Amazon', CURRENT_DATE - INTERVAL '2 days', 'Package was marked as delivered but I never received it.', 'submitted', 'pending', 'CASE20250100000005', 'urgent', CURRENT_TIMESTAMP - INTERVAL '1 day'),

-- Resolved against customer (Bob Johnson)
('bb0e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440003', '660e8400-e29b-41d4-a716-446655440006', '770e8400-e29b-41d4-a716-446655440011', '880e8400-e29b-41d4-a716-446655440005', 'billing_error', 'billing', 45.00, 'Shell Gas Station', CURRENT_DATE - INTERVAL '60 days', 'I believe I was charged for premium gas but pumped regular.', 'resolved_against', 'no_refund', 'CASE20241200000099', 'low', CURRENT_TIMESTAMP - INTERVAL '58 days');

-- Update resolved disputes with resolution details
UPDATE disputes SET 
    resolved_at = CURRENT_TIMESTAMP - INTERVAL '18 days',
    refund_amount = 75.00,
    resolution_notes = 'Merchant confirmed duplicate charge. Full refund processed.'
WHERE dispute_id = 'bb0e8400-e29b-41d4-a716-446655440002';

UPDATE disputes SET 
    resolved_at = CURRENT_TIMESTAMP - INTERVAL '13 days',
    refund_amount = 30.00,
    resolution_notes = 'Merchant acknowledged error. Partial refund of $30 processed.'
WHERE dispute_id = 'bb0e8400-e29b-41d4-a716-446655440004';

UPDATE disputes SET 
    resolved_at = CURRENT_TIMESTAMP - INTERVAL '55 days',
    refund_amount = 0.00,
    resolution_notes = 'Video evidence shows customer selected premium grade. Dispute denied.'
WHERE dispute_id = 'bb0e8400-e29b-41d4-a716-446655440006';

-- Add evidence and internal notes
UPDATE disputes SET 
    evidence_provided = ARRAY['receipt_copy', 'bank_statement', 'email_correspondence'],
    customer_notes = 'I have all documentation showing this was not authorized. Card was with me in NYC.',
    internal_notes = 'Transaction occurred in NYC. Customer location confirmed. Reviewing merchant security footage.'
WHERE dispute_id = 'bb0e8400-e29b-41d4-a716-446655440001';

UPDATE disputes SET 
    evidence_provided = ARRAY['tracking_number', 'delivery_confirmation'],
    customer_notes = 'Tracking shows delivered to wrong address. Neighbor confirmed they did not receive it.',
    assigned_to = 'support_agent_001'
WHERE dispute_id = 'bb0e8400-e29b-41d4-a716-446655440005';

-- Set deadlines for pending disputes
UPDATE disputes SET 
    deadline_at = CURRENT_TIMESTAMP + INTERVAL '30 days'
WHERE status IN ('submitted', 'under_review', 'pending_merchant', 'pending_customer');
