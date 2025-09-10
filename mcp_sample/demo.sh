#!/bin/bash

# MCP Sample Demo - Quick Start Script
echo "🎯 MCP Sample Demo - Quick Start"
echo "=================================="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the mcp_sample directory"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo ""
echo "🚀 Choose an option:"
echo "1. Run full demo (recommended for first time)"
echo "2. Run test suite"
echo "3. Start backend API only"
echo "4. Start all components in development mode"
echo "5. Run interactive client mode"
echo "6. Show help"
echo ""

read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo "🎬 Running full demo..."
        node index.js demo
        ;;
    2)
        echo "🧪 Running test suite..."
        node test.js
        ;;
    3)
        echo "🔧 Starting backend API only..."
        echo "Press Ctrl+C to stop"
        node backend-api.js
        ;;
    4)
        echo "🛠️ Starting development mode..."
        echo "Press Ctrl+C to stop all processes"
        npm run dev
        ;;
    5)
        echo "🎮 Starting interactive mode..."
        echo "Make sure backend API is running in another terminal first!"
        echo "Run: node backend-api.js"
        read -p "Press Enter when backend is ready..."
        node mcp-client.js interactive
        ;;
    6)
        echo "📖 Help - Available commands:"
        echo ""
        echo "Direct usage:"
        echo "  node index.js demo          - Run full demo"
        echo "  node index.js test          - Run tests"
        echo "  node index.js backend       - Start backend only"
        echo "  node index.js dev           - Development mode"
        echo ""
        echo "NPM scripts:"
        echo "  npm run dev                 - Start all components"
        echo "  npm run backend             - Start backend only"
        echo "  npm run server              - Start MCP server only"
        echo "  npm run client              - Start MCP client only"
        echo "  npm test                    - Run test suite"
        echo ""
        echo "Manual testing:"
        echo "  curl http://localhost:3001/api/health"
        echo "  curl http://localhost:3001/api/users"
        ;;
    *)
        echo "❌ Invalid choice. Please run the script again."
        exit 1
        ;;
esac
