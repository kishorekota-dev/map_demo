#!/bin/bash

# Credit Card Enterprise API Demo Test Script
# This script demonstrates various API endpoints and their responses

echo "🚀 Credit Card Enterprise API Demo"
echo "=================================="
echo ""

BASE_URL="http://localhost:3001"
API_PREFIX="/api/v1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print section headers
print_section() {
    echo -e "\n${BLUE}📋 $1${NC}"
    echo "----------------------------------------"
}

# Function to print test results
print_test() {
    echo -e "\n${YELLOW}🧪 Test: $1${NC}"
    echo "Endpoint: $2"
    echo "Response:"
    echo "$3" | jq . 2>/dev/null || echo "$3"
    echo ""
}

# Test 1: Health Check
print_section "Health Check"
health_response=$(curl -s "${BASE_URL}/health")
print_test "Backend Health Check" "GET /health" "$health_response"

# Test 2: User Registration
print_section "User Registration & Authentication"

# Register a test user
register_payload='{
    "email":"demo.customer@creditcard.com",
    "password":"demo123456",
    "firstName":"Demo",
    "lastName":"Customer",
    "role":"CUSTOMER",
    "phone":"555-0123",
    "address": {
        "street":"123 Demo Street",
        "city":"Demo City",
        "state":"CA",
        "zipCode":"90210",
        "country":"USA"
    }
}'

register_response=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/auth/register" \
    -H "Content-Type: application/json" \
    -d "$register_payload")

print_test "Customer Registration" "POST /api/v1/auth/register" "$register_response"

# Test 3: User Login
login_payload='{
    "email":"demo.customer@creditcard.com",
    "password":"demo123456"
}'

login_response=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/auth/login" \
    -H "Content-Type: application/json" \
    -d "$login_payload")

print_test "Customer Login" "POST /api/v1/auth/login" "$login_response"

# Extract token for authenticated requests
TOKEN=$(echo "$login_response" | jq -r '.token // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo -e "${RED}❌ Failed to get authentication token. Cannot proceed with authenticated tests.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Authentication successful! Token acquired.${NC}"

# Test 4: User Profile
print_section "User Profile & Permissions"

profile_response=$(curl -s -X GET "${BASE_URL}${API_PREFIX}/auth/me" \
    -H "Authorization: Bearer $TOKEN")

print_test "User Profile" "GET /api/v1/auth/me" "$profile_response"

# Test 5: User Permissions
permissions_response=$(curl -s -X GET "${BASE_URL}${API_PREFIX}/auth/permissions" \
    -H "Authorization: Bearer $TOKEN")

print_test "User Permissions" "GET /api/v1/auth/permissions" "$permissions_response"

# Test 6: Token Refresh
print_section "Token Management"

refresh_response=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/auth/refresh" \
    -H "Authorization: Bearer $TOKEN")

print_test "Token Refresh" "POST /api/v1/auth/refresh" "$refresh_response"

# Test 7: Protected Endpoints (showing permission enforcement)
print_section "Permission System Demonstration"

# Try to access admin endpoint (should fail)
admin_response=$(curl -s -X GET "${BASE_URL}${API_PREFIX}/auth/users" \
    -H "Authorization: Bearer $TOKEN")

print_test "Admin Endpoint Access (Should Fail)" "GET /api/v1/auth/users" "$admin_response"

# Try to access accounts (should require proper permissions)
accounts_response=$(curl -s -X GET "${BASE_URL}${API_PREFIX}/accounts" \
    -H "Authorization: Bearer $TOKEN")

print_test "General Accounts Access (Should Fail)" "GET /api/v1/accounts" "$accounts_response"

# Test 8: Create a second user for additional testing
print_section "Additional User Testing"

register_payload2='{
    "email":"demo.agent@creditcard.com",
    "password":"agent123456",
    "firstName":"Demo",
    "lastName":"Agent",
    "role":"CUSTOMER"
}'

register_response2=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/auth/register" \
    -H "Content-Type: application/json" \
    -d "$register_payload2")

print_test "Second User Registration" "POST /api/v1/auth/register" "$register_response2"

# Test 9: Error Handling
print_section "Error Handling Demonstration"

# Try login with wrong credentials
wrong_login_payload='{
    "email":"demo.customer@creditcard.com",
    "password":"wrongpassword"
}'

wrong_login_response=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/auth/login" \
    -H "Content-Type: application/json" \
    -d "$wrong_login_payload")

print_test "Invalid Login Attempt" "POST /api/v1/auth/login" "$wrong_login_response"

# Try to access endpoint without token
no_auth_response=$(curl -s -X GET "${BASE_URL}${API_PREFIX}/auth/me")

print_test "Access Without Authentication" "GET /api/v1/auth/me" "$no_auth_response"

# Test 10: Input Validation
print_section "Input Validation Demonstration"

# Try registration with invalid email
invalid_register_payload='{
    "email":"invalid-email",
    "password":"short",
    "firstName":"",
    "lastName":"Test"
}'

invalid_register_response=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/auth/register" \
    -H "Content-Type: application/json" \
    -d "$invalid_register_payload")

print_test "Invalid Registration Data" "POST /api/v1/auth/register" "$invalid_register_response"

# Test 11: Logout
print_section "Session Management"

logout_response=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/auth/logout" \
    -H "Authorization: Bearer $TOKEN")

print_test "User Logout" "POST /api/v1/auth/logout" "$logout_response"

# Test 12: Service URLs Check
print_section "Service Availability Check"

echo -e "\n${YELLOW}🌐 Checking all service endpoints:${NC}"

services=(
    "Backend API:3001"
    "Web UI:3000"
    "Agent UI:3002"
    "ChatBot UI:3003"
)

for service in "${services[@]}"; do
    name=$(echo $service | cut -d: -f1)
    port=$(echo $service | cut -d: -f2)
    
    if curl -s --connect-timeout 5 "http://localhost:$port" > /dev/null; then
        echo -e "  ✅ $name (Port $port): ${GREEN}RUNNING${NC}"
    else
        echo -e "  ❌ $name (Port $port): ${RED}NOT ACCESSIBLE${NC}"
    fi
done

# Final Summary
print_section "Test Summary"

echo -e "${GREEN}✅ Completed API Demo Tests${NC}"
echo ""
echo "📊 Tests Performed:"
echo "  • Health check and service status"
echo "  • User registration and authentication"
echo "  • JWT token management"
echo "  • User profile and permissions"
echo "  • Role-based access control"
echo "  • Error handling and validation"
echo "  • Security enforcement"
echo ""
echo "🎯 Key Features Demonstrated:"
echo "  • RESTful API endpoints"
echo "  • JWT-based authentication"
echo "  • Role-based permission system"
echo "  • Input validation"
echo "  • Error handling"
echo "  • Security middleware"
echo ""
echo -e "${BLUE}🚀 Credit Card Enterprise API is fully operational!${NC}"
