#!/bin/bash

# POC Chat Backend - Quick Test Script
# Tests all endpoints to verify deployment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_test() {
    echo -e "${BLUE}🧪 Testing: $1${NC}"
}

print_success() {
    echo -e "${GREEN}  ✅ $1${NC}"
}

print_error() {
    echo -e "${RED}  ❌ $1${NC}"
}

BASE_URL="${1:-http://localhost:3006}"

echo ""
echo "======================================"
echo "  POC Chat Backend - Deployment Test"
echo "======================================"
echo ""
echo "Testing endpoint: $BASE_URL"
echo ""

# Test 1: Health Check
print_test "Health Check"
if curl -s -f "$BASE_URL/health" > /dev/null 2>&1; then
    HEALTH=$(curl -s "$BASE_URL/health" | jq -r '.status')
    if [ "$HEALTH" = "healthy" ]; then
        print_success "Service is healthy"
    else
        print_error "Service reports unhealthy: $HEALTH"
    fi
else
    print_error "Health check endpoint failed"
fi

# Test 2: API Info
print_test "API Info Endpoint"
if curl -s -f "$BASE_URL/api" > /dev/null 2>&1; then
    SERVICE=$(curl -s "$BASE_URL/api" | jq -r '.service')
    print_success "API endpoint responding: $SERVICE"
else
    print_error "API info endpoint failed"
fi

# Test 3: Metrics
print_test "Metrics Endpoint"
if curl -s -f "$BASE_URL/api/metrics" > /dev/null 2>&1; then
    UPTIME=$(curl -s "$BASE_URL/api/metrics" | jq -r '.uptime')
    print_success "Metrics available (uptime: ${UPTIME}s)"
else
    print_error "Metrics endpoint failed"
fi

# Test 4: CORS Headers
print_test "CORS Headers"
if curl -s -I "$BASE_URL/health" | grep -q "access-control-allow-origin"; then
    print_success "CORS headers present"
else
    print_error "CORS headers missing"
fi

# Test 5: Security Headers
print_test "Security Headers"
HEADERS=$(curl -s -I "$BASE_URL/health")
if echo "$HEADERS" | grep -q "x-content-type-options"; then
    print_success "Security headers present"
else
    print_error "Security headers missing"
fi

# Test 6: Rate Limiting
print_test "Rate Limiting"
if curl -s -I "$BASE_URL/api" | grep -q "ratelimit"; then
    print_success "Rate limiting enabled"
else
    print_error "Rate limiting not detected (may be configured differently)"
fi

# Test 7: Service Dependencies (if health check is detailed)
print_test "Service Dependencies"
DEPS=$(curl -s "$BASE_URL/health" | jq -r '.services // empty')
if [ ! -z "$DEPS" ]; then
    print_success "Dependencies check available"
else
    print_success "Basic health check (dependencies may not be exposed)"
fi

echo ""
echo "======================================"
echo "  Test Summary"
echo "======================================"
echo ""

# Get detailed health info
echo "📊 Service Details:"
curl -s "$BASE_URL/health" | jq '.' 2>/dev/null || echo "  Could not parse health response"

echo ""
echo "✅ Deployment test complete!"
echo ""
echo "Next steps:"
echo "  1. Test WebSocket connection"
echo "  2. Test authentication endpoints"
echo "  3. Send test messages"
echo ""
