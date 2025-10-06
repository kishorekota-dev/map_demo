#!/bin/bash

##############################################################################
# Check Services Status Script
# Displays the current status of all microservices
##############################################################################

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      Chat Banking Microservices Status Check                 ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check port
check_port() {
    local name=$1
    local port=$2
    local url=$3
    
    # Check if port is in use
    if lsof -ti:$port > /dev/null 2>&1; then
        # Try to hit health endpoint
        response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$url" 2>/dev/null)
        
        if [ "$response" = "200" ] || [ "$response" = "304" ]; then
            echo -e "${GREEN}✓${NC} ${name} (Port ${port}): ${GREEN}RUNNING${NC} & ${GREEN}HEALTHY${NC}"
        else
            echo -e "${YELLOW}⚠${NC} ${name} (Port ${port}): ${YELLOW}RUNNING${NC} but ${RED}UNHEALTHY${NC}"
        fi
    else
        echo -e "${RED}✗${NC} ${name} (Port ${port}): ${RED}NOT RUNNING${NC}"
    fi
}

# Check all services
echo -e "${BLUE}Infrastructure Services:${NC}"
check_port "API Gateway      " 3001 "http://localhost:3001/health"
echo ""

echo -e "${BLUE}Processing Services:${NC}"
check_port "NLP Service      " 3002 "http://localhost:3002/health"
check_port "NLU Service      " 3003 "http://localhost:3003/health"
check_port "MCP Service      " 3004 "http://localhost:3004/health"
echo ""

echo -e "${BLUE}Domain Services:${NC}"
check_port "Banking Service  " 3005 "http://localhost:3005/health"
check_port "Chat Backend     " 3006 "http://localhost:3006/health"
echo ""

echo -e "${BLUE}Frontend Services:${NC}"
check_port "Agent UI         " 8081 "http://localhost:8081"
echo ""

# PM2 status if available
if command -v pm2 &> /dev/null; then
    echo -e "${BLUE}PM2 Process Status:${NC}"
    echo "─────────────────────────────────────────────────────────────"
    pm2 status
    echo ""
fi

# Memory and CPU usage
echo -e "${BLUE}System Resources:${NC}"
echo "─────────────────────────────────────────────────────────────"

if command -v free &> /dev/null; then
    echo "Memory Usage:"
    free -h | grep -E "Mem|Swap"
elif command -v vm_stat &> /dev/null; then
    echo "Memory Usage (macOS):"
    vm_stat | grep -E "Pages free|Pages active|Pages inactive|Pages wired down"
fi

echo ""
echo "CPU Load Average:"
uptime | awk -F'load average:' '{print $2}'

echo ""

# Service URLs
echo -e "${BLUE}Service URLs:${NC}"
echo "─────────────────────────────────────────────────────────────"
echo "  • API Gateway:      http://localhost:3001"
echo "  • API Health:       http://localhost:3001/health"
echo "  • API Metrics:      http://localhost:3001/metrics"
echo "  • NLP Service:      http://localhost:3002/health"
echo "  • NLU Service:      http://localhost:3003/health"
echo "  • MCP Service:      http://localhost:3004/health"
echo "  • Banking Service:  http://localhost:3005/health"
echo "  • Chat Backend:     http://localhost:3006/health"
echo "  • Agent UI:         http://localhost:8081"
echo ""

# Quick actions
echo -e "${YELLOW}Quick Actions:${NC}"
echo "─────────────────────────────────────────────────────────────"
echo "  • Start all services:     ./start-all-services.sh"
echo "  • Stop all services:      ./stop-all-services.sh"
echo "  • Test all services:      ./test-all-services.sh"
echo "  • View logs:              pm2 logs"
echo "  • Restart specific:       pm2 restart <service-name>"
echo ""
