#!/bin/sh
set -e

echo "========================================="
echo "POC Banking Service - Starting"
echo "========================================="

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
until nc -z ${DB_HOST} ${DB_PORT}; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done
echo "✓ PostgreSQL is ready"

# Run database migrations (only if schema_history doesn't exist or migrations pending)
echo ""
echo "Running Flyway migrations..."
cd /app/database
npm run migrate || echo "⚠ Migrations already applied or failed (continuing...)"

# Run database seeds (only on first run - skip if data exists)
echo ""
echo "Checking if seeds needed..."
USERS_COUNT=$(PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -U ${DB_USER} -d ${DB_NAME} -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
if [ "$USERS_COUNT" -lt "5" ]; then
  echo "Running database seeds..."
  npm run seed || echo "⚠ Seeds failed (continuing...)"
else
  echo "✓ Database already seeded (skipping)"
fi

# Start the application
echo ""
echo "Starting application server..."
cd /app
exec node server.js
