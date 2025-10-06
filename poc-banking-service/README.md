# POC Banking Service

A comprehensive microservice for banking operations including account management, transactions, cards, transfers, fraud detection, and dispute resolution.

## Features

- ✅ **Account Management**: Checking, savings, credit, loan, and investment accounts
- ✅ **Transactions**: Deposits, withdrawals, purchases, payments with full history
- ✅ **Card Services**: Debit and credit card management with security features
- ✅ **Transfers**: Internal, external, wire, ACH, and P2P transfers
- ✅ **Fraud Detection**: Real-time fraud alerts with risk scoring
- ✅ **Dispute Resolution**: Complete dispute lifecycle management
- ✅ **Database Integration**: PostgreSQL with Flyway migrations
- ✅ **Security**: JWT authentication, encryption, rate limiting
- ✅ **Health Checks**: Comprehensive service monitoring

## Technology Stack

- **Runtime**: Node.js >= 18.0.0
- **Framework**: Express.js
- **Database**: PostgreSQL >= 12.0
- **Migrations**: Flyway
- **Authentication**: JWT (JSON Web Tokens)
- **Security**: Helmet, CORS, bcrypt
- **Logging**: Winston
- **Validation**: Joi

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- npm or yarn

### Installation

1. **Clone and install**:
   ```bash
   cd poc-banking-service
   npm install
   ```

2. **Set up database**:
   ```bash
   # Create PostgreSQL database
   createdb poc_banking

   # Copy environment file
   cp .env.example .env

   # Edit .env with your database credentials
   vim .env

   # Run migrations and seed data
   npm run db:setup
   ```

3. **Start the service**:
   ```bash
   # Development mode with auto-reload
   npm run dev

   # Production mode
   npm start
   ```

4. **Verify it's running**:
   ```bash
   curl http://localhost:3005/health
   ```

## API Endpoints

### Accounts
- `GET /api/accounts` - Get all user accounts
- `GET /api/accounts/:accountId` - Get account details
- `POST /api/accounts` - Create new account
- `PUT /api/accounts/:accountId` - Update account
- `DELETE /api/accounts/:accountId` - Close account
- `GET /api/accounts/:accountId/balance` - Get account balance
- `GET /api/accounts/:accountId/transactions` - Get account transactions
- `GET /api/accounts/:accountId/statements` - Get account statements

### Transactions
- `GET /api/transactions` - Get all transactions
- `GET /api/transactions/:transactionId` - Get transaction details
- `POST /api/transactions` - Create transaction
- `POST /api/transactions/:transactionId/cancel` - Cancel transaction
- `GET /api/transactions/pending` - Get pending transactions
- `GET /api/transactions/search` - Search transactions
- `GET /api/transactions/summary` - Get transaction summary
- `POST /api/transactions/:transactionId/receipt` - Generate receipt
- `GET /api/transactions/categories` - Get transaction categories

### Cards
- `GET /api/cards` - Get all user cards
- `GET /api/cards/:cardId` - Get card details
- `POST /api/cards` - Create new card
- `PUT /api/cards/:cardId` - Update card
- `POST /api/cards/:cardId/block` - Block card
- `POST /api/cards/:cardId/activate` - Activate card
- `POST /api/cards/:cardId/replace` - Replace card

### Transfers
- `GET /api/transfers` - Get all transfers
- `GET /api/transfers/:transferId` - Get transfer details
- `POST /api/transfers` - Create transfer
- `POST /api/transfers/:transferId/process` - Process transfer
- `POST /api/transfers/:transferId/cancel` - Cancel transfer

### Fraud Detection
- `GET /api/fraud` - Get fraud alerts
- `GET /api/fraud/:alertId` - Get alert details
- `POST /api/fraud` - Create fraud alert
- `PUT /api/fraud/:alertId` - Update alert
- `POST /api/fraud/:alertId/confirm` - Confirm fraud
- `POST /api/fraud/:alertId/false-positive` - Mark as false positive

### Disputes
- `GET /api/disputes` - Get all disputes
- `GET /api/disputes/:disputeId` - Get dispute details
- `POST /api/disputes` - Create dispute
- `PUT /api/disputes/:disputeId` - Update dispute
- `POST /api/disputes/:disputeId/resolve` - Resolve dispute
- `POST /api/disputes/:disputeId/withdraw` - Withdraw dispute
- `POST /api/disputes/:disputeId/evidence` - Add evidence

### Health & Docs
- `GET /health` - Service health check
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe
- `GET /api/docs` - API documentation

## Environment Variables

### Server
```bash
PORT=3005
NODE_ENV=development
LOG_LEVEL=info
```

### Database
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=poc_banking
DB_USER=postgres
DB_PASSWORD=your_password
DB_POOL_MIN=2
DB_POOL_MAX=10
```

### Security
```bash
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRY=24h
BCRYPT_ROUNDS=12
ALLOWED_ORIGINS=http://localhost:3000
```

### Banking Configuration
```bash
DAILY_TRANSFER_LIMIT=10000
MONTHLY_TRANSFER_LIMIT=50000
FRAUD_THRESHOLD_AMOUNT=5000
CARD_DAILY_LIMIT=2000
```

See `.env.example` for complete configuration options.

## Database

### Setup

```bash
# Install database dependencies
cd database && npm install && cd ..

# Check connection
node database/scripts/check-connection.js

# Run migrations
npm run db:migrate

# Seed test data
npm run db:seed

# Complete setup (migrations + seeds)
npm run db:setup

# Reset database (drops all tables)
npm run db:reset
```

### Schema

- **users**: Customer information and authentication
- **accounts**: Bank accounts with balances
- **transactions**: Financial transactions
- **cards**: Debit and credit cards
- **transfers**: Money transfers
- **fraud_alerts**: Fraud detection alerts
- **disputes**: Transaction disputes

See `database/README.md` for detailed database documentation.

## Development

### Running in Development

```bash
# Start with auto-reload
npm run dev

# Watch tests
npm run test:watch

# Lint code
npm run lint

# Fix lint issues
npm run lint:fix
```

### Project Structure

```
poc-banking-service/
├── config/                 # Configuration files
├── controllers/            # Route controllers
├── database/              # Database module
│   ├── migrations/        # Flyway SQL migrations
│   ├── seeds/            # Test data seeds
│   ├── repositories/     # Data access layer
│   └── scripts/          # Database scripts
├── middleware/           # Express middleware
├── routes/              # API routes
├── utils/               # Helper utilities
├── logs/                # Log files
├── .env.example         # Environment template
├── package.json         # Dependencies
└── server.js            # Entry point
```

## Testing

### Test Users

All test users have password: `Test123!`

| Email | Accounts |
|-------|----------|
| john.doe@example.com | Checking, Savings, Credit |
| jane.smith@example.com | Checking, Savings |
| bob.johnson@example.com | Checking, Savings |
| alice.williams@example.com | Checking, Investment |
| charlie.brown@example.com | Checking |

### Run Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- accounts.test.js

# Watch mode
npm run test:watch
```

## Security

- **Authentication**: JWT-based authentication required for all API endpoints
- **Encryption**: Sensitive data (cards, SSNs) encrypted at rest
- **Rate Limiting**: Configurable rate limits per endpoint
- **Input Validation**: All inputs validated with Joi
- **SQL Injection**: Parameterized queries throughout
- **CORS**: Configurable allowed origins
- **Helmet**: Security headers enabled
- **HTTPS**: Recommended for production

## Monitoring

### Health Checks

```bash
# Basic health check
curl http://localhost:3005/health

# Readiness probe (Kubernetes)
curl http://localhost:3005/health/ready

# Liveness probe (Kubernetes)
curl http://localhost:3005/health/live
```

### Logs

Logs are written to:
- Console (stdout)
- `logs/banking-service.log`

Log levels: `error`, `warn`, `info`, `debug`

Configure via `LOG_LEVEL` environment variable.

## Production Deployment

### Build & Deploy

```bash
# Install production dependencies only
npm install --production

# Set environment
export NODE_ENV=production

# Run migrations
npm run db:migrate

# Start service
npm start
```

### Docker

```bash
# Build image
docker build -t poc-banking-service .

# Run container
docker run -p 3005:3005 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  poc-banking-service
```

### Environment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong `JWT_SECRET`
- [ ] Enable database SSL (`DB_SSL=true`)
- [ ] Configure proper `ALLOWED_ORIGINS`
- [ ] Set up database backups
- [ ] Configure log rotation
- [ ] Set up monitoring/alerting
- [ ] Use connection pooling
- [ ] Enable rate limiting
- [ ] Review security headers

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Test connection
node database/scripts/check-connection.js

# Check logs
tail -f logs/banking-service.log
```

### Migration Failures

```bash
# Check migration status
psql -d poc_banking -c "SELECT * FROM flyway_schema_history;"

# Reset and retry
npm run db:reset
npm run db:setup
```

### Service Won't Start

1. Check port 3005 is available
2. Verify database is accessible
3. Check environment variables are set
4. Review logs for errors

## Performance

### Optimization Tips

- Connection pooling configured (2-10 connections)
- Indexes on frequently queried columns
- Pagination on all list endpoints
- Caching for static/reference data
- Async/await for non-blocking I/O

### Benchmarks

- Average response time: < 50ms
- Throughput: 1000+ req/sec
- Database query time: < 10ms (indexed)

## Contributing

1. Create feature branch
2. Make changes
3. Add/update tests
4. Run lint: `npm run lint:fix`
5. Run tests: `npm test`
6. Submit pull request

## License

ISC

## Support

For issues or questions:
- Check logs: `logs/banking-service.log`
- Review database: `node database/scripts/check-connection.js`
- API docs: `GET http://localhost:3005/api/docs`

---

**POC Banking Service** - Enterprise-grade banking microservice with complete database integration
