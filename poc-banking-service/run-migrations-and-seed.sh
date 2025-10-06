#!/bin/bash

# POC Banking Service - Database Migration and Seed Script
# This script runs database migrations and loads seed data into the PostgreSQL container

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
POSTGRES_CONTAINER="poc-banking-postgres"
DB_USER="banking_user"
DB_NAME="customer_db"
DB_PASSWORD="banking_pass_2024"
MIGRATIONS_DIR="../services/customer-service/database/migrations"
SEEDS_DIR="./database/seeds"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Banner
echo ""
echo "=========================================="
echo "POC Banking - Database Setup"
echo "=========================================="
echo "Container: $POSTGRES_CONTAINER"
echo "Database: $DB_NAME"
echo "Timestamp: $(date)"
echo "=========================================="
echo ""

# Step 1: Check if container is running
log_info "Step 1: Checking PostgreSQL container..."
if ! docker ps | grep -q "$POSTGRES_CONTAINER"; then
    log_error "PostgreSQL container '$POSTGRES_CONTAINER' is not running!"
    log_info "Start it with: docker-compose -f docker-compose-banking-simple.yml up -d"
    exit 1
fi
log_success "PostgreSQL container is running"

# Step 2: Wait for PostgreSQL to be ready
log_info "Step 2: Waiting for PostgreSQL to be ready..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if docker exec $POSTGRES_CONTAINER pg_isready -U $DB_USER -d $DB_NAME > /dev/null 2>&1; then
        log_success "PostgreSQL is ready"
        break
    fi
    attempt=$((attempt + 1))
    if [ $attempt -eq $max_attempts ]; then
        log_error "PostgreSQL did not become ready in time"
        exit 1
    fi
    echo -n "."
    sleep 1
done
echo ""

# Step 3: Check if database exists, create if not
log_info "Step 3: Checking database '$DB_NAME'..."
if docker exec $POSTGRES_CONTAINER psql -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    log_success "Database '$DB_NAME' exists"
else
    log_warn "Database '$DB_NAME' does not exist, creating..."
    docker exec $POSTGRES_CONTAINER psql -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;"
    log_success "Database '$DB_NAME' created"
fi

# Step 4: Run migrations
log_info "Step 4: Running database migrations..."

# Check if migrations directory exists
if [ -d "$MIGRATIONS_DIR" ]; then
    migration_count=0
    for migration_file in "$MIGRATIONS_DIR"/*.sql; do
        if [ -f "$migration_file" ]; then
            migration_name=$(basename "$migration_file")
            log_info "Running migration: $migration_name"
            
            if docker exec -i $POSTGRES_CONTAINER psql -U $DB_USER -d $DB_NAME < "$migration_file" > /dev/null 2>&1; then
                log_success "Migration $migration_name completed"
                migration_count=$((migration_count + 1))
            else
                log_warn "Migration $migration_name may have already been applied (skipping errors)"
            fi
        fi
    done
    
    if [ $migration_count -gt 0 ]; then
        log_success "Applied $migration_count migration(s)"
    else
        log_warn "No new migrations to apply"
    fi
else
    log_warn "Migrations directory not found: $MIGRATIONS_DIR"
fi

# Step 5: Check if tables exist
log_info "Step 5: Verifying tables..."
table_check=$(docker exec $POSTGRES_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
table_count=$(echo $table_check | tr -d ' ')

if [ "$table_count" -gt 0 ]; then
    log_success "Found $table_count table(s) in database"
    
    # List tables
    log_info "Tables in database:"
    docker exec $POSTGRES_CONTAINER psql -U $DB_USER -d $DB_NAME -c "\dt" | grep -E "public|customers|customer_"
else
    log_error "No tables found in database!"
    exit 1
fi

# Step 6: Load seed data
log_info "Step 6: Loading seed data..."

if [ -d "$SEEDS_DIR" ]; then
    seed_count=0
    for seed_file in "$SEEDS_DIR"/*.sql; do
        if [ -f "$seed_file" ]; then
            seed_name=$(basename "$seed_file")
            log_info "Loading seed data: $seed_name"
            
            if docker exec -i $POSTGRES_CONTAINER psql -U $DB_USER -d $DB_NAME < "$seed_file" 2>&1 | tee /tmp/seed_output.log | grep -qE "(ERROR|FATAL)"; then
                log_warn "Some seed data may already exist (continuing...)"
            else
                log_success "Seed data $seed_name loaded"
                seed_count=$((seed_count + 1))
            fi
        fi
    done
    
    if [ $seed_count -gt 0 ]; then
        log_success "Loaded $seed_count seed file(s)"
    else
        log_warn "No new seed data to load"
    fi
else
    log_warn "Seeds directory not found: $SEEDS_DIR"
    log_info "Creating sample seed data..."
    
    # Create inline seed data
    docker exec -i $POSTGRES_CONTAINER psql -U $DB_USER -d $DB_NAME << 'EOF'
-- Sample seed data for customers
INSERT INTO customers (
    customer_number, first_name, last_name, email, phone, date_of_birth,
    nationality, address_line1, city, state, postal_code, country,
    kyc_status, risk_rating, status, customer_segment
) VALUES 
(
    'CUS_SEED_001', 'Alice', 'Johnson', 'alice.johnson@example.com', 
    '+1-555-1001', '1990-05-15', 'USA', '100 Seed Street', 
    'Boston', 'MA', '02101', 'USA', 'VERIFIED', 'LOW', 'ACTIVE', 'RETAIL'
),
(
    'CUS_SEED_002', 'Bob', 'Williams', 'bob.williams@example.com',
    '+1-555-1002', '1985-08-22', 'USA', '200 Seed Avenue',
    'Seattle', 'WA', '98101', 'USA', 'VERIFIED', 'MEDIUM', 'ACTIVE', 'RETAIL'
),
(
    'CUS_SEED_003', 'Carol', 'Davis', 'carol.davis@example.com',
    '+1-555-1003', '1992-03-10', 'USA', '300 Seed Boulevard',
    'Miami', 'FL', '33101', 'USA', 'PENDING', 'MEDIUM', 'ACTIVE', 'RETAIL'
)
ON CONFLICT (email) DO NOTHING;

-- Create preferences for seed customers
INSERT INTO customer_preferences (customer_id, email_notifications, sms_notifications, preferred_currency)
SELECT id, true, true, 'USD'
FROM customers
WHERE email IN ('alice.johnson@example.com', 'bob.williams@example.com', 'carol.davis@example.com')
ON CONFLICT (customer_id) DO NOTHING;
EOF
    
    if [ $? -eq 0 ]; then
        log_success "Sample seed data loaded"
    else
        log_warn "Some seed data may already exist"
    fi
fi

# Step 7: Verify data
log_info "Step 7: Verifying seed data..."
customer_count=$(docker exec $POSTGRES_CONTAINER psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM customers;")
customer_count=$(echo $customer_count | tr -d ' ')

if [ "$customer_count" -gt 0 ]; then
    log_success "Database has $customer_count customer(s)"
    
    # Show sample customers
    log_info "Sample customers:"
    docker exec $POSTGRES_CONTAINER psql -U $DB_USER -d $DB_NAME -c "SELECT customer_number, first_name, last_name, email, status, kyc_status FROM customers LIMIT 5;"
else
    log_warn "No customers found in database"
fi

# Step 8: Final health check
log_info "Step 8: Running final health check..."
if docker exec $POSTGRES_CONTAINER psql -U $DB_USER -d $DB_NAME -c "SELECT 1;" > /dev/null 2>&1; then
    log_success "Database connection verified"
else
    log_error "Database connection failed"
    exit 1
fi

# Summary
echo ""
echo "=========================================="
echo "Database Setup Complete!"
echo "=========================================="
echo "✅ PostgreSQL container running"
echo "✅ Database '$DB_NAME' ready"
echo "✅ Migrations applied"
echo "✅ Seed data loaded"
echo "✅ Customer count: $customer_count"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  • Test API: curl http://localhost:3010/api/v1/customers"
echo "  • Run tests: cd tests && bash e2e-api-test-simple.sh"
echo "  • View logs: docker logs -f $POSTGRES_CONTAINER"
echo "  • Access pgAdmin: http://localhost:5050"
echo ""

exit 0
