#!/bin/bash

# Start All Services - POC Banking Chat
# This script starts all microservices in the background

echo "🚀 Starting POC Banking Chat Microservices..."
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT" || exit 1

# Log directory
LOG_DIR="$PROJECT_ROOT/deployment-scripts/logs"
mkdir -p "$LOG_DIR"

echo "Project root: $PROJECT_ROOT"
echo "Logs directory: $LOG_DIR"
echo ""

# Function to start a service
start_service() {
    local name=$1
    local path=$2
    local port=$3
    local command=${4:-"npm run dev"}
    
    echo -e "${YELLOW}Starting $name on port $port...${NC}"
    
    if [ -d "$path" ]; then
        cd "$path" || return 1
        
        # Check if port is already in use
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
            echo -e "${RED}✗ Port $port is already in use${NC}"
            cd - > /dev/null || return 1
            return 1
        fi
        
        # Start the service in background
        nohup $command > "$LOG_DIR/$name.log" 2>&1 &
        local pid=$!
        
        # Wait a moment for the service to start
        sleep 2
        
        # Check if process is still running
        if ps -p $pid > /dev/null; then
            echo -e "${GREEN}✓ $name started (PID: $pid)${NC}"
            echo "$pid" > "$LOG_DIR/$name.pid"
        else
            echo -e "${RED}✗ $name failed to start${NC}"
            cat "$LOG_DIR/$name.log"
        fi
        
        cd - > /dev/null || return 1
    else
        echo -e "${RED}✗ Directory not found: $path${NC}"
        return 1
    fi
    
    echo ""
}

# Start all services in order
echo "Starting backend services..."
echo ""

start_service "API Gateway" "poc-api-gateway" "3001"
sleep 3

start_service "NLP Service" "poc-nlp-service" "3002" "npm run dev"
sleep 2

start_service "NLU Service" "poc-nlu-service" "3003" "npm run dev"
sleep 2

start_service "MCP Service" "poc-mcp-service" "3004" "npm run dev"
sleep 2

start_service "Banking Service" "poc-banking-service" "3005" "npm run dev"
sleep 2

start_service "Chat Backend" "poc-chat-backend" "3006" "npm run dev"
sleep 3

start_service "Agent UI" "poc-agent-ui" "3007" "npm run dev"
sleep 2

start_service "Frontend" "poc-frontend" "3000" "npm run dev"

echo "=============================================="
echo ""
echo -e "${GREEN}All services have been started!${NC}"
echo ""
echo "Service URLs:"
echo "  • Customer Chat:   http://localhost:3000"
echo "  • Agent Dashboard: http://localhost:3007"
echo "  • API Gateway:     http://localhost:3001/api"
echo "  • API Health:      http://localhost:3001/health/services"
echo "  • Metrics:         http://localhost:3001/metrics"
echo ""
echo "Logs are available in: $LOG_DIR"
echo "PID files are available in: $LOG_DIR/*.pid"
echo ""
echo "To test services:"
echo "  ./deployment-scripts/test-all-services.sh"
echo ""
echo "To stop services:"
echo "  ./deployment-scripts/stop-all-services.sh"
echo ""
