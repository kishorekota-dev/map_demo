# POC Banking Service - Docker Compose Fix Summary

## 🔧 Changes Made

### Issue
The docker-compose file was pointing to deleted services in `/services` folder and was missing authentication endpoints in poc-banking-service.

### Solution
Restructured the docker-compose to run a standalone poc-banking-service with all necessary components.

---

## 📝 Files Created/Modified

### 1. **Created: `routes/auth.js`** 
   - Complete authentication API with 4 endpoints
   - Login with JWT token generation
   - Refresh token mechanism
   - Logout with token revocation
   - User profile endpoint (`/me`)
   - Uses `bcryptjs` (already in package.json)
   - Includes audit logging

### 2. **Modified: `server.js`**
   - Added auth routes import
   - Registered `/api/v1/auth` endpoint (no auth required)
   - Updated API docs endpoint to include auth info
   - Maintained existing banking routes with auth middleware

### 3. **Modified: `docker-compose-banking-simple.yml`**
   - Removed references to deleted `/services` folder
   - Changed from customer-service + api-gateway to standalone banking-service
   - Configured banking-service to run on port 3005
   - Proper environment variables for JWT and database
   - Health checks configured
   - Volume mapping for logs

### 4. **Created: `start-service.sh`**
   - Quick start script with health checks
   - Shows all service URLs and credentials
   - Provides quick test commands
   - Includes troubleshooting info

---

## 🏗️ New Architecture

```
┌─────────────────────────────────────────┐
│          POC Banking Service            │
│         (Port 3005)                     │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   Authentication Endpoints      │   │
│  │   /api/v1/auth/*                │   │
│  │   - POST /login                 │   │
│  │   - POST /refresh               │   │
│  │   - POST /logout                │   │
│  │   - GET  /me                    │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   Banking Endpoints (protected) │   │
│  │   /api/*                        │   │
│  │   - /accounts                   │   │
│  │   - /transactions               │   │
│  │   - /cards                      │   │
│  │   - /transfers                  │   │
│  │   - /fraud                      │   │
│  │   - /disputes                   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   Health & Docs                 │   │
│  │   - /health                     │   │
│  │   - /api/docs                   │   │
│  │   - /openapi.yaml               │   │
│  │   - /api-docs.html              │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                  │
                  ▼
        ┌─────────────────┐
        │   PostgreSQL    │
        │   (Port 5432)   │
        │                 │
        │  - customers    │
        │  - users        │
        │  - roles        │
        │  - permissions  │
        │  - audit_logs   │
        └─────────────────┘
                  │
                  ▼
        ┌─────────────────┐
        │    pgAdmin      │
        │   (Port 5050)   │
        └─────────────────┘
```

---

## 🚀 How to Start

### Option 1: Use Quick Start Script
```bash
cd /Users/container/git/map_demo/poc-banking-service
./start-service.sh
```

### Option 2: Manual Docker Compose
```bash
cd /Users/container/git/map_demo/poc-banking-service
docker-compose -f docker-compose-banking-simple.yml up -d --build
```

---

## 📊 Service Details

| Service | Port | Container Name | Status |
|---------|------|----------------|--------|
| **Banking Service** | 3005 | poc-banking-service | ✅ Ready |
| **PostgreSQL** | 5432 | poc-banking-postgres | ✅ Ready |
| **pgAdmin** | 5050 | poc-banking-pgadmin | ✅ Ready |

---

## 🔐 Authentication Endpoints

### POST /api/v1/auth/login
Login with username and password, receive JWT tokens.

**Request:**
```bash
curl -X POST http://localhost:3005/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Password123!"}'
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "user": {...},
    "tokens": {
      "accessToken": "eyJhbGc...",
      "refreshToken": "eyJhbGc...",
      "tokenType": "Bearer",
      "expiresIn": "15m"
    },
    "roles": ["ADMIN"],
    "permissions": ["customers.read", ...]
  }
}
```

### POST /api/v1/auth/refresh
Refresh expired access token.

### POST /api/v1/auth/logout
Logout and revoke refresh token (requires auth).

### GET /api/v1/auth/me
Get current user profile (requires auth).

---

## 🧪 Testing

### Test Authentication Flow
```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3005/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Password123!"}' \
  | jq -r '.data.tokens.accessToken')

# 2. Get user profile
curl -X GET http://localhost:3005/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq .

# 3. Access protected banking endpoints
curl -X GET http://localhost:3005/api/accounts \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Run Comprehensive Tests
```bash
cd /Users/container/git/map_demo/poc-banking-service
./tests/test-authentication.sh
```

---

## 🔧 Configuration

### Environment Variables
All configured in `docker-compose-banking-simple.yml`:

```yaml
environment:
  - NODE_ENV=development
  - PORT=3005
  - DB_HOST=postgres
  - DB_PORT=5432
  - DB_NAME=customer_db
  - DB_USER=banking_user
  - DB_PASSWORD=banking_pass_2024
  - JWT_SECRET=poc-banking-secret-key-2024
  - JWT_EXPIRES_IN=15m
  - REFRESH_TOKEN_EXPIRES_IN=7d
```

---

## 📚 Available Documentation

| Document | Description |
|----------|-------------|
| `openapi.yaml` | OpenAPI 3.0 specification |
| `API-DOCUMENTATION.md` | Comprehensive API guide |
| `API-QUICK-REFERENCE.md` | Quick reference cheat sheet |
| `postman-collection.json` | Postman collection |
| `api-docs.html` | Swagger UI (standalone) |

---

## 🐛 Troubleshooting

### Service won't start
```bash
# Check Docker is running
docker info

# View logs
docker-compose -f docker-compose-banking-simple.yml logs -f banking-service

# Restart services
docker-compose -f docker-compose-banking-simple.yml restart
```

### Database connection issues
```bash
# Check PostgreSQL health
docker exec -it poc-banking-postgres pg_isready -U banking_user

# Connect to database
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db
```

### Authentication not working
```bash
# Check if users table exists
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db -c "\dt"

# Check if users exist
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db \
  -c "SELECT username, email, is_active FROM users;"
```

---

## ✅ Verification Checklist

- [x] Authentication routes created in `/routes/auth.js`
- [x] Server.js updated to include auth routes
- [x] Docker Compose file updated for standalone service
- [x] Dependencies verified (bcryptjs, jsonwebtoken already in package.json)
- [x] Port changed to 3005 (different from deleted services)
- [x] Environment variables configured
- [x] Health checks configured
- [x] Quick start script created
- [x] Documentation updated

---

## 🎯 Next Steps

1. **Start the service:**
   ```bash
   ./start-service.sh
   ```

2. **Test authentication:**
   ```bash
   curl -X POST http://localhost:3005/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"Password123!"}'
   ```

3. **View Swagger docs:**
   - Open `api-docs.html` in browser

4. **Run comprehensive tests:**
   ```bash
   ./tests/test-authentication.sh
   ```

---

**Fixed**: October 8, 2025  
**Service**: POC Banking Service  
**Port**: 3005 (changed from 3010 to avoid conflicts)
