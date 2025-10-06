#!/bin/bash

# POC Banking - Simplified E2E API Test Suite
# Tests Customer Service directly (port 3010)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CUSTOMER_SERVICE="http://localhost:3010/api/v1"
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
    echo "$json" | jq -r "$field" 2>/dev/null || echo ""
}

# Banner
echo ""
echo "======================================"
echo "POC Banking - E2E API Test Suite"
echo "======================================"
echo "Timestamp: $(date)"
echo "Customer Service: $CUSTOMER_SERVICE"
echo "Test Results: $TEST_RESULTS_DIR"
echo "======================================"
echo ""

# Pre-flight checks
log_info "=== Pre-flight Checks ==="
log_info "Checking Customer Service health..."
health_response=$(curl -s -w "\n%{http_code}" http://localhost:3010/health)
health_code=$(echo "$health_response" | tail -n1)
if [ "$health_code" == "200" ]; then
    log_success "Customer Service is healthy"
else
    log_error "Customer Service is not responding"
    exit 1
fi

echo ""
log_info "=== Test Suite 1: Customer Management REST API ==="
echo ""

# Test 1: Create Customer 1 (John Doe)
customer1_response=$(run_test "Create Customer (John Doe)" "POST" "$CUSTOMER_SERVICE/customers" '{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "phone": "+1-555-0101",
  "dateOfBirth": "1985-06-15",
  "nationality": "USA",
  "addressLine1": "123 Main Street",
  "city": "New York",
  "state": "NY",
  "postalCode": "10001",
  "country": "USA"
}' "201")

customer1_id=$(extract_field "$customer1_response" ".data.id")
log_info "Customer 1 ID: $customer1_id"

# Test 2: Retrieve Customer
if [ -n "$customer1_id" ]; then
    run_test "Retrieve Customer by ID" "GET" "$CUSTOMER_SERVICE/customers/$customer1_id" "" "200"
fi

# Test 3: List All Customers
run_test "List All Customers" "GET" "$CUSTOMER_SERVICE/customers" "" "200"

# Test 4: Create Customer 2 (Jane Smith)
customer2_response=$(run_test "Create Customer (Jane Smith)" "POST" "$CUSTOMER_SERVICE/customers" '{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane.smith@example.com",
  "phone": "+1-555-0102",
  "dateOfBirth": "1990-03-22",
  "nationality": "USA",
  "addressLine1": "456 Oak Avenue",
  "city": "Los Angeles",
  "state": "CA",
  "postalCode": "90001",
  "country": "USA"
}' "201")

customer2_id=$(extract_field "$customer2_response" ".data.id")
log_info "Customer 2 ID: $customer2_id"

# Test 5: Update Customer
if [ -n "$customer1_id" ]; then
    run_test "Update Customer" "PUT" "$CUSTOMER_SERVICE/customers/$customer1_id" '{
      "phone": "+1-555-0199",
      "addressLine1": "789 Park Avenue",
      "city": "New York",
      "state": "NY",
      "postalCode": "10002",
      "country": "USA"
    }' "200"
fi

# Test 6: Search Customers by Email
run_test "Search Customer by Email" "GET" "$CUSTOMER_SERVICE/customers?email=john.doe@example.com" "" "200"

# Test 7: Pagination
run_test "Pagination (Page 1, Limit 1)" "GET" "$CUSTOMER_SERVICE/customers?page=1&limit=1" "" "200"

# Test 8: Create Customer 3
customer3_response=$(run_test "Create Customer (Robert Johnson)" "POST" "$CUSTOMER_SERVICE/customers" '{
  "firstName": "Robert",
  "lastName": "Johnson",
  "email": "robert.johnson@example.com",
  "phone": "+1-555-0103",
  "dateOfBirth": "1988-11-10",
  "nationality": "USA",
  "addressLine1": "321 Pine Street",
  "city": "Chicago",
  "state": "IL",
  "postalCode": "60601",
  "country": "USA"
}' "201")

customer3_id=$(extract_field "$customer3_response" ".data.id")

echo ""
log_info "=== Test Suite 2: Validation & Error Handling ==="
echo ""

# Test 9: Missing Required Field
run_test "Create Customer (Missing Email)" "POST" "$CUSTOMER_SERVICE/customers" '{
  "firstName": "Invalid",
  "lastName": "Customer",
  "phone": "+1-555-0000",
  "dateOfBirth": "2000-01-01",
  "nationality": "USA"
}' "400"

# Test 10: Invalid Email Format
run_test "Create Customer (Invalid Email)" "POST" "$CUSTOMER_SERVICE/customers" '{
  "firstName": "Invalid",
  "lastName": "Email",
  "email": "not-an-email",
  "phone": "+1-555-0000",
  "dateOfBirth": "2000-01-01",
  "nationality": "USA"
}' "400"

# Test 11: Duplicate Email
run_test "Create Customer (Duplicate Email)" "POST" "$CUSTOMER_SERVICE/customers" '{
  "firstName": "Duplicate",
  "lastName": "User",
  "email": "john.doe@example.com",
  "phone": "+1-555-9999",
  "dateOfBirth": "1995-05-05",
  "nationality": "USA"
}' "409"

# Test 12: Retrieve Non-existent Customer
run_test "Retrieve Non-existent Customer" "GET" "$CUSTOMER_SERVICE/customers/00000000-0000-0000-0000-000000000000" "" "404"

# Test 13: Update Non-existent Customer
run_test "Update Non-existent Customer" "PUT" "$CUSTOMER_SERVICE/customers/00000000-0000-0000-0000-000000000000" '{
  "phone": "+1-555-0000"
}' "404"

echo ""
log_info "=== Test Suite 3: Customer Lifecycle ==="
echo ""

if [ -n "$customer3_id" ]; then
    # Test 14: Suspend Customer
    run_test "Suspend Customer" "PATCH" "$CUSTOMER_SERVICE/customers/$customer3_id/status" '{
      "status": "SUSPENDED"
    }' "200"
    
    # Test 15: Activate Customer
    run_test "Activate Customer" "PATCH" "$CUSTOMER_SERVICE/customers/$customer3_id/status" '{
      "status": "ACTIVE"
    }' "200"
fi

echo ""
log_info "=== Test Suite 4: Cleanup (Optional) ==="
echo ""

# Test 16: Delete Customer (if endpoint exists)
if [ -n "$customer3_id" ]; then
    run_test "Delete Customer" "DELETE" "$CUSTOMER_SERVICE/customers/$customer3_id" "" "200"
fi

echo ""
echo "======================================"
echo "Test Summary"
echo "======================================"
echo "Total Tests: $TESTS_TOTAL"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo "Success Rate: $(echo "scale=2; $TESTS_PASSED * 100 / $TESTS_TOTAL" | bc)%"
echo "======================================"
echo ""
echo "Detailed results saved to: $TEST_RESULTS_DIR"
echo "Test log: $TEST_LOG"
echo ""

# Exit with failure if any tests failed
if [ $TESTS_FAILED -gt 0 ]; then
    exit 1
fi

exit 0
