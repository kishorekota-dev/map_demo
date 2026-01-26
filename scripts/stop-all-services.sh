#!/bin/bash

# Stop All Services - POC Banking Chat
# This script stops all running microservices

echo "🛑 Stopping POC Banking Chat Microservices..."
echo "============================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_ROOT/deployment-scripts/logs"

STOPPED=0
NOT_RUNNING=0

# Function to stop a service
stop_service() {
    local name=$1
    local pid_file="$LOG_DIR/$name.pid"
    
    echo -e "${YELLOW}Stopping $name...${NC}"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        
        if ps -p $pid > /dev/null 2>&1; then
            kill $pid 2>/dev/null
            
            # Wait for process to stop
            for i in {1..5}; do
                if ! ps -p $pid > /dev/null 2>&1; then
                    break
                fi
                sleep 1
            done
            
            # Force kill if still running
            if ps -p $pid > /dev/null 2>&1; then
                kill -9 $pid 2>/dev/null
            fi
            
            echo -e "${GREEN}✓ $name stopped${NC}"
            STOPPED=$((STOPPED + 1))
            rm "$pid_file"
        else
            echo -e "${YELLOW}✓ $name was not running${NC}"
            NOT_RUNNING=$((NOT_RUNNING + 1))
            rm "$pid_file"
        fi
    else
        echo -e "${YELLOW}✓ No PID file found for $name${NC}"
        NOT_RUNNING=$((NOT_RUNNING + 1))
    fi
    
    echo ""
}

# Stop all services
stop_service "Frontend"
stop_service "Agent UI"
stop_service "Chat Backend"
stop_service "Banking Service"
stop_service "MCP Service"
stop_service "NLU Service"
stop_service "NLP Service"
stop_service "API Gateway"

# Also kill any remaining node processes for these services
echo -e "${YELLOW}Cleaning up any remaining processes...${NC}"

# Kill by port
for port in 3000 3001 3002 3003 3004 3005 3006 3007; do
    if lsof -ti:$port >/dev/null 2>&1; then
        echo "Killing process on port $port..."
        kill -9 $(lsof -ti:$port) 2>/dev/null
    fi
done

echo ""
echo "============================================="
echo "Summary:"
echo "--------"
echo -e "Services stopped:     ${GREEN}$STOPPED${NC}"
echo -e "Not running:          ${YELLOW}$NOT_RUNNING${NC}"
echo ""
echo -e "${GREEN}All services have been stopped!${NC}"
echo ""
