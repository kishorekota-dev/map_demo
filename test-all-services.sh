#!/bin/bash

##############################################################################
# Test All Services - Comprehensive Health Check Script
# Tests all microservices in the Chat Banking Application
##############################################################################

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Service configurations
declare -A SERVICES=(
    ["API Gateway"]="http://localhost:3001/health"
    ["Backend API"]="http://localhost:3001/api/health"
    ["NLP Service"]="http://localhost:3002/health"
    ["NLU Service"]="http://localhost:3003/health"
    ["MCP Service"]="http://localhost:3004/health"
    ["Banking Service"]="http://localhost:3005/health"
    ["Chat Backend"]="http://localhost:3006/health"
    ["Frontend"]="http://localhost:3000"
    ["Agent UI"]="http://localhost:8081"
)

# Counters
PASSED=0
FAILED=0
TOTAL=0

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Chat Banking Microservices Health Check              ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

##############################################################################
# Function: Test Service Health
##############################################################################
test_service() {
    local name=$1
    local url=$2
    local timeout=5
    
    TOTAL=$((TOTAL + 1))
    
    echo -n "Testing ${name}... "
    
    # Make HTTP request with timeout
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time $timeout "$url" 2>/dev/null)
    
    # Check response
    if [ "$response" = "200" ] || [ "$response" = "304" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $response)"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $response)"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

##############################################################################
# Function: Test WebSocket Connection
##############################################################################
test_websocket() {
    local name=$1
    local url=$2
    
    TOTAL=$((TOTAL + 1))
    
    echo -n "Testing ${name} WebSocket... "
    
    # Check if wscat is available
    if ! command -v wscat &> /dev/null; then
        echo -e "${YELLOW}⚠ SKIPPED${NC} (wscat not installed)"
        return 0
    fi
    
    # Test WebSocket connection
    timeout 2 wscat -c "$url" --execute "ping" &>/dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ PASSED${NC}"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

##############################################################################
# Function: Test Service Endpoints
##############################################################################
test_endpoints() {
    echo ""
    echo -e "${BLUE}Testing Service Endpoints:${NC}"
    echo "─────────────────────────────────────────────────────────────"
    
    # Test chat message endpoint
    TOTAL=$((TOTAL + 1))
    echo -n "Testing Chat Message API... "
    response=$(curl -s -X POST http://localhost:3001/api/chat/message \
        -H "Content-Type: application/json" \
        -H "X-Session-ID: test-session-123" \
        -d '{"message":"Hello","userId":"test"}' \
        -w "%{http_code}" -o /dev/null 2>/dev/null)
    
    if [ "$response" = "200" ] || [ "$response" = "201" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $response)"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $response)"
        FAILED=$((FAILED + 1))
    fi
    
    # Test banking service endpoint
    TOTAL=$((TOTAL + 1))
    echo -n "Testing Banking Account API... "
    response=$(curl -s -X GET http://localhost:3005/api/accounts/test-user \
        -H "Content-Type: application/json" \
        -w "%{http_code}" -o /dev/null 2>/dev/null)
    
    if [ "$response" = "200" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $response)"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $response)"
        FAILED=$((FAILED + 1))
    fi
    
    # Test NLP analysis endpoint
    TOTAL=$((TOTAL + 1))
    echo -n "Testing NLP Analysis API... "
    response=$(curl -s -X POST http://localhost:3002/api/nlp/analyze \
        -H "Content-Type: application/json" \
        -d '{"text":"Check my balance"}' \
        -w "%{http_code}" -o /dev/null 2>/dev/null)
    
    if [ "$response" = "200" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $response)"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $response)"
        FAILED=$((FAILED + 1))
    fi
    
    # Test NLU intent detection
    TOTAL=$((TOTAL + 1))
    echo -n "Testing NLU Intent Detection... "
    response=$(curl -s -X POST http://localhost:3003/api/nlu/detect-intent \
        -H "Content-Type: application/json" \
        -d '{"text":"Show my transactions"}' \
        -w "%{http_code}" -o /dev/null 2>/dev/null)
    
    if [ "$response" = "200" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $response)"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $response)"
        FAILED=$((FAILED + 1))
    fi
}

##############################################################################
# Function: Test Service Integration
##############################################################################
test_integration() {
    echo ""
    echo -e "${BLUE}Testing Service Integration:${NC}"
    echo "─────────────────────────────────────────────────────────────"
    
    # Test full chat flow through API Gateway
    TOTAL=$((TOTAL + 1))
    echo -n "Testing End-to-End Chat Flow... "
    
    # Create session
    session_response=$(curl -s -X POST http://localhost:3006/auth/login \
        -H "Content-Type: application/json" \
        -d '{"username":"testuser","password":"testpass"}')
    
    # Send message through gateway
    response=$(curl -s -X POST http://localhost:3001/api/chat/message \
        -H "Content-Type: application/json" \
        -H "X-Session-ID: integration-test-session" \
        -d '{"message":"What is my account balance?","userId":"test"}' \
        -w "%{http_code}" -o /dev/null 2>/dev/null)
    
    if [ "$response" = "200" ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $response)"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $response)"
        FAILED=$((FAILED + 1))
    fi
}

##############################################################################
# Main Test Execution
##############################################################################

echo -e "${YELLOW}Phase 1: Testing Service Health Endpoints${NC}"
echo "─────────────────────────────────────────────────────────────"

# Test all services
for service in "${!SERVICES[@]}"; do
    test_service "$service" "${SERVICES[$service]}"
done

# Test WebSocket
test_websocket "Chat Backend" "ws://localhost:3006"

# Test API endpoints
test_endpoints

# Test integration
test_integration

##############################################################################
# Summary Report
##############################################################################

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                      Test Summary                             ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Total Tests:    ${TOTAL}"
echo -e "${GREEN}Passed:         ${PASSED}${NC}"
echo -e "${RED}Failed:         ${FAILED}${NC}"
echo ""

# Calculate success rate
if [ $TOTAL -gt 0 ]; then
    SUCCESS_RATE=$((PASSED * 100 / TOTAL))
    echo -e "Success Rate:   ${SUCCESS_RATE}%"
fi

echo ""

# Exit with appropriate code
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Please check the services.${NC}"
    echo ""
    echo "Troubleshooting tips:"
    echo "1. Check if all services are running: ./check-services-status.sh"
    echo "2. View service logs: tail -f poc-*/logs/*.log"
    echo "3. Restart failed services: pm2 restart <service-name>"
    exit 1
fi
