#!/bin/bash

# Credit Card Enterprise Monorepo Migration Script
# This script migrates the existing backend files to the new monorepo structure

set -e

echo "🚀 Starting Credit Card Enterprise Monorepo Migration..."

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

# Ensure we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root."
    exit 1
fi

print_status "Migrating backend files to packages/backend..."

# Create necessary directories
mkdir -p packages/backend/{middleware,models,routes,services,utils,scripts}

# Copy backend files if they exist in the root
if [ -d "middleware" ]; then
    print_status "Copying middleware files..."
    cp -r middleware/* packages/backend/middleware/ 2>/dev/null || true
    print_success "Middleware files copied"
fi

if [ -d "models" ]; then
    print_status "Copying models files..."
    cp -r models/* packages/backend/models/ 2>/dev/null || true
    print_success "Models files copied"
fi

if [ -d "routes" ]; then
    print_status "Copying routes files..."
    cp -r routes/* packages/backend/routes/ 2>/dev/null || true
    print_success "Routes files copied"
fi

if [ -d "services" ]; then
    print_status "Copying services files..."
    cp -r services/* packages/backend/services/ 2>/dev/null || true
    print_success "Services files copied"
fi

if [ -d "utils" ]; then
    print_status "Copying utils files..."
    cp -r utils/* packages/backend/utils/ 2>/dev/null || true
    print_success "Utils files copied"
fi

# Copy server files
if [ -f "server.js" ]; then
    print_status "Copying server.js..."
    cp server.js packages/backend/ 2>/dev/null || true
    print_success "Server.js copied"
fi

# Copy MCP server
if [ -f "mcp-server.js" ]; then
    print_status "Copying MCP server..."
    cp mcp-server.js packages/backend/ 2>/dev/null || true
    print_success "MCP server copied"
fi

# Copy configuration files
if [ -f "mcp-config.json" ]; then
    print_status "Copying MCP configuration..."
    cp mcp-config.json packages/backend/ 2>/dev/null || true
    print_success "MCP configuration copied"
fi

# Copy test scripts
print_status "Copying test scripts..."
cp test-*.sh packages/backend/scripts/ 2>/dev/null || true
cp demo-api.sh packages/backend/scripts/ 2>/dev/null || true
cp setup-mcp.sh packages/backend/scripts/ 2>/dev/null || true
print_success "Test scripts copied"

# Copy environment file
if [ -f ".env" ]; then
    print_status "Copying environment file..."
    cp .env packages/backend/ 2>/dev/null || true
    print_success "Environment file copied"
fi

# Make scripts executable
print_status "Making scripts executable..."
chmod +x packages/backend/scripts/*.sh 2>/dev/null || true
print_success "Scripts made executable"

print_success "Backend migration completed successfully!"

# Verify the migration
print_status "Verifying migration..."
if [ -f "packages/backend/server.js" ] && [ -f "packages/backend/package.json" ]; then
    print_success "✅ Backend package structure verified"
else
    print_warning "⚠️  Some backend files may be missing"
fi

if [ -f "packages/shared/package.json" ]; then
    print_success "✅ Shared package structure verified"
else
    print_warning "⚠️  Shared package may need attention"
fi

print_status "Next steps:"
echo "1. Run 'npm run install:all' to install dependencies"
echo "2. Run 'npm run build:shared' to build shared package"
echo "3. Run 'npm run dev:backend' to start the backend server"
echo "4. Set up UI packages as needed"

print_success "🎉 Monorepo migration completed!"
