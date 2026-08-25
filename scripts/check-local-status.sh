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
COMPOSE_FILE="$PROJECT_ROOT/docker/docker-compose.local.yml"

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}POC Banking System - Service Status${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Navigate to project root
cd "$PROJECT_ROOT"

# Check if docker-compose.local.yml exists
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}✗ docker/docker-compose.local.yml not found${NC}"
    exit 1
fi

# Function to check service health
check_service() {
    local service_name=$1
    local port=$2
    local health_path=$3
    
    # Check if container is running
    if ! docker compose -f "$COMPOSE_FILE" ps --status running --services 2>/dev/null | grep -Fxq "$service_name"; then
        echo -e "${RED}✗ ${service_name} - Not Running${NC}"
        return 1
    fi
    
    if [ -z "$health_path" ]; then
        echo -e "${GREEN}✓ ${service_name} - Running${NC}"
        return 0
    fi

    # Check health endpoint
    if command -v curl &> /dev/null; then
        local url="http://localhost:${port}${health_path}"
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
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
docker compose -f "$COMPOSE_FILE" ps
echo ""

# Check service health
echo -e "${BLUE}Service Health Checks:${NC}"
check_service "postgres" "5432" ""
check_service "redis" "6379" ""
check_service "banking-service" "3005" "/health"
check_service "nlu-service" "3003" "/health"
check_service "mcp-service" "3004" "/health"
check_service "ai-orchestrator" "3007" "/health"
check_service "chat-backend" "3006" "/health"
check_service "api-gateway" "3001" "/health"
check_service "agent-ui" "8081" "/health"
check_service "frontend" "3000" "/"

echo ""
echo -e "${BLUE}Quick Access URLs:${NC}"
echo "  • Frontend:        http://localhost:3000"
echo "  • Agent UI:        http://localhost:8081"
echo "  • API Gateway:     http://localhost:3001/health"
echo "  • Chat Backend:    http://localhost:3006/health"
echo "  • Banking Service: http://localhost:3005/health"
echo "  • NLU Service:     http://localhost:3003/health"
echo "  • MCP Service:     http://localhost:3004/health"
echo "  • AI Orchestrator: http://localhost:3007/health"
echo ""
echo -e "${BLUE}View Logs:${NC}"
echo "  docker compose -f docker/docker-compose.local.yml logs -f [service-name]"
echo ""
