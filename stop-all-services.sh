#!/bin/bash

##############################################################################
# Stop All Services Script
# Gracefully stops all microservices
##############################################################################

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Stopping Chat Banking Microservices                   ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}✗ PM2 not found. Services may not be running under PM2.${NC}"
    echo ""
    echo "Attempting to kill processes by port..."
    
    # Kill processes by port
    PORTS=(3001 3002 3003 3004 3005 3006 8081)
    for port in "${PORTS[@]}"; do
        pid=$(lsof -ti:$port)
        if [ ! -z "$pid" ]; then
            echo -e "${YELLOW}Stopping process on port ${port}...${NC}"
            kill -9 $pid 2>/dev/null
            echo -e "${GREEN}✓ Stopped process on port ${port}${NC}"
        fi
    done
else
    # Stop all PM2 processes
    echo -e "${YELLOW}Stopping all PM2 services...${NC}"
    pm2 stop all
    
    echo ""
    echo -e "${YELLOW}Deleting all PM2 processes...${NC}"
    pm2 delete all
    
    echo ""
    echo -e "${GREEN}✓ All services stopped${NC}"
fi

echo ""
echo -e "${BLUE}Verifying all services are stopped...${NC}"

# Check if any ports are still in use
PORTS=(3001 3002 3003 3004 3005 3006 8081)
STILL_RUNNING=0

for port in "${PORTS[@]}"; do
    if lsof -ti:$port > /dev/null 2>&1; then
        echo -e "${RED}✗ Port ${port} is still in use${NC}"
        STILL_RUNNING=1
    else
        echo -e "${GREEN}✓ Port ${port} is free${NC}"
    fi
done

echo ""

if [ $STILL_RUNNING -eq 0 ]; then
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║          All Services Stopped Successfully!                   ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ Some services may still be running${NC}"
    echo ""
    echo "To force stop all services, run:"
    echo "  ./force-stop-services.sh"
    exit 1
fi
