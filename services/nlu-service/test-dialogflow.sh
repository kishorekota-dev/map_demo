#!/bin/bash

###############################################################################
# DialogFlow Integration - Test Script
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Base URL
BASE_URL="http://localhost:3003"
SESSION_ID="test-$(date +%s)"

# Function to print messages
print_info() { echo -e "${BLUE}ℹ ${1}${NC}"; }
print_success() { echo -e "${GREEN}✓ ${1}${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ ${1}${NC}"; }
print_error() { echo -e "${RED}✗ ${1}${NC}"; }

# Function to test endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo -e "${BLUE}Testing: ${description}${NC}"
    
    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "${BASE_URL}${endpoint}")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "${BASE_URL}${endpoint}" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        print_success "Success (HTTP $http_code)"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        print_error "Failed (HTTP $http_code)"
        echo "$body"
    fi
    
    echo ""
}

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}DialogFlow Integration Tests${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""
echo "Session ID: $SESSION_ID"
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Health check
test_endpoint "GET" "/health" "" "Health Check"

# Test 2: DialogFlow status
test_endpoint "GET" "/api/nlu/dialogflow/status" "" "DialogFlow Status"

# Test 3: Balance inquiry
test_endpoint "POST" "/api/nlu/analyze" \
    "{\"user_input\":\"What is my account balance?\",\"sessionId\":\"$SESSION_ID\"}" \
    "Balance Inquiry"

# Test 4: Transfer money
test_endpoint "POST" "/api/nlu/analyze" \
    "{\"user_input\":\"Transfer 500 dollars to savings account\",\"sessionId\":\"$SESSION_ID\"}" \
    "Transfer Money"

# Test 5: Transaction history
test_endpoint "POST" "/api/nlu/analyze" \
    "{\"user_input\":\"Show me my last 10 transactions\",\"sessionId\":\"$SESSION_ID\"}" \
    "Transaction History"

# Test 6: Card operations
test_endpoint "POST" "/api/nlu/analyze" \
    "{\"user_input\":\"I want to block my credit card\",\"sessionId\":\"$SESSION_ID\"}" \
    "Block Card"

# Test 7: Loan inquiry
test_endpoint "POST" "/api/nlu/analyze" \
    "{\"user_input\":\"How much is my loan payment?\",\"sessionId\":\"$SESSION_ID\"}" \
    "Loan Payment Inquiry"

# Test 8: Banking intent detection
test_endpoint "POST" "/api/nlu/intents/banking" \
    "{\"user_input\":\"Check my checking account balance\"}" \
    "Banking Intent Detection"

# Test 9: Entity extraction
test_endpoint "POST" "/api/nlu/entities/extract" \
    "{\"text\":\"Transfer 1000 dollars to John's account\"}" \
    "Entity Extraction"

# Test 10: Context management
test_endpoint "POST" "/api/nlu/context" \
    "{\"sessionId\":\"$SESSION_ID\",\"contextName\":\"transfer-context\",\"parameters\":{\"amount\":500,\"recipient\":\"savings\"}}" \
    "Set Context"

test_endpoint "GET" "/api/nlu/context?sessionId=$SESSION_ID" "" "Get Context"

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✓ All Tests Complete${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""

# Summary
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Review test results above"
echo "2. Verify DialogFlow integration is working (enabled: true)"
echo "3. Check intent confidence scores (should be > 0.7)"
echo "4. Monitor logs: docker compose logs -f poc-nlu-service"
echo "5. Test through Chat Backend: http://localhost:3006"
echo ""
