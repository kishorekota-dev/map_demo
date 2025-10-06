-- Authentication and Authorization Schema
-- V2__create_auth_tables.sql

-- ==============================================
-- ROLES TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default roles
INSERT INTO roles (name, description) VALUES 
    ('ADMIN', 'System administrator with full access'),
    ('MANAGER', 'Branch manager with elevated privileges'),
    ('CUSTOMER', 'Regular customer with standard access'),
    ('SUPPORT', 'Customer support representative'),
    ('AUDITOR', 'Read-only access for auditing purposes')
ON CONFLICT (name) DO NOTHING;

-- ==============================================
-- PERMISSIONS TABLE
-- ==============================================

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default permissions
INSERT INTO permissions (name, resource, action, description) VALUES 
    ('customers.read', 'customers', 'read', 'Read customer information'),
    ('customers.create', 'customers', 'create', 'Create new customers'),
    ('customers.update', 'customers', 'update', 'Update customer information'),
    ('customers.delete', 'customers', 'delete', 'Delete customers'),
    ('customers.suspend', 'customers', 'suspend', 'Suspend customer accounts'),
    ('customers.verify_kyc', 'customers', 'verify_kyc', 'Verify customer KYC'),
    ('accounts.read', 'accounts', 'read', 'Read account information'),
    ('accounts.create', 'accounts', 'create', 'Create new accounts'),
    ('accounts.update', 'accounts', 'update', 'Update account information'),
    ('transactions.read', 'transactions', 'read', 'Read transaction history'),
    ('transactions.create', 'transactions', 'create', 'Create transactions'),
    ('reports.read', 'reports', 'read', 'Read reports and analytics'),
    ('admin.full_access', 'admin', '*', 'Full system access')
ON CONFLICT (name) DO NOTHING;

-- ==============================================
-- ROLE_PERMISSIONS TABLE (Many-to-Many)
-- ==============================================

CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

-- Assign permissions to roles
-- ADMIN: Full access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
ON CONFLICT DO NOTHING;

-- MANAGER: Most permissions except admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'MANAGER'
  AND p.name != 'admin.full_access'
  AND p.name != 'customers.delete'
ON CONFLICT DO NOTHING;

-- CUSTOMER: Read own data, create transactions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'CUSTOMER'
  AND p.name IN ('customers.read', 'accounts.read', 'transactions.read', 'transactions.create')
ON CONFLICT DO NOTHING;

-- SUPPORT: Read and update customers
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'SUPPORT'
  AND p.name IN ('customers.read', 'customers.update', 'accounts.read', 'transactions.read')
ON CONFLICT DO NOTHING;

-- AUDITOR: Read-only access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'AUDITOR'
  AND p.action = 'read'
ON CONFLICT DO NOTHING;

-- ==============================================
-- USERS TABLE (Authentication)
-- ==============================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Account status
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    
    -- Security
    failed_login_attempts INTEGER DEFAULT 0,
    last_login_at TIMESTAMP,
    last_login_ip VARCHAR(45),
    password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    must_change_password BOOLEAN DEFAULT FALSE,
    
    -- Two-factor authentication
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(255),
    
    -- Audit fields
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'system',
    updated_by VARCHAR(100)
);

CREATE INDEX idx_users_customer_id ON users(customer_id);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);

-- ==============================================
-- USER_ROLES TABLE (Many-to-Many)
-- ==============================================

CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by VARCHAR(100),
    UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

-- ==============================================
-- REFRESH_TOKENS TABLE (JWT Token Management)
-- ==============================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP,
    replaced_by_token VARCHAR(500),
    created_by_ip VARCHAR(45),
    revoked_by_ip VARCHAR(45)
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ==============================================
-- AUDIT_LOGS TABLE (Security audit trail)
-- ==============================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    resource_id VARCHAR(100),
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    status VARCHAR(20) DEFAULT 'SUCCESS',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource, resource_id);

-- ==============================================
-- TRIGGERS
-- ==============================================

-- Update timestamp trigger for roles
CREATE OR REPLACE FUNCTION update_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_roles_timestamp
    BEFORE UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION update_roles_updated_at();

-- Update timestamp trigger for permissions
CREATE OR REPLACE FUNCTION update_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_permissions_timestamp
    BEFORE UPDATE ON permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_permissions_updated_at();

-- Update timestamp trigger for users
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_users_timestamp
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- Lock account after failed login attempts
CREATE OR REPLACE FUNCTION check_failed_login_attempts()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.failed_login_attempts >= 5 AND NEW.failed_login_attempts != OLD.failed_login_attempts THEN
        NEW.is_locked = TRUE;
        
        -- Log the account lock
        INSERT INTO audit_logs (user_id, action, details, status)
        VALUES (NEW.id, 'ACCOUNT_LOCKED', 
                jsonb_build_object('reason', 'Too many failed login attempts', 'attempts', NEW.failed_login_attempts),
                'WARNING');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_failed_logins
    BEFORE UPDATE ON users
    FOR EACH ROW
    WHEN (NEW.failed_login_attempts IS DISTINCT FROM OLD.failed_login_attempts)
    EXECUTE FUNCTION check_failed_login_attempts();

-- ==============================================
-- HELPER FUNCTIONS
-- ==============================================

-- Function to get user permissions
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID)
RETURNS TABLE (
    permission_name VARCHAR(100),
    resource VARCHAR(50),
    action VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT p.name, p.resource, p.action
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN role_permissions rp ON ur.role_id = rp.role_id
    JOIN permissions p ON rp.permission_id = p.id
    WHERE u.id = p_user_id
      AND u.is_active = TRUE
      AND NOT u.is_locked;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user has permission
CREATE OR REPLACE FUNCTION user_has_permission(p_user_id UUID, p_permission_name VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    has_perm BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM users u
        JOIN user_roles ur ON u.id = ur.user_id
        JOIN role_permissions rp ON ur.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE u.id = p_user_id
          AND p.name = p_permission_name
          AND u.is_active = TRUE
          AND NOT u.is_locked
    ) INTO has_perm;
    
    RETURN has_perm;
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- COMMENTS
-- ==============================================

COMMENT ON TABLE roles IS 'System roles for role-based access control';
COMMENT ON TABLE permissions IS 'Granular permissions for resources and actions';
COMMENT ON TABLE users IS 'User authentication and account management';
COMMENT ON TABLE refresh_tokens IS 'JWT refresh token management';
COMMENT ON TABLE audit_logs IS 'Security and action audit trail';
COMMENT ON FUNCTION get_user_permissions(UUID) IS 'Returns all permissions for a given user';
COMMENT ON FUNCTION user_has_permission(UUID, VARCHAR) IS 'Checks if user has a specific permission';
