# Database Migration and Seed Script - User Guide

## Overview

The `run-migrations-and-seed.sh` script automates the complete database setup process for the POC Banking Service, including:
- Running database migrations
- Loading seed data
- Verifying the setup

## Quick Start

```bash
# Make sure Docker containers are running
docker-compose -f docker-compose-banking-simple.yml up -d

# Run migrations and seed data
./run-migrations-and-seed.sh
```

## What the Script Does

### Step-by-Step Process

1. **Container Check** - Verifies PostgreSQL container is running
2. **Database Ready** - Waits for PostgreSQL to be ready (max 30 seconds)
3. **Database Verification** - Checks if `customer_db` exists, creates if needed
4. **Run Migrations** - Applies all SQL migrations from `services/customer-service/database/migrations/`
5. **Verify Tables** - Confirms tables were created successfully
6. **Load Seed Data** - Loads sample data from `database/seeds/`
7. **Verify Data** - Counts and displays sample customers
8. **Health Check** - Final database connection verification

### Expected Output

```
==========================================
POC Banking - Database Setup
==========================================
Container: poc-banking-postgres
Database: customer_db
Timestamp: Sun Oct  5 23:15:19 CDT 2025
==========================================

[INFO] Step 1: Checking PostgreSQL container...
[SUCCESS] PostgreSQL container is running
[INFO] Step 2: Waiting for PostgreSQL to be ready...
[SUCCESS] PostgreSQL is ready
[INFO] Step 3: Checking database 'customer_db'...
[SUCCESS] Database 'customer_db' exists
[INFO] Step 4: Running database migrations...
[SUCCESS] Applied 1 migration(s)
[INFO] Step 5: Verifying tables...
[SUCCESS] Found 4 table(s) in database
[INFO] Step 6: Loading seed data...
[SUCCESS] Loaded seed data
[INFO] Step 7: Verifying seed data...
[SUCCESS] Database has 7 customer(s)
[INFO] Step 8: Running final health check...
[SUCCESS] Database connection verified

==========================================
Database Setup Complete!
==========================================
✅ PostgreSQL container running
✅ Database 'customer_db' ready
✅ Migrations applied
✅ Seed data loaded
✅ Customer count: 7
==========================================
```

## Seed Data Included

The script loads 6 sample customers with different profiles:

### Customer Profiles

| Customer # | Name | Email | Segment | KYC Status | Status |
|------------|------|-------|---------|------------|--------|
| CUS_SEED_001 | James Patterson | james.patterson@premiumbank.com | PREMIUM | VERIFIED | ACTIVE |
| CUS_SEED_002 | Sarah Martinez | sarah.martinez@sbusiness.com | BUSINESS | VERIFIED | ACTIVE |
| CUS_SEED_003 | Michael Chen | michael.chen@techstart.com | RETAIL | IN_PROGRESS | ACTIVE |
| CUS_SEED_004 | Robert Thompson | robert.thompson@retired.com | WEALTH | VERIFIED | ACTIVE |
| CUS_SEED_005 | Yuki Tanaka | yuki.tanaka@intlbank.com | INTERNATIONAL | VERIFIED | ACTIVE |
| CUS_SEED_006 | David Wilson | david.wilson@suspended.com | RETAIL | REJECTED | SUSPENDED |

### Additional Data Loaded

- **Customer Preferences**: Email, SMS, statement delivery preferences
- **Customer Contacts**: Additional contact methods (work email, emergency phone)
- **Customer Relationships**: Business partner relationships

## Database Tables Created

The migration creates the following tables:

1. **customers** - Main customer table
   - Personal information
   - Contact details
   - KYC information
   - Account status
   - Audit fields

2. **customer_contacts** - Additional contact methods
   - Multiple emails/phones per customer
   - Contact purpose (work, home, emergency)
   - Verification status

3. **customer_relationships** - Customer connections
   - Family relationships
   - Business partners
   - Guarantors/Beneficiaries

4. **customer_preferences** - Customer preferences
   - Communication preferences
   - Statement preferences
   - Security settings

## Configuration

### Environment Variables

The script uses these default values (can be modified in the script):

```bash
POSTGRES_CONTAINER="poc-banking-postgres"
DB_USER="banking_user"
DB_NAME="customer_db"
DB_PASSWORD="banking_pass_2024"
MIGRATIONS_DIR="../services/customer-service/database/migrations"
SEEDS_DIR="./database/seeds"
```

## Usage Examples

### Basic Usage

```bash
# Run migrations and seeds
./run-migrations-and-seed.sh
```

### Re-running the Script

The script is idempotent - safe to run multiple times:
- Existing migrations are skipped (with warnings)
- Duplicate seed data is prevented with `ON CONFLICT DO NOTHING`
- No data loss occurs

### Custom Seed Data

To add your own seed data:

1. Create a new SQL file in `database/seeds/`:
```bash
vi database/seeds/002_my_custom_data.sql
```

2. Write your INSERT statements:
```sql
INSERT INTO customers (
    customer_number, first_name, last_name, email, phone, date_of_birth, nationality
) VALUES (
    'CUS_CUSTOM_001', 'Jane', 'Doe', 'jane@example.com', '+1-555-0000', '1990-01-01', 'USA'
) ON CONFLICT (email) DO NOTHING;
```

3. Run the script again:
```bash
./run-migrations-and-seed.sh
```

## Verification

### Via API

```bash
# List all customers
curl http://localhost:3010/api/v1/customers | jq '.'

# Get specific customer
curl http://localhost:3010/api/v1/customers/CUS_SEED_001 | jq '.'

# Search by email
curl "http://localhost:3010/api/v1/customers?email=james.patterson@premiumbank.com" | jq '.'
```

### Via PostgreSQL CLI

```bash
# Connect to database
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db

# List customers
SELECT customer_number, first_name, last_name, email, status FROM customers;

# Check relationships
SELECT c1.email as customer, c2.email as related_to, relationship_type 
FROM customer_relationships cr
JOIN customers c1 ON cr.customer_id = c1.id
JOIN customers c2 ON cr.related_customer_id = c2.id;

# Exit
\q
```

### Via pgAdmin

1. Open http://localhost:5050
2. Login with:
   - Email: `admin@banking.local`
   - Password: `admin123`
3. Add server:
   - Name: POC Banking
   - Host: `postgres`
   - Port: `5432`
   - Database: `customer_db`
   - Username: `banking_user`
   - Password: `banking_pass_2024`
4. Browse tables under: Servers → POC Banking → Databases → customer_db → Schemas → public → Tables

## Troubleshooting

### Container Not Running

**Error:**
```
[ERROR] PostgreSQL container 'poc-banking-postgres' is not running!
```

**Solution:**
```bash
docker-compose -f docker-compose-banking-simple.yml up -d
```

### Database Not Ready

**Error:**
```
[ERROR] PostgreSQL did not become ready in time
```

**Solution:**
```bash
# Check container logs
docker logs poc-banking-postgres

# Restart container
docker-compose -f docker-compose-banking-simple.yml restart postgres
```

### Migration Errors

**Error:**
```
Migration V1__create_customer_tables.sql failed
```

**Solution:**
```bash
# Check what went wrong
docker exec -it poc-banking-postgres psql -U banking_user -d customer_db

# Drop and recreate database (WARNING: loses all data)
docker exec -it poc-banking-postgres psql -U banking_user -d postgres -c "DROP DATABASE customer_db;"
docker exec -it poc-banking-postgres psql -U banking_user -d postgres -c "CREATE DATABASE customer_db;"

# Run script again
./run-migrations-and-seed.sh
```

### Duplicate Data Warnings

**Warning:**
```
[WARN] Some seed data may already exist (continuing...)
```

**This is normal** - The script uses `ON CONFLICT DO NOTHING` to prevent duplicates. Data that already exists is skipped.

### Clear All Data and Start Fresh

```bash
# Stop services
docker-compose -f docker-compose-banking-simple.yml down -v

# Start services (fresh database)
docker-compose -f docker-compose-banking-simple.yml up -d

# Wait a moment for PostgreSQL to initialize
sleep 10

# Run migrations and seeds
./run-migrations-and-seed.sh
```

## Advanced Usage

### Run Only Migrations (No Seeds)

Edit the script and comment out Step 6:

```bash
# Step 6: Load seed data
# log_info "Step 6: Loading seed data..."
# ... (comment out the entire Step 6 section)
```

### Load Only Specific Seed Files

```bash
# Run specific seed file manually
docker exec -i poc-banking-postgres psql -U banking_user -d customer_db < database/seeds/001_sample_customers.sql
```

### Backup Database Before Running

```bash
# Backup current database
docker exec poc-banking-postgres pg_dump -U banking_user customer_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Run migrations
./run-migrations-and-seed.sh

# Restore if needed
docker exec -i poc-banking-postgres psql -U banking_user -d customer_db < backup_20251005_231500.sql
```

## Integration with CI/CD

### In GitHub Actions

```yaml
- name: Setup Database
  run: |
    docker-compose -f docker-compose-banking-simple.yml up -d
    sleep 10
    ./run-migrations-and-seed.sh
    
- name: Run Tests
  run: |
    cd tests
    bash e2e-api-test-simple.sh
```

### In Jenkins

```groovy
stage('Database Setup') {
    steps {
        sh 'docker-compose -f docker-compose-banking-simple.yml up -d'
        sh 'sleep 10'
        sh './run-migrations-and-seed.sh'
    }
}
```

## Related Files

- `run-migrations-and-seed.sh` - Main script
- `database/seeds/001_sample_customers.sql` - Sample customer data
- `services/customer-service/database/migrations/V1__create_customer_tables.sql` - Database schema
- `docker-compose-banking-simple.yml` - Docker configuration
- `tests/e2e-api-test-simple.sh` - Test suite

## Next Steps

After running migrations and seeds:

1. **Test the API:**
   ```bash
   curl http://localhost:3010/api/v1/customers | jq '.'
   ```

2. **Run E2E Tests:**
   ```bash
   cd tests && bash e2e-api-test-simple.sh
   ```

3. **Explore in pgAdmin:**
   http://localhost:5050

4. **Monitor Logs:**
   ```bash
   docker logs -f poc-banking-customer-service
   ```

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review container logs: `docker logs poc-banking-postgres`
3. Verify service health: `curl http://localhost:3010/health`
4. Check database connectivity: `docker exec poc-banking-postgres pg_isready`
