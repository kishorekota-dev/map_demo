#!/bin/bash

# POC Banking Service - Quick Setup Script
# This script sets up the entire banking service with database

set -e  # Exit on error

echo "=================================="
echo "POC Banking Service - Quick Setup"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if PostgreSQL is installed
echo "Checking prerequisites..."
if ! command -v psql &> /dev/null; then
    echo -e "${RED}✗ PostgreSQL is not installed${NC}"
    echo "  Please install PostgreSQL first: https://www.postgresql.org/download/"
    exit 1
fi
echo -e "${GREEN}✓ PostgreSQL is installed${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    echo "  Please install Node.js >= 18.0.0: https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗ Node.js version must be >= 18.0.0${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v) is installed${NC}"

echo ""
echo "Step 1: Installing dependencies..."
npm install
echo -e "${GREEN}✓ Main dependencies installed${NC}"

cd database
npm install
cd ..
echo -e "${GREEN}✓ Database dependencies installed${NC}"

echo ""
echo "Step 2: Setting up environment..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${YELLOW}⚠ Created .env file from .env.example${NC}"
    echo -e "${YELLOW}  Please update database credentials in .env if needed${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

if [ ! -f database/.env ]; then
    cp database/.env.example database/.env
    echo -e "${GREEN}✓ Created database/.env file${NC}"
fi

echo ""
echo "Step 3: Setting up database..."
read -p "Database name [poc_banking]: " DB_NAME
DB_NAME=${DB_NAME:-poc_banking}

read -p "Database user [postgres]: " DB_USER
DB_USER=${DB_USER:-postgres}

read -sp "Database password [postgres]: " DB_PASSWORD
DB_PASSWORD=${DB_PASSWORD:-postgres}
echo ""

# Update .env files
sed -i.bak "s/DB_NAME=.*/DB_NAME=$DB_NAME/" .env
sed -i.bak "s/DB_USER=.*/DB_USER=$DB_USER/" .env
sed -i.bak "s/DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" .env
rm .env.bak

sed -i.bak "s/DB_NAME=.*/DB_NAME=$DB_NAME/" database/.env
sed -i.bak "s/DB_USER=.*/DB_USER=$DB_USER/" database/.env
sed -i.bak "s/DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" database/.env
sed -i.bak "s|DATABASE_URL=.*|DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME|" database/.env
rm database/.env.bak

echo -e "${GREEN}✓ Environment files updated${NC}"

echo ""
echo "Creating database '$DB_NAME'..."
export PGPASSWORD=$DB_PASSWORD
if psql -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo -e "${YELLOW}⚠ Database '$DB_NAME' already exists${NC}"
    read -p "Drop and recreate? (y/N): " DROP_DB
    if [ "$DROP_DB" = "y" ] || [ "$DROP_DB" = "Y" ]; then
        dropdb -U $DB_USER $DB_NAME || true
        createdb -U $DB_USER $DB_NAME
        echo -e "${GREEN}✓ Database recreated${NC}"
    fi
else
    createdb -U $DB_USER $DB_NAME
    echo -e "${GREEN}✓ Database '$DB_NAME' created${NC}"
fi
unset PGPASSWORD

echo ""
echo "Step 4: Running database migrations..."
npm run db:migrate
echo -e "${GREEN}✓ Migrations completed${NC}"

echo ""
echo "Step 5: Loading seed data..."
npm run db:seed
echo -e "${GREEN}✓ Seed data loaded${NC}"

echo ""
echo "Step 6: Verifying setup..."
node database/scripts/check-connection.js

echo ""
echo "=================================="
echo -e "${GREEN}✓ Setup completed successfully!${NC}"
echo "=================================="
echo ""
echo "Next steps:"
echo "  1. Review and update configuration in .env"
echo "  2. Start the service:"
echo "     npm run dev    (development mode)"
echo "     npm start      (production mode)"
echo ""
echo "  3. Test the API:"
echo "     curl http://localhost:3005/health"
echo ""
echo "Test users (password: Test123!):"
echo "  - john.doe@example.com"
echo "  - jane.smith@example.com"
echo "  - bob.johnson@example.com"
echo "  - alice.williams@example.com"
echo "  - charlie.brown@example.com"
echo ""
echo "For more information, see README.md"
echo ""
