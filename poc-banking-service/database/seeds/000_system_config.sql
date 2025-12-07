-- Seed System Configuration
-- Roles, Permissions, and Role-Permission Mappings

-- ==============================================
-- INSERT ROLES
-- ==============================================
INSERT INTO roles (name, description, is_system_role) VALUES
    ('ADMIN', 'System Administrator with full access to all features', true),
    ('MANAGER', 'Bank Manager with management and oversight permissions', true),
    ('CUSTOMER', 'Regular banking customer with self-service access', true),
    ('SUPPORT', 'Customer support representative with limited access', true),
    ('AUDITOR', 'Audit and compliance role with read-only access', true),
    ('TELLER', 'Bank teller with transaction processing access', true),
    ('COMPLIANCE_OFFICER', 'Compliance and risk management officer', true)
ON CONFLICT (name) DO NOTHING;

-- ==============================================
-- INSERT PERMISSIONS
-- ==============================================
INSERT INTO permissions (name, resource, action, description) VALUES
    -- Customer Management Permissions
    ('customers.read', 'customers', 'read', 'View customer information and profiles'),
    ('customers.create', 'customers', 'create', 'Create new customer accounts'),
    ('customers.update', 'customers', 'update', 'Update customer information'),
    ('customers.delete', 'customers', 'delete', 'Delete customer accounts'),
    ('customers.suspend', 'customers', 'suspend', 'Suspend/unsuspend customer accounts'),
    ('customers.verify_kyc', 'customers', 'verify_kyc', 'Verify KYC documents and customer identity'),
    
    -- Account Management Permissions
    ('accounts.read', 'accounts', 'read', 'View account information and balances'),
    ('accounts.read.own', 'accounts', 'read', 'View own account information only'),
    ('accounts.create', 'accounts', 'create', 'Create new bank accounts'),
    ('accounts.update', 'accounts', 'update', 'Update account information'),
    ('accounts.close', 'accounts', 'close', 'Close bank accounts'),
    ('accounts.freeze', 'accounts', 'freeze', 'Freeze and unfreeze accounts'),
    
    -- Transaction Permissions
    ('transactions.read', 'transactions', 'read', 'View all transaction history'),
    ('transactions.read.own', 'transactions', 'read', 'View own transaction history only'),
    ('transactions.create', 'transactions', 'create', 'Create and process transactions'),
    ('transactions.approve', 'transactions', 'approve', 'Approve large or pending transactions'),
    ('transactions.reverse', 'transactions', 'reverse', 'Reverse completed transactions'),
    
    -- Card Management Permissions
    ('cards.read', 'cards', 'read', 'View card information'),
    ('cards.read.own', 'cards', 'read', 'View own cards only'),
    ('cards.create', 'cards', 'create', 'Issue new debit/credit cards'),
    ('cards.block', 'cards', 'block', 'Block and unblock cards'),
    ('cards.cancel', 'cards', 'cancel', 'Cancel cards permanently'),
    
    -- Transfer Permissions
    ('transfers.read', 'transfers', 'read', 'View all transfer information'),
    ('transfers.read.own', 'transfers', 'read', 'View own transfers only'),
    ('transfers.create', 'transfers', 'create', 'Create internal and external transfers'),
    ('transfers.approve', 'transfers', 'approve', 'Approve large transfers'),
    ('transfers.cancel', 'transfers', 'cancel', 'Cancel pending transfers'),
    
    -- Fraud Management Permissions
    ('fraud.read', 'fraud', 'read', 'View fraud alerts and cases'),
    ('fraud.investigate', 'fraud', 'investigate', 'Investigate fraud cases'),
    ('fraud.resolve', 'fraud', 'resolve', 'Resolve and close fraud cases'),
    ('fraud.block', 'fraud', 'block', 'Block suspicious accounts or transactions'),
    
    -- Dispute Management Permissions
    ('disputes.read', 'disputes', 'read', 'View all dispute cases'),
    ('disputes.read.own', 'disputes', 'read', 'View own disputes only'),
    ('disputes.create', 'disputes', 'create', 'Create dispute cases'),
    ('disputes.investigate', 'disputes', 'investigate', 'Investigate dispute cases'),
    ('disputes.resolve', 'disputes', 'resolve', 'Resolve dispute cases'),
    
    -- Reporting Permissions
    ('reports.read', 'reports', 'read', 'View system reports'),
    ('reports.generate', 'reports', 'generate', 'Generate custom reports'),
    ('reports.export', 'reports', 'export', 'Export reports to various formats'),
    ('reports.financial', 'reports', 'financial', 'Access financial and sensitive reports'),
    
    -- Administrative Permissions
    ('admin.full_access', 'admin', '*', 'Full administrative access to all features'),
    ('admin.user_management', 'admin', 'user_management', 'Manage system users and staff'),
    ('admin.role_management', 'admin', 'role_management', 'Manage roles and permissions'),
    ('admin.settings', 'admin', 'settings', 'Manage system settings and configuration'),
    ('admin.audit_logs', 'admin', 'audit_logs', 'View audit logs and system activity')
ON CONFLICT (name) DO NOTHING;

-- ==============================================
-- ASSIGN PERMISSIONS TO ROLES
-- ==============================================

-- ADMIN - Full access to everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
ON CONFLICT DO NOTHING;

-- MANAGER - Management and oversight permissions (no delete)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MANAGER'
  AND p.name NOT IN ('admin.full_access', 'customers.delete', 'accounts.delete')
ON CONFLICT DO NOTHING;

-- CUSTOMER - Self-service permissions only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'CUSTOMER'
  AND p.name IN (
    'accounts.read.own',
    'transactions.read.own',
    'transactions.create',
    'cards.read.own',
    'cards.block',
    'transfers.read.own',
    'transfers.create',
    'disputes.read.own',
    'disputes.create'
  )
ON CONFLICT DO NOTHING;

-- SUPPORT - Customer assistance permissions (read-only mostly)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'SUPPORT'
  AND p.name IN (
    'customers.read',
    'customers.update',
    'accounts.read',
    'transactions.read',
    'cards.read',
    'cards.block',
    'transfers.read',
    'disputes.read',
    'disputes.investigate'
  )
ON CONFLICT DO NOTHING;

-- AUDITOR - Read-only access to everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'AUDITOR'
  AND p.action = 'read'
ON CONFLICT DO NOTHING;

-- AUDITOR - Plus special audit permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'AUDITOR'
  AND p.name IN (
    'reports.read',
    'reports.generate',
    'reports.export',
    'reports.financial',
    'admin.audit_logs'
  )
ON CONFLICT DO NOTHING;

-- TELLER - Transaction processing permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'TELLER'
  AND p.name IN (
    'customers.read',
    'accounts.read',
    'accounts.create',
    'transactions.read',
    'transactions.create',
    'cards.read',
    'cards.block',
    'transfers.read',
    'transfers.create'
  )
ON CONFLICT DO NOTHING;

-- COMPLIANCE_OFFICER - Fraud and compliance permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'COMPLIANCE_OFFICER'
  AND (
    p.resource IN ('fraud', 'disputes', 'reports', 'customers')
    OR p.name LIKE '%audit%'
    OR p.name LIKE '%kyc%'
  )
ON CONFLICT DO NOTHING;

-- ==============================================
-- VERIFICATION QUERY
-- ==============================================
DO $$
DECLARE
    role_count INTEGER;
    permission_count INTEGER;
    mapping_count INTEGER;
    admin_perms INTEGER;
    customer_perms INTEGER;
BEGIN
    SELECT COUNT(*) INTO role_count FROM roles;
    SELECT COUNT(*) INTO permission_count FROM permissions;
    SELECT COUNT(*) INTO mapping_count FROM role_permissions;
    SELECT COUNT(*) INTO admin_perms FROM role_permissions rp 
        JOIN roles r ON rp.role_id = r.id WHERE r.name = 'ADMIN';
    SELECT COUNT(*) INTO customer_perms FROM role_permissions rp 
        JOIN roles r ON rp.role_id = r.id WHERE r.name = 'CUSTOMER';
    
    RAISE NOTICE '=========================================';
    RAISE NOTICE 'System Configuration Seed Data Loaded:';
    RAISE NOTICE '  - Roles Created: %', role_count;
    RAISE NOTICE '  - Permissions Defined: %', permission_count;
    RAISE NOTICE '  - Total Role-Permission Mappings: %', mapping_count;
    RAISE NOTICE '  - ADMIN Permissions: %', admin_perms;
    RAISE NOTICE '  - CUSTOMER Permissions: %', customer_perms;
    RAISE NOTICE '=========================================';
END $$;
