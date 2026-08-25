#!/usr/bin/env bash
# POC Banking Chat - Integration Tests
#
# Defaults target the local non-Docker ports. Override individual service URLs
# when testing an isolated stack, for example:
#   API_GATEWAY_URL=http://127.0.0.1:13001 \
#   NLU_SERVICE_URL=http://127.0.0.1:13003 \
#   MCP_SERVICE_URL=http://127.0.0.1:13004 \
#   BANKING_SERVICE_URL=http://127.0.0.1:13005 \
#   CHAT_SERVICE_URL=http://127.0.0.1:13006 \
#   AI_ORCHESTRATOR_URL=http://127.0.0.1:13007 \
#   ./scripts/test-integration.sh

set -uo pipefail

API_GATEWAY_URL="${API_GATEWAY_URL:-http://127.0.0.1:3001}"
NLU_SERVICE_URL="${NLU_SERVICE_URL:-http://127.0.0.1:3003}"
MCP_SERVICE_URL="${MCP_SERVICE_URL:-http://127.0.0.1:3004}"
BANKING_SERVICE_URL="${BANKING_SERVICE_URL:-http://127.0.0.1:3005}"
CHAT_SERVICE_URL="${CHAT_SERVICE_URL:-http://127.0.0.1:3006}"
AI_ORCHESTRATOR_URL="${AI_ORCHESTRATOR_URL:-http://127.0.0.1:3007}"
LOGIN_USERNAME="${LOGIN_USERNAME:-james.patterson}"
LOGIN_PASSWORD="${LOGIN_PASSWORD:-Password123!}"
REQUEST_TIMEOUT_SECONDS="${REQUEST_TIMEOUT_SECONDS:-45}"

if [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  RED='\033[0;31m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  NC='\033[0m'
else
  GREEN=''
  RED=''
  YELLOW=''
  BLUE=''
  NC=''
fi

PASSED=0
FAILED=0
RESPONSE_BODY=''
HTTP_STATUS='000'

json_get() {
  local path="$1"

  node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      try {
        let value = JSON.parse(input);
        for (const key of process.argv[1].split(".")) {
          value = value?.[key];
        }
        if (value === undefined || value === null) process.exit(2);
        process.stdout.write(typeof value === "object" ? JSON.stringify(value) : String(value));
      } catch {
        process.exit(2);
      }
    });
  ' "$path"
}

request_json() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local token="${4:-}"
  local session_id="${5:-}"
  local raw
  local -a curl_args=(
    --silent
    --show-error
    --max-time "$REQUEST_TIMEOUT_SECONDS"
    --request "$method"
    --header 'Accept: application/json'
    --write-out $'\n%{http_code}'
  )

  if [[ -n "$data" ]]; then
    curl_args+=(--header 'Content-Type: application/json' --data "$data")
  fi
  if [[ -n "$token" ]]; then
    curl_args+=(--header "Authorization: Bearer $token")
  fi
  if [[ -n "$session_id" ]]; then
    curl_args+=(--header "X-Session-ID: $session_id")
  fi

  if ! raw="$(curl "${curl_args[@]}" "$url" 2>/dev/null)"; then
    RESPONSE_BODY=''
    HTTP_STATUS='000'
    return 1
  fi

  HTTP_STATUS="${raw##*$'\n'}"
  RESPONSE_BODY="${raw%$'\n'*}"
}

record_response() {
  local name="$1"
  local expected_status="$2"
  local required_path="${3:-}"
  local expected_value="${4:-}"
  local match_mode="${5:-equals}"
  local actual_value=''
  local passed=true

  if [[ "$HTTP_STATUS" != "$expected_status" ]]; then
    passed=false
  elif [[ -n "$required_path" ]]; then
    if ! actual_value="$(printf '%s' "$RESPONSE_BODY" | json_get "$required_path" 2>/dev/null)"; then
      passed=false
    elif [[ -n "$expected_value" ]]; then
      if [[ "$match_mode" == 'contains' && "$actual_value" != *"$expected_value"* ]]; then
        passed=false
      elif [[ "$match_mode" != 'contains' && "$actual_value" != "$expected_value" ]]; then
        passed=false
      fi
    fi
  fi

  printf '%-44s ' "$name"
  if [[ "$passed" == true ]]; then
    printf '%b\n' "${GREEN}PASS${NC}"
    PASSED=$((PASSED + 1))
    return 0
  fi

  printf '%b\n' "${RED}FAIL${NC} (HTTP ${HTTP_STATUS})"
  if [[ -n "$RESPONSE_BODY" ]]; then
    printf '  Response: %.400s\n' "$RESPONSE_BODY"
  fi
  FAILED=$((FAILED + 1))
  return 1
}

run_health_check() {
  local name="$1"
  local url="$2"

  request_json GET "$url" || true
  record_response "$name" 200 status healthy || true
}

printf '%b\n' "${BLUE}========================================${NC}"
printf '%b\n' "${BLUE}  POC Banking Chat - Integration Tests  ${NC}"
printf '%b\n\n' "${BLUE}========================================${NC}"

printf '%b\n' "${YELLOW}Testing health endpoints...${NC}"
run_health_check 'API Gateway health' "$API_GATEWAY_URL/health"
run_health_check 'NLU service health' "$NLU_SERVICE_URL/health"
run_health_check 'MCP service health' "$MCP_SERVICE_URL/health"
run_health_check 'Banking service health' "$BANKING_SERVICE_URL/health"
run_health_check 'Chat backend health' "$CHAT_SERVICE_URL/health"
run_health_check 'AI orchestrator health' "$AI_ORCHESTRATOR_URL/health"

printf '\n%b\n' "${YELLOW}Testing authenticated gateway flow...${NC}"
login_payload="$(node -e 'process.stdout.write(JSON.stringify({ username: process.argv[1], password: process.argv[2] }))' "$LOGIN_USERNAME" "$LOGIN_PASSWORD")"
request_json POST "$API_GATEWAY_URL/api/banking/v1/auth/login" "$login_payload" || true
record_response 'Login through API gateway' 200 status success || true

access_token=''
if [[ "$HTTP_STATUS" == '200' ]]; then
  access_token="$(printf '%s' "$RESPONSE_BODY" | json_get data.tokens.accessToken 2>/dev/null || true)"
fi

session_id=''
if [[ -n "$access_token" ]]; then
  request_json POST "$API_GATEWAY_URL/api/nlu/analyze" '{"user_input":"What is my balance?"}' "$access_token" || true
  record_response 'NLU analysis through API gateway' 200 data.intent balance_inquiry || true

  request_json POST "$API_GATEWAY_URL/api/sessions" '{"metadata":{"source":"integration-test"}}' "$access_token" || true
  record_response 'Create authenticated chat session' 201 sessionId || true
  if [[ "$HTTP_STATUS" == '201' ]]; then
    session_id="$(printf '%s' "$RESPONSE_BODY" | json_get sessionId 2>/dev/null || true)"
  fi
else
  printf '%-44s %b\n' 'Dependent authenticated checks' "${RED}SKIP${NC} (login token missing)"
  FAILED=$((FAILED + 7))
fi

if [[ -n "$access_token" && -n "$session_id" ]]; then
  message_payload="$(printf '{\"message\":\"What is my balance?\",\"sessionId\":\"%s\"}' "$session_id")"
  request_json POST "$API_GATEWAY_URL/api/chat/message" "$message_payload" "$access_token" "$session_id" || true
  record_response 'Process balance inquiry end to end' 200 agentResult.intent balance_inquiry || true
  record_response 'Return seeded balance from banking data' 200 response.content 'USD 25000.00' contains || true
  record_response 'Mask account number to last four digits' 200 response.content 'ending in 1001' contains || true

  request_json GET "$API_GATEWAY_URL/api/chat/history?sessionId=$session_id" '' "$access_token" || true
  record_response 'Read authenticated chat history' 200 sessionId "$session_id" || true

  request_json DELETE "$API_GATEWAY_URL/api/sessions/$session_id" '{"reason":"integration_test_complete"}' "$access_token" || true
  record_response 'End authenticated chat session' 200 success true || true
elif [[ -n "$access_token" ]]; then
  printf '%-44s %b\n' 'Dependent session checks' "${RED}SKIP${NC} (session creation failed)"
  FAILED=$((FAILED + 5))
fi

printf '\n%b\n' "${BLUE}========================================${NC}"
printf '  Results: %b, %b\n' "${GREEN}${PASSED} passed${NC}" "${RED}${FAILED} failed${NC}"
printf '%b\n' "${BLUE}========================================${NC}"

if [[ "$FAILED" -eq 0 ]]; then
  exit 0
fi
exit 1
