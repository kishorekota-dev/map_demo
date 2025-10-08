#!/bin/bash

BASE_URL="http://localhost:3005"
ADMIN_USER="admin"
ADMIN_PASS="Password123!"

echo "=========================================="
echo "POC Banking Service API Test Suite"
echo "=========================================="
echo ""

# Test 1: Health
echo "[1/10] Health Check..."
curl -s "$BASE_URL/health" | jq '.'
echo ""

# Test 2: Admin Login
echo "[2/10] Admin Login..."
LOGIN=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")
echo "$LOGIN" | jq '.'
TOKEN=$(echo "$LOGIN" | jq -r '.token')
echo "Token: ${TOKEN:0:50}..."
echo ""

# Test 3: Get Accounts
echo "[3/10] Get All Accounts..."
ACCOUNTS=$(curl -s "$BASE_URL/api/v1/accounts" -H "Authorization: Bearer $TOKEN")
echo "$ACCOUNTS" | jq '.data | length' | xargs echo "Found accounts:"
ACCOUNT_ID=$(echo "$ACCOUNTS" | jq -r '.data[0].id')
echo "First Account ID: $ACCOUNT_ID"
echo ""

# Test 4: Get Account by ID
echo "[4/10] Get Account by ID..."
curl -s "$BASE_URL/api/v1/accounts/$ACCOUNT_ID" -H "Authorization: Bearer $TOKEN" | jq '.data | {id, accountNumber, balance, status}'
echo ""

# Test 5: Get Account Balance
echo "[5/10] Get Account Balance..."
curl -s "$BASE_URL/api/v1/accounts/$ACCOUNT_ID/balance" -H "Authorization: Bearer $TOKEN" | jq '.'
echo ""

# Test 6: Get Transactions
echo "[6/10] Get All Transactions..."
TRANSACTIONS=$(curl -s "$BASE_URL/api/v1/transactions" -H "Authorization: Bearer $TOKEN")
echo "$TRANSACTIONS" | jq '.data | length' | xargs echo "Found transactions:"
TRANSACTION_ID=$(echo "$TRANSACTIONS" | jq -r '.data[0].id')
echo "First Transaction ID: $TRANSACTION_ID"
echo ""

# Test 7: Create Transaction
echo "[7/10] Create Transaction..."
curl -s -X POST "$BASE_URL/api/v1/transactions" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"accountId\":\"$ACCOUNT_ID\",\"type\":\"purchase\",\"amount\":25.99,\"description\":\"Test Purchase\",\"merchantName\":\"Test Merchant\"}" | jq '.data | {id, type, amount, description}'
echo ""

# Test 8: Get Cards
echo "[8/10] Get All Cards..."
CARDS=$(curl -s "$BASE_URL/api/v1/cards" -H "Authorization: Bearer $TOKEN")
echo "$CARDS" | jq '.data | length' | xargs echo "Found cards:"
CARD_ID=$(echo "$CARDS" | jq -r '.data[0].id')
echo "First Card ID: $CARD_ID"
echo ""

# Test 9: Get Fraud Alerts
echo "[9/10] Get All Fraud Alerts..."
ALERTS=$(curl -s "$BASE_URL/api/v1/fraud/alerts" -H "Authorization: Bearer $TOKEN")
echo "$ALERTS" | jq '.data | length' | xargs echo "Found fraud alerts:"
echo ""

# Test 10: Get Disputes
echo "[10/10] Get All Disputes..."
DISPUTES=$(curl -s "$BASE_URL/api/v1/disputes" -H "Authorization: Bearer $TOKEN")
echo "$DISPUTES" | jq '.data | length' | xargs echo "Found disputes:"
echo ""

echo "=========================================="
echo "Test Complete!"
echo "=========================================="
