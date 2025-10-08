#!/bin/bash

# POC Banking Service API Test Suite
# Tests all endpoints against the running Docker container on port 3005

set -e

BASE_URL="http://localhost:3005"
ADMIN_USER="admin"
ADMIN_PASS="Password123!"
CUSTOMER_USER="customer"
CUSTOMER_PASS="Password123!"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Test result helper
test_result() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $2"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ FAIL${NC}: $2"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

echo "=========================================="
echo "POC Banking Service API Test Suite"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Health Check
echo -e "${YELLOW}[1/25] Testing Health Endpoint${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')
if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q "healthy"; then
    test_result 0 "Health endpoint"
else
    test_result 1 "Health endpoint (HTTP $HTTP_CODE)"
fi
echo ""

# Test 2: Admin Login
echo -e "${YELLOW}[2/25] Testing Admin Login${NC}"
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")
HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -n1)
BODY=$(echo "$LOGIN_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    ADMIN_TOKEN=$(echo "$BODY" | jq -r '.token' 2>/dev/null || echo "")
    if [ -n "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ]; then
        test_result 0 "Admin login"
        echo "   Token: ${ADMIN_TOKEN:0:50}..."
    else
        test_result 1 "Admin login - no token in response"
        echo "   Response: $BODY"
    fi
else
    test_result 1 "Admin login (HTTP $HTTP_CODE)"
    echo "   Response: $BODY"
fi
echo ""

# Test 3: Customer Login
echo -e "${YELLOW}[3/25] Testing Customer Login${NC}"
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$CUSTOMER_USER\",\"password\":\"$CUSTOMER_PASS\"}")
HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -n1)
BODY=$(echo "$LOGIN_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    CUSTOMER_TOKEN=$(echo "$BODY" | jq -r '.token' 2>/dev/null || echo "")
    if [ -n "$CUSTOMER_TOKEN" ] && [ "$CUSTOMER_TOKEN" != "null" ]; then
        test_result 0 "Customer login"
        echo "   Token: ${CUSTOMER_TOKEN:0:50}..."
    else
        test_result 1 "Customer login - no token in response"
    fi
else
    test_result 1 "Customer login (HTTP $HTTP_CODE)"
fi
echo ""

# Exit if no tokens
if [ -z "$ADMIN_TOKEN" ]; then
    echo -e "${RED}Cannot continue without admin token${NC}"
    exit 1
fi

# Test 4: Get All Accounts (Admin)
echo -e "${YELLOW}[4/25] Testing Get All Accounts (Admin)${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/accounts" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    ACCOUNT_COUNT=$(echo "$BODY" | jq -r '.data | length' 2>/dev/null || echo "0")
    test_result 0 "Get all accounts"
    echo "   Found $ACCOUNT_COUNT accounts"
    # Save first account ID for later tests
    ACCOUNT_ID=$(echo "$BODY" | jq -r '.data[0].id' 2>/dev/null || echo "")
else
    test_result 1 "Get all accounts (HTTP $HTTP_CODE)"
    echo "   Response: $BODY"
fi
echo ""

# Test 5: Get Account by ID
if [ -n "$ACCOUNT_ID" ] && [ "$ACCOUNT_ID" != "null" ]; then
    echo -e "${YELLOW}[5/25] Testing Get Account by ID${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/accounts/$ACCOUNT_ID" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        test_result 0 "Get account by ID"
        ACCOUNT_NUMBER=$(echo "$BODY" | jq -r '.data.accountNumber' 2>/dev/null || echo "")
        BALANCE=$(echo "$BODY" | jq -r '.data.balance' 2>/dev/null || echo "")
        echo "   Account: $ACCOUNT_NUMBER, Balance: $BALANCE"
    else
        test_result 1 "Get account by ID (HTTP $HTTP_CODE)"
    fi
else
    test_result 1 "Get account by ID - no account ID available"
fi
echo ""

# Test 6: Get Account Balance
if [ -n "$ACCOUNT_ID" ] && [ "$ACCOUNT_ID" != "null" ]; then
    echo -e "${YELLOW}[6/25] Testing Get Account Balance${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/accounts/$ACCOUNT_ID/balance" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        test_result 0 "Get account balance"
    else
        test_result 1 "Get account balance (HTTP $HTTP_CODE)"
    fi
else
    test_result 1 "Get account balance - no account ID available"
fi
echo ""

# Test 7: Get Transactions
echo -e "${YELLOW}[7/25] Testing Get All Transactions${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/transactions" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    TRANSACTION_COUNT=$(echo "$BODY" | jq -r '.data | length' 2>/dev/null || echo "0")
    test_result 0 "Get all transactions"
    echo "   Found $TRANSACTION_COUNT transactions"
    TRANSACTION_ID=$(echo "$BODY" | jq -r '.data[0].id' 2>/dev/null || echo "")
else
    test_result 1 "Get all transactions (HTTP $HTTP_CODE)"
fi
echo ""

# Test 8: Get Transaction by ID
if [ -n "$TRANSACTION_ID" ] && [ "$TRANSACTION_ID" != "null" ]; then
    echo -e "${YELLOW}[8/25] Testing Get Transaction by ID${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/transactions/$TRANSACTION_ID" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        test_result 0 "Get transaction by ID"
    else
        test_result 1 "Get transaction by ID (HTTP $HTTP_CODE)"
    fi
else
    test_result 1 "Get transaction by ID - no transaction ID available"
fi
echo ""

# Test 9: Get Transaction Categories
echo -e "${YELLOW}[9/25] Testing Get Transaction Categories${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/transactions/categories" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

if [ "$HTTP_CODE" = "200" ]; then
    test_result 0 "Get transaction categories"
else
    test_result 1 "Get transaction categories (HTTP $HTTP_CODE)"
fi
echo ""

# Test 10: Create Transaction
if [ -n "$ACCOUNT_ID" ] && [ "$ACCOUNT_ID" != "null" ]; then
    echo -e "${YELLOW}[10/25] Testing Create Transaction${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/transactions" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"accountId\": \"$ACCOUNT_ID\",
            \"type\": \"purchase\",
            \"amount\": 25.99,
            \"description\": \"Test Purchase\",
            \"merchantName\": \"Test Merchant\"
        }")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
        test_result 0 "Create transaction"
        NEW_TRANSACTION_ID=$(echo "$BODY" | jq -r '.data.id' 2>/dev/null || echo "")
    else
        test_result 1 "Create transaction (HTTP $HTTP_CODE)"
    fi
else
    test_result 1 "Create transaction - no account ID available"
fi
echo ""

# Test 11: Get All Cards
echo -e "${YELLOW}[11/25] Testing Get All Cards${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/cards" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    CARD_COUNT=$(echo "$BODY" | jq -r '.data | length' 2>/dev/null || echo "0")
    test_result 0 "Get all cards"
    echo "   Found $CARD_COUNT cards"
    CARD_ID=$(echo "$BODY" | jq -r '.data[0].id' 2>/dev/null || echo "")
else
    test_result 1 "Get all cards (HTTP $HTTP_CODE)"
fi
echo ""

# Test 12: Get Card by ID
if [ -n "$CARD_ID" ] && [ "$CARD_ID" != "null" ]; then
    echo -e "${YELLOW}[12/25] Testing Get Card by ID${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/cards/$CARD_ID" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        test_result 0 "Get card by ID"
    else
        test_result 1 "Get card by ID (HTTP $HTTP_CODE)"
    fi
else
    test_result 1 "Get card by ID - no card ID available"
fi
echo ""

# Test 13: Block Card
if [ -n "$CARD_ID" ] && [ "$CARD_ID" != "null" ]; then
    echo -e "${YELLOW}[13/25] Testing Block Card${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/v1/cards/$CARD_ID/block" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"reason\": \"Test block\"}")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        test_result 0 "Block card"
    else
        test_result 1 "Block card (HTTP $HTTP_CODE)"
    fi
else
    test_result 1 "Block card - no card ID available"
fi
echo ""

# Test 14: Activate Card (unblock)
if [ -n "$CARD_ID" ] && [ "$CARD_ID" != "null" ]; then
    echo -e "${YELLOW}[14/25] Testing Activate Card${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/v1/cards/$CARD_ID/activate" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        test_result 0 "Activate card"
    else
        test_result 1 "Activate card (HTTP $HTTP_CODE)"
    fi
else
    test_result 1 "Activate card - no card ID available"
fi
echo ""

# Test 15: Get All Transfers
echo -e "${YELLOW}[15/25] Testing Get All Transfers${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/transfers" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    TRANSFER_COUNT=$(echo "$BODY" | jq -r '.data | length' 2>/dev/null || echo "0")
    test_result 0 "Get all transfers"
    echo "   Found $TRANSFER_COUNT transfers"
    TRANSFER_ID=$(echo "$BODY" | jq -r '.data[0].id' 2>/dev/null || echo "")
else
    test_result 1 "Get all transfers (HTTP $HTTP_CODE)"
fi
echo ""

# Test 16: Get Transfer by ID
if [ -n "$TRANSFER_ID" ] && [ "$TRANSFER_ID" != "null" ]; then
    echo -e "${YELLOW}[16/25] Testing Get Transfer by ID${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/transfers/$TRANSFER_ID" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        test_result 0 "Get transfer by ID"
    else
        test_result 1 "Get transfer by ID (HTTP $HTTP_CODE)"
    fi
else
    test_result 1 "Get transfer by ID - no transfer ID available"
fi
echo ""

# Test 17: Create Internal Transfer
if [ -n "$ACCOUNT_ID" ] && [ "$ACCOUNT_ID" != "null" ]; then
    echo -e "${YELLOW}[17/25] Testing Create Internal Transfer${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/transfers/internal" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"fromAccountId\": \"$ACCOUNT_ID\",
            \"toAccountId\": \"$ACCOUNT_ID\",
            \"amount\": 10.00,
            \"description\": \"Test internal transfer\"
        }")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
        test_result 0 "Create internal transfer"
    else
        test_result 1 "Create internal transfer (HTTP $HTTP_CODE)"
    fi
else
    test_result 1 "Create internal transfer - no account ID available"
fi
echo ""

# Test 18: Get All Fraud Alerts
echo -e "${YELLOW}[18/25] Testing Get All Fraud Alerts${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/fraud/alerts" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    ALERT_COUNT=$(echo "$BODY" | jq -r '.data | length' 2>/dev/null || echo "0")
    test_result 0 "Get all fraud alerts"
    echo "   Found $ALERT_COUNT alerts"
    ALERT_ID=$(echo "$BODY" | jq -r '.data[0].id' 2>/dev/null || echo "")
else
    test_result 1 "Get all fraud alerts (HTTP $HTTP_CODE)"
fi
echo ""

# Test 19: Get Fraud Alert by ID
if [ -n "$ALERT_ID" ] && [ "$ALERT_ID" != "null" ]; then
    echo -e "${YELLOW}[19/25] Testing Get Fraud Alert by ID${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/fraud/alerts/$ALERT_ID" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        test_result 0 "Get fraud alert by ID"
    else
        test_result 1 "Get fraud alert by ID (HTTP $HTTP_CODE)"
    fi
else
    test_result 1 "Get fraud alert by ID - no alert ID available"
fi
echo ""

# Test 20: Create Investigation
if [ -n "$ALERT_ID" ] && [ "$ALERT_ID" != "null" ]; then
    echo -e "${YELLOW}[20/25] Testing Create Investigation${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/fraud/investigations" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"alertId\": \"$ALERT_ID\",
            \"priority\": \"high\",
            \"notes\": \"Test investigation\"
        }")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
        test_result 0 "Create investigation"
    else
        test_result 1 "Create investigation (HTTP $HTTP_CODE)"
    fi
else
    test_result 1 "Create investigation - no alert ID available"
fi
echo ""

# Test 21: Get All Disputes
echo -e "${YELLOW}[21/25] Testing Get All Disputes${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/disputes" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
    DISPUTE_COUNT=$(echo "$BODY" | jq -r '.data | length' 2>/dev/null || echo "0")
    test_result 0 "Get all disputes"
    echo "   Found $DISPUTE_COUNT disputes"
    DISPUTE_ID=$(echo "$BODY" | jq -r '.data[0].id' 2>/dev/null || echo "")
else
    test_result 1 "Get all disputes (HTTP $HTTP_CODE)"
fi
echo ""

# Test 22: Get Dispute by ID
if [ -n "$DISPUTE_ID" ] && [ "$DISPUTE_ID" != "null" ]; then
    echo -e "${YELLOW}[22/25] Testing Get Dispute by ID${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/disputes/$DISPUTE_ID" \
        -H "Authorization: Bearer $ADMIN_TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "200" ]; then
        test_result 0 "Get dispute by ID"
    else
        test_result 1 "Get dispute by ID (HTTP $HTTP_CODE)"
    fi
else
    test_result 1 "Get dispute by ID - no dispute ID available"
fi
echo ""

# Test 23: Create Dispute
if [ -n "$TRANSACTION_ID" ] && [ "$TRANSACTION_ID" != "null" ]; then
    echo -e "${YELLOW}[23/25] Testing Create Dispute${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/disputes" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"transactionId\": \"$TRANSACTION_ID\",
            \"reason\": \"unauthorized_transaction\",
            \"description\": \"Test dispute creation\"
        }")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
        test_result 0 "Create dispute"
        NEW_DISPUTE_ID=$(echo "$BODY" | jq -r '.data.id' 2>/dev/null || echo "")
    else
        test_result 1 "Create dispute (HTTP $HTTP_CODE)"
    fi
else
    test_result 1 "Create dispute - no transaction ID available"
fi
echo ""

# Test 24: Add Evidence to Dispute
if [ -n "$NEW_DISPUTE_ID" ] && [ "$NEW_DISPUTE_ID" != "null" ]; then
    echo -e "${YELLOW}[24/25] Testing Add Evidence to Dispute${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/disputes/$NEW_DISPUTE_ID/evidence" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"type\": \"document\",
            \"description\": \"Test evidence\",
            \"url\": \"https://example.com/evidence.pdf\"
        }")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
        test_result 0 "Add evidence to dispute"
    else
        test_result 1 "Add evidence to dispute (HTTP $HTTP_CODE)"
    fi
else
    test_result 1 "Add evidence to dispute - no dispute ID available"
fi
echo ""

# Test 25: RBAC - Customer accessing admin-only endpoint (should fail)
if [ -n "$CUSTOMER_TOKEN" ]; then
    echo -e "${YELLOW}[25/25] Testing RBAC - Customer accessing all accounts (should fail)${NC}"
    RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/accounts" \
        -H "Authorization: Bearer $CUSTOMER_TOKEN")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "401" ]; then
        test_result 0 "RBAC enforcement (correctly blocked)"
    else
        test_result 1 "RBAC enforcement (should block but got HTTP $HTTP_CODE)"
    fi
else
    test_result 1 "RBAC enforcement - no customer token available"
fi
echo ""

# Final Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "Total Tests:  $TOTAL_TESTS"
echo -e "${GREEN}Passed:       $PASSED_TESTS${NC}"
echo -e "${RED}Failed:       $FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
