#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3005/api/v1"
PASSED=0
FAILED=0
TOKEN=""
USER_ID=""
ACCOUNT_ID=""
CARD_ID=""
TRANSACTION_ID=""

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Banking Service API Test Suite${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Test 1: Health Check
echo -e "${YELLOW}Test 1: Health Check${NC}"
RESPONSE=$(curl -s http://localhost:3005/health)
if echo "$RESPONSE" | grep -q "healthy"; then
    echo -e "${GREEN}✓ PASSED${NC} - Service is healthy\n"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC} - Service is not healthy\n"
    ((FAILED++))
fi

# Test 2: Authentication
echo -e "${YELLOW}Test 2: User Authentication${NC}"
AUTH_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"username":"admin","password":"Password123!"}')

TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.data.tokens.accessToken')
USER_ID=$(echo "$AUTH_RESPONSE" | jq -r '.data.user.userId')

if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
    echo -e "${GREEN}✓ PASSED${NC} - Authentication successful"
    echo -e "  User ID: $USER_ID\n"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC} - Authentication failed"
    echo "$AUTH_RESPONSE" | jq '.'
    echo ""
    ((FAILED++))
fi

# Test 3: Get All Accounts
echo -e "${YELLOW}Test 3: Get All Accounts${NC}"
ACCOUNTS_RESPONSE=$(curl -s -X GET "$BASE_URL/accounts" \
    -H "Authorization: Bearer $TOKEN")

ACCOUNT_COUNT=$(echo "$ACCOUNTS_RESPONSE" | jq -r '.data | length')
if [ "$ACCOUNT_COUNT" != "null" ]; then
    echo -e "${GREEN}✓ PASSED${NC} - Retrieved accounts"
    echo -e "  Account count: $ACCOUNT_COUNT"
    ACCOUNT_ID=$(echo "$ACCOUNTS_RESPONSE" | jq -r '.data[0].account_id // .data[0].accountId')
    echo -e "  First account ID: $ACCOUNT_ID\n"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC} - Failed to get accounts"
    echo "$ACCOUNTS_RESPONSE" | jq '.'
    echo ""
    ((FAILED++))
fi

# Test 4: Get Account Balance
if [ -n "$ACCOUNT_ID" ] && [ "$ACCOUNT_ID" != "null" ]; then
    echo -e "${YELLOW}Test 4: Get Account Balance${NC}"
    BALANCE_RESPONSE=$(curl -s -X GET "$BASE_URL/accounts/$ACCOUNT_ID/balance" \
        -H "Authorization: Bearer $TOKEN")
    
    BALANCE=$(echo "$BALANCE_RESPONSE" | jq -r '.data.balance // .data.currentBalance')
    if [ "$BALANCE" != "null" ]; then
        echo -e "${GREEN}✓ PASSED${NC} - Retrieved account balance"
        echo -e "  Balance: \$$BALANCE\n"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC} - Failed to get balance"
        echo "$BALANCE_RESPONSE" | jq '.'
        echo ""
        ((FAILED++))
    fi
else
    echo -e "${YELLOW}Test 4: Get Account Balance - SKIPPED (no account ID)\n${NC}"
fi

# Test 5: Get All Transactions
echo -e "${YELLOW}Test 5: Get All Transactions${NC}"
TX_RESPONSE=$(curl -s -X GET "$BASE_URL/transactions?limit=10" \
    -H "Authorization: Bearer $TOKEN")

TX_COUNT=$(echo "$TX_RESPONSE" | jq -r '.data | length')
if [ "$TX_COUNT" != "null" ]; then
    echo -e "${GREEN}✓ PASSED${NC} - Retrieved transactions"
    echo -e "  Transaction count: $TX_COUNT"
    TRANSACTION_ID=$(echo "$TX_RESPONSE" | jq -r '.data[0].transaction_id // .data[0].transactionId')
    echo -e "  First transaction ID: $TRANSACTION_ID\n"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC} - Failed to get transactions"
    echo "$TX_RESPONSE" | jq '.'
    echo ""
    ((FAILED++))
fi

# Test 6: Get Transaction Details
if [ -n "$TRANSACTION_ID" ] && [ "$TRANSACTION_ID" != "null" ]; then
    echo -e "${YELLOW}Test 6: Get Transaction Details${NC}"
    TX_DETAIL_RESPONSE=$(curl -s -X GET "$BASE_URL/transactions/$TRANSACTION_ID" \
        -H "Authorization: Bearer $TOKEN")
    
    TX_AMOUNT=$(echo "$TX_DETAIL_RESPONSE" | jq -r '.data.amount')
    if [ "$TX_AMOUNT" != "null" ]; then
        echo -e "${GREEN}✓ PASSED${NC} - Retrieved transaction details"
        echo -e "  Amount: \$$TX_AMOUNT\n"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC} - Failed to get transaction details"
        echo "$TX_DETAIL_RESPONSE" | jq '.'
        echo ""
        ((FAILED++))
    fi
else
    echo -e "${YELLOW}Test 6: Get Transaction Details - SKIPPED (no transaction ID)\n${NC}"
fi

# Test 7: Get All Cards
echo -e "${YELLOW}Test 7: Get All Cards${NC}"
CARDS_RESPONSE=$(curl -s -X GET "$BASE_URL/cards" \
    -H "Authorization: Bearer $TOKEN")

CARD_COUNT=$(echo "$CARDS_RESPONSE" | jq -r '.data | length')
if [ "$CARD_COUNT" != "null" ]; then
    echo -e "${GREEN}✓ PASSED${NC} - Retrieved cards"
    echo -e "  Card count: $CARD_COUNT"
    CARD_ID=$(echo "$CARDS_RESPONSE" | jq -r '.data[0].card_id // .data[0].cardId')
    echo -e "  First card ID: $CARD_ID\n"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC} - Failed to get cards"
    echo "$CARDS_RESPONSE" | jq '.'
    echo ""
    ((FAILED++))
fi

# Test 8: Get All Transfers
echo -e "${YELLOW}Test 8: Get All Transfers${NC}"
TRANSFERS_RESPONSE=$(curl -s -X GET "$BASE_URL/transfers" \
    -H "Authorization: Bearer $TOKEN")

TRANSFER_COUNT=$(echo "$TRANSFERS_RESPONSE" | jq -r '.data | length')
if [ "$TRANSFER_COUNT" != "null" ]; then
    echo -e "${GREEN}✓ PASSED${NC} - Retrieved transfers"
    echo -e "  Transfer count: $TRANSFER_COUNT\n"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC} - Failed to get transfers"
    echo "$TRANSFERS_RESPONSE" | jq '.'
    echo ""
    ((FAILED++))
fi

# Test 9: Get Fraud Alerts
echo -e "${YELLOW}Test 9: Get Fraud Alerts${NC}"
FRAUD_RESPONSE=$(curl -s -X GET "$BASE_URL/fraud/alerts" \
    -H "Authorization: Bearer $TOKEN")

FRAUD_COUNT=$(echo "$FRAUD_RESPONSE" | jq -r '.data | length')
if [ "$FRAUD_COUNT" != "null" ]; then
    echo -e "${GREEN}✓ PASSED${NC} - Retrieved fraud alerts"
    echo -e "  Fraud alert count: $FRAUD_COUNT\n"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC} - Failed to get fraud alerts"
    echo "$FRAUD_RESPONSE" | jq '.'
    echo ""
    ((FAILED++))
fi

# Test 10: Get All Disputes
echo -e "${YELLOW}Test 10: Get All Disputes${NC}"
DISPUTES_RESPONSE=$(curl -s -X GET "$BASE_URL/disputes" \
    -H "Authorization: Bearer $TOKEN")

DISPUTE_COUNT=$(echo "$DISPUTES_RESPONSE" | jq -r '.data | length')
if [ "$DISPUTE_COUNT" != "null" ]; then
    echo -e "${GREEN}✓ PASSED${NC} - Retrieved disputes"
    echo -e "  Dispute count: $DISPUTE_COUNT\n"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC} - Failed to get disputes"
    echo "$DISPUTES_RESPONSE" | jq '.'
    echo ""
    ((FAILED++))
fi

# Test 11: API Documentation
echo -e "${YELLOW}Test 11: API Documentation Endpoint${NC}"
DOCS_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3005/)
HTTP_CODE=$(echo "$DOCS_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ PASSED${NC} - API documentation accessible"
    echo -e "  HTTP Status: $HTTP_CODE\n"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC} - API documentation not accessible"
    echo -e "  HTTP Status: $HTTP_CODE\n"
    ((FAILED++))
fi

# Test 12: OpenAPI Spec
echo -e "${YELLOW}Test 12: OpenAPI Specification${NC}"
OPENAPI_RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3005/openapi.yaml)
HTTP_CODE=$(echo "$OPENAPI_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ PASSED${NC} - OpenAPI spec accessible"
    echo -e "  HTTP Status: $HTTP_CODE\n"
    ((PASSED++))
else
    echo -e "${RED}✗ FAILED${NC} - OpenAPI spec not accessible"
    echo -e "  HTTP Status: $HTTP_CODE\n"
    ((FAILED++))
fi

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Total Tests:  $((PASSED + FAILED))"
echo -e "${GREEN}Passed:       $PASSED${NC}"
echo -e "${RED}Failed:       $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed!${NC}\n"
    exit 0
else
    echo -e "\n${RED}❌ Some tests failed${NC}\n"
    exit 1
fi
