#!/bin/bash

# Flyway Migration Script for POC Chat Backend
# This script runs Flyway database migrations

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "POC Chat Backend - Flyway Migration"
echo "======================================"
echo ""

# Load environment variables from .env if it exists
if [ -f .env ]; then
    echo -e "${GREEN}✓ Loading environment variables from .env${NC}"
    export $(cat .env | grep -v '^#' | xargs)
else
    echo -e "${YELLOW}⚠ No .env file found, using default values${NC}"
fi

# Set default values
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-poc_banking}
DB_USER=${DB_USER:-postgres}

echo ""
echo "Database Configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""

# Check if Flyway is installed
if ! command -v flyway &> /dev/null; then
    echo -e "${RED}✗ Flyway is not installed${NC}"
    echo ""
    echo "Installation options:"
    echo ""
    echo "1. Using npm (recommended):"
    echo "   npm install -g node-flywaydb"
    echo ""
    echo "2. Using Docker:"
    echo "   docker pull flyway/flyway"
    echo ""
    echo "3. Download from: https://flywaydb.org/download"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ Flyway is installed${NC}"
FLYWAY_VERSION=$(flyway -v 2>&1 | head -n 1)
echo "  $FLYWAY_VERSION"
echo ""

# Check if database is accessible
echo "Checking database connectivity..."
if command -v psql &> /dev/null; then
    if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "SELECT 1" &> /dev/null; then
        echo -e "${GREEN}✓ Database is accessible${NC}"
    else
        echo -e "${RED}✗ Cannot connect to database${NC}"
        echo "  Please check your database credentials and ensure PostgreSQL is running"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ psql not found, skipping connectivity check${NC}"
fi
echo ""

# Create database if it doesn't exist
echo "Checking if database exists..."
if command -v psql &> /dev/null; then
    DB_EXISTS=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")
    if [ "$DB_EXISTS" != "1" ]; then
        echo "Creating database $DB_NAME..."
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME"
        echo -e "${GREEN}✓ Database created${NC}"
    else
        echo -e "${GREEN}✓ Database exists${NC}"
    fi
fi
echo ""

# Parse command line arguments
COMMAND=${1:-migrate}

case $COMMAND in
    info)
        echo "Getting migration info..."
        flyway -configFiles=flyway.conf info
        ;;
    validate)
        echo "Validating migrations..."
        flyway -configFiles=flyway.conf validate
        ;;
    migrate)
        echo "Running migrations..."
        flyway -configFiles=flyway.conf migrate
        echo ""
        echo -e "${GREEN}✓ Migrations completed successfully${NC}"
        ;;
    baseline)
        echo "Creating baseline..."
        flyway -configFiles=flyway.conf baseline
        echo ""
        echo -e "${GREEN}✓ Baseline created${NC}"
        ;;
    repair)
        echo "Repairing migration history..."
        flyway -configFiles=flyway.conf repair
        echo ""
        echo -e "${GREEN}✓ Migration history repaired${NC}"
        ;;
    clean)
        echo -e "${RED}WARNING: This will drop all objects in the database!${NC}"
        read -p "Are you sure? Type 'yes' to continue: " confirm
        if [ "$confirm" = "yes" ]; then
            flyway -configFiles=flyway.conf -cleanDisabled=false clean
            echo ""
            echo -e "${GREEN}✓ Database cleaned${NC}"
        else
            echo "Clean operation cancelled"
        fi
        ;;
    *)
        echo "Usage: $0 {info|validate|migrate|baseline|repair|clean}"
        echo ""
        echo "Commands:"
        echo "  info      - Show migration status"
        echo "  validate  - Validate applied migrations"
        echo "  migrate   - Run pending migrations (default)"
        echo "  baseline  - Create baseline for existing database"
        echo "  repair    - Repair migration history"
        echo "  clean     - Drop all database objects (DANGEROUS)"
        exit 1
        ;;
esac

echo ""
echo "======================================"
echo "Migration Complete"
echo "======================================"
