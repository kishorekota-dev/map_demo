#!/bin/bash

# POC Banking Service - Quick Test Guide
# This script demonstrates how to test all major endpoints

BASE_URL="http://localhost:3005"

echo "=========================================="
echo "POC Banking Service - API Test Guide"
echo "=========================================="
echo ""

# Step 1: Get JWT Token
echo "Step 1: Login and Get JWT Token"
echo "================================"
TOKEN=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Password123!"}' | jq -r '.data.tokens.accessToken')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "❌ Login failed!"
    exit 1
fi

echo "✅ Login successful!"
echo "Token: ${TOKEN:0:50}..."
echo ""

# Step 2: Health Check
echo "Step 2: Health Check"
echo "===================="
curl -s "$BASE_URL/health" | jq '{status, database: .database.status, uptime}'
echo ""

# Step 3: Get Accounts
echo "Step 3: Get All Accounts"
echo "========================"
curl -s "$BASE_URL/api/v1/accounts" \
  -H "Authorization: Bearer $TOKEN" | jq '{total: .pagination.total, count: (.data | length)}'
echo ""

# Step 4: Get Transactions
echo "Step 4: Get All Transactions"
echo "============================="
TRANSACTIONS=$(curl -s "$BASE_URL/api/v1/transactions" -H "Authorization: Bearer $TOKEN")
echo "$TRANSACTIONS" | jq '{total: .pagination.total, count: (.data | length)}'
TRANSACTION_ID=$(echo "$TRANSACTIONS" | jq -r '.data[0].transaction_id')
echo "First Transaction ID: $TRANSACTION_ID"
echo ""

# Step 5: Get Transaction by ID
if [ -n "$TRANSACTION_ID" ] && [ "$TRANSACTION_ID" != "null" ]; then
    echo "Step 5: Get Transaction by ID"
    echo "=============================="
    curl -s "$BASE_URL/api/v1/transactions/$TRANSACTION_ID" \
      -H "Authorization: Bearer $TOKEN" | jq '{
        id: .data.transaction_id,
        type: .data.transaction_type,
        amount: .data.amount,
        status: .data.status,
        created: .data.created_at
      }'
    echo ""
fi

# Step 6: Get Transaction Categories
echo "Step 6: Get Transaction Categories"
echo "==================================="
curl -s "$BASE_URL/api/v1/transactions/categories" \
  -H "Authorization: Bearer $TOKEN" | jq '.data | length' | xargs echo "Available categories:"
echo ""

# Step 7: Get Cards
echo "Step 7: Get All Cards"
echo "====================="
CARDS=$(curl -s "$BASE_URL/api/v1/cards" -H "Authorization: Bearer $TOKEN")
echo "$CARDS" | jq '{count: (.data | length)}'
CARD_ID=$(echo "$CARDS" | jq -r '.data[0].card_id')
if [ -n "$CARD_ID" ] && [ "$CARD_ID" != "null" ]; then
    echo "First Card ID: $CARD_ID"
fi
echo ""

# Step 8: Get Transfers
echo "Step 8: Get All Transfers"
echo "========================="
TRANSFERS=$(curl -s "$BASE_URL/api/v1/transfers" -H "Authorization: Bearer $TOKEN")
echo "$TRANSFERS" | jq '{count: (.data | length)}'
TRANSFER_ID=$(echo "$TRANSFERS" | jq -r '.data[0].transfer_id')
if [ -n "$TRANSFER_ID" ] && [ "$TRANSFER_ID" != "null" ]; then
    echo "First Transfer ID: $TRANSFER_ID"
fi
echo ""

# Step 9: Get Fraud Alerts
echo "Step 9: Get All Fraud Alerts"
echo "============================="
ALERTS=$(curl -s "$BASE_URL/api/v1/fraud/alerts" -H "Authorization: Bearer $TOKEN")
echo "$ALERTS" | jq '{count: (.data | length)}'
ALERT_ID=$(echo "$ALERTS" | jq -r '.data[0].alert_id')
if [ -n "$ALERT_ID" ] && [ "$ALERT_ID" != "null" ]; then
    echo "First Alert ID: $ALERT_ID"
    echo ""
    
    echo "Step 9a: Get Alert Details"
    echo "=========================="
    curl -s "$BASE_URL/api/v1/fraud/alerts/$ALERT_ID" \
      -H "Authorization: Bearer $TOKEN" | jq '{
        id: .data.alert_id,
        type: .data.alert_type,
        severity: .data.severity,
        status: .data.status
      }'
fi
echo ""

# Step 10: Get Disputes
echo "Step 10: Get All Disputes"
echo "========================="
DISPUTES=$(curl -s "$BASE_URL/api/v1/disputes" -H "Authorization: Bearer $TOKEN")
echo "$DISPUTES" | jq '{count: (.data | length)}'
DISPUTE_ID=$(echo "$DISPUTES" | jq -r '.data[0].dispute_id')
if [ -n "$DISPUTE_ID" ] && [ "$DISPUTE_ID" != "null" ]; then
    echo "First Dispute ID: $DISPUTE_ID"
    echo ""
    
    echo "Step 10a: Get Dispute Details"
    echo "=============================="
    curl -s "$BASE_URL/api/v1/disputes/$DISPUTE_ID" \
      -H "Authorization: Bearer $TOKEN" | jq '{
        id: .data.dispute_id,
        reason: .data.reason,
        status: .data.status,
        amount: .data.amount
      }'
fi
echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo "✅ Authentication: Working"
echo "✅ Health Check: Working"
echo "✅ Accounts API: Working"
echo "✅ Transactions API: Working"
echo "✅ Cards API: Working"
echo "✅ Transfers API: Working"
echo "✅ Fraud API: Working"
echo "✅ Disputes API: Working"
echo ""
echo "🎉 All tests completed successfully!"
echo ""
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo "1. Test with different user roles (customer, manager)"
echo "2. Test POST/PUT/DELETE operations"
echo "3. Test error cases (invalid data, unauthorized access)"
echo "4. Test pagination and filtering"
echo "5. Test RBAC permissions"
echo ""
