#!/bin/bash

# POC Banking - End-to-End API Test Suite
# This script performs comprehensive API testing with test data

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_GATEWAY="http://localhost:3001"
CUSTOMER_SERVICE="http://localhost:3010"
# Use v1 API endpoints
CUSTOMER_API_BASE="$CUSTOMER_SERVICE/api/v1"
TEST_RESULTS_DIR="test-results"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TEST_LOG="$TEST_RESULTS_DIR/test_run_$TIMESTAMP.log"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Create results directory
mkdir -p "$TEST_RESULTS_DIR"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$TEST_LOG"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1" | tee -a "$TEST_LOG"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1" | tee -a "$TEST_LOG"
    ((TESTS_FAILED++))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$TEST_LOG"
}

# Test execution function
run_test() {
    local test_name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local expected_status=$5
    
    ((TESTS_TOTAL++))
    log_info "Running: $test_name"
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$endpoint" \
            -H "Content-Type: application/json")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    # Save response
    echo "$body" | jq '.' > "$TEST_RESULTS_DIR/${test_name// /_}_response.json" 2>/dev/null || echo "$body" > "$TEST_RESULTS_DIR/${test_name// /_}_response.json"
    
    if [ "$http_code" == "$expected_status" ]; then
        log_success "$test_name (HTTP $http_code)"
        echo "$body"
        return 0
    else
        log_error "$test_name (Expected HTTP $expected_status, got $http_code)"
        echo "$body"
        return 1
    fi
}

# Extract field from JSON response
extract_field() {
    local json=$1
    local field=$2
    echo "$json" | jq -r ".$field" 2>/dev/null || echo ""
}

# Banner
echo ""
echo "======================================"
echo "POC Banking - E2E API Test Suite"
echo "======================================"
echo "Timestamp: $(date)"
echo "API Gateway: $API_GATEWAY"
echo "Test Results: $TEST_RESULTS_DIR"
echo "======================================"
echo "" | tee "$TEST_LOG"

# ============================================
# Pre-flight Checks
# ============================================
log_info "=== Pre-flight Checks ==="

log_info "Checking API Gateway health..."
if curl -s -f "$API_GATEWAY/health" > /dev/null 2>&1; then
    log_success "API Gateway is healthy"
else
    log_error "API Gateway is not responding"
    exit 1
fi

log_info "Checking Customer Service health..."
if curl -s -f "$CUSTOMER_SERVICE/health" > /dev/null 2>&1; then
    log_success "Customer Service is healthy"
else
    log_error "Customer Service is not responding"
    exit 1
fi

sleep 2

# ============================================
# Test Suite 1: Customer Management (REST API)
# ============================================
echo ""
log_info "=== Test Suite 1: Customer Management (REST API) ==="
echo ""

# Test 1.1: Create Customer - John Doe
log_info "Test 1.1: Create Customer - John Doe"
customer1_response=$(run_test "Create Customer John Doe" "POST" "$API_GATEWAY/customers" '{
  "title": "Mr",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "phone": "+15551234567",
  "dateOfBirth": "1985-06-15",
  "gender": "MALE",
  "nationality": "USA",
  "addressLine1": "123 Main Street",
  "addressLine2": "Apt 4B",
  "city": "New York",
  "state": "NY",
  "postalCode": "10001",
  "country": "USA",
  "idType": "PASSPORT",
  "idNumber": "P12345678",
  "idExpiryDate": "2030-12-31",
  "idIssuingCountry": "USA"
}' "201")

customer1_id=$(extract_field "$customer1_response" "data.id")
customer1_number=$(extract_field "$customer1_response" "data.customer_number")
log_info "Customer 1 ID: $customer1_id"
log_info "Customer 1 Number: $customer1_number"

sleep 1

# Test 1.2: Create Customer - Jane Smith
log_info "Test 1.2: Create Customer - Jane Smith"
customer2_response=$(run_test "Create Customer Jane Smith" "POST" "$API_GATEWAY/customers" '{
  "title": "Ms",
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane.smith@example.com",
  "phone": "+15559876543",
  "dateOfBirth": "1990-03-22",
  "gender": "FEMALE",
  "nationality": "USA",
  "addressLine1": "456 Oak Avenue",
  "city": "Los Angeles",
  "state": "CA",
  "postalCode": "90001",
  "country": "USA",
  "idType": "DRIVERS_LICENSE",
  "idNumber": "DL987654321",
  "idExpiryDate": "2028-06-30",
  "idIssuingCountry": "USA"
}' "201")

customer2_id=$(extract_field "$customer2_response" "data.id")
log_info "Customer 2 ID: $customer2_id"

sleep 1

# Test 1.3: Create Customer - Robert Johnson
log_info "Test 1.3: Create Customer - Robert Johnson"
customer3_response=$(run_test "Create Customer Robert Johnson" "POST" "$API_GATEWAY/customers" '{
  "title": "Dr",
  "firstName": "Robert",
  "lastName": "Johnson",
  "email": "robert.johnson@example.com",
  "phone": "+15555555555",
  "dateOfBirth": "1975-11-10",
  "gender": "MALE",
  "nationality": "USA",
  "addressLine1": "789 Elm Street",
  "city": "Chicago",
  "state": "IL",
  "postalCode": "60601",
  "country": "USA",
  "idType": "PASSPORT",
  "idNumber": "P87654321",
  "idExpiryDate": "2029-05-15",
  "idIssuingCountry": "USA"
}' "201")

customer3_id=$(extract_field "$customer3_response" "data.id")
log_info "Customer 3 ID: $customer3_id"

sleep 1

# Test 1.4: Duplicate Email - Should Fail
log_info "Test 1.4: Create Customer with Duplicate Email (Should Fail)"
run_test "Create Customer Duplicate Email" "POST" "$API_GATEWAY/customers" '{
  "firstName": "Duplicate",
  "lastName": "User",
  "email": "john.doe@example.com",
  "phone": "+15551111111",
  "dateOfBirth": "1980-01-01"
}' "409"

sleep 1

# Test 1.5: Get All Customers
log_info "Test 1.5: Get All Customers"
run_test "Get All Customers" "GET" "$API_GATEWAY/customers" "" "200"

sleep 1

# Test 1.6: Get Customer by ID
log_info "Test 1.6: Get Customer by ID"
if [ -n "$customer1_id" ]; then
    run_test "Get Customer by ID" "GET" "$API_GATEWAY/customers/$customer1_id" "" "200"
else
    log_error "Customer 1 ID not available, skipping test"
fi

sleep 1

# Test 1.7: Get Customers with Pagination
log_info "Test 1.7: Get Customers with Pagination"
run_test "Get Customers Page 1 Limit 2" "GET" "$API_GATEWAY/customers?page=1&limit=2" "" "200"

sleep 1

# Test 1.8: Update Customer
log_info "Test 1.8: Update Customer"
if [ -n "$customer1_id" ]; then
    run_test "Update Customer Email" "PUT" "$API_GATEWAY/customers/$customer1_id" '{
      "email": "john.doe.updated@example.com",
      "phone": "+15551234999",
      "addressLine1": "123 Main Street Updated"
    }' "200"
else
    log_error "Customer 1 ID not available, skipping test"
fi

sleep 1

# Test 1.9: Get Customer KYC Status
log_info "Test 1.9: Get Customer KYC Status"
if [ -n "$customer1_id" ]; then
    run_test "Get Customer KYC Status" "GET" "$API_GATEWAY/customers/$customer1_id/kyc" "" "200"
else
    log_error "Customer 1 ID not available, skipping test"
fi

sleep 1

# Test 1.10: Update KYC Status - Verify Customer
log_info "Test 1.10: Update KYC Status - Verify Customer"
if [ -n "$customer1_id" ]; then
    run_test "Verify Customer KYC" "POST" "$API_GATEWAY/customers/$customer1_id/kyc/verify" '{
      "status": "VERIFIED",
      "verifiedBy": "admin@bank.com",
      "riskRating": "LOW"
    }' "200"
else
    log_error "Customer 1 ID not available, skipping test"
fi

sleep 1

# Test 1.11: Update KYC Status - In Progress
log_info "Test 1.11: Update KYC Status - In Progress"
if [ -n "$customer2_id" ]; then
    run_test "Set Customer KYC In Progress" "POST" "$API_GATEWAY/customers/$customer2_id/kyc/verify" '{
      "status": "IN_PROGRESS",
      "verifiedBy": "kyc_team@bank.com",
      "riskRating": "MEDIUM"
    }' "200"
else
    log_error "Customer 2 ID not available, skipping test"
fi

sleep 1

# Test 1.12: Filter Customers by Status
log_info "Test 1.12: Filter Customers by Status"
run_test "Get Active Customers" "GET" "$API_GATEWAY/customers?status=ACTIVE" "" "200"

sleep 1

# Test 1.13: Filter Customers by KYC Status
log_info "Test 1.13: Filter Customers by KYC Status"
run_test "Get Verified Customers" "GET" "$API_GATEWAY/customers?kyc_status=VERIFIED" "" "200"

sleep 1

# ============================================
# Test Suite 2: BIAN API - Party Reference Data Management
# ============================================
echo ""
log_info "=== Test Suite 2: BIAN API - Party Reference Data Management ==="
echo ""

# Test 2.1: BIAN Initiate Party Reference Profile
log_info "Test 2.1: BIAN Initiate Party Reference Profile"
bian_customer1_response=$(run_test "BIAN Initiate Party Profile" "POST" "$API_GATEWAY/sd-party-reference-data-management/v1/party-reference-profile/initiate" '{
  "partyName": {
    "firstName": "Emily",
    "lastName": "Williams"
  },
  "contactDetails": {
    "email": "emily.williams@example.com",
    "phone": "+15556789012"
  },
  "identificationDocuments": {
    "type": "PASSPORT",
    "number": "P11223344"
  },
  "riskAssessment": {
    "rating": "LOW"
  }
}' "201")

bian_customer1_id=$(extract_field "$bian_customer1_response" "controlRecordId")
log_info "BIAN Customer ID: $bian_customer1_id"

sleep 1

# Test 2.2: BIAN Retrieve Party Reference Profile
log_info "Test 2.2: BIAN Retrieve Party Reference Profile"
if [ -n "$bian_customer1_id" ]; then
    run_test "BIAN Retrieve Party Profile" "GET" "$API_GATEWAY/sd-party-reference-data-management/v1/party-reference-profile/$bian_customer1_id/retrieve" "" "200"
else
    log_error "BIAN Customer ID not available, skipping test"
fi

sleep 1

# Test 2.3: BIAN Update Party Reference Profile
log_info "Test 2.3: BIAN Update Party Reference Profile"
if [ -n "$bian_customer1_id" ]; then
    run_test "BIAN Update Party Profile" "PUT" "$API_GATEWAY/sd-party-reference-data-management/v1/party-reference-profile/$bian_customer1_id/update" '{
      "contactDetails": {
        "email": "emily.williams.updated@example.com",
        "phone": "+15556789999"
      },
      "status": "ACTIVE",
      "riskRating": "MEDIUM"
    }' "200"
else
    log_error "BIAN Customer ID not available, skipping test"
fi

sleep 1

# Test 2.4: BIAN Control - Suspend Customer
log_info "Test 2.4: BIAN Control - Suspend Customer"
if [ -n "$customer3_id" ]; then
    run_test "BIAN Suspend Customer" "PUT" "$API_GATEWAY/sd-party-reference-data-management/v1/party-reference-profile/$customer3_id/control?action=suspend" '{}' "200"
else
    log_error "Customer 3 ID not available, skipping test"
fi

sleep 1

# Test 2.5: BIAN Control - Activate Customer
log_info "Test 2.5: BIAN Control - Activate Customer"
if [ -n "$customer3_id" ]; then
    run_test "BIAN Activate Customer" "PUT" "$API_GATEWAY/sd-party-reference-data-management/v1/party-reference-profile/$customer3_id/control?action=activate" '{}' "200"
else
    log_error "Customer 3 ID not available, skipping test"
fi

sleep 1

# Test 2.6: BIAN Control - Block Customer
log_info "Test 2.6: BIAN Control - Block Customer"
if [ -n "$bian_customer1_id" ]; then
    run_test "BIAN Block Customer" "PUT" "$API_GATEWAY/sd-party-reference-data-management/v1/party-reference-profile/$bian_customer1_id/control?action=block" '{}' "200"
else
    log_error "BIAN Customer ID not available, skipping test"
fi

sleep 1

# ============================================
# Test Suite 3: Validation & Error Handling
# ============================================
echo ""
log_info "=== Test Suite 3: Validation & Error Handling ==="
echo ""

# Test 3.1: Missing Required Field
log_info "Test 3.1: Missing Required Field (Should Fail)"
run_test "Create Customer Missing Email" "POST" "$API_GATEWAY/customers" '{
  "firstName": "Invalid",
  "lastName": "User",
  "phone": "+15551111111",
  "dateOfBirth": "1980-01-01"
}' "400"

sleep 1

# Test 3.2: Invalid Email Format
log_info "Test 3.2: Invalid Email Format (Should Fail)"
run_test "Create Customer Invalid Email" "POST" "$API_GATEWAY/customers" '{
  "firstName": "Invalid",
  "lastName": "User",
  "email": "not-an-email",
  "phone": "+15551111111",
  "dateOfBirth": "1980-01-01"
}' "400"

sleep 1

# Test 3.3: Invalid Date Format
log_info "Test 3.3: Invalid Date Format (Should Fail)"
run_test "Create Customer Invalid Date" "POST" "$API_GATEWAY/customers" '{
  "firstName": "Invalid",
  "lastName": "User",
  "email": "invalid@example.com",
  "phone": "+15551111111",
  "dateOfBirth": "not-a-date"
}' "400"

sleep 1

# Test 3.4: Get Non-Existent Customer
log_info "Test 3.4: Get Non-Existent Customer (Should Fail)"
run_test "Get Non-Existent Customer" "GET" "$API_GATEWAY/customers/00000000-0000-0000-0000-000000000000" "" "404"

sleep 1

# Test 3.5: Update Non-Existent Customer
log_info "Test 3.5: Update Non-Existent Customer (Should Fail)"
run_test "Update Non-Existent Customer" "PUT" "$API_GATEWAY/customers/00000000-0000-0000-0000-000000000000" '{
  "email": "test@example.com"
}' "404"

sleep 1

# ============================================
# Test Suite 4: Performance & Load Testing
# ============================================
echo ""
log_info "=== Test Suite 4: Performance & Load Testing ==="
echo ""

# Test 4.1: Rapid Customer Creation
log_info "Test 4.1: Create 10 Customers Rapidly"
for i in {1..10}; do
    run_test "Bulk Create Customer $i" "POST" "$API_GATEWAY/customers" "{
      \"firstName\": \"Bulk\",
      \"lastName\": \"User$i\",
      \"email\": \"bulk.user$i@example.com\",
      \"phone\": \"+1555000$i$i$i$i\",
      \"dateOfBirth\": \"1990-01-$i\"
    }" "201" > /dev/null 2>&1 || log_error "Bulk create $i failed"
done

sleep 1

# Test 4.2: Large Pagination Request
log_info "Test 4.2: Get Customers with Large Limit"
run_test "Get Customers Large Limit" "GET" "$API_GATEWAY/customers?limit=50" "" "200"

sleep 1

# ============================================
# Test Suite 5: Integration Testing
# ============================================
echo ""
log_info "=== Test Suite 5: Integration Testing ==="
echo ""

# Test 5.1: Complete Customer Lifecycle
log_info "Test 5.1: Complete Customer Lifecycle"

# Create
lifecycle_customer_response=$(run_test "Lifecycle Create" "POST" "$API_GATEWAY/customers" '{
  "firstName": "Lifecycle",
  "lastName": "Test",
  "email": "lifecycle.test@example.com",
  "phone": "+15559999999",
  "dateOfBirth": "1988-08-08"
}' "201")

lifecycle_customer_id=$(extract_field "$lifecycle_customer_response" "data.id")

if [ -n "$lifecycle_customer_id" ]; then
    # Retrieve
    run_test "Lifecycle Retrieve" "GET" "$API_GATEWAY/customers/$lifecycle_customer_id" "" "200"
    
    # Update
    run_test "Lifecycle Update" "PUT" "$API_GATEWAY/customers/$lifecycle_customer_id" '{
      "email": "lifecycle.updated@example.com"
    }' "200"
    
    # Verify KYC
    run_test "Lifecycle KYC Verify" "POST" "$API_GATEWAY/customers/$lifecycle_customer_id/kyc/verify" '{
      "status": "VERIFIED",
      "verifiedBy": "system",
      "riskRating": "LOW"
    }' "200"
    
    # Suspend
    run_test "Lifecycle Suspend" "PUT" "$API_GATEWAY/sd-party-reference-data-management/v1/party-reference-profile/$lifecycle_customer_id/control?action=suspend" '{}' "200"
    
    # Reactivate
    run_test "Lifecycle Activate" "PUT" "$API_GATEWAY/sd-party-reference-data-management/v1/party-reference-profile/$lifecycle_customer_id/control?action=activate" '{}' "200"
    
    log_success "Complete Customer Lifecycle Test Passed"
else
    log_error "Could not complete lifecycle test - customer ID not available"
fi

sleep 1

# ============================================
# Test Results Summary
# ============================================
echo ""
echo "======================================"
echo "Test Results Summary"
echo "======================================"
echo "Total Tests:  $TESTS_TOTAL" | tee -a "$TEST_LOG"
echo -e "${GREEN}Passed:       $TESTS_PASSED${NC}" | tee -a "$TEST_LOG"
echo -e "${RED}Failed:       $TESTS_FAILED${NC}" | tee -a "$TEST_LOG"
echo "Success Rate: $(echo "scale=2; $TESTS_PASSED * 100 / $TESTS_TOTAL" | bc)%" | tee -a "$TEST_LOG"
echo "======================================"
echo ""
echo "Detailed results saved to: $TEST_RESULTS_DIR"
echo "Test log: $TEST_LOG"
echo ""

# Generate HTML report
cat > "$TEST_RESULTS_DIR/report_$TIMESTAMP.html" <<EOF
<!DOCTYPE html>
<html>
<head>
    <title>POC Banking API Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; }
        .summary { background: #ecf0f1; padding: 15px; margin: 20px 0; }
        .passed { color: #27ae60; font-weight: bold; }
        .failed { color: #e74c3c; font-weight: bold; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background: #3498db; color: white; }
    </style>
</head>
<body>
    <div class="header">
        <h1>POC Banking API Test Report</h1>
        <p>Generated: $(date)</p>
    </div>
    <div class="summary">
        <h2>Summary</h2>
        <p>Total Tests: $TESTS_TOTAL</p>
        <p class="passed">Passed: $TESTS_PASSED</p>
        <p class="failed">Failed: $TESTS_FAILED</p>
        <p>Success Rate: $(echo "scale=2; $TESTS_PASSED * 100 / $TESTS_TOTAL" | bc)%</p>
    </div>
    <h2>Test Suites</h2>
    <ul>
        <li>Customer Management (REST API)</li>
        <li>BIAN API - Party Reference Data Management</li>
        <li>Validation & Error Handling</li>
        <li>Performance & Load Testing</li>
        <li>Integration Testing</li>
    </ul>
    <p>See test log for detailed results: <code>$TEST_LOG</code></p>
</body>
</html>
EOF

log_info "HTML report generated: $TEST_RESULTS_DIR/report_$TIMESTAMP.html"

# Exit with appropriate code
if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Check logs for details.${NC}"
    exit 1
fi
