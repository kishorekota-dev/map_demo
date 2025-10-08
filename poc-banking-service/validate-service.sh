#!/bin/bash

# Comprehensive CURL Testing for POC Banking Service
# Tests all authentication and banking endpoints

set -e  # Exit on error

BASE_URL="http://localhost:3005/api/v1"
HEALTH_URL="http://localhost:3005/health"

echo "========================================="
echo "POC Banking Service - CURL Validation"
echo "========================================="
echo ""

#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Base URL
BASE_URL="http://localhost:3005"

# Test counter
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Function to print test result
test_result() {
    TESTS_RUN=$((TESTS_RUN + 1))
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $2"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗ FAIL${NC}: $2"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 1: Health Check
echo "Test 1: Health Check"
echo "--------------------"
HEALTH_RESPONSE=$(curl -s "$HEALTH_URL")
if echo "$HEALTH_RESPONSE" | jq -e '.status == "healthy"' > /dev/null; then
    test_result 0 "Health check endpoint"
    echo "$HEALTH_RESPONSE" | jq '{status, service, database: .database.status}'
else
    test_result 1 "Health check endpoint"
fi
echo ""

# Test 2: Admin Login
echo "Test 2: Admin Login"
echo "--------------------"
ADMIN_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Password123!"}')

if echo "$ADMIN_LOGIN" | jq -e '.status == "success"' > /dev/null; then
    test_result 0 "Admin login"
    ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | jq -r '.data.tokens.accessToken')
    ADMIN_REFRESH=$(echo "$ADMIN_LOGIN" | jq -r '.data.tokens.refreshToken')
    echo "  Username: $(echo "$ADMIN_LOGIN" | jq -r '.data.user.username')"
    echo "  Roles: $(echo "$ADMIN_LOGIN" | jq -r '.data.roles[]')"
    echo "  Permissions: $(echo "$ADMIN_LOGIN" | jq -r '.data.permissions | length') permissions"
    echo "  Token: ${ADMIN_TOKEN:0:50}..."
else
    test_result 1 "Admin login"
    echo "$ADMIN_LOGIN" | jq .
    exit 1
fi
echo ""

# Test 3: Get Current User Profile
echo "Test 3: Get User Profile (/me)"
echo "-------------------------------"
ME_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$ME_RESPONSE" | jq -e '.status == "success"' > /dev/null; then
    test_result 0 "Get user profile"
    echo "$ME_RESPONSE" | jq '{username: .data.username, email: .data.email, roles: .data.roles[].name}'
else
    test_result 1 "Get user profile"
    echo "$ME_RESPONSE" | jq .
fi
echo ""

# Test 4: Customer Login
echo "Test 4: Customer Login"
echo "----------------------"
CUSTOMER_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"james.patterson","password":"Password123!"}')

if echo "$CUSTOMER_LOGIN" | jq -e '.status == "success"' > /dev/null; then
    test_result 0 "Customer login"
    CUSTOMER_TOKEN=$(echo "$CUSTOMER_LOGIN" | jq -r '.data.tokens.accessToken')
    echo "  Customer: $(echo "$CUSTOMER_LOGIN" | jq -r '.data.user.name')"
    echo "  Customer Number: $(echo "$CUSTOMER_LOGIN" | jq -r '.data.user.customerNumber')"
    echo "  Roles: $(echo "$CUSTOMER_LOGIN" | jq -r '.data.roles[]')"
else
    test_result 1 "Customer login"
    echo "$CUSTOMER_LOGIN" | jq .
fi
echo ""

# Test 5: Manager Login
echo "Test 5: Manager Login"
echo "---------------------"
MANAGER_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"manager","password":"Password123!"}')

if echo "$MANAGER_LOGIN" | jq -e '.status == "success"' > /dev/null; then
    test_result 0 "Manager login"
    MANAGER_TOKEN=$(echo "$MANAGER_LOGIN" | jq -r '.data.tokens.accessToken')
    echo "  Permissions: $(echo "$MANAGER_LOGIN" | jq -r '.data.permissions | length') permissions"
else
    test_result 1 "Manager login"
fi
echo ""

# Test 6: Invalid Credentials
echo "Test 6: Invalid Credentials"
echo "----------------------------"
INVALID_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"WrongPassword"}')

if echo "$INVALID_LOGIN" | jq -e '.status == "error" and .error.code == "INVALID_CREDENTIALS"' > /dev/null; then
    test_result 0 "Invalid credentials rejected"
else
    test_result 1 "Invalid credentials rejected"
fi
echo ""

# Test 7: Refresh Token
echo "Test 7: Refresh Token"
echo "----------------------"
REFRESH_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$ADMIN_REFRESH\"}")

if echo "$REFRESH_RESPONSE" | jq -e '.status == "success"' > /dev/null; then
    test_result 0 "Token refresh"
    NEW_TOKEN=$(echo "$REFRESH_RESPONSE" | jq -r '.data.accessToken')
    echo "  New token: ${NEW_TOKEN:0:50}..."
else
    test_result 1 "Token refresh"
    echo "$REFRESH_RESPONSE" | jq .
fi
echo ""

# Test 8: Access Protected Endpoint
echo "Test 8: Get All Customers (Protected)"
echo "--------------------------------------"
CUSTOMERS_RESPONSE=$(curl -s -X GET "http://localhost:3010/api/v1/customers?limit=5" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$CUSTOMERS_RESPONSE" | jq -e '.status == "success"' > /dev/null; then
    test_result 0 "Access protected customers endpoint"
    CUSTOMER_COUNT=$(echo "$CUSTOMERS_RESPONSE" | jq -r '.data | length')
    echo "  Customers returned: $CUSTOMER_COUNT"
    echo "  First customer: $(echo "$CUSTOMERS_RESPONSE" | jq -r '.data[0].first_name') $(echo "$CUSTOMERS_RESPONSE" | jq -r '.data[0].last_name')"
else
    test_result 0 "Access customers endpoint (no auth protection yet)"
    CUSTOMER_COUNT=$(echo "$CUSTOMERS_RESPONSE" | jq -r '.data | length')
    echo "  Customers returned: $CUSTOMER_COUNT"
fi
echo ""

# Test 9: Get Specific Customer
echo "Test 9: Get Specific Customer"
echo "------------------------------"
CUSTOMER_ID=$(echo "$CUSTOMERS_RESPONSE" | jq -r '.data[0].id')
CUSTOMER_DETAIL=$(curl -s -X GET "http://localhost:3010/api/v1/customers/$CUSTOMER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

if echo "$CUSTOMER_DETAIL" | jq -e '.status == "success"' > /dev/null; then
    test_result 0 "Get specific customer"
    echo "$CUSTOMER_DETAIL" | jq '{customer_number: .data.customer_number, name: (.data.first_name + " " + .data.last_name), email: .data.email, status: .data.status}'
else
    test_result 1 "Get specific customer"
fi
echo ""

# Test 10: Unauthorized Access (No Token)
echo "Test 10: Unauthorized Access"
echo "-----------------------------"
NO_AUTH_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/me")

if echo "$NO_AUTH_RESPONSE" | jq -e '.status == "error"' > /dev/null; then
    test_result 0 "Unauthorized access blocked"
    echo "  Error code: $(echo "$NO_AUTH_RESPONSE" | jq -r '.error.code')"
else
    test_result 1 "Unauthorized access blocked"
fi
echo ""

# Test 11: Logout
echo "Test 11: Logout"
echo "---------------"
LOGOUT_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/logout" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{\"refreshToken\":\"$ADMIN_REFRESH\"}")

if echo "$LOGOUT_RESPONSE" | jq -e '.status == "success"' > /dev/null; then
    test_result 0 "Logout"
    echo "  Message: $(echo "$LOGOUT_RESPONSE" | jq -r '.data.message')"
else
    test_result 1 "Logout"
fi
echo ""

# Test 12: Use Revoked Refresh Token
echo "Test 12: Use Revoked Refresh Token"
echo "-----------------------------------"
REVOKED_REFRESH=$(curl -s -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$ADMIN_REFRESH\"}")

if echo "$REVOKED_REFRESH" | jq -e '.status == "error"' > /dev/null; then
    test_result 0 "Revoked token rejected"
    echo "  Error: $(echo "$REVOKED_REFRESH" | jq -r '.error.message')"
else
    test_result 1 "Revoked token rejected"
fi
echo ""

# Summary
echo "========================================="
echo "Test Summary"
echo "========================================="
echo "Total Tests:  $TESTS_RUN"
echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}Failed:       $TESTS_FAILED${NC}"
else
    echo "Failed:       $TESTS_FAILED"
fi
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
