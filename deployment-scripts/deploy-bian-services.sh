#!/bin/bash

# POC Banking - BIAN Architecture Deployment Script
# This script sets up and deploys all microservices

set -e

echo "======================================"
echo "POC Banking - BIAN Architecture Setup"
echo "======================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
print_info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

print_info "Prerequisites check passed ✓"

# Setup environment files
print_info "Setting up environment files..."

# API Gateway
if [ ! -f "services/api-gateway/.env" ]; then
    cp services/api-gateway/.env.example services/api-gateway/.env
    print_info "Created API Gateway .env file"
fi

# Install dependencies for shared library
print_info "Installing shared library dependencies..."
cd poc-banking-service/shared
npm install
cd ../..

# Install dependencies for API Gateway
print_info "Installing API Gateway dependencies..."
cd services/api-gateway
npm install
cd ../..

# Install dependencies for Customer Service
print_info "Installing Customer Service dependencies..."
cd services/customer-service
npm install
cd ../..

# Build Docker images
print_info "Building Docker images..."
docker-compose -f docker-compose-banking.yml build

# Start PostgreSQL first
print_info "Starting PostgreSQL database..."
docker-compose -f docker-compose-banking.yml up -d postgres
print_info "Waiting for PostgreSQL to be ready..."
sleep 10

# Wait for PostgreSQL to be healthy
print_info "Checking PostgreSQL health..."
until docker-compose -f docker-compose-banking.yml exec -T postgres pg_isready -U banking_user -d poc_banking; do
    print_warn "PostgreSQL is unavailable - waiting..."
    sleep 2
done
print_info "PostgreSQL is ready ✓"

# Start pgAdmin
print_info "Starting pgAdmin..."
docker-compose -f docker-compose-banking.yml up -d pgadmin

# Start all services
print_info "Starting all microservices..."
docker-compose -f docker-compose-banking.yml up -d

# Wait for services to be ready
print_info "Waiting for services to start..."
sleep 15

# Check service health
print_info "Checking service health..."

check_service_health() {
    local service_name=$1
    local port=$2
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
            print_info "$service_name is healthy ✓"
            return 0
        fi
        print_warn "$service_name not ready yet (attempt $attempt/$max_attempts)..."
        sleep 2
        ((attempt++))
    done

    print_error "$service_name failed to become healthy"
    return 1
}

# Check each service
check_service_health "API Gateway" 3001 &
check_service_health "Customer Service" 3010 &

wait

# Display service URLs
echo ""
print_info "======================================"
print_info "Deployment Complete! 🎉"
print_info "======================================"
echo ""
echo "Service URLs:"
echo "  API Gateway:       http://localhost:3001"
echo "  Customer Service:  http://localhost:3010"
echo "  Account Service:   http://localhost:3011"
echo "  Card Service:      http://localhost:3012"
echo "  Payment Service:   http://localhost:3013"
echo "  Fraud Service:     http://localhost:3014"
echo "  Auth Service:      http://localhost:3015"
echo "  pgAdmin:           http://localhost:5050"
echo ""
echo "Database:"
echo "  Host:     localhost"
echo "  Port:     5432"
echo "  User:     banking_user"
echo "  Password: banking_pass_2024"
echo ""
echo "pgAdmin Credentials:"
echo "  Email:    admin@banking.local"
echo "  Password: admin123"
echo ""
echo "BIAN Service Domains:"
echo "  Party Authentication:              /sd-party-authentication/v1"
echo "  Party Reference Data Management:   /sd-party-reference-data-management/v1"
echo "  Current Account:                   /sd-current-account/v1"
echo "  Card Management:                   /sd-card-management/v1"
echo "  Payment Execution:                 /sd-payment-execution/v1"
echo "  Fraud Detection:                   /sd-fraud-detection/v1"
echo ""
echo "Quick Commands:"
echo "  View logs:         docker-compose -f docker-compose-banking.yml logs -f"
echo "  Stop services:     docker-compose -f docker-compose-banking.yml down"
echo "  Restart services:  docker-compose -f docker-compose-banking.yml restart"
echo "  Check health:      curl http://localhost:3001/health"
echo ""
print_info "Setup complete! Services are running."
