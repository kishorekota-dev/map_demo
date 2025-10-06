# POC Banking Service - Database Module

Complete database integration for the POC Banking Service with PostgreSQL, Flyway migrations, and comprehensive test data.

## Overview

This module provides:
- **Database Schema**: Complete banking schema with users, accounts, transactions, cards, transfers, fraud alerts, and disputes
- **Migrations**: Flyway-based migrations for schema versioning
- **Seed Data**: Realistic test data for development and testing
- **Repositories**: Data access layer with comprehensive CRUD operations
- **Transaction Support**: ACID-compliant transaction handling

## Database Schema

### Tables

1. **users** - Customer information and authentication
2. **accounts** - Bank accounts (checking, savings, credit, etc.)
3. **transactions** - Financial transactions
4. **cards** - Debit and credit cards
5. **transfers** - Money transfers between accounts
6. **fraud_alerts** - Fraud detection alerts
7. **disputes** - Transaction disputes and chargebacks

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 12.0
- npm or yarn

### Installation

1. **Install dependencies**:
   ```bash
   cd poc-banking-service
   npm install
   cd database
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Create PostgreSQL database**:
   ```sql
   CREATE DATABASE poc_banking;
   ```

4. **Run migrations and seed data**:
   ```bash
   npm run db:setup
   ```

## Database Commands

From the `poc-banking-service` root directory:

```bash
# Check database connection
node database/scripts/check-connection.js

# Run migrations only
npm run db:migrate

# Seed data only
npm run db:seed

# Run migrations + seeds
npm run db:setup

# Reset database (drops all tables)
npm run db:reset
```

## Environment Variables

### Required Variables

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=poc_banking
DB_USER=postgres
DB_PASSWORD=your_password

# Connection Pool
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=10000

# Optional
DB_SSL=false
```

### Full Configuration

See `.env.example` for all available configuration options including:
- Server configuration
- Security settings
- Banking business rules
- External service URLs
- Rate limiting
- Logging

## Database API

### Connection Pool

```javascript
const db = require('./database');

// Execute query
const result = await db.query('SELECT * FROM accounts WHERE user_id = $1', [userId]);

// Transaction
const result = await db.transaction(async (client) => {
  await client.query('UPDATE accounts SET balance = balance - $1 WHERE account_id = $2', [amount, fromAccount]);
  await client.query('UPDATE accounts SET balance = balance + $1 WHERE account_id = $2', [amount, toAccount]);
  return { success: true };
});

// Health check
const health = await db.healthCheck();

// Graceful shutdown
await db.close();
```

### Repositories

```javascript
const { 
  AccountRepository, 
  TransactionRepository, 
  CardRepository,
  TransferRepository,
  FraudRepository,
  DisputeRepository 
} = require('./database/repositories');

// Get user accounts
const accounts = await AccountRepository.findByUserId(userId);

// Create transaction
const transaction = await TransactionRepository.create({
  accountId,
  transactionType: 'purchase',
  amount: -99.99,
  description: 'Coffee Shop',
  category: 'dining'
});

// Get fraud alerts
const alerts = await FraudRepository.findPending({ severity: 'high' });
```

## Test Data

The seed scripts create:
- **5 test users** with various account types
- **10 accounts** across different types (checking, savings, credit, investment)
- **20+ transactions** including deposits, withdrawals, purchases
- **9 cards** with different statuses
- **9 transfers** in various states
- **6 fraud alerts** with different severities
- **6 disputes** at different stages

### Test User Credentials

All test users have the password: `Test123!` (bcrypt hashed)

| Email | Name | Accounts |
|-------|------|----------|
| john.doe@example.com | John Doe | Checking, Savings, Credit |
| jane.smith@example.com | Jane Smith | Checking, Savings |
| bob.johnson@example.com | Bob Johnson | Checking, Savings |
| alice.williams@example.com | Alice Williams | Checking, Investment |
| charlie.brown@example.com | Charlie Brown | Checking |

## Migrations

### Migration Files

Located in `database/migrations/`:

- `V1__create_users_table.sql`
- `V2__create_accounts_table.sql`
- `V3__create_transactions_table.sql`
- `V4__create_cards_table.sql`
- `V5__create_transfers_table.sql`
- `V6__create_fraud_alerts_table.sql`
- `V7__create_disputes_table.sql`

### Migration Naming Convention

```
V{version}__{description}.sql

Example: V1__create_users_table.sql
```

### Creating New Migrations

1. Create new file in `database/migrations/`
2. Follow naming convention with next version number
3. Write idempotent SQL (use IF NOT EXISTS, etc.)
4. Run `npm run db:migrate`

## Repository Pattern

Each entity has a dedicated repository with methods for:

- **CRUD Operations**: Create, Read, Update, Delete
- **Search & Filter**: Complex queries with multiple criteria
- **Statistics**: Aggregations and analytics
- **Business Logic**: Domain-specific operations

### Example: AccountRepository

```javascript
// Find operations
await AccountRepository.findById(accountId);
await AccountRepository.findByUserId(userId, { limit, offset });
await AccountRepository.findByAccountNumber(accountNumber);

// Create/Update
await AccountRepository.create(accountData);
await AccountRepository.update(accountId, updateData);
await AccountRepository.updateBalance(accountId, amount);

// Business operations
await AccountRepository.hasSufficientFunds(accountId, amount);
await AccountRepository.getStatistics(accountId, startDate, endDate);
await AccountRepository.close(accountId);
```

## Transaction Handling

The database module supports ACID transactions:

```javascript
const db = require('./database');

try {
  const result = await db.transaction(async (client) => {
    // All queries use the same client
    const debit = await client.query(
      'UPDATE accounts SET balance = balance - $1 WHERE account_id = $2 RETURNING *',
      [amount, fromAccountId]
    );
    
    const credit = await client.query(
      'UPDATE accounts SET balance = balance + $1 WHERE account_id = $2 RETURNING *',
      [amount, toAccountId]
    );
    
    // If any query fails, entire transaction rolls back
    return { debit: debit.rows[0], credit: credit.rows[0] };
  });
  
  console.log('Transfer completed:', result);
} catch (error) {
  console.error('Transfer failed and rolled back:', error);
}
```

## Security Considerations

- **Sensitive Data**: Card numbers, CVVs, and PINs are encrypted in the database
- **SQL Injection**: All queries use parameterized statements
- **Connection Pooling**: Limited connections prevent resource exhaustion
- **Prepared Statements**: Better performance and security

## Performance Optimization

### Indexes

Strategic indexes are created on:
- Primary keys (automatic)
- Foreign keys
- Frequently queried columns (email, account_number, status)
- Timestamp columns for date range queries

### Connection Pooling

Default pool configuration:
- Min: 2 connections
- Max: 10 connections
- Idle timeout: 30 seconds
- Connection timeout: 10 seconds

Adjust based on your load in `.env`:
```bash
DB_POOL_MIN=5
DB_POOL_MAX=20
```

## Troubleshooting

### Cannot connect to database

```bash
# Check PostgreSQL is running
pg_isready

# Verify connection settings
node database/scripts/check-connection.js

# Check PostgreSQL logs
tail -f /var/log/postgresql/postgresql-*.log
```

### Migration failed

```bash
# Check migration status
SELECT * FROM flyway_schema_history ORDER BY installed_rank DESC;

# Reset and retry
npm run db:reset
npm run db:setup
```

### Seed data errors

```bash
# Seeds require migrations to run first
npm run db:migrate
npm run db:seed
```

## Production Considerations

1. **Backups**: Implement regular PostgreSQL backups
2. **SSL**: Enable SSL for database connections
3. **Monitoring**: Set up connection pool monitoring
4. **Read Replicas**: Consider read replicas for scaling
5. **Clean Disabled**: Migrations won't allow clean in production

## Development Workflow

```bash
# 1. Make schema changes
vim database/migrations/V8__add_new_feature.sql

# 2. Run migration
npm run db:migrate

# 3. Add seed data if needed
vim database/seeds/07_seed_new_feature.sql

# 4. Test with seed data
npm run db:seed

# 5. Update repositories if needed
vim database/repositories/NewFeatureRepository.js
```

## Testing

```bash
# Run tests with test database
NODE_ENV=test npm test

# Use separate test database
createdb poc_banking_test
DB_NAME=poc_banking_test npm run db:setup
```

## Support

For issues or questions:
1. Check the logs: `logs/banking-service.log`
2. Verify database connection: `node database/scripts/check-connection.js`
3. Review migration history in database
4. Check PostgreSQL server logs

## License

ISC
