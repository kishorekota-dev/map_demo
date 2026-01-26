#!/bin/bash
# POC Banking Chat - Health Check All Services
# Usage: ./scripts/health-check.sh

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  POC Banking Chat - Health Check       ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Service definitions: name:port
SERVICES=(
  "API Gateway:3001"
  "NLU Service:3003"
  "MCP Service:3004"
  "Banking Service:3005"
  "Chat Backend:3006"
  "AI Orchestrator:3007"
  "Agent UI:8081"
)

HEALTHY=0
UNHEALTHY=0

check_service() {
  local name=$1
  local port=$2
  
  printf "%-20s " "$name"
  
  response=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port/health" 2>/dev/null || echo "000")
  
  if [[ "$response" == "200" ]]; then
    echo -e "${GREEN}✓ Healthy (port $port)${NC}"
    ((HEALTHY++))
  else
    echo -e "${RED}✗ Unhealthy (port $port, status: $response)${NC}"
    ((UNHEALTHY++))
  fi
}

for service in "${SERVICES[@]}"; do
  IFS=':' read -r name port <<< "$service"
  check_service "$name" "$port"
done

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "  Summary: ${GREEN}$HEALTHY healthy${NC}, ${RED}$UNHEALTHY unhealthy${NC}"
echo -e "${BLUE}========================================${NC}"

# Exit with error if any unhealthy
[[ $UNHEALTHY -eq 0 ]] && exit 0 || exit 1
