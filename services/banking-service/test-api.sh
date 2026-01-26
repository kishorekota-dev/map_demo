#!/bin/bash

# POC Banking Service - Comprehensive API Test Suite
# Tests all endpoints with proper authentication and RBAC

set -e  # Exit on error

BASE_URL="${BASE_URL:-http://localhost:3005}"
API_VERSION="v1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
PASSED=0
FAILED=0

# Test results array
declare -a FAILED_TESTS

# Function to print colored output
print_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
    ((PASSED++))
}

print_failure() {
    echo -e "${RED}[✗]${NC} $1"
    FAILED_TESTS+=("$1")
    ((FAILED++))
}

print_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

print_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Function to make API calls and check response
api_call() {
    local METHOD=$1
    local ENDPOINT=$2
    local DATA=$3
    local TOKEN=$4
    local EXPECTED_STATUS=$5
    local TEST_NAME=$6

    print_test "$TEST_NAME"

    local HEADERS=(-H "Content-Type: application/json")
    if [ ! -z "$TOKEN" ]; then
        HEADERS+=(-H "Authorization: Bearer $TOKEN")
    fi

    if [ "$METHOD" = "GET" ] || [ "$METHOD" = "DELETE" ]; then
        RESPONSE=$(curl -s -w "\n%{http_code}" -X $METHOD "${BASE_URL}${ENDPOINT}" "${HEADERS[@]}")
    else
        RESPONSE=$(curl -s -w "\n%{http_code}" -X $METHOD "${BASE_URL}${ENDPOINT}" "${HEADERS[@]}" -d "$DATA")
    fi

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" = "$EXPECTED_STATUS" ]; then
        print_success "$TEST_NAME - Status: $HTTP_CODE"
        echo "$BODY"
        echo "$BODY"
        return 0
    else
        print_failure "$TEST_NAME - Expected: $EXPECTED_STATUS, Got: $HTTP_CODE"
        echo "Response: $BODY"
        return 1
    fi
}

# Wait for service to be ready
print_section "Service Health Check"
print_info "Waiting for service to be ready..."
RETRIES=0
MAX_RETRIES=30
while [ $RETRIES -lt $MAX_RETRIES ]; do
    if curl -s "${BASE_URL}/health" > /dev/null 2>&1; then
        print_success "Service is ready!"
        curl -s "${BASE_URL}/health" | jq '.'
        break
    fi
    ((RETRIES++))
    sleep 2
done

if [ $RETRIES -eq $MAX_RETRIES ]; then
    print_failure "Service failed to start"
    exit 1
fi

# ========================================
# Authentication Tests
# ========================================
print_section "1. Authentication Tests"

# Test 1: Login with admin user
print_test "Login as admin"
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/${API_VERSION}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "Password123!"
  }')

if echo "$LOGIN_RESPONSE" | jq -e '.data.accessToken' > /dev/null 2>&1; then
    ADMIN_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken')
    ADMIN_USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.user_id')
    print_success "Admin login successful"
    print_info "Admin User ID: $ADMIN_USER_ID"
    print_info "Token length: ${#ADMIN_TOKEN}"
else
    print_failure "Admin login failed"
    echo "$LOGIN_RESPONSE"
    exit 1
fi

# Test 2: Login with manager user
print_test "Login as manager"
MANAGER_LOGIN=$(curl -s -X POST "${BASE_URL}/api/${API_VERSION}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "manager",
    "password": "Password123!"
  }')

if echo "$MANAGER_LOGIN" | jq -e '.data.accessToken' > /dev/null 2>&1; then
    MANAGER_TOKEN=$(echo "$MANAGER_LOGIN" | jq -r '.data.accessToken')
    print_success "Manager login successful"
else
    print_failure "Manager login failed"
fi

# Test 3: Get user profile
print_test "Get admin profile"
PROFILE=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/auth/me" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$PROFILE" | jq -e '.data.user_id' > /dev/null 2>&1; then
    print_success "Profile retrieved successfully"
    echo "$PROFILE" | jq '.data'
else
    print_failure "Failed to get profile"
fi

# Test 4: Test invalid credentials
print_test "Test invalid login"
INVALID_LOGIN=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/${API_VERSION}/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "wrong"}')

INVALID_STATUS=$(echo "$INVALID_LOGIN" | tail -n1)
if [ "$INVALID_STATUS" = "401" ]; then
    print_success "Invalid login correctly rejected"
else
    print_failure "Invalid login should return 401, got: $INVALID_STATUS"
fi

# ========================================
# Account Tests
# ========================================
print_section "2. Account Tests"

# Test 5: Get all accounts
print_test "Get all accounts for user"
ACCOUNTS=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/accounts" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$ACCOUNTS" | jq -e '.data' > /dev/null 2>&1; then
    ACCOUNT_COUNT=$(echo "$ACCOUNTS" | jq '.data | length')
    print_success "Retrieved $ACCOUNT_COUNT accounts"
    
    # Store first account ID for further tests
    if [ "$ACCOUNT_COUNT" -gt 0 ]; then
        FIRST_ACCOUNT_ID=$(echo "$ACCOUNTS" | jq -r '.data[0].account_id')
        print_info "Using account ID: $FIRST_ACCOUNT_ID"
    fi
else
    print_failure "Failed to get accounts"
fi

# Test 6: Get specific account
if [ ! -z "$FIRST_ACCOUNT_ID" ]; then
    print_test "Get account by ID"
    ACCOUNT=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/accounts/${FIRST_ACCOUNT_ID}" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$ACCOUNT" | jq -e '.data.account_id' > /dev/null 2>&1; then
        print_success "Retrieved account details"
        echo "$ACCOUNT" | jq '.data'
    else
        print_failure "Failed to get account details"
    fi
fi

# Test 7: Get account balance
if [ ! -z "$FIRST_ACCOUNT_ID" ]; then
    print_test "Get account balance"
    BALANCE=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/accounts/${FIRST_ACCOUNT_ID}/balance" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$BALANCE" | jq -e '.data.balance' > /dev/null 2>&1; then
        CURRENT_BALANCE=$(echo "$BALANCE" | jq -r '.data.balance')
        print_success "Balance: $CURRENT_BALANCE"
    else
        print_failure "Failed to get balance"
    fi
fi

# Test 8: Get account transactions
if [ ! -z "$FIRST_ACCOUNT_ID" ]; then
    print_test "Get account transactions"
    TRANSACTIONS=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/accounts/${FIRST_ACCOUNT_ID}/transactions" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$TRANSACTIONS" | jq -e '.data' > /dev/null 2>&1; then
        TXN_COUNT=$(echo "$TRANSACTIONS" | jq '.data | length')
        print_success "Retrieved $TXN_COUNT transactions"
    else
        print_failure "Failed to get transactions"
    fi
fi

# Test 9: Create new account
print_test "Create new account"
NEW_ACCOUNT=$(curl -s -X POST "${BASE_URL}/api/${API_VERSION}/accounts" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountType": "checking",
    "accountName": "Test Checking Account",
    "currency": "USD",
    "initialBalance": 1000,
    "dailyTransactionLimit": 5000
  }')

if echo "$NEW_ACCOUNT" | jq -e '.data.account_id' > /dev/null 2>&1; then
    NEW_ACCOUNT_ID=$(echo "$NEW_ACCOUNT" | jq -r '.data.account_id')
    print_success "Created new account: $NEW_ACCOUNT_ID"
else
    print_failure "Failed to create account"
fi

# ========================================
# Transaction Tests
# ========================================
print_section "3. Transaction Tests"

# Test 10: Get all transactions
print_test "Get all transactions"
ALL_TRANSACTIONS=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/transactions" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$ALL_TRANSACTIONS" | jq -e '.data' > /dev/null 2>&1; then
    TXN_COUNT=$(echo "$ALL_TRANSACTIONS" | jq '.data | length')
    print_success "Retrieved $TXN_COUNT transactions"
    
    if [ "$TXN_COUNT" -gt 0 ]; then
        FIRST_TXN_ID=$(echo "$ALL_TRANSACTIONS" | jq -r '.data[0].transaction_id')
        print_info "Using transaction ID: $FIRST_TXN_ID"
    fi
else
    print_failure "Failed to get transactions"
fi

# Test 11: Get specific transaction
if [ ! -z "$FIRST_TXN_ID" ]; then
    print_test "Get transaction by ID"
    TXN=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/transactions/${FIRST_TXN_ID}" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$TXN" | jq -e '.data.transaction_id' > /dev/null 2>&1; then
        print_success "Retrieved transaction details"
    else
        print_failure "Failed to get transaction details"
    fi
fi

# Test 12: Get pending transactions
print_test "Get pending transactions"
PENDING=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/transactions/pending" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$PENDING" | jq -e '.data' > /dev/null 2>&1; then
    PENDING_COUNT=$(echo "$PENDING" | jq '.data | length')
    print_success "Retrieved $PENDING_COUNT pending transactions"
else
    print_failure "Failed to get pending transactions"
fi

# Test 13: Get transaction categories
print_test "Get transaction categories"
CATEGORIES=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/transactions/categories" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$CATEGORIES" | jq -e '.data' > /dev/null 2>&1; then
    CAT_COUNT=$(echo "$CATEGORIES" | jq '.data | length')
    print_success "Retrieved $CAT_COUNT categories"
else
    print_failure "Failed to get categories"
fi

# ========================================
# Card Tests
# ========================================
print_section "4. Card Tests"

# Test 14: Get all cards
print_test "Get all cards"
CARDS=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/cards" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$CARDS" | jq -e '.data' > /dev/null 2>&1; then
    CARD_COUNT=$(echo "$CARDS" | jq '.data | length')
    print_success "Retrieved $CARD_COUNT cards"
    
    if [ "$CARD_COUNT" -gt 0 ]; then
        FIRST_CARD_ID=$(echo "$CARDS" | jq -r '.data[0].card_id')
        print_info "Using card ID: $FIRST_CARD_ID"
    fi
else
    print_failure "Failed to get cards"
fi

# Test 15: Get specific card
if [ ! -z "$FIRST_CARD_ID" ]; then
    print_test "Get card by ID"
    CARD=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/cards/${FIRST_CARD_ID}" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$CARD" | jq -e '.data.card_id' > /dev/null 2>&1; then
        print_success "Retrieved card details"
        # Verify sensitive data is masked
        if echo "$CARD" | jq -e '.data.card_number_encrypted' > /dev/null 2>&1; then
            print_failure "Card number should be masked"
        else
            print_success "Sensitive data properly masked"
        fi
    else
        print_failure "Failed to get card details"
    fi
fi

# ========================================
# Transfer Tests
# ========================================
print_section "5. Transfer Tests"

# Test 16: Get all transfers
print_test "Get all transfers"
TRANSFERS=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/transfers" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$TRANSFERS" | jq -e '.data' > /dev/null 2>&1; then
    TRANSFER_COUNT=$(echo "$TRANSFERS" | jq '.data | length')
    print_success "Retrieved $TRANSFER_COUNT transfers"
    
    if [ "$TRANSFER_COUNT" -gt 0 ]; then
        FIRST_TRANSFER_ID=$(echo "$TRANSFERS" | jq -r '.data[0].transfer_id')
        print_info "Using transfer ID: $FIRST_TRANSFER_ID"
    fi
else
    print_failure "Failed to get transfers"
fi

# Test 17: Get specific transfer
if [ ! -z "$FIRST_TRANSFER_ID" ]; then
    print_test "Get transfer by ID"
    TRANSFER=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/transfers/${FIRST_TRANSFER_ID}" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$TRANSFER" | jq -e '.data.transfer_id' > /dev/null 2>&1; then
        print_success "Retrieved transfer details"
    else
        print_failure "Failed to get transfer details"
    fi
fi

# ========================================
# Fraud Alert Tests
# ========================================
print_section "6. Fraud Alert Tests"

# Test 18: Get all fraud alerts
print_test "Get all fraud alerts"
FRAUD_ALERTS=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/fraud/alerts" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$FRAUD_ALERTS" | jq -e '.data' > /dev/null 2>&1; then
    FRAUD_COUNT=$(echo "$FRAUD_ALERTS" | jq '.data | length')
    print_success "Retrieved $FRAUD_COUNT fraud alerts"
    
    if [ "$FRAUD_COUNT" -gt 0 ]; then
        FIRST_ALERT_ID=$(echo "$FRAUD_ALERTS" | jq -r '.data[0].alert_id')
        print_info "Using alert ID: $FIRST_ALERT_ID"
    fi
else
    print_failure "Failed to get fraud alerts"
fi

# Test 19: Get specific fraud alert
if [ ! -z "$FIRST_ALERT_ID" ]; then
    print_test "Get fraud alert by ID"
    ALERT=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/fraud/alerts/${FIRST_ALERT_ID}" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$ALERT" | jq -e '.data.alert_id' > /dev/null 2>&1; then
        print_success "Retrieved fraud alert details"
    else
        print_failure "Failed to get fraud alert details"
    fi
fi

# ========================================
# Dispute Tests
# ========================================
print_section "7. Dispute Tests"

# Test 20: Get all disputes
print_test "Get all disputes"
DISPUTES=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/disputes" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$DISPUTES" | jq -e '.data' > /dev/null 2>&1; then
    DISPUTE_COUNT=$(echo "$DISPUTES" | jq '.data | length')
    print_success "Retrieved $DISPUTE_COUNT disputes"
    
    if [ "$DISPUTE_COUNT" -gt 0 ]; then
        FIRST_DISPUTE_ID=$(echo "$DISPUTES" | jq -r '.data[0].dispute_id')
        print_info "Using dispute ID: $FIRST_DISPUTE_ID"
    fi
else
    print_failure "Failed to get disputes"
fi

# Test 21: Get specific dispute
if [ ! -z "$FIRST_DISPUTE_ID" ]; then
    print_test "Get dispute by ID"
    DISPUTE=$(curl -s -X GET "${BASE_URL}/api/${API_VERSION}/disputes/${FIRST_DISPUTE_ID}" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$DISPUTE" | jq -e '.data.dispute_id' > /dev/null 2>&1; then
        print_success "Retrieved dispute details"
    else
        print_failure "Failed to get dispute details"
    fi
fi

# ========================================
# Authorization Tests (RBAC)
# ========================================
print_section "8. Authorization Tests"

# Test 22: Test unauthorized access (no token)
print_test "Test unauthorized access"
UNAUTHORIZED=$(curl -s -w "\n%{http_code}" -X GET "${BASE_URL}/api/${API_VERSION}/accounts")
UNAUTH_STATUS=$(echo "$UNAUTHORIZED" | tail -n1)
if [ "$UNAUTH_STATUS" = "401" ]; then
    print_success "Unauthorized access correctly rejected"
else
    print_failure "Expected 401, got: $UNAUTH_STATUS"
fi

# Test 23: Test invalid token
print_test "Test invalid token"
INVALID_TOKEN=$(curl -s -w "\n%{http_code}" -X GET "${BASE_URL}/api/${API_VERSION}/accounts" \
  -H "Authorization: Bearer invalid_token_here")
INVALID_STATUS=$(echo "$INVALID_TOKEN" | tail -n1)
if [ "$INVALID_STATUS" = "401" ]; then
    print_success "Invalid token correctly rejected"
else
    print_failure "Expected 401, got: $INVALID_STATUS"
fi

# ========================================
# Test Summary
# ========================================
print_section "Test Summary"

TOTAL=$((PASSED + FAILED))
PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED/$TOTAL)*100}")

echo ""
print_info "Total Tests: $TOTAL"
print_success "Passed: $PASSED"
if [ $FAILED -gt 0 ]; then
    print_failure "Failed: $FAILED"
    echo ""
    echo "Failed Tests:"
    for test in "${FAILED_TESTS[@]}"; do
        echo "  - $test"
    done
else
    print_success "Failed: $FAILED"
fi
echo ""
print_info "Pass Rate: ${PASS_RATE}%"

if [ $FAILED -eq 0 ]; then
    print_success "All tests passed! ✓"
    exit 0
else
    print_failure "Some tests failed. Please review the output above."
    exit 1
fi
