#!/bin/bash

# POC Banking Chatbot - Development Environment Setup Script
# This script starts all microservices with proper environment configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

# Check if we're in the correct directory
if [ ! -f ".env.development" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

print_header "POC Banking Chatbot - Development Setup"

# Create logs directories for all services
print_status "Creating log directories..."
mkdir -p poc-api-gateway/logs
mkdir -p poc-banking-service/logs
mkdir -p poc-nlp-service/logs
mkdir -p poc-nlu-service/logs
mkdir -p poc-mcp-service/logs

# Copy environment files to each service
print_status "Setting up environment files..."

# Copy development environment to each service
cp .env.development poc-api-gateway/.env
cp .env.development poc-banking-service/.env
cp .env.development poc-nlp-service/.env
cp .env.development poc-nlu-service/.env
cp .env.development poc-mcp-service/.env

# Override specific port configurations for each service
print_status "Configuring service-specific ports..."

# API Gateway
echo "PORT=3001" >> poc-api-gateway/.env
echo "SERVICE_NAME=poc-api-gateway" >> poc-api-gateway/.env
echo "LOG_FILE_PATH=logs/api-gateway.log" >> poc-api-gateway/.env

# Banking Service
echo "PORT=3005" >> poc-banking-service/.env
echo "SERVICE_NAME=poc-banking-service" >> poc-banking-service/.env
echo "SERVICE_HEALTH_CHECK_URL=http://localhost:3005/health" >> poc-banking-service/.env
echo "LOG_FILE_PATH=logs/banking-service.log" >> poc-banking-service/.env

# NLP Service
echo "PORT=3002" >> poc-nlp-service/.env
echo "SERVICE_NAME=poc-nlp-service" >> poc-nlp-service/.env
echo "SERVICE_HEALTH_CHECK_URL=http://localhost:3002/health" >> poc-nlp-service/.env
echo "LOG_FILE_PATH=logs/nlp-service.log" >> poc-nlp-service/.env

# NLU Service
echo "PORT=3003" >> poc-nlu-service/.env
echo "SERVICE_NAME=poc-nlu-service" >> poc-nlu-service/.env
echo "SERVICE_HEALTH_CHECK_URL=http://localhost:3003/health" >> poc-nlu-service/.env
echo "LOG_FILE_PATH=logs/nlu-service.log" >> poc-nlu-service/.env

# MCP Service
echo "PORT=3004" >> poc-mcp-service/.env
echo "SERVICE_NAME=poc-mcp-service" >> poc-mcp-service/.env
echo "SERVICE_HEALTH_CHECK_URL=http://localhost:3004/health" >> poc-mcp-service/.env
echo "LOG_FILE_PATH=logs/mcp-service.log" >> poc-mcp-service/.env

# Install dependencies for all services
print_status "Installing dependencies..."

services=("poc-api-gateway" "poc-banking-service" "poc-nlp-service" "poc-nlu-service" "poc-mcp-service")

for service in "${services[@]}"; do
    if [ -d "$service" ]; then
        print_status "Installing dependencies for $service..."
        cd "$service"
        if [ -f "package.json" ]; then
            npm install
        else
            print_warning "No package.json found in $service"
        fi
        cd ..
    else
        print_warning "Service directory $service not found"
    fi
done

# Function to start a service
start_service() {
    local service_name=$1
    local service_port=$2
    
    print_status "Starting $service_name on port $service_port..."
    
    cd "$service_name"
    
    # Start the service in background
    npm run dev > "../logs/${service_name}.log" 2>&1 &
    
    # Store the PID
    echo $! > "../logs/${service_name}.pid"
    
    cd ..
    
    # Wait a moment for the service to start
    sleep 2
    
    # Check if service is running
    if kill -0 $(cat "logs/${service_name}.pid") 2>/dev/null; then
        print_status "$service_name started successfully (PID: $(cat logs/${service_name}.pid))"
    else
        print_error "Failed to start $service_name"
        return 1
    fi
}

# Function to check if port is available
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null; then
        return 1
    else
        return 0
    fi
}

# Check if required ports are available
print_status "Checking port availability..."
required_ports=(3001 3002 3003 3004 3005)
for port in "${required_ports[@]}"; do
    if ! check_port $port; then
        print_error "Port $port is already in use. Please stop the service using this port."
        print_status "You can find the process with: lsof -i :$port"
        exit 1
    fi
done

# Start all services
print_header "Starting Microservices"

# Start services in dependency order
print_status "Starting services in dependency order..."

# 1. Start MCP Service (foundational service)
start_service "poc-mcp-service" 3004

# 2. Start NLP Service
start_service "poc-nlp-service" 3002

# 3. Start NLU Service
start_service "poc-nlu-service" 3003

# 4. Start Banking Service
start_service "poc-banking-service" 3005

# 5. Start API Gateway (last, as it routes to other services)
start_service "poc-api-gateway" 3001

# Wait for all services to be ready
print_status "Waiting for services to be ready..."
sleep 5

# Health check all services
print_header "Health Check"

health_check() {
    local service_name=$1
    local port=$2
    
    print_status "Checking health of $service_name..."
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port/health" || echo "000")
    
    if [ "$response" = "200" ]; then
        print_status "$service_name is healthy ✓"
        return 0
    else
        print_error "$service_name health check failed (HTTP $response) ✗"
        return 1
    fi
}

# Perform health checks
health_check "API Gateway" 3001
health_check "NLP Service" 3002  
health_check "NLU Service" 3003
health_check "MCP Service" 3004
health_check "Banking Service" 3005

print_header "Development Environment Ready"

echo ""
echo -e "${GREEN}🚀 All services are running!${NC}"
echo ""
echo "Service URLs:"
echo "  • API Gateway:     http://localhost:3001"
echo "  • NLP Service:     http://localhost:3002"
echo "  • NLU Service:     http://localhost:3003"
echo "  • MCP Service:     http://localhost:3004"
echo "  • Banking Service: http://localhost:3005"
echo ""
echo "API Endpoints:"
echo "  • Gateway API:     http://localhost:3001/api"
echo "  • Banking API:     http://localhost:3001/api/banking"
echo "  • NLP API:         http://localhost:3001/api/nlp"
echo "  • NLU API:         http://localhost:3001/api/nlu"
echo "  • MCP API:         http://localhost:3001/api/mcp"
echo ""
echo "Health Checks:"
echo "  • All Services:    http://localhost:3001/health"
echo ""
echo "Logs:"
echo "  • API Gateway:     tail -f logs/poc-api-gateway.log"
echo "  • Banking Service: tail -f logs/poc-banking-service.log"
echo "  • NLP Service:     tail -f logs/poc-nlp-service.log"
echo "  • NLU Service:     tail -f logs/poc-nlu-service.log"
echo "  • MCP Service:     tail -f logs/poc-mcp-service.log"
echo ""
echo -e "${YELLOW}To stop all services, run: ./scripts/stop-dev.sh${NC}"