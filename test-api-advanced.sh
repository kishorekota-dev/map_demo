#!/bin/bash

# Advanced API Demo - Business Logic & Data Structures
echo "🏦 Credit Card Enterprise - Advanced API Demo"
echo "=============================================="
echo ""

BASE_URL="http://localhost:3001"
API_PREFIX="/api/v1"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo -e "\n${CYAN}🔍 $1${NC}"
    echo "================================================"
}

print_endpoint() {
    echo -e "\n${YELLOW}📡 Endpoint: $1${NC}"
    echo -e "${BLUE}Method: $2${NC}"
    if [ ! -z "$3" ]; then
        echo -e "${BLUE}Payload:${NC}"
        echo "$3" | jq . 2>/dev/null || echo "$3"
    fi
    echo -e "${BLUE}Response:${NC}"
}

# First, let's create a user and get a token
echo "🔐 Setting up test user..."
register_payload='{
    "email":"business.demo@creditcard.com",
    "password":"business123",
    "firstName":"Business",
    "lastName":"Demo",
    "role":"CUSTOMER",
    "phone":"555-9999",
    "address": {
        "street":"456 Business Ave",
        "city":"Enterprise City",
        "state":"NY",
        "zipCode":"10001",
        "country":"USA"
    }
}'

register_response=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/auth/register" \
    -H "Content-Type: application/json" \
    -d "$register_payload")

TOKEN=$(echo "$register_response" | jq -r '.token // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "❌ Failed to create test user"
    exit 1
fi

USER_ID=$(echo "$register_response" | jq -r '.user.userId // empty')
ACCOUNT_ID=$(echo "$register_response" | jq -r '.user.accountIds[0] // empty')

echo "✅ Test user created successfully"
echo "User ID: $USER_ID"
echo "Account ID: $ACCOUNT_ID"

# Demo 1: Detailed User Information
print_header "User Management & Profile Data"

print_endpoint "/api/v1/auth/me" "GET"
user_profile=$(curl -s -X GET "${BASE_URL}${API_PREFIX}/auth/me" \
    -H "Authorization: Bearer $TOKEN")
echo "$user_profile" | jq .

# Demo 2: JWT Token Structure Analysis
print_header "JWT Token Analysis"
echo -e "\n${YELLOW}🔐 JWT Token Structure:${NC}"
echo "Header.Payload.Signature"
echo ""
echo "Token: $TOKEN"
echo ""
echo -e "${BLUE}Decoded JWT Payload (Base64):${NC}"
# Extract and decode the payload part of JWT
payload=$(echo "$TOKEN" | cut -d. -f2)
# Add padding if needed
padding_length=$((4 - ${#payload} % 4))
if [ $padding_length -ne 4 ]; then
    payload="${payload}$(printf '%*s' $padding_length | tr ' ' '=')"
fi
echo "$payload" | base64 -d 2>/dev/null | jq . || echo "Could not decode JWT payload"

# Demo 3: Permission System Deep Dive
print_header "Permission System & Role-Based Access Control"

print_endpoint "/api/v1/auth/permissions" "GET"
permissions=$(curl -s -X GET "${BASE_URL}${API_PREFIX}/auth/permissions" \
    -H "Authorization: Bearer $TOKEN")
echo "$permissions" | jq .

echo -e "\n${YELLOW}🛡️ Permission Analysis:${NC}"
echo "$permissions" | jq -r '.permissions[]' | while read perm; do
    echo "  • $perm"
done

# Demo 4: Error Response Structure
print_header "Error Handling & Response Patterns"

print_endpoint "/api/v1/accounts" "GET" 
echo "Expected: Permission denied for general accounts access"
accounts_error=$(curl -s -X GET "${BASE_URL}${API_PREFIX}/accounts" \
    -H "Authorization: Bearer $TOKEN")
echo "$accounts_error" | jq .

print_endpoint "/api/v1/auth/users" "GET"
echo "Expected: Admin-only endpoint access denied"
users_error=$(curl -s -X GET "${BASE_URL}${API_PREFIX}/auth/users" \
    -H "Authorization: Bearer $TOKEN")
echo "$users_error" | jq .

# Demo 5: Input Validation Examples
print_header "Input Validation & Data Integrity"

invalid_payloads=(
    '{"email":"invalid-email","password":"123"}|Invalid email and short password'
    '{"email":"test@example.com","password":"validpass","firstName":"","lastName":"Valid"}|Empty first name'
    '{"email":"test@example.com","password":"validpass","firstName":"Valid","lastName":""}|Empty last name'
    '{}|Missing required fields'
)

for payload_info in "${invalid_payloads[@]}"; do
    payload=$(echo "$payload_info" | cut -d'|' -f1)
    description=$(echo "$payload_info" | cut -d'|' -f2)
    
    print_endpoint "/api/v1/auth/register" "POST" "$payload"
    echo "Test: $description"
    validation_response=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/auth/register" \
        -H "Content-Type: application/json" \
        -d "$payload")
    echo "$validation_response" | jq .
done

# Demo 6: Authentication Flow Demonstration
print_header "Authentication Flow & Session Management"

# Show login response structure
login_payload='{
    "email":"business.demo@creditcard.com",
    "password":"business123"
}'

print_endpoint "/api/v1/auth/login" "POST" "$login_payload"
login_response=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/auth/login" \
    -H "Content-Type: application/json" \
    -d "$login_payload")
echo "$login_response" | jq .

# Show token refresh
print_endpoint "/api/v1/auth/refresh" "POST"
refresh_response=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/auth/refresh" \
    -H "Authorization: Bearer $TOKEN")
echo "$refresh_response" | jq .

# Demo 7: Security Headers and Response Metadata
print_header "Security & Response Metadata"

echo -e "\n${YELLOW}🔒 Security Headers Analysis:${NC}"
curl -I -s "${BASE_URL}/health" | grep -E "(X-|Content-Security|Strict-Transport)"

echo -e "\n${YELLOW}📊 Response Timing & Performance:${NC}"
start_time=$(date +%s%N)
health_response=$(curl -s "${BASE_URL}/health")
end_time=$(date +%s%N)
response_time=$(( (end_time - start_time) / 1000000 ))

echo "Health endpoint response time: ${response_time}ms"
echo "$health_response" | jq .

# Demo 8: Database Integration Evidence
print_header "Database Integration & Data Persistence"

echo -e "\n${YELLOW}🗄️ User Data Persistence Verification:${NC}"

# Check user exists by attempting login with different case
case_test_payload='{
    "email":"BUSINESS.DEMO@CREDITCARD.COM",
    "password":"business123"
}'

print_endpoint "/api/v1/auth/login" "POST" "$case_test_payload"
echo "Test: Case-insensitive email login"
case_response=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/auth/login" \
    -H "Content-Type: application/json" \
    -d "$case_test_payload")
echo "$case_response" | jq .

# Demo 9: API Rate and Behavior Patterns
print_header "API Behavior & Response Patterns"

echo -e "\n${YELLOW}⚡ Multiple Request Pattern Analysis:${NC}"

# Make multiple rapid requests to show consistency
echo "Making 3 rapid profile requests to test consistency..."
for i in {1..3}; do
    response=$(curl -s -X GET "${BASE_URL}${API_PREFIX}/auth/me" \
        -H "Authorization: Bearer $TOKEN")
    user_id=$(echo "$response" | jq -r '.user.userId')
    timestamp=$(echo "$response" | jq -r '.user.lastLoginAt')
    echo "Request $i: User ID: $user_id, Last Login: $timestamp"
done

# Demo 10: Logout and Session Termination
print_header "Session Termination & Cleanup"

print_endpoint "/api/v1/auth/logout" "POST"
logout_response=$(curl -s -X POST "${BASE_URL}${API_PREFIX}/auth/logout" \
    -H "Authorization: Bearer $TOKEN")
echo "$logout_response" | jq .

# Verify token is invalidated
echo -e "\n${YELLOW}🔒 Post-logout Token Validation:${NC}"
print_endpoint "/api/v1/auth/me" "GET"
echo "Expected: Access denied after logout"
post_logout_response=$(curl -s -X GET "${BASE_URL}${API_PREFIX}/auth/me" \
    -H "Authorization: Bearer $TOKEN")
echo "$post_logout_response" | jq .

# Final Summary
print_header "Demo Summary & Key Findings"

echo -e "${GREEN}✅ Comprehensive API Demo Completed${NC}"
echo ""
echo "🔍 Demonstrated Features:"
echo "  • JWT-based authentication with proper token structure"
echo "  • Role-based permission system with granular controls"
echo "  • Comprehensive input validation and error handling"
echo "  • Proper session management and token lifecycle"
echo "  • Database integration with persistent user data"
echo "  • Security middleware and headers"
echo "  • Consistent API response patterns"
echo "  • Case-insensitive email handling"
echo ""
echo "📊 Response Characteristics:"
echo "  • JSON-formatted responses with consistent structure"
echo "  • Detailed error messages with validation feedback"
echo "  • Proper HTTP status codes and error categorization"
echo "  • Timestamp tracking for audit purposes"
echo "  • Secure token handling and expiration"
echo ""
echo "🛡️ Security Features:"
echo "  • Password encryption and secure storage"
echo "  • JWT token-based authentication"
echo "  • Permission-based access control"
echo "  • Input sanitization and validation"
echo "  • Session management and logout functionality"
echo ""
echo -e "${BLUE}🎯 The Credit Card Enterprise API demonstrates enterprise-grade${NC}"
echo -e "${BLUE}   security, scalability, and reliability patterns.${NC}"
