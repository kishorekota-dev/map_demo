#!/bin/bash

###############################################################################
# POC Banking System - Check Service Status
###############################################################################

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}POC Banking System - Service Status${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Navigate to project root
cd "$PROJECT_ROOT"

# Check if docker-compose.local.yml exists
if [ ! -f "docker-compose.local.yml" ]; then
    echo -e "${RED}✗ docker-compose.local.yml not found${NC}"
    exit 1
fi

# Function to check service health
check_service() {
    local service_name=$1
    local port=$2
    local url="http://localhost:${port}/health"
    
    # Check if container is running
    RUNNING=$(docker compose -f docker-compose.local.yml ps $service_name 2>/dev/null | grep -c "Up" || echo "0")
    
    if [ "$RUNNING" = "0" ]; then
        echo -e "${RED}✗ ${service_name} - Not Running${NC}"
        return 1
    fi
    
    # Check health endpoint
    if command -v curl &> /dev/null; then
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $url 2>/dev/null || echo "000")
        if [ "$HTTP_CODE" = "200" ]; then
            echo -e "${GREEN}✓ ${service_name} - Healthy (Port ${port})${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠ ${service_name} - Running but not healthy (Port ${port})${NC}"
            return 1
        fi
    else
        echo -e "${GREEN}✓ ${service_name} - Running (Port ${port})${NC}"
        return 0
    fi
}

# Check Docker
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker is not running${NC}"
    exit 1
fi

# Check container status
echo -e "${BLUE}Container Status:${NC}"
docker compose -f docker-compose.local.yml ps
echo ""

# Check service health
echo -e "${BLUE}Service Health Checks:${NC}"
check_service "poc-postgres" "5432"
check_service "poc-redis" "6379"
check_service "poc-banking-service" "3005"
check_service "poc-nlu-service" "3003"
check_service "poc-mcp-service" "3004"
check_service "poc-chat-backend" "3006"
check_service "poc-frontend" "3000"

echo ""
echo -e "${BLUE}Quick Access URLs:${NC}"
echo "  • Frontend:        http://localhost:3000"
echo "  • Chat Backend:    http://localhost:3006/health"
echo "  • Banking Service: http://localhost:3005/health"
echo "  • NLU Service:     http://localhost:3003/health"
echo "  • MCP Service:     http://localhost:3004/health"
echo ""
echo -e "${BLUE}View Logs:${NC}"
echo "  docker compose -f docker-compose.local.yml logs -f [service-name]"
echo ""
