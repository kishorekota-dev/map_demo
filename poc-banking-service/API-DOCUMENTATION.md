# POC Banking Service API Documentation

## Overview

This is a comprehensive API documentation for the POC Banking Service, built with JWT authentication and role-based access control (RBAC).

## Quick Links

- **OpenAPI Spec**: [openapi.yaml](./openapi.yaml)
- **Live API**: http://localhost:3010/api/v1
- **Health Check**: http://localhost:3010/health

## Table of Contents

1. [Authentication](#authentication)
2. [Authorization](#authorization)
3. [API Endpoints](#api-endpoints)
4. [Error Handling](#error-handling)
5. [Rate Limiting](#rate-limiting)
6. [Examples](#examples)

---

## Authentication

### JWT Token System

The API uses JWT (JSON Web Token) for authentication with two token types:

- **Access Token**: Short-lived (15 minutes) - used for API requests
- **Refresh Token**: Long-lived (7 days) - used to obtain new access tokens

### Getting Started

1. **Login** to get tokens:
```bash
curl -X POST http://localhost:3010/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "Password123!"
  }'
```

2. **Use the access token** in subsequent requests:
```bash
curl -X GET http://localhost:3010/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

3. **Refresh token** when it expires:
```bash
curl -X POST http://localhost:3010/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "YOUR_REFRESH_TOKEN"
  }'
```

---

## Authorization

### Roles

The system supports 5 roles with different permission levels:

| Role | Description | Permission Count |
|------|-------------|------------------|
| **ADMIN** | Full system access | 13 permissions |
| **MANAGER** | Customer and account management | 11 permissions |
| **CUSTOMER** | Self-service access | 4 permissions |
| **SUPPORT** | Customer support operations | 6 permissions |
| **AUDITOR** | Read-only audit access | 3 permissions |

### Permissions

Permissions are structured as `resource.action`:

**Customer Operations:**
- `customers.read` - View customers
- `customers.create` - Create customers
- `customers.update` - Update customers
- `customers.delete` - Delete customers
- `customers.suspend` - Suspend customers
- `customers.verify_kyc` - Verify KYC

**Account Operations:**
- `accounts.read` - View accounts
- `accounts.create` - Create accounts
- `accounts.update` - Update accounts

**Transaction Operations:**
- `transactions.read` - View transactions
- `transactions.create` - Create transactions

**Report Operations:**
- `reports.read` - View reports

**Admin Operations:**
- `admin.full_access` - Full admin access

---

## API Endpoints

### Authentication Endpoints

#### POST /api/v1/auth/login
Login with username and password.

**Request:**
```json
{
  "username": "admin",
  "password": "Password123!"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "uuid",
      "username": "admin",
      "email": "admin@pocbanking.com",
      "customerId": null,
      "roles": ["ADMIN"]
    },
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc...",
      "tokenType": "Bearer",
      "expiresIn": "15m"
    },
    "roles": ["ADMIN"],
    "permissions": ["customers.read", "customers.create", ...]
  }
}
```

#### POST /api/v1/auth/refresh
Refresh access token.

#### POST /api/v1/auth/logout
Logout and invalidate refresh token.

#### GET /api/v1/auth/me
Get current user profile.

---

### Customer Endpoints

#### GET /api/v1/customers
Get paginated list of customers.

**Query Parameters:**
- `page` (integer, default: 1) - Page number
- `limit` (integer, default: 10) - Items per page
- `status` (string) - Filter by status (ACTIVE, INACTIVE, SUSPENDED, CLOSED)
- `kyc_status` (string) - Filter by KYC status (PENDING, VERIFIED, REJECTED, EXPIRED)

**Example:**
```bash
curl -X GET "http://localhost:3010/api/v1/customers?page=1&limit=10&status=ACTIVE" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### GET /api/v1/customers/{id}
Get customer by ID.

#### POST /api/v1/customers
Create new customer.

**Request:**
```json
{
  "title": "Mr",
  "firstName": "John",
  "lastName": "Doe",
  "dateOfBirth": "1990-01-15",
  "gender": "MALE",
  "nationality": "USA",
  "email": "john.doe@example.com",
  "phone": "+1-555-0100",
  "addressLine1": "123 Main Street",
  "city": "New York",
  "state": "NY",
  "postalCode": "10001",
  "country": "USA",
  "idType": "PASSPORT",
  "idNumber": "P12345678",
  "idExpiryDate": "2030-12-31",
  "idIssuingCountry": "USA"
}
```

#### PUT /api/v1/customers/{id}
Update customer information.

---

### KYC Endpoints

#### GET /api/v1/customers/{id}/kyc
Get customer KYC status.

#### POST /api/v1/customers/{id}/kyc/verify
Verify customer KYC.

**Request:**
```json
{
  "status": "VERIFIED",
  "verifiedBy": "John Smith",
  "riskRating": "LOW"
}
```

---

## Error Handling

All errors follow a consistent format:

```json
{
  "status": "error",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  },
  "metadata": {
    "timestamp": "2025-10-08T01:45:00.000Z",
    "correlationId": "uuid"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Authentication required or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `CONFLICT` | 409 | Resource conflict (e.g., duplicate email) |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |
| `INVALID_CREDENTIALS` | 401 | Invalid username or password |
| `ACCOUNT_LOCKED` | 403 | Account locked due to failed login attempts |
| `INVALID_TOKEN` | 401 | Token is invalid or expired |

---

## Rate Limiting

API requests are rate-limited to prevent abuse:

- **Anonymous requests**: 100 requests per 15 minutes
- **Authenticated requests**: 1,000 requests per 15 minutes

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1633024800
```

---

## Examples

### Complete Authentication Flow

```bash
#!/bin/bash

# 1. Login as admin
RESPONSE=$(curl -s -X POST http://localhost:3010/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Password123!"}')

# 2. Extract tokens
ACCESS_TOKEN=$(echo $RESPONSE | jq -r '.data.tokens.accessToken')
REFRESH_TOKEN=$(echo $RESPONSE | jq -r '.data.tokens.refreshToken')

echo "Access Token: $ACCESS_TOKEN"
echo "Refresh Token: $REFRESH_TOKEN"

# 3. Get current user info
curl -s -X GET http://localhost:3010/api/v1/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

# 4. Get all customers
curl -s -X GET http://localhost:3010/api/v1/customers \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

# 5. Refresh token when needed
curl -s -X POST http://localhost:3010/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" | jq .

# 6. Logout
curl -s -X POST http://localhost:3010/api/v1/auth/logout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}" | jq .
```

### Create Customer Example

```bash
ACCESS_TOKEN="your_token_here"

curl -X POST http://localhost:3010/api/v1/customers \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Mr",
    "firstName": "John",
    "lastName": "Doe",
    "dateOfBirth": "1990-01-15",
    "gender": "MALE",
    "email": "john.doe@example.com",
    "phone": "+1-555-0100",
    "addressLine1": "123 Main Street",
    "city": "New York",
    "state": "NY",
    "postalCode": "10001",
    "country": "USA"
  }' | jq .
```

### Verify KYC Example

```bash
ACCESS_TOKEN="your_token_here"
CUSTOMER_ID="customer-uuid-here"

curl -X POST "http://localhost:3010/api/v1/customers/$CUSTOMER_ID/kyc/verify" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "VERIFIED",
    "verifiedBy": "Compliance Officer",
    "riskRating": "LOW"
  }' | jq .
```

### Customer Login and Self-Service Example

```bash
# 1. Customer login
CUSTOMER_RESPONSE=$(curl -s -X POST http://localhost:3010/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"james.patterson","password":"Password123!"}')

CUSTOMER_TOKEN=$(echo $CUSTOMER_RESPONSE | jq -r '.data.tokens.accessToken')

# 2. Get own profile
curl -s -X GET http://localhost:3010/api/v1/auth/me \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" | jq .

# 3. View own customer record
CUSTOMER_ID=$(echo $CUSTOMER_RESPONSE | jq -r '.data.user.customerId')
curl -s -X GET "http://localhost:3010/api/v1/customers/$CUSTOMER_ID" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" | jq .
```

---

## Testing Credentials

Use these credentials for testing:

### System Users

| Username | Password | Role | Description |
|----------|----------|------|-------------|
| `admin` | `Password123!` | ADMIN | Full system access |
| `manager` | `Password123!` | MANAGER | Customer management |
| `support` | `Password123!` | SUPPORT | Customer support |
| `auditor` | `Password123!` | AUDITOR | Audit access |

### Customer Users

| Username | Password | Role | Customer |
|----------|----------|------|----------|
| `james.patterson` | `Password123!` | CUSTOMER | James Patterson (Premium) |
| `sarah.martinez` | `Password123!` | CUSTOMER | Sarah Martinez (Business) |
| `michael.chen` | `Password123!` | CUSTOMER | Michael Chen (Business) |
| `robert.thompson` | `Password123!` | CUSTOMER | Robert Thompson (Retail) |
| `yuki.tanaka` | `Password123!` | CUSTOMER | Yuki Tanaka (Corporate) |
| `david.wilson` | `Password123!` | CUSTOMER | David Wilson (Suspended) |

---

## Viewing the OpenAPI Specification

### Using Swagger UI

You can view the OpenAPI specification in Swagger UI:

1. **Online**: Go to [Swagger Editor](https://editor.swagger.io/) and paste the contents of `openapi.yaml`

2. **Docker**: Run Swagger UI locally:
```bash
docker run -p 8080:8080 -e SWAGGER_JSON=/api/openapi.yaml \
  -v $(pwd)/openapi.yaml:/api/openapi.yaml \
  swaggerapi/swagger-ui
```
Then open http://localhost:8080

### Using Postman

Import the OpenAPI spec into Postman:
1. Open Postman
2. Click "Import"
3. Select the `openapi.yaml` file
4. All endpoints will be available with examples

### Using VS Code

Install the "OpenAPI (Swagger) Editor" extension for VS Code to view and edit the spec with syntax highlighting and validation.

---

## Additional Resources

- **Health Check**: `GET /health` - Check service health
- **Database**: PostgreSQL 15 with full ACID compliance
- **Architecture**: Microservices with API Gateway
- **Documentation**: Complete inline documentation in code

---

## Support

For issues or questions:
- GitHub Issues: [Repository Issues](https://github.com/kishorekota-dev/map_demo/issues)
- Email: support@pocbanking.com

---

**Last Updated**: October 8, 2025  
**API Version**: 1.0.0  
**OpenAPI Version**: 3.0.3
