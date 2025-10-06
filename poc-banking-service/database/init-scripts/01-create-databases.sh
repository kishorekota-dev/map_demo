#!/bin/bash

# Script to create multiple databases in PostgreSQL
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create additional databases for microservices
    CREATE DATABASE customer_db;
    CREATE DATABASE account_db;
    CREATE DATABASE card_db;
    CREATE DATABASE payment_db;
    CREATE DATABASE fraud_db;

    -- Grant privileges
    GRANT ALL PRIVILEGES ON DATABASE customer_db TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE account_db TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE card_db TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE payment_db TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE fraud_db TO $POSTGRES_USER;

    -- Log completion
    SELECT 'Databases created successfully' AS status;
EOSQL

echo "✓ Multiple databases created successfully"
