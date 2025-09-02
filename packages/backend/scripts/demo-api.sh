#!/bin/bash

echo "=========================================="
echo "Credit Card Enterprise API - Full Demo"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000/api/v1"

echo -e "${BLUE}1. Testing Health Check${NC}"
curl -s -X GET http://localhost:3000/health | jq '.'

echo -e "\n${BLUE}2. User Registration${NC}"
REGISTER_RESPONSE=$(curl -s -X POST $BASE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@example.com",
    "password": "password123",
    "firstName": "Demo",
    "lastName": "User",
    "phone": "+1-555-9999"
  }')
echo $REGISTER_RESPONSE | jq '.'

echo -e "\n${BLUE}3. User Login${NC}"
LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@example.com",
    "password": "password123"
  }')
echo $LOGIN_RESPONSE | jq '.'

# Extract token
TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
    echo -e "${RED}Failed to get token. Exiting.${NC}"
    exit 1
fi

echo -e "\n${GREEN}Token received: ${TOKEN:0:20}...${NC}"

echo -e "\n${BLUE}4. Creating Credit Account${NC}"
ACCOUNT_RESPONSE=$(curl -s -X POST $BASE_URL/accounts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountType": "CREDIT",
    "creditLimit": 5000.00
  }')
echo $ACCOUNT_RESPONSE | jq '.'

# Extract account ID
ACCOUNT_ID=$(echo $ACCOUNT_RESPONSE | jq -r '.account.id')

echo -e "\n${BLUE}5. Getting All Accounts${NC}"
curl -s -X GET $BASE_URL/accounts \
  -H "Authorization: Bearer $TOKEN" | jq '.'

echo -e "\n${BLUE}6. Requesting New Card${NC}"
CARD_RESPONSE=$(curl -s -X POST $BASE_URL/cards/request \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "'$ACCOUNT_ID'",
    "cardType": "VISA",
    "deliveryMethod": "STANDARD",
    "deliveryAddress": {
      "street": "123 Demo Street",
      "city": "Demo City",
      "state": "NY",
      "zipCode": "10001",
      "country": "USA"
    },
    "reason": "NEW_ACCOUNT"
  }')
echo $CARD_RESPONSE | jq '.'

# Extract card ID
CARD_ID=$(echo $CARD_RESPONSE | jq -r '.card.id')

echo -e "\n${BLUE}7. Creating Transaction${NC}"
TRANSACTION_RESPONSE=$(curl -s -X POST $BASE_URL/transactions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "'$ACCOUNT_ID'",
    "amount": 99.99,
    "type": "PURCHASE",
    "merchantName": "Demo Store",
    "description": "Test purchase at demo store",
    "location": {
      "city": "New York",
      "state": "NY",
      "country": "USA"
    }
  }')
echo $TRANSACTION_RESPONSE | jq '.'

# Extract transaction ID
TRANSACTION_ID=$(echo $TRANSACTION_RESPONSE | jq -r '.transaction.id')

echo -e "\n${BLUE}8. Getting Account Balance${NC}"
curl -s -X GET $BASE_URL/accounts/$ACCOUNT_ID/balance \
  -H "Authorization: Bearer $TOKEN" | jq '.'

echo -e "\n${BLUE}9. Getting Transactions${NC}"
curl -s -X GET "$BASE_URL/transactions?limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq '.'

echo -e "\n${BLUE}10. Creating Dispute${NC}"
DISPUTE_RESPONSE=$(curl -s -X POST $BASE_URL/disputes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transactionId": "'$TRANSACTION_ID'",
    "disputeType": "BILLING_ERROR",
    "reason": "Wrong amount charged - should be $89.99 not $99.99",
    "disputeAmount": 10.00
  }')
echo $DISPUTE_RESPONSE | jq '.'

echo -e "\n${BLUE}11. Getting Fraud Settings${NC}"
curl -s -X GET "$BASE_URL/fraud/settings?accountId=$ACCOUNT_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.'

echo -e "\n${BLUE}12. Updating Fraud Settings${NC}"
curl -s -X PUT $BASE_URL/fraud/settings/$ACCOUNT_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dailyTransactionLimit": 1000.00,
    "internationalTransactionsBlocked": true,
    "notificationPreferences": {
      "email": true,
      "sms": true,
      "push": true
    }
  }' | jq '.'

echo -e "\n${BLUE}13. Getting Card Details${NC}"
curl -s -X GET $BASE_URL/cards/$CARD_ID \
  -H "Authorization: Bearer $TOKEN" | jq '.'

echo -e "\n${BLUE}14. Getting Balance Transfer Offers${NC}"
curl -s -X GET $BASE_URL/balance-transfers/offers \
  -H "Authorization: Bearer $TOKEN" | jq '.'

echo -e "\n${BLUE}15. Getting Fraud Alerts${NC}"
curl -s -X GET $BASE_URL/fraud/alerts \
  -H "Authorization: Bearer $TOKEN" | jq '.'

echo -e "\n${GREEN}=========================================="
echo "Demo completed successfully!"
echo "All major API endpoints tested!"
echo "==========================================${NC}"
