-- Seed fraud alerts

INSERT INTO fraud_alerts (alert_id, user_id, account_id, transaction_id, card_id, alert_type, severity, risk_score, description, amount, location, status, action_taken) VALUES
-- High-value transaction alert (John Doe)
('aa0e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440019', '880e8400-e29b-41d4-a716-446655440001', 'high_value_transaction', 'high', 75, 'Unusually high transaction amount detected for electronics purchase', 5500.00, 'New York, NY', 'confirmed', 'notified_user'),

-- Velocity check alert (Jane Smith)
('aa0e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', '660e8400-e29b-41d4-a716-446655440004', '770e8400-e29b-41d4-a716-446655440020', '880e8400-e29b-41d4-a716-446655440003', 'velocity_check', 'medium', 65, 'Multiple high-value transactions detected within short timeframe', 3200.00, 'Los Angeles, CA', 'investigating', 'manual_review'),

-- Unusual activity alert (Bob Johnson) - resolved as false positive
('aa0e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440003', '660e8400-e29b-41d4-a716-446655440006', NULL, '880e8400-e29b-41d4-a716-446655440005', 'unusual_activity', 'low', 35, 'Login from new device detected', NULL, 'Chicago, IL', 'false_positive', 'none'),

-- Multiple failed attempts (blocked card)
('aa0e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001', NULL, '880e8400-e29b-41d4-a716-446655440009', 'multiple_failed_attempts', 'critical', 95, 'Multiple failed PIN attempts detected - card blocked automatically', NULL, 'Unknown', 'confirmed', 'blocked_card'),

-- Location mismatch (pending investigation)
('aa0e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440004', '660e8400-e29b-41d4-a716-446655440008', NULL, '880e8400-e29b-41d4-a716-446655440006', 'location_mismatch', 'medium', 60, 'Transaction attempted from unusual location', 1200.00, 'Miami, FL', 'pending', 'notified_user'),

-- Suspicious merchant alert
('aa0e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440002', '660e8400-e29b-41d4-a716-446655440004', NULL, '880e8400-e29b-41d4-a716-446655440003', 'suspicious_merchant', 'medium', 55, 'Transaction attempted at merchant with high fraud rate', 450.00, 'Online', 'pending', 'manual_review');

-- Update timestamps for realism
UPDATE fraud_alerts SET created_at = CURRENT_TIMESTAMP - INTERVAL '5 days' WHERE alert_id = 'aa0e8400-e29b-41d4-a716-446655440001';
UPDATE fraud_alerts SET created_at = CURRENT_TIMESTAMP - INTERVAL '3 days' WHERE alert_id = 'aa0e8400-e29b-41d4-a716-446655440002';
UPDATE fraud_alerts SET created_at = CURRENT_TIMESTAMP - INTERVAL '7 days', resolved_at = CURRENT_TIMESTAMP - INTERVAL '6 days' WHERE alert_id = 'aa0e8400-e29b-41d4-a716-446655440003';
UPDATE fraud_alerts SET created_at = CURRENT_TIMESTAMP - INTERVAL '30 days', resolved_at = CURRENT_TIMESTAMP - INTERVAL '30 days' WHERE alert_id = 'aa0e8400-e29b-41d4-a716-446655440004';
UPDATE fraud_alerts SET created_at = CURRENT_TIMESTAMP - INTERVAL '2 days' WHERE alert_id = 'aa0e8400-e29b-41d4-a716-446655440005';
UPDATE fraud_alerts SET created_at = CURRENT_TIMESTAMP - INTERVAL '1 day' WHERE alert_id = 'aa0e8400-e29b-41d4-a716-446655440006';

-- Add detailed metadata
UPDATE fraud_alerts SET details = '{"transaction_count": 3, "time_window": "2 hours", "average_amount": 2100.00}'::jsonb WHERE alert_id = 'aa0e8400-e29b-41d4-a716-446655440002';
UPDATE fraud_alerts SET details = '{"device_id": "unknown-device-123", "ip_address": "203.45.67.89", "browser": "Firefox"}'::jsonb WHERE alert_id = 'aa0e8400-e29b-41d4-a716-446655440003';
UPDATE fraud_alerts SET details = '{"failed_attempts": 5, "last_attempt": "2025-01-05 10:23:45"}'::jsonb WHERE alert_id = 'aa0e8400-e29b-41d4-a716-446655440004';
