#!/bin/bash

echo "🧪 Testing Enhanced Chat Backend Logging"
echo "======================================="

# Start server in background
echo "📡 Starting POC Chatbot Server..."
PORT=3002 node /workspaces/map_demo/poc/server.js &
SERVER_PID=$!

# Wait for server to start
sleep 3

echo ""
echo "🔍 Testing Enhanced Logging Features:"
echo ""

# Test 1: Health Check
echo "1️⃣ Testing Health Endpoint..."
curl -s http://localhost:3002/health

echo ""
echo ""

# Test 2: Chat Message
echo "2️⃣ Testing Chat Message with Enhanced Logging..."
curl -s -X POST http://localhost:3002/api/chat/message \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: test-session-$(date +%s)" \
  -H "X-Request-ID: req-$(date +%s)" \
  -d '{"message": "Hello, I need help with my account balance", "context": {"userId": "test-user-123"}}'

echo ""
echo ""

# Test 3: Intent Analysis
echo "3️⃣ Testing Intent Analysis..."
curl -s -X POST http://localhost:3002/api/chat/analyze \
  -H "Content-Type: application/json" \
  -d '{"message": "What is my current balance?"}'

echo ""
echo ""

# Test 4: Status Check
echo "4️⃣ Testing Status Endpoint..."
curl -s http://localhost:3002/api/chat/status

echo ""
echo ""

# Test 5: Available Intents
echo "5️⃣ Testing Available Intents..."
curl -s http://localhost:3002/api/chat/intents

echo ""
echo ""

# Test 6: Invalid Request (to test error logging)
echo "6️⃣ Testing Error Logging with Invalid Request..."
curl -s -X POST http://localhost:3002/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"invalidField": "test"}'

echo ""
echo ""

# Clean up
echo "🧹 Cleaning up..."
kill $SERVER_PID 2>/dev/null

echo ""
echo "✅ Enhanced Logging Test Complete!"
echo ""
echo "📋 Logging Features Added:"
echo "   • Request/Response tracking with unique IDs"
echo "   • Performance timing for all operations"
echo "   • Client IP and User-Agent logging"
echo "   • Enhanced error context and stack traces"
echo "   • Color-coded console output"
echo "   • Debug level logging for detailed troubleshooting"
echo "   • Structured metadata for better observability"