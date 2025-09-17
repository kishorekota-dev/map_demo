#!/bin/bash

# Start Individual Services for Local Development

case "$1" in
    "backend")
        echo "🚀 Starting Backend API on port 3000..."
        cd packages/backend
        npm run dev
        ;;
    "mcp")
        echo "🤖 Starting MCP Server on port 3001..."
        cd packages/backend
        npm run mcp:start
        ;;
    "chatbot")
        echo "💬 Starting ChatBot UI on port 3002..."
        cd packages/chatbot-ui
        npm run dev
        ;;
    *)
        echo "Usage: $0 {backend|mcp|chatbot}"
        echo ""
        echo "Available services:"
        echo "  backend  - Start Backend API (port 3000)"
        echo "  mcp      - Start MCP Server (port 3001)"
        echo "  chatbot  - Start ChatBot UI (port 3002)"
        echo ""
        echo "To start all services: ./start-local.sh"
        exit 1
        ;;
esac
