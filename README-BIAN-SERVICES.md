# POC Banking - BIAN Microservices Architecture

## Overview

This is a BIAN (Banking Industry Architecture Network) compliant banking system implemented as microservices using Docker Compose. The system demonstrates modern banking architecture with proper service domain separation, API Gateway pattern, and inter-service communication.

## Architecture

### Service Domains

1. **API Gateway** (Port 3001)
   - Entry point for all external requests
   - Request routing and load balancing
   - Rate limiting and CORS handling
   - Correlation ID management
   - Circuit breaker pattern

2. **Party Authentication Service** (Port 3015)
   - BIAN SD: Party Authentication
   - JWT-based authentication
   - Session management
   - Multi-factor authentication support
   - Password policies

3. **Customer Service** (Port 3010)
   - BIAN SD: Party Reference Data Management
   - Customer profile management
   - KYC (Know Your Customer) workflows
   - Contact information management
   - Customer relationships
   - Risk rating assessment

4. **Account Service** (Port 3011)
   - BIAN SD: Current Account / Savings Account
   - Account lifecycle management
   - Balance inquiries
   - Account transactions
   - Interest calculation
   - Account statements

5. **Card Service** (Port 3012)
   - BIAN SD: Card Management
   - Card issuance and activation
   - Card blocking and replacement
   - PIN management
   - Card transaction authorization
   - Card lifecycle management

6. **Payment Service** (Port 3013)
   - BIAN SD: Payment Execution
   - Payment initiation and processing
   - Funds transfer (internal/external)
   - Payment validation
   - Transaction reconciliation
   - Scheduled payments

7. **Fraud Service** (Port 3014)
   - BIAN SD: Fraud Detection / Fraud Resolution
   - Real-time fraud scoring
   - Rule-based fraud detection
   - Fraud alert management
   - Dispute resolution
   - Case management

### Infrastructure

- **PostgreSQL** (Port 5432): Primary database with separate schemas per service
- **pgAdmin** (Port 5050): Database management UI
- **Docker Network**: Isolated network for inter-service communication

## Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL 15
- **Migration**: Flyway
- **Containerization**: Docker & Docker Compose
- **API**: RESTful with BIAN patterns
- **Authentication**: JWT
- **Logging**: Winston
- **Validation**: Joi

## Quick Start

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18+ (for local development)
- 4GB RAM minimum
- 10GB disk space

### Deployment

```bash
# Clone repository
cd /Users/container/git/map_demo

# Run deployment script
chmod +x deployment-scripts/deploy-bian-services.sh
./deployment-scripts/deploy-bian-services.sh
```

### Manual Deployment

```bash
# Start all services
docker-compose -f docker-compose-banking.yml up -d

# Check service health
curl http://localhost:3001/health

# View logs
docker-compose -f docker-compose-banking.yml logs -f

# Stop services
docker-compose -f docker-compose-banking.yml down
```

## API Documentation

### BIAN URL Structure

All services follow BIAN REST API conventions:

```
/{service-domain}/{version}/{control-record-type}/{cr-id}/{behavior-qualifier}/{bq-id}/{action}
```

### Example Endpoints

#### Customer Service
```bash
# Create customer (Initiate)
POST /sd-party-reference-data-management/v1/party-reference-profile/initiate

# Retrieve customer
GET /sd-party-reference-data-management/v1/party-reference-profile/{customer-id}/retrieve

# Update customer
PUT /sd-party-reference-data-management/v1/party-reference-profile/{customer-id}/update
```

#### Account Service
```bash
# Open account (Initiate)
POST /sd-current-account/v1/current-account-facility/initiate

# Get account balance
GET /sd-current-account/v1/current-account-facility/{account-id}/balance/retrieve

# Deposit funds
POST /sd-current-account/v1/current-account-facility/{account-id}/deposits/initiate
```

#### Payment Service
```bash
# Initiate payment
POST /sd-payment-execution/v1/payment-order/initiate

# Get payment status
GET /sd-payment-execution/v1/payment-order/{payment-id}/retrieve

# Cancel payment
PUT /sd-payment-execution/v1/payment-order/{payment-id}/control?action=cancel
```

#### Fraud Service
```bash
# Create fraud alert
POST /sd-fraud-detection/v1/fraud-case/initiate

# Assess risk
POST /sd-fraud-detection/v1/fraud-case/{case-id}/risk-assessment/evaluate

# Resolve case
PUT /sd-fraud-detection/v1/fraud-case/{case-id}/control?action=resolve
```

### Simplified REST Endpoints

The API Gateway also provides simplified REST endpoints:

```bash
# Customers
GET    /customers
POST   /customers
GET    /customers/:id
PUT    /customers/:id
DELETE /customers/:id

# Accounts
GET    /accounts
POST   /accounts
GET    /accounts/:id
PUT    /accounts/:id

# Cards
GET    /cards
POST   /cards
POST   /cards/:id/block
POST   /cards/:id/activate

# Payments
GET    /payments
POST   /payments
GET    /transfers
POST   /transfers

# Fraud
GET    /fraud/alerts
POST   /fraud/alerts
GET    /disputes
POST   /disputes
```

## Database Schema

Each service has its own database:

- `customer_db`: Customer profiles, KYC data, relationships
- `account_db`: Accounts, transactions, balances
- `card_db`: Cards, card transactions, limits
- `payment_db`: Payments, transfers, beneficiaries
- `fraud_db`: Fraud alerts, cases, risk assessments
- `poc_banking`: Shared data (authentication sessions)

### Database Access

```bash
# PostgreSQL CLI
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db

# pgAdmin
open http://localhost:5050
# Email: admin@banking.local
# Password: admin123
```

## Shared Libraries

### ServiceClient

Inter-service communication with retry and circuit breaker:

```javascript
const { ServiceClient } = require('./shared');

const customerService = new ServiceClient('customer-service', 'http://customer-service:3010');

// Make request
const customer = await customerService.get('/api/v1/customers/123');
```

### BIAN Response Format

```javascript
const { BIANResponse } = require('./shared');

// Success response
return BIANResponse.initiate(customerId, 'PartyReferenceProfile', customerData);

// Error response
throw BIANError.notFound('Customer', customerId);
```

### Validation

```javascript
const { Validator } = require('./shared');

const customerSchema = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  email: Validator.schemas.email.required()
});

app.post('/customers', Validator.middleware(customerSchema), async (req, res) => {
  // Request body is validated
});
```

## Business Logic

### Account Opening Workflow

1. Customer creates profile (Customer Service)
2. KYC verification triggered
3. Risk assessment performed
4. Account initiated (Account Service)
5. Card issued automatically (Card Service)
6. Welcome email sent

### Payment Processing

1. Payment initiated (Payment Service)
2. Account validation (Account Service)
3. Balance check
4. Fraud check (Fraud Service)
5. If approved, execute transfer
6. Update balances
7. Send notifications

### Fraud Detection

1. Transaction initiated
2. Real-time scoring (ML model)
3. Rule engine evaluation
4. If suspicious, create alert
5. Block transaction if high risk
6. Create case for investigation
7. Notify customer

## Monitoring & Observability

### Health Checks

```bash
# Gateway health
curl http://localhost:3001/health

# Individual service health
curl http://localhost:3010/health  # Customer
curl http://localhost:3011/health  # Account
curl http://localhost:3012/health  # Card
curl http://localhost:3013/health  # Payment
curl http://localhost:3014/health  # Fraud
curl http://localhost:3015/health  # Auth
```

### Logs

```bash
# View all logs
docker-compose -f docker-compose-banking.yml logs -f

# View specific service
docker-compose -f docker-compose-banking.yml logs -f customer-service

# Search logs for correlation ID
docker-compose -f docker-compose-banking.yml logs | grep "correlation-id-here"
```

### Metrics

Each service exposes:
- Request count
- Response times
- Error rates
- Database connection pool stats
- Circuit breaker state

## Security

### Authentication Flow

1. Client sends credentials to `/auth/login`
2. Party Auth Service validates credentials
3. JWT token issued (24h expiry)
4. Client includes token in Authorization header
5. Services validate token
6. Correlation ID tracks request flow

### Security Features

- Helmet.js for HTTP headers
- CORS configuration
- Rate limiting (100 req/15min per IP)
- JWT token expiration
- Password hashing with bcrypt
- SQL injection prevention (parameterized queries)
- Input validation with Joi
- Environment variable secrets

## Development

### Local Development

```bash
# Start database only
docker-compose -f docker-compose-banking.yml up -d postgres pgadmin

# Run service locally
cd services/customer-service
npm install
npm run dev
```

### Adding a New Service

1. Create service directory: `services/new-service/`
2. Add to `docker-compose-banking.yml`
3. Configure database schema
4. Add routes to API Gateway
5. Update documentation

### Database Migrations

```bash
# Run migrations for a service
cd services/customer-service
npm run db:migrate
```

## Troubleshooting

### Services Not Starting

```bash
# Check Docker logs
docker-compose -f docker-compose-banking.yml logs

# Restart services
docker-compose -f docker-compose-banking.yml restart

# Clean rebuild
docker-compose -f docker-compose-banking.yml down -v
docker-compose -f docker-compose-banking.yml up --build
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Check database exists
docker exec -it poc-banking-postgres psql -U banking_user -l

# Test connection
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db -c "SELECT 1;"
```

### Service Communication Issues

```bash
# Check network
docker network ls | grep banking

# Test service connectivity
docker exec -it poc-banking-gateway curl http://customer-service:3010/health
```

## Performance Optimization

- Connection pooling (20 connections per service)
- Database indexes on frequently queried columns
- Circuit breaker prevents cascading failures
- Request timeout: 30s
- Retry logic with exponential backoff
- Correlation IDs for request tracing

## Compliance

- **BIAN**: Follows BIAN service domain patterns
- **PCI-DSS**: Card data security (masking, encryption)
- **GDPR**: Customer data protection
- **KYC/AML**: Customer verification workflows
- **Audit Trail**: All transactions logged with timestamps

## Future Enhancements

- [ ] Kubernetes deployment manifests
- [ ] Service mesh (Istio)
- [ ] Event-driven architecture (Kafka)
- [ ] Redis caching layer
- [ ] Elasticsearch for log aggregation
- [ ] Prometheus + Grafana monitoring
- [ ] API documentation (Swagger/OpenAPI)
- [ ] Integration tests
- [ ] Load testing scenarios

## Support

For issues or questions:
1. Check logs: `docker-compose -f docker-compose-banking.yml logs -f`
2. Review documentation: `BIAN-ARCHITECTURE.md`
3. Check service health: `curl http://localhost:3001/health`

## License

MIT License - POC Banking System
