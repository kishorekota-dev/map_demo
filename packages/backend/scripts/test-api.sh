#!/bin/bash

# Start the server in background
echo "Starting Credit Card Enterprise API..."
node server.js &
SERVER_PID=$!

# Wait for server to start
sleep 3

# Test health endpoint
echo "Testing health endpoint..."
curl -X GET http://localhost:3000/health | jq '.' || echo "Health check response received"

echo -e "\n\nTesting authentication..."

# Test registration
echo "Testing user registration..."
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User",
    "phone": "+1-555-0123"
  }' | jq '.' || echo "Registration response received"

echo -e "\n\nTesting login..."
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.doe@example.com",
    "password": "password123"
  }' | jq -r '.token' 2>/dev/null || echo "")

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  echo "Login successful! Token: ${TOKEN:0:20}..."
  
  echo -e "\n\nTesting authenticated endpoints..."
  
  # Test accounts endpoint
  echo "Testing accounts endpoint..."
  curl -X GET http://localhost:3000/api/v1/accounts \
    -H "Authorization: Bearer $TOKEN" | jq '.' || echo "Accounts response received"
    
  echo -e "\n\nTesting transactions endpoint..."
  curl -X GET http://localhost:3000/api/v1/transactions \
    -H "Authorization: Bearer $TOKEN" | jq '.' || echo "Transactions response received"
    
  echo -e "\n\nTesting cards endpoint..."
  curl -X GET http://localhost:3000/api/v1/cards \
    -H "Authorization: Bearer $TOKEN" | jq '.' || echo "Cards response received"
else
  echo "Login failed or token not received"
fi

# Clean up
echo -e "\n\nStopping server..."
kill $SERVER_PID
wait $SERVER_PID 2>/dev/null

echo "Testing complete!"
