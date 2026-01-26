#!/bin/bash
# POC Banking Chat - Integration Tests
# Usage: ./scripts/test-integration.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  POC Banking Chat - Integration Tests  ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

PASSED=0
FAILED=0

test_endpoint() {
  local name=$1
  local method=$2
  local url=$3
  local data=$4
  local expected=$5
  
  printf "%-40s " "$name"
  
  if [[ -n "$data" ]]; then
    response=$(curl -s -X "$method" "$url" -H "Content-Type: application/json" -d "$data" 2>/dev/null || echo "")
  else
    response=$(curl -s -X "$method" "$url" 2>/dev/null || echo "")
  fi
  
  if echo "$response" | grep -q "$expected"; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC}"
    ((FAILED++))
  fi
}

echo -e "${YELLOW}Testing Health Endpoints...${NC}"
test_endpoint "API Gateway Health" "GET" "http://localhost:3001/health" "" "healthy"
test_endpoint "NLU Service Health" "GET" "http://localhost:3003/health" "" "healthy"
test_endpoint "MCP Service Health" "GET" "http://localhost:3004/health" "" "healthy"
test_endpoint "Banking Service Health" "GET" "http://localhost:3005/health" "" "healthy"
test_endpoint "Chat Backend Health" "GET" "http://localhost:3006/health" "" "healthy"
test_endpoint "AI Orchestrator Health" "GET" "http://localhost:3007/health" "" "healthy"

echo ""
echo -e "${YELLOW}Testing API Endpoints...${NC}"
test_endpoint "Login Endpoint" "POST" "http://localhost:3005/api/v1/auth/login" '{"email":"customer1@example.com","password":"Password123!"}' "token"

echo ""
echo -e "${YELLOW}Testing Chat Flow...${NC}"
test_endpoint "Chat Message" "POST" "http://localhost:3006/api/chat/message" '{"message":"Hello","sessionId":"test-123"}' "response"

echo ""
echo -e "${YELLOW}Testing NLU...${NC}"
test_endpoint "Intent Analysis" "POST" "http://localhost:3003/api/nlu/analyze" '{"text":"What is my balance?"}' "intent"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "  Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
echo -e "${BLUE}========================================${NC}"

[[ $FAILED -eq 0 ]] && exit 0 || exit 1
