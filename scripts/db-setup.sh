#!/bin/bash
# POC Banking Chat - Database Setup
# Usage: ./scripts/db-setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  POC Banking Chat - Database Setup     ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Load environment
if [[ -f "$ROOT_DIR/.env.development" ]]; then
  source "$ROOT_DIR/.env.development"
fi

# Default values
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-password}

echo -e "${YELLOW}Setting up databases...${NC}"
echo ""

# Create databases
DATABASES=("poc_banking" "poc_chat" "ai_orchestrator")

for db in "${DATABASES[@]}"; do
  exists=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -Atc \
    "SELECT 1 FROM pg_database WHERE datname = '$db';")

  if [ "$exists" = "1" ]; then
    echo "  Database $db already exists"
  else
    echo -e "${YELLOW}Creating database: $db${NC}"
    PGPASSWORD="$DB_PASSWORD" createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$db"
  fi
done

echo ""
echo -e "${YELLOW}Running migrations...${NC}"

# Banking service migrations
if [[ -d "$ROOT_DIR/services/banking-service/database" ]]; then
  echo "Running banking service migrations..."
  cd "$ROOT_DIR/services/banking-service"
  npm run db:migrate 2>/dev/null || echo "  Migration script not available, skipping..."
fi

# AI Orchestrator migrations
if [[ -f "$ROOT_DIR/scripts/init-ai-orchestrator-db.sql" ]]; then
  echo "Running AI orchestrator schema..."
  PGPASSWORD="$DB_PASSWORD" psql -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
    -d postgres -f "$ROOT_DIR/scripts/init-ai-orchestrator-db.sql"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Database setup complete!              ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Databases created:"
for db in "${DATABASES[@]}"; do
  echo "  • $db"
done
