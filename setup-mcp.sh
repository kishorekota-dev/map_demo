#!/bin/bash

# Setup script for Credit Card Enterprise MCP Server

echo "🚀 Setting up Credit Card Enterprise MCP Server..."

# Install MCP server dependencies
echo "📦 Installing MCP server dependencies..."
npm install @modelcontextprotocol/sdk@^0.4.0 axios@^1.6.0

# Make the MCP server executable
chmod +x mcp-server.js

echo "✅ MCP Server setup complete!"
echo ""
echo "📋 Usage Instructions:"
echo "1. Start your API server: npm start"
echo "2. In another terminal, run the MCP server: node mcp-server.js"
echo "3. The MCP server will communicate via stdio"
echo ""
echo "🔧 Available Tools:"
echo "  - authenticate: Login to get access token"
echo "  - get_accounts: Retrieve user accounts"
echo "  - create_account: Create new account"
echo "  - get_account_details: Get specific account details"
echo "  - get_transactions: Retrieve transactions"
echo "  - create_transaction: Create new transaction"
echo "  - get_cards: Retrieve credit/debit cards"
echo "  - create_card: Create new card"
echo "  - get_fraud_cases: Retrieve fraud cases"
echo "  - create_fraud_case: Create fraud case"
echo "  - get_disputes: Retrieve disputes"
echo "  - health_check: Check API health"
echo ""
echo "📚 Configuration:"
echo "  - API Base URL: http://localhost:3000/api/v1 (configurable via API_BASE_URL env var)"
echo "  - MCP Config: mcp-config.json"
