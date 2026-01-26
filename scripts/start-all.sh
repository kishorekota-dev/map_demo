#!/bin/bash
# POC Banking Chat - Start All Services
# Usage: ./scripts/start-all.sh [--background]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICES_DIR="$ROOT_DIR/services"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BACKGROUND=false
[[ "$1" == "--background" ]] && BACKGROUND=true

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  POC Banking Chat - Starting Services  ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Service definitions: name:port:directory:command
SERVICES=(
  "api-gateway:3001:api-gateway:npm start"
  "nlu-service:3003:nlu-service:npm start"
  "mcp-service:3004:mcp-service:npm start"
  "banking-service:3005:banking-service:npm start"
  "chat-backend:3006:chat-backend:npm start"
  "ai-orchestrator:3007:ai-orchestrator:npm start"
  "agent-ui:8081:agent-ui:npm start"
)

PIDS_FILE="$ROOT_DIR/.pids"
> "$PIDS_FILE"

start_service() {
  local name=$1
  local port=$2
  local dir=$3
  local cmd=$4
  
  echo -e "${YELLOW}Starting $name on port $port...${NC}"
  
  cd "$SERVICES_DIR/$dir"
  
  if $BACKGROUND; then
    nohup $cmd > "$ROOT_DIR/logs/$name.log" 2>&1 &
    echo "$! $name" >> "$PIDS_FILE"
  else
    $cmd &
    echo "$! $name" >> "$PIDS_FILE"
  fi
  
  sleep 2
  
  # Health check
  if curl -s "http://localhost:$port/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ $name started successfully${NC}"
  else
    echo -e "${YELLOW}⚠ $name starting (health check pending)${NC}"
  fi
}

# Create logs directory
mkdir -p "$ROOT_DIR/logs"

# Start each service
for service in "${SERVICES[@]}"; do
  IFS=':' read -r name port dir cmd <<< "$service"
  start_service "$name" "$port" "$dir" "$cmd"
done

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  All services started!                 ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Service URLs:"
echo "  • Frontend:        http://localhost:3000"
echo "  • API Gateway:     http://localhost:3001"
echo "  • NLU Service:     http://localhost:3003"
echo "  • MCP Service:     http://localhost:3004"
echo "  • Banking Service: http://localhost:3005"
echo "  • Chat Backend:    http://localhost:3006"
echo "  • AI Orchestrator: http://localhost:3007"
echo "  • Agent UI:        http://localhost:8081"
echo ""
echo "Run './scripts/health-check.sh' to verify all services"
echo "Run './scripts/stop-all.sh' to stop all services"
