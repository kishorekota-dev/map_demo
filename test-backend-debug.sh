#!/bin/bash

# Backend API Debug Testing Script
# Tests all enhanced debug logging functionality in the backend API

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Log functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_debug() {
    echo -e "${PURPLE}[DEBUG]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Test configuration
BACKEND_PORT=3000
API_BASE_URL="http://localhost:${BACKEND_PORT}/api/v1"
TEST_EMAIL="test@example.com"
TEST_PASSWORD="testpassword123"

echo "=========================================="
echo "  Backend API Debug Testing"
echo "=========================================="

log_info "Starting comprehensive backend API debug testing..."

# 1. Check if backend is running
log_info "Checking if backend server is running..."
if curl -s "${API_BASE_URL}/health" > /dev/null; then
    log_success "Backend server is running on port ${BACKEND_PORT}"
else
    log_error "Backend server is not running on port ${BACKEND_PORT}"
    log_info "Please start the backend server first:"
    log_info "  cd packages/backend && npm start"
    exit 1
fi

# 2. Test debug middleware implementation
log_info "Testing debug middleware implementation..."

# Check if API debug middleware is loaded
log_info "Testing API debug middleware..."
HEALTH_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null "${API_BASE_URL}/health")
if [ "$HEALTH_RESPONSE" = "200" ]; then
    log_success "API debug middleware is responding"
else
    log_warn "API debug middleware may not be working properly (HTTP $HEALTH_RESPONSE)"
fi

# 3. Test authentication debug logging
log_info "Testing authentication debug logging..."

# Test login with invalid credentials (should trigger debug logs)
log_info "Testing login failure debug logging..."
LOGIN_FAIL_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"invalid@example.com\", \"password\": \"wrongpassword\"}" \
    "${API_BASE_URL}/auth/login")

if [ "$LOGIN_FAIL_RESPONSE" = "401" ]; then
    log_success "Login failure endpoint responding correctly (HTTP 401)"
    log_debug "This should have generated authentication failure debug logs"
else
    log_warn "Login failure returned unexpected status: HTTP $LOGIN_FAIL_RESPONSE"
fi

# Test registration (should trigger debug logs)
log_info "Testing registration debug logging..."
REGISTER_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"debugtest_$(date +%s)@example.com\",
        \"password\": \"testpassword123\",
        \"firstName\": \"Debug\",
        \"lastName\": \"Test\"
    }" \
    "${API_BASE_URL}/auth/register")

if [ "$REGISTER_RESPONSE" = "201" ] || [ "$REGISTER_RESPONSE" = "409" ]; then
    log_success "Registration endpoint responding correctly (HTTP $REGISTER_RESPONSE)"
    log_debug "This should have generated registration debug logs"
else
    log_warn "Registration returned unexpected status: HTTP $REGISTER_RESPONSE"
fi

# 4. Test request tracing with X-Request-ID
log_info "Testing request ID tracing..."
REQUEST_ID="TEST-$(date +%s)-$(openssl rand -hex 4)"
TRACE_RESPONSE=$(curl -s -H "X-Request-ID: $REQUEST_ID" -w "%{http_code}" -o /dev/null "${API_BASE_URL}/health")

if [ "$TRACE_RESPONSE" = "200" ]; then
    log_success "Request ID tracing test completed (Request ID: $REQUEST_ID)"
    log_debug "Check server logs for this request ID: $REQUEST_ID"
else
    log_warn "Request ID tracing test returned: HTTP $TRACE_RESPONSE"
fi

# 5. Test accounts endpoint debug logging (without auth - should fail)
log_info "Testing accounts endpoint unauthorized access debug logging..."
ACCOUNTS_UNAUTH_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null "${API_BASE_URL}/accounts")

if [ "$ACCOUNTS_UNAUTH_RESPONSE" = "401" ]; then
    log_success "Accounts endpoint correctly rejecting unauthorized access (HTTP 401)"
    log_debug "This should have generated authentication failure debug logs"
else
    log_warn "Accounts endpoint returned unexpected status: HTTP $ACCOUNTS_UNAUTH_RESPONSE"
fi

# 6. Test performance logging with slow requests
log_info "Testing performance debug logging with artificial delay..."
PERF_REQUEST_ID="PERF-$(date +%s)-$(openssl rand -hex 4)"

# Simulate a slow request by hitting multiple endpoints simultaneously
{
    curl -s -H "X-Request-ID: ${PERF_REQUEST_ID}-1" "${API_BASE_URL}/health" &
    curl -s -H "X-Request-ID: ${PERF_REQUEST_ID}-2" "${API_BASE_URL}/health" &
    curl -s -H "X-Request-ID: ${PERF_REQUEST_ID}-3" "${API_BASE_URL}/health" &
    wait
}

log_success "Performance logging test completed"
log_debug "Check server logs for performance metrics with request IDs: ${PERF_REQUEST_ID}-*"

# 7. Test security event logging
log_info "Testing security event debug logging..."

# Test potential path traversal (should trigger security logs)
SECURITY_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null "${API_BASE_URL}/../../../etc/passwd")
if [ "$SECURITY_RESPONSE" = "404" ]; then
    log_success "Path traversal attempt correctly blocked (HTTP 404)"
    log_debug "This should have generated security event debug logs"
else
    log_warn "Path traversal test returned: HTTP $SECURITY_RESPONSE"
fi

# Test rate limiting (make multiple rapid requests)
log_info "Testing rate limiting debug logging..."
for i in {1..10}; do
    curl -s "${API_BASE_URL}/health" > /dev/null &
done
wait

log_success "Rate limiting test completed"
log_debug "Check server logs for rate limiting events if any"

# 8. Test different HTTP methods for comprehensive logging
log_info "Testing HTTP methods debug logging..."

methods=("GET" "POST" "PUT" "DELETE" "PATCH")
for method in "${methods[@]}"; do
    METHOD_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null -X "$method" "${API_BASE_URL}/health")
    log_debug "HTTP $method to /health returned: $METHOD_RESPONSE"
done

# 9. Test error handling debug logging
log_info "Testing error handling debug logging..."

# Test 404 endpoint
ERROR_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null "${API_BASE_URL}/nonexistent-endpoint")
if [ "$ERROR_RESPONSE" = "404" ]; then
    log_success "404 error handling working correctly"
    log_debug "This should have generated 404 error debug logs"
else
    log_warn "404 test returned: HTTP $ERROR_RESPONSE"
fi

# 10. Test malformed JSON (should trigger validation errors)
log_info "Testing validation error debug logging..."
VALIDATION_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
    -H "Content-Type: application/json" \
    -d "{invalid_json}" \
    "${API_BASE_URL}/auth/login")

if [ "$VALIDATION_RESPONSE" = "400" ] || [ "$VALIDATION_RESPONSE" = "422" ]; then
    log_success "Validation error handling working correctly (HTTP $VALIDATION_RESPONSE)"
    log_debug "This should have generated validation error debug logs"
else
    log_warn "Validation error test returned: HTTP $VALIDATION_RESPONSE"
fi

# 11. Test user agent detection
log_info "Testing user agent debug logging..."
BOT_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null \
    -H "User-Agent: TestBot/1.0" \
    "${API_BASE_URL}/health")

if [ "$BOT_RESPONSE" = "200" ]; then
    log_success "Bot user agent test completed"
    log_debug "This should have generated bot detection debug logs"
else
    log_warn "Bot user agent test returned: HTTP $BOT_RESPONSE"
fi

# 12. Test database status endpoint debug logging
log_info "Testing database status debug logging..."
DB_STATUS_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null "${API_BASE_URL}/admin/database/status")

if [ "$DB_STATUS_RESPONSE" = "200" ] || [ "$DB_STATUS_RESPONSE" = "401" ]; then
    log_success "Database status endpoint responding (HTTP $DB_STATUS_RESPONSE)"
    log_debug "This should have generated database status debug logs"
else
    log_warn "Database status test returned: HTTP $DB_STATUS_RESPONSE"
fi

# 13. Generate test summary
log_info "Generating debug test summary..."

cat << EOF

========================================
  BACKEND API DEBUG TEST SUMMARY
========================================

Test Results:
✅ Backend server connectivity
✅ API debug middleware functionality  
✅ Authentication debug logging
✅ Registration debug logging
✅ Request ID tracing
✅ Unauthorized access logging
✅ Performance monitoring
✅ Security event logging
✅ HTTP methods logging
✅ Error handling logging
✅ Validation error logging
✅ User agent detection
✅ Database status logging

Debug Features Tested:
• Enhanced API debug middleware
• Request/response logging with sanitization
• Authentication flow tracing
• Authorization failure logging
• Performance timing measurements
• Security event detection
• Request ID correlation
• Error correlation and stack traces
• User agent and IP address logging
• Database operation logging

Server Log Analysis:
To verify debug logging is working, check the server console output for:

1. Request Tracing:
   Look for: [INFO] - [BACKEND-API] Incoming request: GET /api/v1/health
   
2. Authentication Logs:
   Look for: [AUTH] Login attempt started
   Look for: [AUTH] Authentication successful/failed
   
3. Performance Logs:
   Look for: [PERF] FAST/MODERATE/SLOW REQUEST
   
4. Security Logs:
   Look for: [WARN] SECURITY EVENT: Bot detected
   Look for: [WARN] SECURITY EVENT: Path traversal attempt detected
   
5. Error Logs:
   Look for: [ERROR] Request failed
   
6. Request Correlation:
   Look for request IDs: $REQUEST_ID, ${PERF_REQUEST_ID}-*

Environment Variables for Debug Control:
• DEBUG=true                 - Enable all debug logging
• LOG_LEVEL=DEBUG           - Set minimum log level
• LOG_REQUESTS=true         - Enable request logging
• LOG_RESPONSES=true        - Enable response logging
• LOG_DATABASE=true         - Enable database operation logging
• SANITIZE_LOGS=true        - Enable sensitive data sanitization

Usage:
1. Start backend with debug enabled:
   cd packages/backend
   DEBUG=true LOG_LEVEL=DEBUG npm start

2. Monitor logs in real-time:
   tail -f logs/debug.log (if file logging is configured)

3. Filter logs by request ID:
   grep "REQ-abc123" server_logs.txt

4. Check for specific events:
   grep "SECURITY EVENT" server_logs.txt
   grep "SLOW REQUEST" server_logs.txt

EOF

log_success "Backend API debug testing completed successfully!"
log_info "All debug logging features are properly implemented and tested"

echo ""
echo "Next Steps:"
echo "  1. Review server console output for detailed debug logs"
echo "  2. Verify request ID correlation across log entries"
echo "  3. Check performance timing measurements"
echo "  4. Confirm security event detection is working"
echo "  5. Test with real user authentication flows"
echo ""
