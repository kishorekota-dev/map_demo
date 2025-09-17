#!/bin/bash

# POC Banking API Test Script
# Tests the banking functionality implemented in poc-backend

echo "🏦 Testing POC Banking API Implementation"
echo "=========================================="

# Server configuration
BASE_URL="http://localhost:3001"
API_BASE="$BASE_URL/api"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to test API endpoint
test_endpoint() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local description="$4"
    
    echo -e "\n${BLUE}Testing:${NC} $description"
    echo -e "${YELLOW}$method${NC} $endpoint"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$endpoint")
    else
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$endpoint")
    fi
    
    http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
    response_body=$(echo "$response" | sed '/HTTP_STATUS:/d')
    
    if [ "$http_status" -eq 200 ]; then
        echo -e "${GREEN}✓ Success${NC} (HTTP $http_status)"
        echo "$response_body" | jq '.' 2>/dev/null || echo "$response_body"
    else
        echo -e "${RED}✗ Failed${NC} (HTTP $http_status)"
        echo "$response_body"
    fi
}

# Function to test banking chat
test_banking_chat() {
    local message="$1"
    local description="$2"
    
    echo -e "\n${BLUE}Banking Chat:${NC} $description"
    echo -e "${YELLOW}Message:${NC} \"$message\""
    
    data=$(jq -n --arg msg "$message" '{message: $msg, userId: "user123"}')
    
    response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -H "x-session-id: test-session-123" \
        -d "$data" \
        "$API_BASE/banking/chat")
    
    http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
    response_body=$(echo "$response" | sed '/HTTP_STATUS:/d')
    
    if [ "$http_status" -eq 200 ]; then
        echo -e "${GREEN}✓ Response received${NC}"
        echo "$response_body" | jq '.data.response' 2>/dev/null || echo "$response_body"
    else
        echo -e "${RED}✗ Failed${NC} (HTTP $http_status)"
        echo "$response_body"
    fi
}

# Check if server is running
echo -e "\n${BLUE}1. Checking server status...${NC}"
if curl -s "$BASE_URL/health" > /dev/null; then
    echo -e "${GREEN}✓ Server is running${NC}"
else
    echo -e "${RED}✗ Server is not running. Please start the server first.${NC}"
    echo "Run: cd poc-backend && npm start"
    exit 1
fi

# Check if jq is available for JSON parsing
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠ jq not found. Installing for better JSON output...${NC}"
    # Try to install jq if possible
    if command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y jq
    elif command -v brew &> /dev/null; then
        brew install jq
    else
        echo -e "${YELLOW}⚠ Please install jq for better JSON formatting${NC}"
    fi
fi

# Test Banking API Endpoints
echo -e "\n${BLUE}2. Testing Banking API Endpoints${NC}"
echo "================================"

# Test banking service status
test_endpoint "GET" "$API_BASE/banking/status" "" "Banking service status"

# Test banking help
test_endpoint "GET" "$API_BASE/banking/help" "" "Banking help information"

# Test account balance
test_endpoint "GET" "$API_BASE/banking/balance/user123" "" "Account balance for user123"

# Test account information
test_endpoint "GET" "$API_BASE/banking/account/user123" "" "Account information for user123"

# Test transaction history
test_endpoint "GET" "$API_BASE/banking/transactions/user123?limit=5" "" "Transaction history (limit 5)"

# Test card information
test_endpoint "GET" "$API_BASE/banking/cards/user123" "" "Card information for user123"

# Test loan information
test_endpoint "GET" "$API_BASE/banking/loans/user123" "" "Loan information for user123"

# Test intent detection
echo -e "\n${BLUE}3. Testing Intent Detection${NC}"
echo "============================"

intent_data='{"message": "What is my account balance?"}'
test_endpoint "POST" "$API_BASE/banking/intent" "$intent_data" "Intent detection for balance inquiry"

intent_data='{"message": "Show me my recent transactions"}'
test_endpoint "POST" "$API_BASE/banking/intent" "$intent_data" "Intent detection for transaction history"

# Test Banking Chat Functionality
echo -e "\n${BLUE}4. Testing Banking Chat Interface${NC}"
echo "=================================="

# Test various banking chat messages
test_banking_chat "What is my balance?" "Balance inquiry"
test_banking_chat "Show my account information" "Account information request"
test_banking_chat "I want to see my recent transactions" "Transaction history request"
test_banking_chat "Tell me about my cards" "Card information request"
test_banking_chat "What loans do I have?" "Loan information request"
test_banking_chat "Banking help" "Banking help request"
test_banking_chat "Hello, how are you?" "Non-banking message"
test_banking_chat "I want to transfer money" "Complex banking request"

# Test Regular Chat with Banking Integration
echo -e "\n${BLUE}5. Testing Regular Chat with Banking Integration${NC}"
echo "================================================"

chat_data='{"message": "Check my balance", "userId": "user123"}'
test_endpoint "POST" "$API_BASE/chat/banking" "$chat_data" "Banking chat through regular chat endpoint"

# Test Transfer Money (should require additional info)
echo -e "\n${BLUE}6. Testing Transfer Money (Complex Operations)${NC}"
echo "=============================================="

transfer_data='{"toAccount": "ACC-999", "amount": 100, "description": "Test transfer", "userId": "user123"}'
test_endpoint "POST" "$API_BASE/banking/transfer/user123" "$transfer_data" "Money transfer request"

# Test Bill Payment
bill_data='{"billType": "electricity", "amount": 150, "accountNumber": "ELEC-123", "userId": "user123"}'
test_endpoint "POST" "$API_BASE/banking/bills/pay" "$bill_data" "Bill payment request"

# Test Card Status Update
card_data='{"action": "block", "userId": "user123"}'
test_endpoint "PUT" "$API_BASE/banking/cards/CARD-001/status" "$card_data" "Block card request"

# Summary
echo -e "\n${BLUE}7. Test Summary${NC}"
echo "==============="
echo -e "${GREEN}✓ Banking API tests completed${NC}"
echo ""
echo "Key Features Tested:"
echo "• Banking service status and health"
echo "• Account balance and information"
echo "• Transaction history"
echo "• Card and loan information"
echo "• Banking intent detection"
echo "• Natural language banking chat"
echo "• Money transfers and bill payments"
echo "• Card management operations"
echo ""
echo "🏦 POC Banking implementation is ready for use!"
echo ""
echo "Usage Examples:"
echo "• Chat: POST $API_BASE/banking/chat"
echo "• Balance: GET $API_BASE/banking/balance/:userId"
echo "• Transactions: GET $API_BASE/banking/transactions/:userId"
echo "• Help: GET $API_BASE/banking/help"