#!/bin/bash
set -e

echo "========================================="
echo "POC Banking - Database Initialization"
echo "========================================="

psql -v ON_ERROR_STOP=0 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create additional databases if needed for microservices architecture
    SELECT 'CREATE DATABASE account_db'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'account_db')\gexec
    
    SELECT 'CREATE DATABASE payment_db'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'payment_db')\gexec
    
    SELECT 'CREATE DATABASE fraud_db'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fraud_db')\gexec
    
    SELECT 'CREATE DATABASE card_db'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'card_db')\gexec
EOSQL

echo "✓ Database initialization complete"
echo "  - Main database: customer_db (auto-created)"
echo "  - Additional databases created for future microservices"
echo "========================================="
