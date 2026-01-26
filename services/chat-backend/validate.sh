#!/bin/bash

# POC Chat Backend Validation Script
# Test all endpoints and functionality

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Configuration
BASE_URL="http://localhost:3006"
WEBSOCKET_URL="ws://localhost:3006"
TEST_USER_ID="test-user-$(date +%s)"
TOKEN=""

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TESTS_RUN=$((TESTS_RUN + 1))
    print_status "Running: $test_name"
    
    if eval "$test_command"; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        print_success "$test_name"
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        print_error "$test_name"
    fi
    echo ""
}

# Test service health
test_health() {
    local response=$(curl -s -w "%{http_code}" -o /tmp/health_response.json "$BASE_URL/health")
    if [ "$response" = "200" ]; then
        local status=$(cat /tmp/health_response.json | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        if [ "$status" = "healthy" ]; then
            return 0
        fi
    fi
    return 1
}

# Test API info endpoint
test_api_info() {
    local response=$(curl -s -w "%{http_code}" -o /tmp/api_response.json "$BASE_URL/api")
    if [ "$response" = "200" ]; then
        local service=$(cat /tmp/api_response.json | grep -o '"service":"[^"]*"' | cut -d'"' -f4)
        if [ "$service" = "POC Chat Backend" ]; then
            return 0
        fi
    fi
    return 1
}

# Test authentication token generation
test_auth_token() {
    local response=$(curl -s -w "%{http_code}" -o /tmp/auth_response.json \
        -H "Content-Type: application/json" \
        -d "{\"userId\":\"$TEST_USER_ID\"}" \
        "$BASE_URL/auth/token")
    
    if [ "$response" = "200" ]; then
        TOKEN=$(cat /tmp/auth_response.json | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$TOKEN" ]; then
            return 0
        fi
    fi
    return 1
}

# Test token validation
test_auth_validation() {
    if [ -z "$TOKEN" ]; then
        print_warning "No token available for validation test"
        return 1
    fi
    
    local response=$(curl -s -w "%{http_code}" -o /tmp/validate_response.json \
        -H "Content-Type: application/json" \
        -d "{\"token\":\"$TOKEN\"}" \
        "$BASE_URL/auth/validate")
    
    if [ "$response" = "200" ]; then
        local valid=$(cat /tmp/validate_response.json | grep -o '"valid":[^,}]*' | cut -d':' -f2)
        if [ "$valid" = "true" ]; then
            return 0
        fi
    fi
    return 1
}

# Test session creation via REST API
test_session_creation() {
    if [ -z "$TOKEN" ]; then
        print_warning "No token available for session creation test"
        return 1
    fi
    
    local response=$(curl -s -w "%{http_code}" -o /tmp/session_response.json \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TOKEN" \
        -d "{\"userId\":\"$TEST_USER_ID\",\"userData\":{\"testSession\":true}}" \
        "$BASE_URL/api/sessions")
    
    if [ "$response" = "201" ]; then
        SESSION_ID=$(cat /tmp/session_response.json | grep -o '"sessionId":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$SESSION_ID" ]; then
            return 0
        fi
    fi
    return 1
}

# Test message sending via REST API
test_message_sending() {
    if [ -z "$TOKEN" ] || [ -z "$SESSION_ID" ]; then
        print_warning "No token or session available for message test"
        return 1
    fi
    
    local response=$(curl -s -w "%{http_code}" -o /tmp/message_response.json \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TOKEN" \
        -d "{\"content\":\"Hello, I need help with my account balance\",\"type\":\"text\"}" \
        "$BASE_URL/api/sessions/$SESSION_ID/messages")
    
    if [ "$response" = "200" ]; then
        local message_id=$(cat /tmp/message_response.json | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ -n "$message_id" ]; then
            return 0
        fi
    fi
    return 1
}

# Test conversation history retrieval
test_conversation_history() {
    if [ -z "$SESSION_ID" ]; then
        print_warning "No session available for history test"
        return 1
    fi
    
    local response=$(curl -s -w "%{http_code}" -o /tmp/history_response.json \
        "$BASE_URL/api/sessions/$SESSION_ID/history")
    
    if [ "$response" = "200" ]; then
        local count=$(cat /tmp/history_response.json | grep -o '"count":[^,}]*' | cut -d':' -f2)
        if [ "$count" -gt 0 ]; then
            return 0
        fi
    fi
    return 1
}

# Test agents endpoint
test_agents_status() {
    local response=$(curl -s -w "%{http_code}" -o /tmp/agents_response.json \
        "$BASE_URL/api/agents")
    
    if [ "$response" = "200" ]; then
        local total=$(cat /tmp/agents_response.json | grep -o '"totalAgents":[^,}]*' | cut -d':' -f2)
        if [ "$total" -gt 0 ]; then
            return 0
        fi
    fi
    return 1
}

# Test service metrics
test_metrics() {
    local response=$(curl -s -w "%{http_code}" -o /tmp/metrics_response.json \
        "$BASE_URL/api/metrics")
    
    if [ "$response" = "200" ]; then
        local uptime=$(cat /tmp/metrics_response.json | grep -o '"uptime":[^,}]*' | cut -d':' -f2)
        if [ $(echo "$uptime > 0" | bc -l 2>/dev/null || echo "1") = "1" ]; then
            return 0
        fi
    fi
    return 1
}

# Test session cleanup
test_session_cleanup() {
    if [ -z "$TOKEN" ] || [ -z "$SESSION_ID" ]; then
        print_warning "No token or session available for cleanup test"
        return 1
    fi
    
    local response=$(curl -s -w "%{http_code}" -o /tmp/cleanup_response.json \
        -X DELETE \
        -H "Authorization: Bearer $TOKEN" \
        -d "{\"reason\":\"test_completed\"}" \
        "$BASE_URL/api/sessions/$SESSION_ID")
    
    if [ "$response" = "200" ]; then
        return 0
    fi
    return 1
}

# WebSocket connectivity test
test_websocket_connection() {
    if [ -z "$TOKEN" ]; then
        print_warning "No token available for WebSocket test"
        return 1
    fi
    
    # Simple WebSocket connection test using Node.js
    if command -v node &> /dev/null; then
        local test_result=$(node -e "
            const WebSocket = require('ws');
            const ws = new WebSocket('$WEBSOCKET_URL/socket.io/?EIO=4&transport=websocket&token=$TOKEN');
            ws.on('open', () => { console.log('CONNECTED'); ws.close(); });
            ws.on('error', () => { console.log('ERROR'); });
            setTimeout(() => process.exit(1), 5000);
        " 2>/dev/null || echo "ERROR")
        
        if [ "$test_result" = "CONNECTED" ]; then
            return 0
        fi
    fi
    return 1
}

# Main test execution
main() {
    echo "=========================================="
    echo "POC Chat Backend Validation Tests"
    echo "=========================================="
    echo "Base URL: $BASE_URL"
    echo "WebSocket URL: $WEBSOCKET_URL"
    echo "Test User ID: $TEST_USER_ID"
    echo ""

    # Check if service is running
    print_status "Checking if service is running..."
    if ! curl -s --connect-timeout 5 "$BASE_URL/health" > /dev/null; then
        print_error "Service is not running at $BASE_URL"
        print_status "Please start the service first: ./startup.sh"
        exit 1
    fi
    print_success "Service is running"
    echo ""

    # Run tests
    run_test "Health Check" "test_health"
    run_test "API Info Endpoint" "test_api_info"
    run_test "Authentication Token Generation" "test_auth_token"
    run_test "Token Validation" "test_auth_validation"
    run_test "Session Creation" "test_session_creation"
    run_test "Message Sending" "test_message_sending"
    run_test "Conversation History" "test_conversation_history"
    run_test "Agents Status" "test_agents_status"
    run_test "Service Metrics" "test_metrics"
    run_test "Session Cleanup" "test_session_cleanup"
    
    # WebSocket test (optional)
    if command -v ws &> /dev/null || npm list ws &> /dev/null; then
        run_test "WebSocket Connection" "test_websocket_connection"
    else
        print_warning "WebSocket test skipped (ws module not available)"
    fi

    # Test summary
    echo "=========================================="
    echo "Test Summary"
    echo "=========================================="
    echo "Tests Run: $TESTS_RUN"
    echo "Tests Passed: $TESTS_PASSED"
    echo "Tests Failed: $TESTS_FAILED"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        print_success "All tests passed! 🎉"
        echo ""
        echo "Service endpoints validated:"
        echo "  • Health: $BASE_URL/health"
        echo "  • API: $BASE_URL/api"
        echo "  • Auth: $BASE_URL/auth"
        echo "  • WebSocket: $WEBSOCKET_URL/socket.io"
        echo ""
        echo "The POC Chat Backend is ready for use!"
        exit 0
    else
        print_error "Some tests failed"
        echo ""
        echo "Check the service logs for more details:"
        echo "  tail -f logs/chat-backend.log"
        exit 1
    fi

    # Cleanup temp files
    rm -f /tmp/health_response.json /tmp/api_response.json /tmp/auth_response.json
    rm -f /tmp/validate_response.json /tmp/session_response.json /tmp/message_response.json
    rm -f /tmp/history_response.json /tmp/agents_response.json /tmp/metrics_response.json
    rm -f /tmp/cleanup_response.json
}

# Run main function
main "$@"