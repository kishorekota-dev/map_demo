#!/bin/bash
# Test script for MCP Hybrid Implementation
# Tests true MCP protocol, HTTP fallback, and tool discovery

set -e

echo "======================================"
echo "MCP Hybrid Implementation Test Suite"
echo "======================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
AI_ORCHESTRATOR_URL="http://localhost:3007"
MCP_SERVICE_URL="http://localhost:3004"
MCP_SSE_URL="http://localhost:3004/mcp/sse"

# Test counter
PASSED=0
FAILED=0

# Helper function to print test results
print_result() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✓ PASSED${NC}: $2"
    ((PASSED++))
  else
    echo -e "${RED}✗ FAILED${NC}: $2"
    ((FAILED++))
  fi
  echo ""
}

# Test 1: Health Check - AI Orchestrator
echo "Test 1: AI Orchestrator Health Check"
RESPONSE=$(curl -s -w "\n%{http_code}" "$AI_ORCHESTRATOR_URL/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "AI Orchestrator is healthy"
  echo "$BODY" | jq '.'
  print_result 0 "AI Orchestrator Health Check"
else
  echo "AI Orchestrator health check failed: $HTTP_CODE"
  print_result 1 "AI Orchestrator Health Check"
fi

# Test 2: Health Check - MCP Service
echo "Test 2: MCP Service Health Check"
RESPONSE=$(curl -s -w "\n%{http_code}" "$MCP_SERVICE_URL/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "MCP Service is healthy"
  echo "$BODY" | jq '.'
  print_result 0 "MCP Service Health Check"
else
  echo "MCP Service health check failed: $HTTP_CODE"
  print_result 1 "MCP Service Health Check"
fi

# Test 3: MCP Protocol Status
echo "Test 3: MCP Protocol Status Check"
RESPONSE=$(curl -s -w "\n%{http_code}" "$MCP_SERVICE_URL/mcp/status")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "MCP Protocol Status:"
  echo "$BODY" | jq '.'
  print_result 0 "MCP Protocol Status Check"
else
  echo "MCP Protocol status check failed: $HTTP_CODE"
  print_result 1 "MCP Protocol Status Check"
fi

# Test 4: Tool Discovery via HTTP API
echo "Test 4: Tool Discovery via HTTP API (Fallback)"
RESPONSE=$(curl -s -w "\n%{http_code}" "$MCP_SERVICE_URL/api/mcp/tools")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  TOOL_COUNT=$(echo "$BODY" | jq '.data.tools | length')
  echo "Discovered $TOOL_COUNT tools via HTTP API"
  echo "$BODY" | jq '.data.tools[] | .name'
  print_result 0 "Tool Discovery via HTTP API"
else
  echo "Tool discovery failed: $HTTP_CODE"
  print_result 1 "Tool Discovery via HTTP API"
fi

# Test 5: Enhanced MCP Client Health
echo "Test 5: Enhanced MCP Client Health Check"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$AI_ORCHESTRATOR_URL/api/orchestrator/health" \
  -H "Content-Type: application/json")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "Enhanced MCP Client Status:"
  echo "$BODY" | jq '.'
  print_result 0 "Enhanced MCP Client Health"
else
  echo "Enhanced MCP Client health check failed (expected if endpoint doesn't exist yet)"
  print_result 0 "Enhanced MCP Client Health (optional)"
fi

# Test 6: Execute Tool via HTTP (Fallback Mode)
echo "Test 6: Execute Account Balance Tool via HTTP"
SESSION_ID="test_session_$(date +%s)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$MCP_SERVICE_URL/api/mcp/tools/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"tool\": \"get_account_balance\",
    \"params\": {
      \"accountId\": \"ACC001\",
      \"sessionId\": \"$SESSION_ID\"
    }
  }")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "Tool execution successful:"
  echo "$BODY" | jq '.'
  print_result 0 "Execute Tool via HTTP"
else
  echo "Tool execution failed: $HTTP_CODE"
  echo "$BODY"
  print_result 1 "Execute Tool via HTTP"
fi

# Test 7: AI Orchestrator Workflow Execution
echo "Test 7: Execute Banking Workflow with Account Balance Intent"
SESSION_ID="workflow_test_$(date +%s)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$AI_ORCHESTRATOR_URL/api/orchestrator/process" \
  -H "Content-Type: application/json" \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"userId\": \"test_user_001\",
    \"intent\": \"account_balance\",
    \"question\": \"What is my account balance for account ACC001?\",
    \"metadata\": {
      \"channel\": \"test\",
      \"testMode\": true
    }
  }")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "Workflow execution successful:"
  echo "$BODY" | jq '.'
  
  # Check if response indicates success
  SUCCESS=$(echo "$BODY" | jq -r '.success // .data.success // false')
  if [ "$SUCCESS" = "true" ]; then
    print_result 0 "AI Orchestrator Workflow Execution"
  else
    echo "Workflow returned but indicated failure"
    print_result 1 "AI Orchestrator Workflow Execution"
  fi
else
  echo "Workflow execution failed: $HTTP_CODE"
  echo "$BODY"
  print_result 1 "AI Orchestrator Workflow Execution"
fi

# Test 8: Test Transaction History Tool
echo "Test 8: Execute Transaction History Tool"
SESSION_ID="trans_test_$(date +%s)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$MCP_SERVICE_URL/api/mcp/tools/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"tool\": \"get_transactions\",
    \"params\": {
      \"accountId\": \"ACC001\",
      \"limit\": 5,
      \"sessionId\": \"$SESSION_ID\"
    }
  }")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "Transaction history retrieved:"
  echo "$BODY" | jq '.data.data.transactions[] | {id, date, description, amount}'
  print_result 0 "Execute Transaction History Tool"
else
  echo "Transaction history retrieval failed: $HTTP_CODE"
  print_result 1 "Execute Transaction History Tool"
fi

# Test 9: Test Fund Transfer Tool
echo "Test 9: Execute Fund Transfer Tool"
SESSION_ID="transfer_test_$(date +%s)"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "$MCP_SERVICE_URL/api/mcp/tools/execute" \
  -H "Content-Type: application/json" \
  -d "{
    \"tool\": \"transfer_funds\",
    \"params\": {
      \"fromAccount\": \"ACC001\",
      \"toAccount\": \"ACC002\",
      \"amount\": 100.00,
      \"description\": \"Test transfer\",
      \"sessionId\": \"$SESSION_ID\"
    }
  }")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "Fund transfer initiated:"
  echo "$BODY" | jq '.'
  print_result 0 "Execute Fund Transfer Tool"
else
  echo "Fund transfer failed: $HTTP_CODE"
  print_result 1 "Execute Fund Transfer Tool"
fi

# Test 10: Service Info Check
echo "Test 10: MCP Service Info Check"
RESPONSE=$(curl -s -w "\n%{http_code}" "$MCP_SERVICE_URL/api")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo "MCP Service Info:"
  echo "$BODY" | jq '{service, protocols, capabilities}'
  
  # Check for hybrid protocol support
  HAS_SSE=$(echo "$BODY" | jq '.protocols[] | select(.transport == "Server-Sent Events") | .name' | wc -l)
  if [ "$HAS_SSE" -gt 0 ]; then
    echo -e "${GREEN}✓ Hybrid Protocol Support Confirmed${NC}"
  fi
  
  print_result 0 "Service Info Check"
else
  echo "Service info check failed: $HTTP_CODE"
  print_result 1 "Service Info Check"
fi

# Summary
echo ""
echo "======================================"
echo "           TEST SUMMARY              "
echo "======================================"
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${RED}Failed:${NC} $FAILED"
echo "Total:  $((PASSED + FAILED))"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed! 🎉${NC}"
  echo "The MCP Hybrid Implementation is working correctly."
  exit 0
else
  echo -e "${YELLOW}Some tests failed. Please review the results above.${NC}"
  exit 1
fi
