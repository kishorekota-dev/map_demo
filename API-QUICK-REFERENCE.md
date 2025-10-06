# POC Banking API Quick Reference

## Service URLs

| Service | URL | Status |
|---------|-----|--------|
| API Gateway | http://localhost:3001 | ✅ Ready |
| Customer Service | http://localhost:3010 | ✅ Ready |
| Account Service | http://localhost:3011 | 🟡 Pending |
| Card Service | http://localhost:3012 | 🟡 Pending |
| Payment Service | http://localhost:3013 | 🟡 Pending |
| Fraud Service | http://localhost:3014 | 🟡 Pending |
| Auth Service | http://localhost:3015 | 🟡 Pending |
| pgAdmin | http://localhost:5050 | ✅ Ready |

## Quick Start

```bash
# Deploy all services
./deployment-scripts/deploy-bian-services.sh

# Check health
curl http://localhost:3001/health

# Check status
./deployment-scripts/check-bian-status.sh

# Stop services
./deployment-scripts/stop-bian-services.sh
```

## Customer Service API

### REST API Endpoints

#### Create Customer
```bash
curl -X POST http://localhost:3001/customers \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Mr",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "phone": "+1234567890",
    "dateOfBirth": "1990-01-01",
    "gender": "MALE",
    "nationality": "USA",
    "addressLine1": "123 Main St",
    "city": "New York",
    "state": "NY",
    "postalCode": "10001",
    "country": "USA",
    "idType": "PASSPORT",
    "idNumber": "P12345678",
    "idExpiryDate": "2030-12-31"
  }'
```

#### Get All Customers
```bash
curl http://localhost:3001/customers

# With pagination
curl "http://localhost:3001/customers?page=1&limit=10"

# Filter by status
curl "http://localhost:3001/customers?status=ACTIVE"

# Filter by KYC status
curl "http://localhost:3001/customers?kyc_status=VERIFIED"
```

#### Get Customer by ID
```bash
curl http://localhost:3001/customers/{customer-id}
```

#### Update Customer
```bash
curl -X PUT http://localhost:3001/customers/{customer-id} \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newemail@example.com",
    "phone": "+1987654321",
    "addressLine1": "456 New St"
  }'
```

#### Get Customer KYC Status
```bash
curl http://localhost:3001/customers/{customer-id}/kyc
```

#### Update KYC Status
```bash
curl -X POST http://localhost:3001/customers/{customer-id}/kyc/verify \
  -H "Content-Type: application/json" \
  -d '{
    "status": "VERIFIED",
    "verifiedBy": "admin@bank.com",
    "riskRating": "LOW"
  }'
```

### BIAN API Endpoints

#### Initiate Party Reference Profile
```bash
curl -X POST http://localhost:3001/sd-party-reference-data-management/v1/party-reference-profile/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "partyName": {
      "firstName": "Jane",
      "lastName": "Smith"
    },
    "contactDetails": {
      "email": "jane.smith@example.com",
      "phone": "+1234567892"
    },
    "identificationDocuments": {
      "type": "DRIVERS_LICENSE",
      "number": "DL987654"
    },
    "riskAssessment": {
      "rating": "LOW"
    }
  }'
```

#### Retrieve Party Reference Profile
```bash
curl http://localhost:3001/sd-party-reference-data-management/v1/party-reference-profile/{customer-id}/retrieve
```

#### Update Party Reference Profile
```bash
curl -X PUT http://localhost:3001/sd-party-reference-data-management/v1/party-reference-profile/{customer-id}/update \
  -H "Content-Type: application/json" \
  -d '{
    "contactDetails": {
      "email": "updated@example.com",
      "phone": "+1999888777"
    },
    "status": "ACTIVE",
    "riskRating": "MEDIUM"
  }'
```

#### Control Party Reference Profile
```bash
# Block customer
curl -X PUT "http://localhost:3001/sd-party-reference-data-management/v1/party-reference-profile/{customer-id}/control?action=block" \
  -H "Content-Type: application/json"

# Suspend customer
curl -X PUT "http://localhost:3001/sd-party-reference-data-management/v1/party-reference-profile/{customer-id}/control?action=suspend" \
  -H "Content-Type: application/json"

# Activate customer
curl -X PUT "http://localhost:3001/sd-party-reference-data-management/v1/party-reference-profile/{customer-id}/control?action=activate" \
  -H "Content-Type: application/json"

# Close customer account
curl -X PUT "http://localhost:3001/sd-party-reference-data-management/v1/party-reference-profile/{customer-id}/control?action=close" \
  -H "Content-Type: application/json"
```

## Response Formats

### REST API Success Response
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "customer_number": "CUS0000000001",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "status": "ACTIVE",
    "kyc_status": "PENDING",
    "created_at": "2024-01-01T00:00:00.000Z"
  },
  "metadata": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "correlationId": "uuid"
  }
}
```

### BIAN API Success Response
```json
{
  "status": "success",
  "controlRecordId": "uuid",
  "controlRecordType": "PartyReferenceProfile",
  "data": {
    "partyReferenceProfileId": "uuid",
    "partyNumber": "CUS0000000001",
    "partyName": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "status": "ACTIVE",
    "kycStatus": "VERIFIED"
  },
  "metadata": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "version": "v1",
    "action": "initiate",
    "correlationId": "uuid"
  }
}
```

### Error Response
```json
{
  "status": "error",
  "error": {
    "code": "NOT_FOUND",
    "message": "Customer not found",
    "details": {
      "customerId": "uuid"
    }
  },
  "metadata": {
    "timestamp": "2024-01-01T00:00:00.000Z",
    "correlationId": "uuid"
  }
}
```

## Health Check

```bash
# Check all services
curl http://localhost:3001/health

# Response
{
  "status": "healthy",
  "gateway": {
    "uptime": 123.45,
    "timestamp": "2024-01-01T00:00:00.000Z"
  },
  "services": [
    {
      "name": "customer",
      "status": "healthy",
      "data": {
        "status": "healthy",
        "service": "customer-service",
        "database": {
          "status": "connected"
        }
      }
    }
  ]
}
```

## Database Access

### PostgreSQL CLI
```bash
# Connect to customer database
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db

# List tables
\dt

# Describe customers table
\d customers

# Query customers
SELECT * FROM customers LIMIT 10;

# Exit
\q
```

### pgAdmin
1. Open: http://localhost:5050
2. Login:
   - Email: admin@banking.local
   - Password: admin123
3. Add Server:
   - Name: POC Banking
   - Host: postgres
   - Port: 5432
   - Database: customer_db
   - Username: banking_user
   - Password: banking_pass_2024

## Common Operations

### View Logs
```bash
# All services
docker-compose -f docker-compose-banking.yml logs -f

# Specific service
docker-compose -f docker-compose-banking.yml logs -f customer-service

# Last 100 lines
docker-compose -f docker-compose-banking.yml logs --tail=100

# Search for error
docker-compose -f docker-compose-banking.yml logs | grep ERROR
```

### Restart Service
```bash
# Restart all
docker-compose -f docker-compose-banking.yml restart

# Restart specific service
docker-compose -f docker-compose-banking.yml restart customer-service
```

### Rebuild Service
```bash
# Rebuild all
docker-compose -f docker-compose-banking.yml up -d --build

# Rebuild specific service
docker-compose -f docker-compose-banking.yml up -d --build customer-service
```

### Clean Reset
```bash
# Stop and remove everything (WARNING: deletes all data)
docker-compose -f docker-compose-banking.yml down -v

# Rebuild and start
docker-compose -f docker-compose-banking.yml up -d --build
```

## Customer Status Values

| Status | Description |
|--------|-------------|
| ACTIVE | Customer is active and can use services |
| INACTIVE | Customer is temporarily inactive |
| SUSPENDED | Customer is suspended (cannot use services) |
| CLOSED | Customer account is closed |

## KYC Status Values

| Status | Description |
|--------|-------------|
| PENDING | KYC verification not started |
| IN_PROGRESS | KYC verification in progress |
| VERIFIED | KYC verification completed successfully |
| REJECTED | KYC verification failed |

## Risk Rating Values

| Rating | Description |
|--------|-------------|
| LOW | Low risk customer |
| MEDIUM | Medium risk customer |
| HIGH | High risk customer |
| VERY_HIGH | Very high risk customer |

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Invalid request data |
| UNAUTHORIZED | 401 | Authentication required |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Resource already exists |
| INTERNAL_ERROR | 500 | Server error |
| SERVICE_UNAVAILABLE | 503 | Service is down |

## Troubleshooting

### Service Not Starting
```bash
# Check logs
docker-compose -f docker-compose-banking.yml logs customer-service

# Check if port is in use
lsof -i :3010

# Restart service
docker-compose -f docker-compose-banking.yml restart customer-service
```

### Database Connection Error
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check PostgreSQL logs
docker-compose -f docker-compose-banking.yml logs postgres

# Test connection
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db -c "SELECT 1;"
```

### Gateway Not Routing
```bash
# Check gateway logs
docker-compose -f docker-compose-banking.yml logs api-gateway

# Test direct service access
curl http://localhost:3010/health

# Check network
docker network inspect poc-banking-network
```

## Performance Tips

1. **Use pagination**: Always specify page and limit for list endpoints
2. **Filter results**: Use status and kyc_status filters to reduce data
3. **Connection pooling**: Services use connection pooling (20 connections per service)
4. **Caching**: Consider adding Redis for frequently accessed data
5. **Monitoring**: Watch logs for slow queries and errors

## Security Best Practices

1. **Use HTTPS in production**: Add SSL/TLS certificates
2. **Rotate secrets**: Change JWT_SECRET and database passwords regularly
3. **Rate limiting**: Currently 100 req/15min per IP
4. **Input validation**: All inputs are validated with Joi
5. **Audit logs**: Enable audit logging for compliance
6. **Correlation IDs**: Track requests across services

## Next Steps

1. Implement remaining services (Account, Card, Payment, Fraud, Auth)
2. Add authentication/authorization
3. Implement event-driven architecture
4. Add caching layer (Redis)
5. Set up monitoring (Prometheus + Grafana)
6. Add API documentation (Swagger)
7. Write integration tests
8. Prepare for production deployment

---

For more information, see:
- **Full Documentation**: README-BIAN-SERVICES.md
- **Architecture Details**: BIAN-ARCHITECTURE.md
- **Implementation Summary**: BIAN-IMPLEMENTATION-COMPLETE.md
