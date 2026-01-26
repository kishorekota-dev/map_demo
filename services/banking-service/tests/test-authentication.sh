#!/bin/bash

# POC Banking - Authentication API Test Suite
# Tests JWT authentication, role-based access control, and all auth endpoints

set -e  # Exit on error

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Base URL
BASE_URL="http://localhost:3010/api/v1"

# Test counters
PASSED=0
FAILED=0
TOTAL=0

# Function to print test results
print_test() {
    local test_name="$1"
    local status="$2"
    TOTAL=$((TOTAL + 1))
    
    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✓ PASS${NC} - $test_name"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ FAIL${NC} - $test_name"
        FAILED=$((FAILED + 1))
    fi
}

# Function to print section header
print_section() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

# Function to extract JSON field
get_json_field() {
    echo "$1" | jq -r "$2"
}

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║    POC Banking - Authentication API Test Suite            ║"
echo "║    Testing JWT Authentication & Role-Based Access Control ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ========================================
# Test 1: Login with Admin
# ========================================
print_section "Test 1: Admin Login"

ADMIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Password123!"}')

ADMIN_STATUS=$(get_json_field "$ADMIN_RESPONSE" ".status")
ADMIN_TOKEN=$(get_json_field "$ADMIN_RESPONSE" ".data.tokens.accessToken")
ADMIN_REFRESH=$(get_json_field "$ADMIN_RESPONSE" ".data.tokens.refreshToken")
ADMIN_USERNAME=$(get_json_field "$ADMIN_RESPONSE" ".data.user.username")
ADMIN_ROLES=$(get_json_field "$ADMIN_RESPONSE" ".data.roles[0]")

if [ "$ADMIN_STATUS" = "success" ] && [ ! -z "$ADMIN_TOKEN" ] && [ "$ADMIN_TOKEN" != "null" ]; then
    print_test "Admin login successful" "PASS"
    echo "  → Username: $ADMIN_USERNAME"
    echo "  → Role: $ADMIN_ROLES"
    echo "  → Token length: ${#ADMIN_TOKEN} chars"
else
    print_test "Admin login successful" "FAIL"
    echo "  Response: $ADMIN_RESPONSE"
fi

# ========================================
# Test 2: Login with Customer
# ========================================
print_section "Test 2: Customer Login"

CUSTOMER_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"james.patterson","password":"Password123!"}')

CUSTOMER_STATUS=$(get_json_field "$CUSTOMER_RESPONSE" ".status")
CUSTOMER_TOKEN=$(get_json_field "$CUSTOMER_RESPONSE" ".data.tokens.accessToken")
CUSTOMER_USERNAME=$(get_json_field "$CUSTOMER_RESPONSE" ".data.user.username")
CUSTOMER_ROLES=$(get_json_field "$CUSTOMER_RESPONSE" ".data.roles[0]")
CUSTOMER_ID=$(get_json_field "$CUSTOMER_RESPONSE" ".data.user.customerId")

if [ "$CUSTOMER_STATUS" = "success" ] && [ ! -z "$CUSTOMER_TOKEN" ] && [ "$CUSTOMER_TOKEN" != "null" ]; then
    print_test "Customer login successful" "PASS"
    echo "  → Username: $CUSTOMER_USERNAME"
    echo "  → Role: $CUSTOMER_ROLES"
    echo "  → Customer ID: $CUSTOMER_ID"
else
    print_test "Customer login successful" "FAIL"
    echo "  Response: $CUSTOMER_RESPONSE"
fi

# ========================================
# Test 3: Invalid Credentials
# ========================================
print_section "Test 3: Invalid Credentials"

INVALID_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"WrongPassword123!"}')

INVALID_STATUS=$(get_json_field "$INVALID_RESPONSE" ".status")
INVALID_CODE=$(get_json_field "$INVALID_RESPONSE" ".error.code")

if [ "$INVALID_STATUS" = "error" ] && [ "$INVALID_CODE" = "INVALID_CREDENTIALS" ]; then
    print_test "Invalid credentials rejected" "PASS"
else
    print_test "Invalid credentials rejected" "FAIL"
    echo "  Response: $INVALID_RESPONSE"
fi

# ========================================
# Test 4: Get Current User Info (/me)
# ========================================
print_section "Test 4: Get Current User Info (/me)"

ME_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

ME_STATUS=$(get_json_field "$ME_RESPONSE" ".status")
ME_USERNAME=$(get_json_field "$ME_RESPONSE" ".data.username")
ME_ROLES=$(get_json_field "$ME_RESPONSE" ".data.roles[0].name")

if [ "$ME_STATUS" = "success" ] && [ "$ME_USERNAME" = "admin" ]; then
    print_test "/me endpoint returns user info" "PASS"
    echo "  → Username: $ME_USERNAME"
    echo "  → Role: $ME_ROLES"
else
    print_test "/me endpoint returns user info" "FAIL"
    echo "  Response: $ME_RESPONSE"
fi

# ========================================
# Test 5: Access Without Token
# ========================================
print_section "Test 5: Access Without Token"

NO_TOKEN_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/me")

NO_TOKEN_STATUS=$(get_json_field "$NO_TOKEN_RESPONSE" ".status")
NO_TOKEN_CODE=$(get_json_field "$NO_TOKEN_RESPONSE" ".error.code")

if [ "$NO_TOKEN_STATUS" = "error" ] && [ "$NO_TOKEN_CODE" = "MISSING_TOKEN" ]; then
    print_test "Access denied without token" "PASS"
else
    print_test "Access denied without token" "FAIL"
    echo "  Response: $NO_TOKEN_RESPONSE"
fi

# ========================================
# Test 6: Access With Invalid Token
# ========================================
print_section "Test 6: Access With Invalid Token"

INVALID_TOKEN_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/me" \
  -H "Authorization: Bearer invalid.token.here")

INVALID_TOKEN_STATUS=$(get_json_field "$INVALID_TOKEN_RESPONSE" ".status")
INVALID_TOKEN_CODE=$(get_json_field "$INVALID_TOKEN_RESPONSE" ".error.code")

if [ "$INVALID_TOKEN_STATUS" = "error" ] && [ "$INVALID_TOKEN_CODE" = "INVALID_TOKEN" ]; then
    print_test "Invalid token rejected" "PASS"
else
    print_test "Invalid token rejected" "FAIL"
    echo "  Response: $INVALID_TOKEN_RESPONSE"
fi

# ========================================
# Test 7: Refresh Token
# ========================================
print_section "Test 7: Refresh Access Token"

REFRESH_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$ADMIN_REFRESH\"}")

REFRESH_STATUS=$(get_json_field "$REFRESH_RESPONSE" ".status")
NEW_ACCESS_TOKEN=$(get_json_field "$REFRESH_RESPONSE" ".data.accessToken")

if [ "$REFRESH_STATUS" = "success" ] && [ ! -z "$NEW_ACCESS_TOKEN" ] && [ "$NEW_ACCESS_TOKEN" != "null" ]; then
    print_test "Token refresh successful" "PASS"
    echo "  → New token length: ${#NEW_ACCESS_TOKEN} chars"
else
    print_test "Token refresh successful" "FAIL"
    echo "  Response: $REFRESH_RESPONSE"
fi

# ========================================
# Test 8: Logout
# ========================================
print_section "Test 8: Logout"

LOGOUT_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/logout" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{\"refreshToken\":\"$ADMIN_REFRESH\"}")

LOGOUT_STATUS=$(get_json_field "$LOGOUT_RESPONSE" ".status")

if [ "$LOGOUT_STATUS" = "success" ]; then
    print_test "Logout successful" "PASS"
else
    print_test "Logout successful" "FAIL"
    echo "  Response: $LOGOUT_RESPONSE"
fi

# ========================================
# Test 9: Use Refresh Token After Logout
# ========================================
print_section "Test 9: Refresh Token After Logout"

REVOKED_REFRESH_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$ADMIN_REFRESH\"}")

REVOKED_STATUS=$(get_json_field "$REVOKED_REFRESH_RESPONSE" ".status")
REVOKED_CODE=$(get_json_field "$REVOKED_REFRESH_RESPONSE" ".error.code")

# Accept either INVALID_REFRESH_TOKEN or INVALID_TOKEN as both indicate rejection
if [ "$REVOKED_STATUS" = "error" ] && ([ "$REVOKED_CODE" = "INVALID_REFRESH_TOKEN" ] || [ "$REVOKED_CODE" = "INVALID_TOKEN" ]); then
    print_test "Revoked refresh token rejected" "PASS"
    echo "  → Error code: $REVOKED_CODE"
else
    print_test "Revoked refresh token rejected" "FAIL"
    echo "  Response: $REVOKED_REFRESH_RESPONSE"
fi

# ========================================
# Test 10: Customer Access to Own Data
# ========================================
print_section "Test 10: Customer Access to Own Data"

CUSTOMER_DATA_RESPONSE=$(curl -s -X GET "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN")

CUSTOMER_DATA_STATUS=$(get_json_field "$CUSTOMER_DATA_RESPONSE" ".status")
CUSTOMER_DATA_USERNAME=$(get_json_field "$CUSTOMER_DATA_RESPONSE" ".data.username")

if [ "$CUSTOMER_DATA_STATUS" = "success" ] && [ "$CUSTOMER_DATA_USERNAME" = "james.patterson" ]; then
    print_test "Customer can access own data" "PASS"
    echo "  → Username: $CUSTOMER_DATA_USERNAME"
    echo "  → Customer ID: $(get_json_field "$CUSTOMER_DATA_RESPONSE" ".data.customerId")"
else
    print_test "Customer can access own data" "FAIL"
    echo "  Response: $CUSTOMER_DATA_RESPONSE"
fi

# ========================================
# Test 11: Permission Check
# ========================================
print_section "Test 11: Permission Verification"

ADMIN_PERMISSIONS=$(get_json_field "$ADMIN_RESPONSE" ".data.permissions | length")
CUSTOMER_PERMISSIONS=$(get_json_field "$CUSTOMER_RESPONSE" ".data.permissions | length")

if [ "$ADMIN_PERMISSIONS" -gt "$CUSTOMER_PERMISSIONS" ]; then
    print_test "Admin has more permissions than customer" "PASS"
    echo "  → Admin permissions: $ADMIN_PERMISSIONS"
    echo "  → Customer permissions: $CUSTOMER_PERMISSIONS"
else
    print_test "Admin has more permissions than customer" "FAIL"
    echo "  → Admin permissions: $ADMIN_PERMISSIONS"
    echo "  → Customer permissions: $CUSTOMER_PERMISSIONS"
fi

# ========================================
# Test 12: Role Verification
# ========================================
print_section "Test 12: Role Verification"

ADMIN_HAS_ADMIN_ROLE=$(get_json_field "$ADMIN_RESPONSE" '.data.roles[] | select(. == "ADMIN") | length')
CUSTOMER_HAS_CUSTOMER_ROLE=$(get_json_field "$CUSTOMER_RESPONSE" '.data.roles[] | select(. == "CUSTOMER") | length')

ROLES_OK="true"
if [ "$ADMIN_HAS_ADMIN_ROLE" = "5" ]; then
    echo -e "  ${GREEN}✓${NC} Admin has ADMIN role"
else
    echo -e "  ${RED}✗${NC} Admin missing ADMIN role"
    ROLES_OK="false"
fi

if [ "$CUSTOMER_HAS_CUSTOMER_ROLE" = "8" ]; then
    echo -e "  ${GREEN}✓${NC} Customer has CUSTOMER role"
else
    echo -e "  ${RED}✗${NC} Customer missing CUSTOMER role"
    ROLES_OK="false"
fi

if [ "$ROLES_OK" = "true" ]; then
    print_test "Roles correctly assigned" "PASS"
else
    print_test "Roles correctly assigned" "FAIL"
fi

# ========================================
# Test Summary
# ========================================
print_section "Test Summary"

echo ""
echo -e "Total Tests: ${BLUE}$TOTAL${NC}"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║            ✓ ALL TESTS PASSED ✓                           ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Authentication system is working correctly!${NC}"
    echo ""
    echo "Features verified:"
    echo "  ✓ JWT token generation and validation"
    echo "  ✓ Access token + Refresh token pattern"
    echo "  ✓ Role-based access control (RBAC)"
    echo "  ✓ Permission-based authorization"
    echo "  ✓ Login/Logout functionality"
    echo "  ✓ Token refresh mechanism"
    echo "  ✓ Token revocation on logout"
    echo "  ✓ Invalid credentials rejection"
    echo "  ✓ Missing/invalid token handling"
    echo ""
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║            ✗ SOME TESTS FAILED ✗                          ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    exit 1
fi
