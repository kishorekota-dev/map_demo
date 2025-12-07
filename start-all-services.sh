#!/bin/bash

##############################################################################
# Start All Services Script
# Starts all microservices in the correct order
##############################################################################

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      Starting Chat Banking Microservices Application         ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠ PM2 not found. Installing PM2...${NC}"
    npm install -g pm2
fi

# Function to start a service
start_service() {
    local name=$1
    local dir=$2
    local script=$3
    local port=$4
    
    echo -e "${YELLOW}Starting ${name}...${NC}"
    
    cd "$dir" || exit 1
    
    if [ -f "$script" ]; then
        PORT=$port pm2 start "$script" --name "$name" --watch
        echo -e "${GREEN}✓ ${name} started on port ${port}${NC}"
    else
        echo -e "${RED}✗ Error: ${script} not found in ${dir}${NC}"
        return 1
    fi
    
    cd - > /dev/null || exit 1
}

# Stop any existing services
echo -e "${YELLOW}Stopping any existing services...${NC}"
pm2 delete all 2>/dev/null || true
echo ""

# Phase 1: Processing Services
echo -e "${BLUE}═══ Phase 1: Processing Services ═══${NC}"
start_service "nlu-service" "./poc-nlu-service/src" "server.js" 3003
start_service "mcp-service" "./poc-mcp-service/src" "server.js" 3004
sleep 3

# Phase 2: Domain Services
echo ""
echo -e "${BLUE}═══ Phase 2: Domain Services ═══${NC}"
start_service "banking-service" "./poc-banking-service" "server.js" 3010
start_service "chat-backend" "./poc-chat-backend" "server.js" 3001
sleep 3

# Phase 3: Frontend Services
echo ""
echo -e "${BLUE}═══ Phase 3: Frontend Services ═══${NC}"
start_service "frontend" "./poc-frontend" "node_modules/.bin/vite" 3002

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║             All Services Started Successfully!                ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Display service status
echo -e "${BLUE}Service Status:${NC}"
pm2 status

echo ""
echo -e "${YELLOW}Service URLs:${NC}"
echo "  • API Gateway:      http://localhost:3001"
echo "  • NLU Service:      http://localhost:3003"
echo "  • MCP Service:      http://localhost:3004"
echo "  • Banking Service:  http://localhost:3005"
echo "  • Chat Backend:     http://localhost:3006"
echo "  • Agent UI:         http://localhost:8081"
echo ""

echo -e "${YELLOW}Useful Commands:${NC}"
echo "  • Check status:   pm2 status"
echo "  • View logs:      pm2 logs"
echo "  • Stop all:       pm2 stop all"
echo "  • Restart all:    pm2 restart all"
echo "  • Test services:  ./test-all-services.sh"
echo ""

# Save PM2 configuration
pm2 save

echo -e "${GREEN}✓ Startup complete!${NC}"
