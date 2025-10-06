#!/bin/bash

# Test All Services - POC Banking Chat
# This script checks if all microservices are running and healthy

echo "🔍 Testing POC Banking Chat Microservices..."
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
TOTAL=0
SUCCESS=0
FAILED=0

# Function to test a service
test_service() {
    local name=$1
    local url=$2
    local port=$3
    
    TOTAL=$((TOTAL + 1))
    
    printf "Testing %-25s (Port %-5s) ... " "$name" "$port"
    
    response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$url" 2>/dev/null)
    
    if [ "$response" = "200" ]; then
        echo -e "${GREEN}✓ Healthy${NC}"
        SUCCESS=$((SUCCESS + 1))
    else
        echo -e "${RED}✗ Failed (HTTP $response)${NC}"
        FAILED=$((FAILED + 1))
    fi
}

# Test all services
echo "Testing Backend Services:"
echo "------------------------"

test_service "API Gateway" "http://localhost:3001/health" "3001"
test_service "NLP Service" "http://localhost:3002/health" "3002"
test_service "NLU Service" "http://localhost:3003/health" "3003"
test_service "MCP Service" "http://localhost:3004/health" "3004"
test_service "Banking Service" "http://localhost:3005/health" "3005"
test_service "Chat Backend" "http://localhost:3006/health" "3006"
test_service "Agent UI" "http://localhost:3007/health" "3007"

echo ""
echo "Testing Frontend Services:"
echo "-------------------------"

# Frontend check (different approach as it's not a health endpoint)
printf "Testing %-25s (Port %-5s) ... " "Frontend" "3000"
response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://localhost:3000" 2>/dev/null)
TOTAL=$((TOTAL + 1))
if [ "$response" = "200" ]; then
    echo -e "${GREEN}✓ Healthy${NC}"
    SUCCESS=$((SUCCESS + 1))
else
    echo -e "${RED}✗ Failed (HTTP $response)${NC}"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "================================================"
echo "Summary:"
echo "--------"
echo -e "Total Services:   $TOTAL"
echo -e "Healthy:          ${GREEN}$SUCCESS${NC}"
echo -e "Failed:           ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All services are running and healthy!${NC}"
    echo ""
    echo "You can now access:"
    echo "  • Customer Chat:  http://localhost:3000"
    echo "  • Agent Dashboard: http://localhost:3007"
    echo "  • API Gateway:    http://localhost:3001/api"
    echo "  • Metrics:        http://localhost:3001/metrics"
    echo ""
    exit 0
else
    echo -e "${RED}⚠️  Some services are not running or unhealthy.${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check if services are started: ps aux | grep node"
    echo "  2. Check service logs in poc-*/logs/ directories"
    echo "  3. Ensure all dependencies are installed: npm install"
    echo "  4. Verify port availability: lsof -ti:<port>"
    echo ""
    exit 1
fi
