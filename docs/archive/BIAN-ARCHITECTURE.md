# POC Banking - BIAN Architecture

## BIAN Service Domain Mapping

This implementation follows BIAN (Banking Industry Architecture Network) standards for service domains.

### Service Domains Implemented

1. **Party Authentication** (Port 3015)
   - BIAN SD: Party Authentication
   - Responsibilities: Authentication, authorization, session management
   - Endpoints: `/sd-party-authentication/v1`

2. **Party Reference Data Management** (Port 3010 - Customer Service)
   - BIAN SD: Party Reference Data Management
   - Responsibilities: Customer profiles, KYC, contact information
   - Endpoints: `/sd-party-reference-data-management/v1`

3. **Current Account** (Port 3011 - Account Service)
   - BIAN SD: Current Account, Savings Account
   - Responsibilities: Account lifecycle, balance management, transactions
   - Endpoints: `/sd-current-account/v1`, `/sd-savings-account/v1`

4. **Card Management** (Port 3012)
   - BIAN SD: Card Management, Card Collections
   - Responsibilities: Card issuance, activation, blocking, lifecycle
   - Endpoints: `/sd-card-management/v1`

5. **Payment Execution** (Port 3013)
   - BIAN SD: Payment Execution, Payment Order
   - Responsibilities: Payment processing, transfers, transaction execution
   - Endpoints: `/sd-payment-execution/v1`

6. **Fraud Detection** (Port 3014)
   - BIAN SD: Fraud Detection, Fraud Resolution
   - Responsibilities: Real-time fraud detection, alert management, case resolution
   - Endpoints: `/sd-fraud-detection/v1`

### BIAN API Pattern

All services follow BIAN REST API conventions:

```
/{service-domain}/{version}/{control-record-type}/{control-record-id}/{behavior-qualifier}/{behavior-qualifier-id}/{action}
```

Example:
```
POST /sd-current-account/v1/current-account-facility/{cr-id}/deposits/initiate
GET  /sd-current-account/v1/current-account-facility/{cr-id}/deposits/{bq-id}/retrieve
PUT  /sd-current-account/v1/current-account-facility/{cr-id}/deposits/{bq-id}/update
```

### Control Record Types

- **Current Account Facility**: Account management control record
- **Card Facility**: Card management control record
- **Payment Order**: Payment execution control record
- **Fraud Case**: Fraud detection control record
- **Party Reference Profile**: Customer data control record
- **Authentication Session**: Auth session control record

### Behavior Qualifiers

- **Deposits**: Deposit transactions
- **Withdrawals**: Withdrawal transactions
- **Interest**: Interest calculations
- **Service Fees**: Fee management
- **Account Statements**: Statement generation
- **Card Transactions**: Card-based transactions
- **Fraud Alerts**: Fraud detection alerts
- **Risk Assessment**: Risk scoring

### Service Communication

Services communicate via REST APIs following these patterns:

1. **Synchronous**: Direct HTTP calls for immediate responses
2. **Asynchronous**: Event-driven for long-running processes
3. **Circuit Breaker**: Fault tolerance for service failures
4. **Retry Logic**: Automatic retries with exponential backoff

### Service Dependencies

```
API Gateway (3001)
  ├── Party Auth Service (3015)
  ├── Customer Service (3010)
  │   └── Party Auth Service (3015)
  ├── Account Service (3011)
  │   ├── Customer Service (3010)
  │   └── Fraud Service (3014)
  ├── Card Service (3012)
  │   ├── Customer Service (3010)
  │   ├── Account Service (3011)
  │   └── Fraud Service (3014)
  ├── Payment Service (3013)
  │   ├── Account Service (3011)
  │   ├── Customer Service (3010)
  │   └── Fraud Service (3014)
  └── Fraud Service (3014)
```

### Docker Compose Architecture

- **postgres**: PostgreSQL 15 database (port 5432)
- **pgadmin**: Database management UI (port 5050)
- **api-gateway**: Entry point and router (port 3001)
- **customer-service**: Customer management (port 3010)
- **account-service**: Account management (port 3011)
- **card-service**: Card operations (port 3012)
- **payment-service**: Payment processing (port 3013)
- **fraud-service**: Fraud detection (port 3014)
- **party-auth-service**: Authentication (port 3015)

### Database Strategy

Each service has its own database for independence:
- `customer_db`: Customer service data
- `account_db`: Account service data
- `card_db`: Card service data
- `payment_db`: Payment service data
- `fraud_db`: Fraud service data
- `poc_banking`: Shared data (authentication sessions)

### Quick Start

```bash
# Start all services
docker-compose -f docker-compose-banking.yml up -d

# Check service health
curl http://localhost:3001/health

# Access pgAdmin
open http://localhost:5050

# View logs
docker-compose -f docker-compose-banking.yml logs -f

# Stop all services
docker-compose -f docker-compose-banking.yml down
```

### Environment Variables

All services use consistent environment variables:
- `NODE_ENV`: Environment (development/production)
- `PORT`: Service port
- `DATABASE_URL`: PostgreSQL connection string
- `*_SERVICE_URL`: URLs for inter-service communication
- `JWT_SECRET`: JWT signing key
- `SERVICE_NAME`: Service identifier

### Health Checks

Each service exposes:
- `GET /health`: Overall health status
- `GET /health/ready`: Readiness probe
- `GET /health/live`: Liveness probe

### API Gateway Routes

- `/auth/*` → Party Auth Service
- `/customers/*` → Customer Service
- `/accounts/*` → Account Service
- `/cards/*` → Card Service
- `/payments/*` → Payment Service
- `/fraud/*` → Fraud Service

### Business Logic

Each service implements BIAN-compliant business logic:

1. **Account Service**: Account opening, closure, balance management
2. **Payment Service**: Payment validation, execution, reconciliation
3. **Card Service**: Card issuance, PIN management, transaction authorization
4. **Fraud Service**: Real-time scoring, rule engine, case management
5. **Customer Service**: KYC verification, profile management
6. **Party Auth**: Multi-factor authentication, session management
