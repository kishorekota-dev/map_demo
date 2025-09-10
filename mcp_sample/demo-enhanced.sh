#!/bin/bash

echo "🎯 Enhanced MCP Demo - Comprehensive Showcase"
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if dependencies are installed
check_dependencies() {
    print_info "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    if [ ! -d "node_modules" ]; then
        print_warning "Dependencies not installed, running npm install..."
        npm install
    fi
    
    print_status "Dependencies checked"
}

# Start backend API
start_backend() {
    print_info "Starting Enhanced Backend API..."
    node backend-api-enhanced.js &
    BACKEND_PID=$!
    
    # Wait for backend to start
    sleep 3
    
    # Check if backend is running
    if curl -s http://localhost:3001/api/health > /dev/null; then
        print_status "Enhanced Backend API started successfully (PID: $BACKEND_PID)"
    else
        print_error "Failed to start Enhanced Backend API"
        exit 1
    fi
}

# Test basic API endpoints
test_api() {
    print_info "Testing API endpoints..."
    
    # Health check
    HEALTH=$(curl -s http://localhost:3001/api/health | jq -r '.status')
    if [ "$HEALTH" = "healthy" ]; then
        print_status "Health check passed"
    else
        print_error "Health check failed"
    fi
    
    # Analytics
    ANALYTICS=$(curl -s http://localhost:3001/api/analytics | jq -r '.success')
    if [ "$ANALYTICS" = "true" ]; then
        print_status "Analytics endpoint working"
    else
        print_error "Analytics endpoint failed"
    fi
    
    # Users endpoint
    USERS=$(curl -s http://localhost:3001/api/users | jq -r '.success')
    if [ "$USERS" = "true" ]; then
        print_status "Users endpoint working"
    else
        print_error "Users endpoint failed"
    fi
}

# Cleanup function
cleanup() {
    print_info "Cleaning up..."
    
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
        print_status "Backend API stopped"
    fi
    
    # Kill any remaining node processes
    pkill -f "backend-api-enhanced.js" 2>/dev/null || true
    pkill -f "mcp-server-enhanced.js" 2>/dev/null || true
}

# Trap cleanup on exit
trap cleanup EXIT

# Main execution
main() {
    print_info "Starting Enhanced MCP Demo Script"
    
    check_dependencies
    start_backend
    test_api
    
    print_status "Demo completed successfully!"
}

# Show usage if help is requested
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0"
    echo "Enhanced MCP Demo - Tests the complete stack"
    exit 0
fi

# Run main function
main "$@"
