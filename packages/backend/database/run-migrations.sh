#!/bin/bash

# Flyway Database Migration Script
# Usage: ./run-migrations.sh [command]
# Commands: migrate, info, clean, baseline, validate

set -e  # Exit on any error

# Configuration
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="credit_card_enterprise"
DB_USER="credit_card_user"
DB_PASSWORD="credit_card_password"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Flyway is installed
check_flyway() {
    if ! command -v flyway &> /dev/null; then
        print_error "Flyway is not installed. Please install Flyway first."
        print_status "You can install it with: brew install flyway"
        exit 1
    fi
    print_success "Flyway is installed: $(flyway --version)"
}

# Check if PostgreSQL is running
check_postgres() {
    print_status "Checking PostgreSQL connection..."
    if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1;" &> /dev/null; then
        print_success "PostgreSQL connection successful"
    else
        print_error "Cannot connect to PostgreSQL database"
        print_status "Make sure PostgreSQL is running: docker-compose up postgres"
        exit 1
    fi
}

# Get current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATABASE_DIR="$SCRIPT_DIR"
MIGRATIONS_DIR="$DATABASE_DIR/migrations"

# Change to database directory
cd "$DATABASE_DIR"

print_status "Starting Flyway migration process..."
print_status "Database: $DB_NAME"
print_status "Migrations directory: $MIGRATIONS_DIR"

# Check prerequisites
check_flyway
check_postgres

# Get command from argument or default to migrate
COMMAND=${1:-migrate}

print_status "Running Flyway command: $COMMAND"

case $COMMAND in
    "migrate")
        print_status "Running database migrations..."
        flyway -configFiles=flyway.conf migrate
        print_success "Database migration completed successfully!"
        ;;
    
    "info")
        print_status "Getting migration information..."
        flyway -configFiles=flyway.conf info
        ;;
    
    "validate")
        print_status "Validating migrations..."
        flyway -configFiles=flyway.conf validate
        print_success "Migration validation completed!"
        ;;
    
    "clean")
        print_warning "This will delete ALL data in the database!"
        read -p "Are you sure you want to clean the database? (yes/no): " confirm
        if [ "$confirm" = "yes" ]; then
            print_status "Cleaning database..."
            flyway -configFiles=flyway.conf clean
            print_success "Database cleaned successfully!"
        else
            print_status "Clean operation cancelled."
        fi
        ;;
    
    "baseline")
        print_status "Creating baseline..."
        flyway -configFiles=flyway.conf baseline
        print_success "Baseline created successfully!"
        ;;
    
    "repair")
        print_status "Repairing migration metadata..."
        flyway -configFiles=flyway.conf repair
        print_success "Migration metadata repaired!"
        ;;
    
    "reset")
        print_warning "This will clean and migrate the database!"
        read -p "Are you sure? This will delete ALL data! (yes/no): " confirm
        if [ "$confirm" = "yes" ]; then
            print_status "Cleaning database..."
            flyway -configFiles=flyway.conf clean
            print_status "Running migrations..."
            flyway -configFiles=flyway.conf migrate
            print_success "Database reset and migrated successfully!"
        else
            print_status "Reset operation cancelled."
        fi
        ;;
    
    *)
        print_error "Unknown command: $COMMAND"
        echo "Available commands:"
        echo "  migrate   - Run pending migrations"
        echo "  info      - Show migration information"
        echo "  validate  - Validate applied migrations"
        echo "  clean     - Drop all objects in schema (DANGEROUS)"
        echo "  baseline  - Baseline existing schema"
        echo "  repair    - Repair migration metadata"
        echo "  reset     - Clean and migrate (DANGEROUS)"
        exit 1
        ;;
esac

print_success "Flyway operation completed successfully!"
