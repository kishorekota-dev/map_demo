#!/bin/bash

###############################################################################
# POC AI Orchestrator - Test Script
# 
# Tests the AI Orchestrator service endpoints
###############################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BASE_URL="http://localhost:3007"
SESSION_ID="test-session-$(date +%s)"
USER_ID="test-user"
EXECUTION_ID=""

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "       POC AI Orchestrator - API Test Script              "
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Testing service at: $BASE_URL"
echo "Session ID: $SESSION_ID"
echo "User ID: $USER_ID"
echo ""

# Test 1: Health Check
echo -e "${BLUE}[TEST 1]${NC} Health Check"
echo "GET $BASE_URL/health"
echo ""

HEALTH_RESPONSE=$(curl -s "$BASE_URL/health")
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | jq -r '.status' 2>/dev/null || echo "error")

if [ "$HEALTH_STATUS" = "healthy" ]; then
    echo -e "${GREEN}✓ PASSED${NC} - Service is healthy"
    echo "$HEALTH_RESPONSE" | jq . 2>/dev/null || echo "$HEALTH_RESPONSE"
else
    echo -e "${RED}✗ FAILED${NC} - Service is unhealthy"
    echo "$HEALTH_RESPONSE"
    exit 1
fi

echo ""
echo "─────────────────────────────────────────────────────────"
echo ""

# Test 2: Create Session
echo -e "${BLUE}[TEST 2]${NC} Create Session"
echo "POST $BASE_URL/api/orchestrator/session"
echo ""

CREATE_SESSION_RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestrator/session" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"sessionId\": \"$SESSION_ID\",
    \"metadata\": {
      \"test\": true
    }
  }")

CREATE_SUCCESS=$(echo "$CREATE_SESSION_RESPONSE" | jq -r '.success' 2>/dev/null || echo "false")

if [ "$CREATE_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✓ PASSED${NC} - Session created"
    echo "$CREATE_SESSION_RESPONSE" | jq . 2>/dev/null || echo "$CREATE_SESSION_RESPONSE"
else
    echo -e "${YELLOW}⚠ INFO${NC} - Session might already exist or creation not required"
    echo "$CREATE_SESSION_RESPONSE" | jq . 2>/dev/null || echo "$CREATE_SESSION_RESPONSE"
fi

echo ""
echo "─────────────────────────────────────────────────────────"
echo ""

# Test 3: Process Message - Balance Inquiry
echo -e "${BLUE}[TEST 3]${NC} Process Message - Balance Inquiry"
echo "POST $BASE_URL/api/orchestrator/process"
echo ""

PROCESS_RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestrator/process" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"userId\": \"$USER_ID\",
    \"message\": \"What is my account balance?\",
    \"intent\": \"balance_inquiry\",
    \"metadata\": {
      \"test\": true
    }
  }")

PROCESS_SUCCESS=$(echo "$PROCESS_RESPONSE" | jq -r '.success' 2>/dev/null || echo "false")
REQUIRES_INPUT=$(echo "$PROCESS_RESPONSE" | jq -r '.data.requiresHumanInput' 2>/dev/null || echo "false")
EXECUTION_ID=$(echo "$PROCESS_RESPONSE" | jq -r '.data.executionId' 2>/dev/null || echo "")

if [ "$PROCESS_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✓ PASSED${NC} - Message processed"
    echo "$PROCESS_RESPONSE" | jq . 2>/dev/null || echo "$PROCESS_RESPONSE"
    
    if [ "$REQUIRES_INPUT" = "true" ]; then
        echo ""
        echo -e "${YELLOW}[INFO]${NC} Human input required"
        REQUIRED_FIELDS=$(echo "$PROCESS_RESPONSE" | jq -r '.data.requiredFields[]' 2>/dev/null)
        echo "Required fields: $REQUIRED_FIELDS"
    fi
else
    echo -e "${RED}✗ FAILED${NC} - Message processing failed"
    echo "$PROCESS_RESPONSE"
fi

echo ""
echo "─────────────────────────────────────────────────────────"
echo ""

# Test 4: Provide Feedback (if required)
if [ "$REQUIRES_INPUT" = "true" ] && [ ! -z "$EXECUTION_ID" ]; then
    echo -e "${BLUE}[TEST 4]${NC} Provide Feedback - Account ID"
    echo "POST $BASE_URL/api/orchestrator/feedback"
    echo ""
    
    FEEDBACK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestrator/feedback" \
      -H "Content-Type: application/json" \
      -d "{
        \"sessionId\": \"$SESSION_ID\",
        \"executionId\": \"$EXECUTION_ID\",
        \"feedback\": \"Savings account 12345\"
      }")
    
    FEEDBACK_SUCCESS=$(echo "$FEEDBACK_RESPONSE" | jq -r '.success' 2>/dev/null || echo "false")
    
    if [ "$FEEDBACK_SUCCESS" = "true" ]; then
        echo -e "${GREEN}✓ PASSED${NC} - Feedback processed"
        echo "$FEEDBACK_RESPONSE" | jq . 2>/dev/null || echo "$FEEDBACK_RESPONSE"
    else
        echo -e "${RED}✗ FAILED${NC} - Feedback processing failed"
        echo "$FEEDBACK_RESPONSE"
    fi
    
    echo ""
    echo "─────────────────────────────────────────────────────────"
    echo ""
fi

# Test 5: Get Session
echo -e "${BLUE}[TEST 5]${NC} Get Session Details"
echo "GET $BASE_URL/api/orchestrator/session/$SESSION_ID"
echo ""

GET_SESSION_RESPONSE=$(curl -s "$BASE_URL/api/orchestrator/session/$SESSION_ID")
GET_SESSION_SUCCESS=$(echo "$GET_SESSION_RESPONSE" | jq -r '.success' 2>/dev/null || echo "false")

if [ "$GET_SESSION_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✓ PASSED${NC} - Session retrieved"
    echo "$GET_SESSION_RESPONSE" | jq . 2>/dev/null || echo "$GET_SESSION_RESPONSE"
else
    echo -e "${RED}✗ FAILED${NC} - Session retrieval failed"
    echo "$GET_SESSION_RESPONSE"
fi

echo ""
echo "─────────────────────────────────────────────────────────"
echo ""

# Test 6: Get User Sessions
echo -e "${BLUE}[TEST 6]${NC} Get User Sessions"
echo "GET $BASE_URL/api/orchestrator/user/$USER_ID/sessions"
echo ""

GET_USER_SESSIONS_RESPONSE=$(curl -s "$BASE_URL/api/orchestrator/user/$USER_ID/sessions")
GET_USER_SESSIONS_SUCCESS=$(echo "$GET_USER_SESSIONS_RESPONSE" | jq -r '.success' 2>/dev/null || echo "false")

if [ "$GET_USER_SESSIONS_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✓ PASSED${NC} - User sessions retrieved"
    SESSION_COUNT=$(echo "$GET_USER_SESSIONS_RESPONSE" | jq -r '.data | length' 2>/dev/null || echo "0")
    echo "Total sessions: $SESSION_COUNT"
    echo "$GET_USER_SESSIONS_RESPONSE" | jq . 2>/dev/null || echo "$GET_USER_SESSIONS_RESPONSE"
else
    echo -e "${RED}✗ FAILED${NC} - User sessions retrieval failed"
    echo "$GET_USER_SESSIONS_RESPONSE"
fi

echo ""
echo "─────────────────────────────────────────────────────────"
echo ""

# Test 7: Process Transfer Funds Intent
echo -e "${BLUE}[TEST 7]${NC} Process Message - Transfer Funds"
echo "POST $BASE_URL/api/orchestrator/process"
echo ""

TRANSFER_SESSION_ID="test-transfer-$(date +%s)"

TRANSFER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/orchestrator/process" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$TRANSFER_SESSION_ID\",
    \"userId\": \"$USER_ID\",
    \"message\": \"I want to transfer money\",
    \"intent\": \"transfer_funds\",
    \"metadata\": {
      \"test\": true
    }
  }")

TRANSFER_SUCCESS=$(echo "$TRANSFER_RESPONSE" | jq -r '.success' 2>/dev/null || echo "false")

if [ "$TRANSFER_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✓ PASSED${NC} - Transfer funds intent processed"
    echo "$TRANSFER_RESPONSE" | jq . 2>/dev/null || echo "$TRANSFER_RESPONSE"
else
    echo -e "${RED}✗ FAILED${NC} - Transfer funds processing failed"
    echo "$TRANSFER_RESPONSE"
fi

echo ""
echo "─────────────────────────────────────────────────────────"
echo ""

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "                    Test Summary                           "
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Service:  AI Orchestrator"
echo "URL:      $BASE_URL"
echo "Status:   Service is operational"
echo ""
echo "Tests Completed:"
echo "  1. Health Check"
echo "  2. Create Session"
echo "  3. Process Message (Balance Inquiry)"
echo "  4. Provide Feedback (if required)"
echo "  5. Get Session Details"
echo "  6. Get User Sessions"
echo "  7. Process Message (Transfer Funds)"
echo ""
echo "═══════════════════════════════════════════════════════════"
echo ""
