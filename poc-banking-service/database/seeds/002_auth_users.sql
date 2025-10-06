-- Authentication Seed Data
-- Links users to existing customers with passwords and roles

-- NOTE: In production, passwords should NEVER be stored in plain text or seed files
-- These are bcrypt hashes for: "Password123!"
-- Generated with: bcrypt.hash('Password123!', 10)

-- ==============================================
-- CREATE USERS LINKED TO CUSTOMERS
-- ==============================================

-- Admin User (not linked to a customer)
INSERT INTO users (
    username, email, password_hash,
    is_active, is_verified, is_locked,
    created_by
) VALUES (
    'admin',
    'admin@pocbanking.com',
    '$2b$10$nf2.6c73o3jOTCU2xbZP2eePqfE1n3.Wom.WolJUmgRQi/YdK7w8a',  -- Password123!
    true,
    true,
    false,
    'seed-script'
) ON CONFLICT (username) DO NOTHING;

-- Manager User (not linked to a customer)
INSERT INTO users (
    username, email, password_hash,
    is_active, is_verified, is_locked,
    created_by
) VALUES (
    'manager',
    'manager@pocbanking.com',
    '$2b$10$nf2.6c73o3jOTCU2xbZP2eePqfE1n3.Wom.WolJUmgRQi/YdK7w8a',  -- Password123!
    true,
    true,
    false,
    'seed-script'
) ON CONFLICT (username) DO NOTHING;

-- Customer Users (linked to existing customers)
-- User for James Patterson (Premium Customer)
INSERT INTO users (
    customer_id, username, email, password_hash,
    is_active, is_verified, is_locked,
    last_login_at,
    created_by
)
SELECT 
    c.id,
    'james.patterson',
    c.email,
    '$2b$10$nf2.6c73o3jOTCU2xbZP2eePqfE1n3.Wom.WolJUmgRQi/YdK7w8a',  -- Password123!
    true,
    true,
    false,
    CURRENT_TIMESTAMP - INTERVAL '2 days',
    'seed-script'
FROM customers c
WHERE c.email = 'james.patterson@premiumbank.com'
ON CONFLICT (username) DO NOTHING;

-- User for Sarah Martinez (Business Customer)
INSERT INTO users (
    customer_id, username, email, password_hash,
    is_active, is_verified, is_locked,
    last_login_at,
    created_by
)
SELECT 
    c.id,
    'sarah.martinez',
    c.email,
    '$2b$10$nf2.6c73o3jOTCU2xbZP2eePqfE1n3.Wom.WolJUmgRQi/YdK7w8a',  -- Password123!
    true,
    true,
    false,
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    'seed-script'
FROM customers c
WHERE c.email = 'sarah.martinez@sbusiness.com'
ON CONFLICT (username) DO NOTHING;

-- User for Michael Chen (Young Professional)
INSERT INTO users (
    customer_id, username, email, password_hash,
    is_active, is_verified, is_locked,
    last_login_at,
    created_by
)
SELECT 
    c.id,
    'michael.chen',
    c.email,
    '$2b$10$nf2.6c73o3jOTCU2xbZP2eePqfE1n3.Wom.WolJUmgRQi/YdK7w8a',  -- Password123!
    true,
    true,
    false,
    CURRENT_TIMESTAMP - INTERVAL '3 hours',
    'seed-script'
FROM customers c
WHERE c.email = 'michael.chen@techstart.com'
ON CONFLICT (username) DO NOTHING;

-- User for Robert Thompson (Retired Customer)
INSERT INTO users (
    customer_id, username, email, password_hash,
    is_active, is_verified, is_locked,
    created_by
)
SELECT 
    c.id,
    'robert.thompson',
    c.email,
    '$2b$10$nf2.6c73o3jOTCU2xbZP2eePqfE1n3.Wom.WolJUmgRQi/YdK7w8a',  -- Password123!
    true,
    true,
    false,
    'seed-script'
FROM customers c
WHERE c.email = 'robert.thompson@retired.com'
ON CONFLICT (username) DO NOTHING;

-- User for Yuki Tanaka (International Customer)
INSERT INTO users (
    customer_id, username, email, password_hash,
    is_active, is_verified, is_locked,
    last_login_at,
    created_by
)
SELECT 
    c.id,
    'yuki.tanaka',
    c.email,
    '$2b$10$nf2.6c73o3jOTCU2xbZP2eePqfE1n3.Wom.WolJUmgRQi/YdK7w8a',  -- Password123!
    true,
    true,
    false,
    CURRENT_TIMESTAMP - INTERVAL '5 hours',
    'seed-script'
FROM customers c
WHERE c.email = 'yuki.tanaka@intlbank.com'
ON CONFLICT (username) DO NOTHING;

-- Locked User for David Wilson (Suspended Customer)
INSERT INTO users (
    customer_id, username, email, password_hash,
    is_active, is_verified, is_locked,
    failed_login_attempts,
    created_by
)
SELECT 
    c.id,
    'david.wilson',
    c.email,
    '$2b$10$nf2.6c73o3jOTCU2xbZP2eePqfE1n3.Wom.WolJUmgRQi/YdK7w8a',  -- Password123!
    false,
    true,
    true,
    5,
    'seed-script'
FROM customers c
WHERE c.email = 'david.wilson@suspended.com'
ON CONFLICT (username) DO NOTHING;

-- Support User
INSERT INTO users (
    username, email, password_hash,
    is_active, is_verified, is_locked,
    created_by
) VALUES (
    'support',
    'support@pocbanking.com',
    '$2b$10$nf2.6c73o3jOTCU2xbZP2eePqfE1n3.Wom.WolJUmgRQi/YdK7w8a',  -- Password123!
    true,
    true,
    false,
    'seed-script'
) ON CONFLICT (username) DO NOTHING;

-- Auditor User
INSERT INTO users (
    username, email, password_hash,
    is_active, is_verified, is_locked,
    created_by
) VALUES (
    'auditor',
    'auditor@pocbanking.com',
    '$2b$10$nf2.6c73o3jOTCU2xbZP2eePqfE1n3.Wom.WolJUmgRQi/YdK7w8a',  -- Password123!
    true,
    true,
    false,
    'seed-script'
) ON CONFLICT (username) DO NOTHING;

-- ==============================================
-- ASSIGN ROLES TO USERS
-- ==============================================

-- Admin role to admin user
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, 'seed-script'
FROM users u
CROSS JOIN roles r
WHERE u.username = 'admin' AND r.name = 'ADMIN'
ON CONFLICT DO NOTHING;

-- Manager role to manager user
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, 'seed-script'
FROM users u
CROSS JOIN roles r
WHERE u.username = 'manager' AND r.name = 'MANAGER'
ON CONFLICT DO NOTHING;

-- Customer roles to customer users
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, 'seed-script'
FROM users u
CROSS JOIN roles r
WHERE u.username IN ('james.patterson', 'sarah.martinez', 'michael.chen', 'robert.thompson', 'yuki.tanaka', 'david.wilson')
  AND r.name = 'CUSTOMER'
ON CONFLICT DO NOTHING;

-- Support role to support user
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, 'seed-script'
FROM users u
CROSS JOIN roles r
WHERE u.username = 'support' AND r.name = 'SUPPORT'
ON CONFLICT DO NOTHING;

-- Auditor role to auditor user
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, 'seed-script'
FROM users u
CROSS JOIN roles r
WHERE u.username = 'auditor' AND r.name = 'AUDITOR'
ON CONFLICT DO NOTHING;

-- ==============================================
-- SAMPLE AUDIT LOGS
-- ==============================================

-- Recent successful logins
INSERT INTO audit_logs (user_id, action, resource, details, ip_address, status)
SELECT 
    u.id,
    'LOGIN',
    'auth',
    jsonb_build_object('username', u.username, 'method', 'password'),
    '192.168.1.' || (10 + (random() * 90)::int),
    'SUCCESS'
FROM users u
WHERE u.last_login_at IS NOT NULL
ORDER BY u.last_login_at DESC
LIMIT 10;

-- Failed login attempt for locked user
INSERT INTO audit_logs (user_id, action, resource, details, ip_address, status, error_message)
SELECT 
    u.id,
    'LOGIN',
    'auth',
    jsonb_build_object('username', u.username, 'method', 'password'),
    '10.0.0.50',
    'FAILED',
    'Account is locked'
FROM users u
WHERE u.username = 'david.wilson';

-- ==============================================
-- VERIFICATION: Show created users
-- ==============================================

DO $$
DECLARE
    user_count INTEGER;
    admin_count INTEGER;
    customer_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO admin_count FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE r.name = 'ADMIN';
    SELECT COUNT(*) INTO customer_count FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE r.name = 'CUSTOMER';
    
    RAISE NOTICE 'Authentication seed data loaded:';
    RAISE NOTICE '  - Total Users: %', user_count;
    RAISE NOTICE '  - Admin Users: %', admin_count;
    RAISE NOTICE '  - Customer Users: %', customer_count;
    RAISE NOTICE '  - Default Password: Password123!';
END $$;
