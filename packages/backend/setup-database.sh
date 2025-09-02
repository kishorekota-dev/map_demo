#!/bin/bash

# Credit Card Enterprise Database Setup Script
echo "🚀 Setting up Credit Card Enterprise Database..."

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

# Check if PostgreSQL is installed
check_postgresql() {
    print_status "Checking PostgreSQL installation..."
    
    if command -v psql &> /dev/null; then
        print_success "PostgreSQL is already installed"
        return 0
    else
        print_warning "PostgreSQL not found, will install it"
        return 1
    fi
}

# Install PostgreSQL
install_postgresql() {
    print_status "Installing PostgreSQL..."
    
    # Update package list
    sudo apt update
    
    # Install PostgreSQL and contrib package
    sudo apt install -y postgresql postgresql-contrib
    
    # Start PostgreSQL service
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    
    print_success "PostgreSQL installed and started"
}

# Setup database and user
setup_database() {
    print_status "Setting up database and user..."
    
    # Switch to postgres user and create database
    sudo -u postgres psql << EOF
-- Create database user
CREATE USER credit_card_user WITH PASSWORD 'credit_card_password';

-- Create database
CREATE DATABASE credit_card_enterprise OWNER credit_card_user;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE credit_card_enterprise TO credit_card_user;

-- Connect to the database and grant schema privileges
\c credit_card_enterprise;
GRANT ALL ON SCHEMA public TO credit_card_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO credit_card_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO credit_card_user;

-- Exit
\q
EOF

    if [ $? -eq 0 ]; then
        print_success "Database and user created successfully"
    else
        print_error "Failed to create database and user"
        return 1
    fi
}

# Update environment file
update_env_file() {
    print_status "Updating environment configuration..."
    
    ENV_FILE="./packages/backend/.env"
    
    # Backup original .env file
    if [ -f "$ENV_FILE" ]; then
        cp "$ENV_FILE" "$ENV_FILE.backup"
        print_status "Backed up existing .env file"
    fi
    
    # Update database configuration
    sed -i 's/DB_HOST=.*/DB_HOST=localhost/' "$ENV_FILE"
    sed -i 's/DB_PORT=.*/DB_PORT=5432/' "$ENV_FILE"
    sed -i 's/DB_NAME=.*/DB_NAME=credit_card_enterprise/' "$ENV_FILE"
    sed -i 's/DB_USER=.*/DB_USER=credit_card_user/' "$ENV_FILE"
    sed -i 's/DB_PASSWORD=.*/DB_PASSWORD=credit_card_password/' "$ENV_FILE"
    sed -i 's/DB_SSL=.*/DB_SSL=false/' "$ENV_FILE"
    
    print_success "Environment file updated"
}

# Install Node.js dependencies
install_dependencies() {
    print_status "Installing Node.js dependencies..."
    
    # Install PostgreSQL client for Node.js
    cd packages/backend
    npm install pg @types/pg
    cd ../..
    
    print_success "Dependencies installed"
}

# Initialize database schema and data
initialize_database() {
    print_status "Initializing database schema and data..."
    
    cd packages/backend
    
    # Run database setup
    node database/populate.js 1000 init-and-seed
    
    if [ $? -eq 0 ]; then
        print_success "Database initialized with 1000 users and related data"
    else
        print_error "Failed to initialize database"
        return 1
    fi
    
    cd ../..
}

# Test database connection
test_connection() {
    print_status "Testing database connection..."
    
    cd packages/backend
    node -e "
        const { testConnection } = require('./database');
        testConnection().then(success => {
            if (success) {
                console.log('✅ Database connection successful');
                process.exit(0);
            } else {
                console.log('❌ Database connection failed');
                process.exit(1);
            }
        }).catch(err => {
            console.error('❌ Connection test error:', err.message);
            process.exit(1);
        });
    "
    
    if [ $? -eq 0 ]; then
        print_success "Database connection test passed"
    else
        print_error "Database connection test failed"
        return 1
    fi
    
    cd ../..
}

# Main setup function
main() {
    echo "🏦 Credit Card Enterprise Database Setup"
    echo "======================================="
    
    # Check if running as root
    if [ "$EUID" -eq 0 ]; then
        print_error "Please do not run this script as root"
        exit 1
    fi
    
    # Check PostgreSQL installation
    if ! check_postgresql; then
        install_postgresql
    fi
    
    # Setup database
    setup_database
    
    # Update environment file
    update_env_file
    
    # Install dependencies
    install_dependencies
    
    # Test connection
    test_connection
    
    # Initialize database
    initialize_database
    
    echo ""
    print_success "🎉 Database setup completed successfully!"
    echo ""
    echo "📊 Database Summary:"
    echo "  • Database: credit_card_enterprise"
    echo "  • User: credit_card_user"
    echo "  • Host: localhost:5432"
    echo "  • Users: 1000 customers + admin users"
    echo "  • Data: Accounts, cards, transactions, disputes, fraud cases"
    echo ""
    echo "🔑 Sample Login Credentials:"
    echo "  • Super Admin: super_admin.john.smith@company.com / password123"
    echo "  • Customer: (any customer email) / password123"
    echo ""
    echo "🚀 You can now start the backend server:"
    echo "  npm run dev:backend"
    echo ""
}

# Run main function
main "$@"
