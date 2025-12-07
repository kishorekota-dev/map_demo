# API Quick Reference Guide

## 🚀 Quick Start

```bash
# 1. Start the services
cd /Users/container/git/map_demo/poc-banking-service
docker-compose -f docker-compose-banking-simple.yml up -d

# 2. Login
curl -X POST http://localhost:3010/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Password123!"}'

# 3. Use the token
TOKEN="your_access_token_here"
curl -X GET http://localhost:3010/api/v1/customers \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📋 Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/login` | Login user | ❌ |
| POST | `/auth/refresh` | Refresh token | ❌ |
| POST | `/auth/logout` | Logout user | ✅ |
| GET | `/auth/me` | Get user profile | ✅ |

---

## 👥 Customer Endpoints

| Method | Endpoint | Description | Auth Required | Permission |
|--------|----------|-------------|---------------|------------|
| GET | `/customers` | List customers | ✅ | `customers.read` |
| GET | `/customers/:id` | Get customer | ✅ | `customers.read` |
| POST | `/customers` | Create customer | ✅ | `customers.create` |
| PUT | `/customers/:id` | Update customer | ✅ | `customers.update` |

---

## 🔍 KYC Endpoints

| Method | Endpoint | Description | Auth Required | Permission |
|--------|----------|-------------|---------------|------------|
| GET | `/customers/:id/kyc` | Get KYC status | ✅ | `customers.read` |
| POST | `/customers/:id/kyc/verify` | Verify KYC | ✅ | `customers.verify_kyc` |

---

## 🔑 Test Credentials

### System Users
```
admin / Password123!          (Role: ADMIN)
manager / Password123!        (Role: MANAGER)
support / Password123!        (Role: SUPPORT)
auditor / Password123!        (Role: AUDITOR)
```

### Customer Users
```
james.patterson / Password123!    (Premium)
sarah.martinez / Password123!     (Business)
michael.chen / Password123!       (Business)
```

---

## 📊 Response Format

### Success Response
```json
{
  "status": "success",
  "data": { ... },
  "metadata": {
    "timestamp": "2025-10-08T01:45:00.000Z",
    "correlationId": "uuid"
  }
}
```

### Error Response
```json
{
  "status": "error",
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message",
    "details": { ... }
  },
  "metadata": {
    "timestamp": "2025-10-08T01:45:00.000Z",
    "correlationId": "uuid"
  }
}
```

---

## 🎯 Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `CONFLICT` | 409 | Duplicate resource |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |

---

## 🔐 Roles & Permissions

| Role | Permissions Count | Key Permissions |
|------|-------------------|-----------------|
| ADMIN | 13 | All permissions + `admin.full_access` |
| MANAGER | 11 | Customer & account management |
| CUSTOMER | 4 | Self-service only |
| SUPPORT | 6 | Customer support operations |
| AUDITOR | 3 | Read-only access |

---

## 📦 Quick Examples

### Login and Get Customers
```bash
# Login
RESPONSE=$(curl -s -X POST http://localhost:3010/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Password123!"}')

# Extract token
TOKEN=$(echo $RESPONSE | jq -r '.data.tokens.accessToken')

# Get customers
curl -X GET http://localhost:3010/api/v1/customers \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Create Customer
```bash
curl -X POST http://localhost:3010/api/v1/customers \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "dateOfBirth": "1990-01-15",
    "email": "john.doe@example.com",
    "phone": "+1-555-0100"
  }' | jq .
```

### Verify KYC
```bash
CUSTOMER_ID="customer-uuid"
curl -X POST "http://localhost:3010/api/v1/customers/$CUSTOMER_ID/kyc/verify" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "VERIFIED",
    "verifiedBy": "Officer Name",
    "riskRating": "LOW"
  }' | jq .
```

---

## 🛠️ Tools & Resources

- **OpenAPI Spec**: `openapi.yaml`
- **Postman Collection**: `postman-collection.json`
- **Full Documentation**: `API-DOCUMENTATION.md`
- **Test Script**: `tests/test-authentication.sh`

---

## 📞 Support

- **Health Check**: http://localhost:3010/health
- **pgAdmin**: http://localhost:5050
- **API Base URL**: http://localhost:3010/api/v1
- **Gateway URL**: http://localhost:3001/api/v1
