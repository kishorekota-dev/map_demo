-- POC Banking Service - Seed Data
-- Sample customers and related data for testing

-- ==============================================
-- SAMPLE CUSTOMERS
-- ==============================================

-- Customer 1: Premium Banking Customer
INSERT INTO customers (
    customer_number, title, first_name, middle_name, last_name, 
    date_of_birth, gender, nationality, email, phone,
    address_line1, address_line2, city, state, postal_code, country,
    kyc_status, kyc_verified_at, risk_rating,
    id_type, id_number, id_expiry_date, id_issuing_country,
    status, customer_segment, preferred_language,
    created_by
) VALUES (
    'CUS_SEED_001', 'Mr.', 'James', 'Alexander', 'Patterson',
    '1978-04-12', 'MALE', 'USA', 'james.patterson@premiumbank.com', '+1-555-2001',
    '1500 Park Avenue', 'Apt 25B', 'New York', 'NY', '10021', 'USA',
    'VERIFIED', CURRENT_TIMESTAMP - INTERVAL '90 days', 'LOW',
    'PASSPORT', 'P123456789', '2028-04-15', 'USA',
    'ACTIVE', 'PREMIUM', 'en',
    'seed-script'
) ON CONFLICT (email) DO NOTHING;

-- Customer 2: Small Business Owner
INSERT INTO customers (
    customer_number, title, first_name, last_name,
    date_of_birth, gender, nationality, email, phone,
    address_line1, city, state, postal_code, country,
    kyc_status, kyc_verified_at, risk_rating,
    id_type, id_number, id_expiry_date, id_issuing_country,
    status, customer_segment, preferred_language,
    created_by
) VALUES (
    'CUS_SEED_002', 'Ms.', 'Sarah', 'Martinez',
    '1985-09-23', 'FEMALE', 'USA', 'sarah.martinez@sbusiness.com', '+1-555-2002',
    '2400 Tech Drive', 'San Francisco', 'CA', '94103', 'USA',
    'VERIFIED', CURRENT_TIMESTAMP - INTERVAL '60 days', 'MEDIUM',
    'DRIVERS_LICENSE', 'DL987654321', '2026-09-25', 'USA',
    'ACTIVE', 'BUSINESS', 'en',
    'seed-script'
) ON CONFLICT (email) DO NOTHING;

-- Customer 3: Young Professional
INSERT INTO customers (
    customer_number, first_name, last_name,
    date_of_birth, gender, nationality, email, phone,
    address_line1, city, state, postal_code, country,
    kyc_status, risk_rating,
    id_type, id_number, id_expiry_date, id_issuing_country,
    status, customer_segment, preferred_language,
    created_by
) VALUES (
    'CUS_SEED_003', 'Michael', 'Chen',
    '1995-11-08', 'MALE', 'USA', 'michael.chen@techstart.com', '+1-555-2003',
    '789 Innovation Way', 'Austin', 'TX', '78701', 'USA',
    'IN_PROGRESS', 'MEDIUM',
    'PASSPORT', 'P987654321', '2030-11-10', 'USA',
    'ACTIVE', 'RETAIL', 'en',
    'seed-script'
) ON CONFLICT (email) DO NOTHING;

-- Customer 4: Retired Customer
INSERT INTO customers (
    customer_number, title, first_name, last_name,
    date_of_birth, gender, nationality, email, phone,
    address_line1, city, state, postal_code, country,
    kyc_status, kyc_verified_at, risk_rating,
    id_type, id_number, id_expiry_date, id_issuing_country,
    status, customer_segment, preferred_language,
    created_by
) VALUES (
    'CUS_SEED_004', 'Dr.', 'Robert', 'Thompson',
    '1955-03-17', 'MALE', 'USA', 'robert.thompson@retired.com', '+1-555-2004',
    '5600 Sunset Boulevard', 'Phoenix', 'AZ', '85001', 'USA',
    'VERIFIED', CURRENT_TIMESTAMP - INTERVAL '180 days', 'LOW',
    'DRIVERS_LICENSE', 'DL555444333', '2025-12-31', 'USA',
    'ACTIVE', 'WEALTH', 'en',
    'seed-script'
) ON CONFLICT (email) DO NOTHING;

-- Customer 5: International Customer
INSERT INTO customers (
    customer_number, title, first_name, last_name,
    date_of_birth, gender, nationality, email, phone,
    address_line1, city, state, postal_code, country,
    kyc_status, kyc_verified_at, risk_rating,
    id_type, id_number, id_expiry_date, id_issuing_country,
    status, customer_segment, preferred_language,
    created_by
) VALUES (
    'CUS_SEED_005', 'Ms.', 'Yuki', 'Tanaka',
    '1988-07-30', 'FEMALE', 'JPN', 'yuki.tanaka@intlbank.com', '+81-3-5555-2005',
    '3-2-1 Shibuya', 'Tokyo', 'Tokyo', '150-0002', 'JPN',
    'VERIFIED', CURRENT_TIMESTAMP - INTERVAL '45 days', 'MEDIUM',
    'PASSPORT', 'JP123456789', '2029-07-30', 'JPN',
    'ACTIVE', 'INTERNATIONAL', 'ja',
    'seed-script'
) ON CONFLICT (email) DO NOTHING;

-- Customer 6: Suspended Account (for testing)
INSERT INTO customers (
    customer_number, first_name, last_name,
    date_of_birth, gender, nationality, email, phone,
    address_line1, city, state, postal_code, country,
    kyc_status, risk_rating,
    status, customer_segment, preferred_language,
    created_by
) VALUES (
    'CUS_SEED_006', 'David', 'Wilson',
    '1992-05-20', 'MALE', 'USA', 'david.wilson@suspended.com', '+1-555-2006',
    '1200 Test Street', 'Chicago', 'IL', '60601', 'USA',
    'REJECTED', 'HIGH',
    'SUSPENDED', 'RETAIL', 'en',
    'seed-script'
) ON CONFLICT (email) DO NOTHING;

-- ==============================================
-- CUSTOMER PREFERENCES
-- ==============================================

INSERT INTO customer_preferences (customer_id, email_notifications, sms_notifications, push_notifications, marketing_emails, statement_frequency, statement_delivery, two_factor_enabled, preferred_currency)
SELECT 
    id, 
    true, 
    true, 
    true, 
    false, 
    'MONTHLY', 
    'EMAIL', 
    true, 
    CASE 
        WHEN nationality = 'JPN' THEN 'JPY'
        ELSE 'USD'
    END
FROM customers
WHERE email IN (
    'james.patterson@premiumbank.com',
    'sarah.martinez@sbusiness.com',
    'michael.chen@techstart.com',
    'robert.thompson@retired.com',
    'yuki.tanaka@intlbank.com',
    'david.wilson@suspended.com'
)
ON CONFLICT (customer_id) DO NOTHING;

-- ==============================================
-- CUSTOMER CONTACTS (Additional contact methods)
-- ==============================================

-- Additional contacts for James Patterson
INSERT INTO customer_contacts (customer_id, contact_type, contact_purpose, contact_value, is_primary, is_verified, verified_at)
SELECT 
    id,
    'EMAIL',
    'WORK',
    'james.p@corporation.com',
    false,
    true,
    CURRENT_TIMESTAMP - INTERVAL '90 days'
FROM customers WHERE email = 'james.patterson@premiumbank.com'
ON CONFLICT DO NOTHING;

INSERT INTO customer_contacts (customer_id, contact_type, contact_purpose, contact_value, is_primary, is_verified, verified_at)
SELECT 
    id,
    'PHONE',
    'EMERGENCY',
    '+1-555-9999',
    false,
    true,
    CURRENT_TIMESTAMP - INTERVAL '90 days'
FROM customers WHERE email = 'james.patterson@premiumbank.com'
ON CONFLICT DO NOTHING;

-- Additional contacts for Sarah Martinez
INSERT INTO customer_contacts (customer_id, contact_type, contact_purpose, contact_value, is_primary, is_verified)
SELECT 
    id,
    'PHONE',
    'WORK',
    '+1-555-3000',
    false,
    true
FROM customers WHERE email = 'sarah.martinez@sbusiness.com'
ON CONFLICT DO NOTHING;

-- ==============================================
-- CUSTOMER RELATIONSHIPS
-- ==============================================

-- James Patterson and Sarah Martinez are business partners
INSERT INTO customer_relationships (customer_id, related_customer_id, relationship_type, relationship_status, start_date, notes)
SELECT 
    c1.id,
    c2.id,
    'BUSINESS_PARTNER',
    'ACTIVE',
    CURRENT_DATE - INTERVAL '2 years',
    'Co-founders of Tech Ventures LLC'
FROM customers c1
CROSS JOIN customers c2
WHERE c1.email = 'james.patterson@premiumbank.com'
  AND c2.email = 'sarah.martinez@sbusiness.com'
ON CONFLICT DO NOTHING;

-- Reciprocal relationship
INSERT INTO customer_relationships (customer_id, related_customer_id, relationship_type, relationship_status, start_date, notes)
SELECT 
    c1.id,
    c2.id,
    'BUSINESS_PARTNER',
    'ACTIVE',
    CURRENT_DATE - INTERVAL '2 years',
    'Co-founders of Tech Ventures LLC'
FROM customers c1
CROSS JOIN customers c2
WHERE c1.email = 'sarah.martinez@sbusiness.com'
  AND c2.email = 'james.patterson@premiumbank.com'
ON CONFLICT DO NOTHING;

-- ==============================================
-- VERIFICATION: Show loaded data
-- ==============================================

-- Count customers
DO $$
DECLARE
    customer_count INTEGER;
    preference_count INTEGER;
    contact_count INTEGER;
    relationship_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO customer_count FROM customers WHERE created_by = 'seed-script';
    SELECT COUNT(*) INTO preference_count FROM customer_preferences;
    SELECT COUNT(*) INTO contact_count FROM customer_contacts;
    SELECT COUNT(*) INTO relationship_count FROM customer_relationships;
    
    RAISE NOTICE 'Seed data loaded successfully:';
    RAISE NOTICE '  - Customers: %', customer_count;
    RAISE NOTICE '  - Preferences: %', preference_count;
    RAISE NOTICE '  - Additional Contacts: %', contact_count;
    RAISE NOTICE '  - Relationships: %', relationship_count;
END $$;
