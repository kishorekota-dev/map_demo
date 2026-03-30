#!/bin/bash

###############################################################################
# POC Banking System - Local Development Deployment Script
# 
# This script starts all services locally using Docker Compose
# Services included:
# - PostgreSQL Database
# - Redis Cache
# - Banking Service (port 3005)
# - NLU Service (port 3003)
# - MCP Service (port 3004)
# - Chat Backend (port 3006)
# - Frontend (port 3000)
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker/docker-compose.local.yml"

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}POC Banking System - Local Deployment${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Function to print colored messages
print_info() {
    echo -e "${BLUE}ℹ ${1}${NC}"
}

print_success() {
    echo -e "${GREEN}✓ ${1}${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ ${1}${NC}"
}

print_error() {
    echo -e "${RED}✗ ${1}${NC}"
}

# Check if Docker is running
print_info "Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi
print_success "Docker is running"

# Check if Docker Compose is available
print_info "Checking Docker Compose..."
if ! docker compose version > /dev/null 2>&1; then
    print_error "Docker Compose is not available. Please install Docker Compose."
    exit 1
fi
print_success "Docker Compose is available"

# Navigate to project root
cd "$PROJECT_ROOT"

# Check if docker-compose.local.yml exists
if [ ! -f "$COMPOSE_FILE" ]; then
    print_error "docker/docker-compose.local.yml not found"
    exit 1
fi

# Stop any existing containers
print_info "Stopping existing containers..."
docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
print_success "Existing containers stopped"

# Create necessary directories
print_info "Creating necessary directories..."
mkdir -p services/nlu-service/logs
mkdir -p services/nlu-service/credentials
mkdir -p services/banking-service/logs
mkdir -p services/mcp-service/logs
mkdir -p services/chat-backend/logs
chmod +x scripts/init-multiple-databases.sh 2>/dev/null || true
print_success "Directories created"

# Check for DialogFlow credentials (optional)
if [ -f "services/nlu-service/credentials/dialogflow-key.json" ]; then
    print_success "DialogFlow credentials found"
else
    print_warning "DialogFlow credentials not found - NLU will use fallback mode"
    print_info "To enable DialogFlow, place your service account key at:"
    print_info "  services/nlu-service/credentials/dialogflow-key.json"
fi

# Build and start services
print_info "Building and starting services..."
echo ""
docker compose -f "$COMPOSE_FILE" up --build -d

# Wait for services to be healthy
print_info "Waiting for services to become healthy..."
echo ""

TIMEOUT=120
ELAPSED=0
INTERVAL=5

while [ $ELAPSED -lt $TIMEOUT ]; do
    # Check service health
    POSTGRES_HEALTHY=$(docker compose -f "$COMPOSE_FILE" ps postgres | grep -c "healthy" || echo "0")
    REDIS_HEALTHY=$(docker compose -f "$COMPOSE_FILE" ps redis | grep -c "healthy" || echo "0")
    BANKING_HEALTHY=$(docker compose -f "$COMPOSE_FILE" ps banking-service | grep -c "healthy" || echo "0")
    NLU_HEALTHY=$(docker compose -f "$COMPOSE_FILE" ps nlu-service | grep -c "healthy" || echo "0")
    MCP_HEALTHY=$(docker compose -f "$COMPOSE_FILE" ps mcp-service | grep -c "healthy" || echo "0")
    CHAT_HEALTHY=$(docker compose -f "$COMPOSE_FILE" ps chat-backend | grep -c "healthy" || echo "0")
    FRONTEND_HEALTHY=$(docker compose -f "$COMPOSE_FILE" ps frontend | grep -c "healthy" || echo "0")
    
    TOTAL_HEALTHY=$((POSTGRES_HEALTHY + REDIS_HEALTHY + BANKING_HEALTHY + NLU_HEALTHY + MCP_HEALTHY + CHAT_HEALTHY + FRONTEND_HEALTHY))
    
    echo -ne "\r${BLUE}Services healthy: ${TOTAL_HEALTHY}/7${NC} (${ELAPSED}s/${TIMEOUT}s)"
    
    if [ $TOTAL_HEALTHY -eq 7 ]; then
        echo ""
        print_success "All services are healthy!"
        break
    fi
    
    sleep $INTERVAL
    ELAPSED=$((ELAPSED + INTERVAL))
done

echo ""

if [ $ELAPSED -ge $TIMEOUT ]; then
    print_warning "Timeout waiting for all services to become healthy"
    print_info "Some services may still be starting up. Check logs with:"
    print_info "  docker compose -f docker/docker-compose.local.yml logs -f [service-name]"
else
    print_success "Deployment completed successfully!"
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Services are running!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
print_info "Service URLs:"
echo "  • Frontend:        http://localhost:3000"
echo "  • Chat Backend:    http://localhost:3006"
echo "  • Banking Service: http://localhost:3005"
echo "  • NLU Service:     http://localhost:3003"
echo "  • MCP Service:     http://localhost:3004"
echo "  • PostgreSQL:      localhost:5432"
echo "  • Redis:           localhost:6379"
echo ""
print_info "API Documentation:"
echo "  • NLU Service:     http://localhost:3003/api"
echo "  • Banking Service: http://localhost:3005/api"
echo ""
print_info "Health Checks:"
echo "  • Frontend:        http://localhost:3000"
echo "  • Chat Backend:    http://localhost:3006/health"
echo "  • Banking Service: http://localhost:3005/health"
echo "  • NLU Service:     http://localhost:3003/health"
echo "  • MCP Service:     http://localhost:3004/health"
echo ""
print_info "Useful Commands:"
echo "  • View all logs:        docker compose -f docker/docker-compose.local.yml logs -f"
echo "  • View service logs:    docker compose -f docker/docker-compose.local.yml logs -f [service-name]"
echo "  • Stop all services:    docker compose -f docker/docker-compose.local.yml down"
echo "  • Restart service:      docker compose -f docker/docker-compose.local.yml restart [service-name]"
echo "  • Check service status: docker compose -f docker/docker-compose.local.yml ps"
echo ""
print_info "Service Names:"
echo "  • postgres"
echo "  • redis"
echo "  • banking-service"
echo "  • nlu-service"
echo "  • mcp-service"
echo "  • chat-backend"
echo "  • frontend"
echo ""
print_success "Happy coding! 🚀"
echo ""
