#!/bin/bash

# Test script for NLU Service

echo "======================================"
echo "POC NLU Service - Integration Tests"
echo "======================================"
echo ""

NLU_SERVICE_URL="${NLU_SERVICE_URL:-http://localhost:3003}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to test endpoint
test_endpoint() {
    local test_name=$1
    local endpoint=$2
    local method=$3
    local data=$4
    
    echo -n "Testing: $test_name... "
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST "$NLU_SERVICE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    else
        response=$(curl -s -w "\n%{http_code}" -X GET "$NLU_SERVICE_URL$endpoint")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)"
        echo "Response: $(echo $body | jq -c '.' 2>/dev/null || echo $body)"
        echo ""
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC} (HTTP $http_code)"
        echo "Response: $body"
        echo ""
        ((TESTS_FAILED++))
    fi
}

echo "1. Testing Health Check"
echo "----------------------"
test_endpoint "Health Check" "/health" "GET"

echo "2. Testing Service Info"
echo "----------------------"
test_endpoint "Service Info" "/api" "GET"

echo "3. Testing Main Analyze Endpoint (Balance Query)"
echo "------------------------------------------------"
test_endpoint "Analyze - Check Balance" "/api/nlu/analyze" "POST" '{
  "user_input": "What is my account balance?",
  "sessionId": "test-session-001",
  "userId": "test-user-001"
}'

echo "4. Testing Analyze Endpoint (Transfer Money)"
echo "-------------------------------------------"
test_endpoint "Analyze - Transfer Money" "/api/nlu/analyze" "POST" '{
  "user_input": "I want to transfer $500 to John",
  "sessionId": "test-session-002",
  "userId": "test-user-002"
}'

echo "5. Testing Analyze Endpoint (View Transactions)"
echo "----------------------------------------------"
test_endpoint "Analyze - View Transactions" "/api/nlu/analyze" "POST" '{
  "user_input": "Show me my recent transactions",
  "sessionId": "test-session-003",
  "userId": "test-user-003"
}'

echo "6. Testing DialogFlow Direct Endpoint"
echo "------------------------------------"
test_endpoint "DialogFlow Direct" "/api/nlu/dialogflow" "POST" '{
  "message": "What is my savings account balance?",
  "sessionId": "test-session-004"
}'

echo "7. Testing Banking Intent Detection"
echo "----------------------------------"
test_endpoint "Banking Intent" "/api/nlu/banking" "POST" '{
  "message": "I need to check my balance"
}'

echo "8. Testing Entity Extraction"
echo "---------------------------"
test_endpoint "Entity Extraction" "/api/nlu/entities" "POST" '{
  "message": "Transfer $1000 from checking to savings on December 15th",
  "domain": "banking"
}'

echo "9. Testing Available Intents"
echo "---------------------------"
test_endpoint "Available Intents" "/api/nlu/intents/available" "GET"

echo "10. Testing DialogFlow Status"
echo "----------------------------"
test_endpoint "DialogFlow Status" "/api/nlu/dialogflow/status" "GET"

echo ""
echo "======================================"
echo "Test Summary"
echo "======================================"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! ✓${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed! ✗${NC}"
    exit 1
fi
