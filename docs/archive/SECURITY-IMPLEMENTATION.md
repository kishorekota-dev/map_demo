# Enhanced Security Implementation

## 🔐 Security Architecture Overview

The Credit Card Enterprise API now implements a comprehensive security model with JWT authentication and role-based access control (RBAC). This document outlines the security features, user roles, permissions, and implementation details.

## 🎭 User Roles & Hierarchy

### Role Hierarchy (Authority Level)
```
SUPER_ADMIN (Level 100) → ADMIN (Level 80) → MANAGER (Level 60) → AGENT (Level 40) → CUSTOMER (Level 20)
```

### Role Definitions

#### 1. SUPER_ADMIN
- **Authority Level**: 100
- **Permissions**: All (`*`)
- **Description**: Full system access including user management, system configuration
- **Use Case**: System administrators, technical support

#### 2. ADMIN  
- **Authority Level**: 80
- **Permissions**: All resources except system management
  - `users:*`, `accounts:*`, `transactions:*`, `cards:*`, `fraud:*`, `disputes:*`, `reports:*`, `audit:*`
- **Description**: Administrative access to all customer and business operations
- **Use Case**: Branch managers, operations managers

#### 3. MANAGER
- **Authority Level**: 60
- **Permissions**: Customer operations and reporting
  - `accounts:read`, `accounts:update`, `transactions:*`, `cards:*`, `fraud:*`, `disputes:*`, `reports:read`
- **Description**: Management access to customer operations
- **Use Case**: Team leads, customer relationship managers

#### 4. AGENT
- **Authority Level**: 40
- **Permissions**: Customer service operations
  - `accounts:read`, `transactions:read`, `cards:read`, `cards:update`, `fraud:read`, `fraud:create`, `disputes:*`
- **Description**: Customer service agent access
- **Use Case**: Call center agents, branch employees

#### 5. CUSTOMER
- **Authority Level**: 20
- **Permissions**: Self-service only
  - `accounts:read:own`, `transactions:read:own`, `cards:read:own`, `cards:create:own`, `disputes:create:own`, `disputes:read:own`
- **Description**: Customer self-service access to own accounts only
- **Use Case**: End customers, mobile app users

## 🔑 Authentication System

### JWT Token Structure
```json
{
  "userId": "user_customer_001",
  "email": "john.doe@email.com",
  "role": "CUSTOMER",
  "iat": 1693670400,
  "exp": 1693756800,
  "iss": "credit-card-enterprise",
  "aud": "credit-card-api"
}
```

### Token Features
- **Expiration**: 24 hours (configurable)
- **Issuer**: credit-card-enterprise
- **Audience**: credit-card-api
- **Refresh**: Supported via `/auth/refresh` endpoint
- **Revocation**: Logout invalidates token (in production, use blacklist)

## 🛡️ Authorization System

### Permission Format
```
resource:action:scope
```

**Examples**:
- `accounts:read` - Read accounts
- `accounts:read:own` - Read only own accounts
- `users:*` - All user operations
- `fraud:create` - Create fraud cases

### Permission Checking Logic
1. **Super Admin**: Always granted (wildcard `*`)
2. **Exact Match**: Check for exact permission
3. **Resource Wildcard**: Check for `resource:*`
4. **Scope Check**: For `:own` scope, verify ownership
5. **Hierarchical**: Higher roles inherit lower role permissions

## 📊 Data Access Control

### Account Access Rules

| Role | Access Scope | Accounts Visible |
|------|-------------|------------------|
| SUPER_ADMIN | All | All accounts system-wide |
| ADMIN | All | All accounts system-wide |
| MANAGER | Branch/Team | All accounts in assigned area |
| AGENT | Assigned | Customer accounts they service |
| CUSTOMER | Own | Only their own accounts |

### Data Isolation
- **Customer Level**: Customers see only their own data
- **Account Level**: Each account has ownership validation
- **Transaction Level**: Transactions filtered by account access
- **Audit Trail**: All access attempts logged

## 🔧 API Endpoints Security

### Authentication Endpoints
- `POST /auth/login` - User login (public)
- `POST /auth/register` - Customer registration (public)
- `GET /auth/me` - Get user profile (authenticated)
- `POST /auth/refresh` - Refresh token (authenticated)
- `POST /auth/logout` - Logout (authenticated)
- `GET /auth/users` - List users (admin only)
- `GET /auth/permissions` - Get user permissions (authenticated)

### Resource Endpoints
All resource endpoints require authentication and appropriate permissions:

#### Accounts
- `GET /accounts` - `accounts:read` permission
- `GET /accounts/:id` - `accounts:read` + account access validation
- `POST /accounts` - `accounts:create` permission
- `PUT /accounts/:id` - `accounts:update` + account access validation

#### Transactions  
- `GET /transactions` - `transactions:read` permission
- `POST /transactions` - `transactions:create` + account access validation

#### Cards
- `GET /cards` - `cards:read` permission
- `POST /cards` - `cards:create` + account access validation

#### Fraud Management
- `GET /fraud/cases` - `fraud:read` permission
- `POST /fraud/cases` - `fraud:create` permission

## 👥 Test Users

### Pre-configured Test Users

| Role | Email | Password | Accounts |
|------|-------|----------|----------|
| SUPER_ADMIN | superadmin@creditcard.com | admin123 | All |
| ADMIN | admin@creditcard.com | admin123 | All |
| MANAGER | manager@creditcard.com | admin123 | All |
| AGENT | agent@creditcard.com | admin123 | All |
| CUSTOMER | john.doe@email.com | admin123 | acc_001, acc_002 |
| CUSTOMER | jane.smith@email.com | admin123 | acc_003, acc_004 |
| CUSTOMER | demo@example.com | admin123 | acc_005 |

## 🧪 Testing Security

### Automated Testing
```bash
# Run comprehensive security tests
./test-security.sh
```

### Manual Testing Examples

#### 1. Authentication
```bash
# Login as customer
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john.doe@email.com","password":"admin123"}'
```

#### 2. Access Own Data (Customer)
```bash
# Get own accounts (success)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/v1/accounts
```

#### 3. Access Forbidden Data (Customer)
```bash
# Try to access admin endpoint (should fail)
curl -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  http://localhost:3000/api/v1/auth/users
```

#### 4. Cross-Account Access (Should Fail)
```bash
# Customer 1 trying to access Customer 2's account
curl -H "Authorization: Bearer $CUSTOMER1_TOKEN" \
  http://localhost:3000/api/v1/accounts/acc_003
```

## 🔐 Security Best Practices Implemented

### 1. Authentication Security
- ✅ Bcrypt password hashing (10 rounds)
- ✅ JWT token with expiration
- ✅ Secure token storage and validation
- ✅ Account status checking (ACTIVE/INACTIVE)

### 2. Authorization Security
- ✅ Role-based access control (RBAC)
- ✅ Permission-level granular control
- ✅ Data ownership validation
- ✅ Principle of least privilege

### 3. Data Protection
- ✅ Account-level data isolation
- ✅ No sensitive data in JWT payload
- ✅ Password excluded from API responses
- ✅ Input validation on all endpoints

### 4. Error Handling
- ✅ Consistent error responses
- ✅ No information leakage in errors
- ✅ Proper HTTP status codes
- ✅ Audit-friendly error logging

## 🚀 MCP Server Integration

The MCP server has been updated to work with the new security system:

### Enhanced Authentication
- Stores JWT tokens securely
- Includes role and permission information
- Validates user context for all operations

### Role-Aware Operations
- Different tools available based on user role
- Data filtering based on user permissions
- Account access validation for customers

### Security Tools Added
- `get_user_profile` - Get current user info
- `get_permissions` - View user permissions
- Enhanced error handling for unauthorized access

## 🔄 Migration from Previous System

### What Changed
1. **User Model**: Enhanced with roles, permissions, account associations
2. **Authentication**: JWT-based with role information
3. **Authorization**: Middleware-based permission checking
4. **Data Access**: Role-based filtering and validation
5. **API Responses**: Include role and permission context

### Backward Compatibility
- All existing endpoints maintained
- Response format enhanced but compatible
- Previous test data migrated to new user model

## 🛠️ Configuration

### Environment Variables
```bash
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=24h
API_PREFIX=/api/v1
NODE_ENV=development
```

### Security Settings
- Token expiration: 24 hours (configurable)
- Password hash rounds: 10 (bcrypt)
- Maximum failed login attempts: 5 (can be implemented)
- Session timeout: Based on JWT expiration

## 📈 Monitoring & Auditing

### Security Events to Monitor
- Login attempts (success/failure)
- Permission denied events
- Cross-account access attempts
- Administrative operations
- Token refresh patterns

### Audit Trail
- All API calls logged with user context
- Permission checks logged
- Data access patterns tracked
- Security violations flagged

## 🔮 Future Enhancements

### Planned Security Features
1. **Multi-Factor Authentication (MFA)**
2. **Rate Limiting** per user/role
3. **IP Whitelisting** for admin roles
4. **Token Blacklisting** for logout
5. **Session Management** with concurrent session limits
6. **Advanced Audit Logging** with ELK stack
7. **OAuth2/OIDC Integration** for enterprise SSO

### Compliance Readiness
- **PCI DSS**: Ready for card data handling compliance
- **SOX**: Audit trail and access control features
- **GDPR**: Data access control and user management
- **SOC 2**: Security controls and monitoring ready

---

This security implementation provides enterprise-grade authentication and authorization suitable for production credit card systems while maintaining developer-friendly APIs and comprehensive testing capabilities.
