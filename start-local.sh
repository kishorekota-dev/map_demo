#!/bin/bash

# Local Development Startup Script
# This script starts all services locally for debugging (excluding Web-UI and Agent-UI)

set -e

echo "🚀 Starting Local Development Environment"
echo "================================================="

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo "⚠️  Port $1 is already in use!"
        return 1
    fi
    return 0
}

# Function to wait for service to be ready
wait_for_service() {
    local url=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1

    echo "⏳ Waiting for $service_name to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" >/dev/null 2>&1; then
            echo "✅ $service_name is ready!"
            return 0
        fi
        echo "   Attempt $attempt/$max_attempts - waiting for $service_name..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo "❌ $service_name failed to start within timeout"
    return 1
}

# Check if Docker services are running
echo "🔍 Checking Docker services..."
if ! docker ps | grep -q "credit_card_postgres\|enterprise-banking-db"; then
    echo "❌ PostgreSQL is not running. Please start it with:"
    echo "   docker compose up -d postgres"
    exit 1
fi

if ! docker ps | grep -q "credit_card_redis\|enterprise-banking-cache"; then
    echo "❌ Redis is not running. Please start it with:"
    echo "   docker compose up -d redis"
    exit 1
fi

echo "✅ Docker services are running"

# Check ports
echo "🔍 Checking available ports..."
check_port 3000 || exit 1
check_port 3001 || exit 1
check_port 3002 || exit 1

echo "✅ All required ports are available"

# Create log directory
mkdir -p logs

echo "🏗️  Installing dependencies..."

# Install backend dependencies
echo "   Installing backend dependencies..."
cd packages/backend
if [ ! -d "node_modules" ]; then
    npm install
fi

# Install shared dependencies
echo "   Installing shared dependencies..."
cd ../shared
if [ ! -d "node_modules" ]; then
    npm install
fi

# Install chatbot-ui dependencies
echo "   Installing chatbot-ui dependencies..."
cd ../chatbot-ui
if [ ! -d "node_modules" ]; then
    npm install
fi

cd ../..

echo "✅ Dependencies installed"

# Setup database if needed
echo "🗄️  Setting up database..."
cd packages/backend
if ! npm run db:setup >/dev/null 2>&1; then
    echo "⚠️  Database setup had issues, but continuing..."
fi
cd ../..

# Start services in background
echo "🚀 Starting services..."

# Start Backend API (Port 3000)
echo "   Starting Backend API on port 3000..."
cd packages/backend
nohup npm run dev > ../../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../../logs/backend.pid
cd ../..

# Wait for backend to be ready
sleep 5
wait_for_service "http://localhost:3000/api/v1/health" "Backend API"

# Start MCP Server (Port 3001)
echo "   Starting MCP Server on port 3001..."
cd packages/backend
nohup npm run mcp:start > ../../logs/mcp-server.log 2>&1 &
MCP_PID=$!
echo $MCP_PID > ../../logs/mcp-server.pid
cd ../..

# Wait for MCP server to be ready
sleep 5
wait_for_service "http://localhost:3001/health" "MCP Server"

# Start ChatBot UI (Port 3002)
echo "   Starting ChatBot UI on port 3002..."
cd packages/chatbot-ui
nohup npm run dev > ../../logs/chatbot-ui.log 2>&1 &
CHATBOT_PID=$!
echo $CHATBOT_PID > ../../logs/chatbot-ui.pid
cd ../..

# Wait for chatbot UI to be ready
sleep 10
wait_for_service "http://localhost:3002" "ChatBot UI"

echo ""
echo "🎉 All services started successfully!"
echo "================================================="
echo "📊 Service Status:"
echo "   🗄️  PostgreSQL: http://localhost:5432 (Docker)"
echo "   🔴 Redis: http://localhost:6379 (Docker)"
echo "   🚀 Backend API: http://localhost:3000/api/v1"
echo "   🤖 MCP Server: http://localhost:3001"
echo "   💬 ChatBot UI: http://localhost:3002"
echo ""
echo "📁 Logs are available in the logs/ directory:"
echo "   📄 Backend: logs/backend.log"
echo "   📄 MCP Server: logs/mcp-server.log"
echo "   📄 ChatBot UI: logs/chatbot-ui.log"
echo ""
echo "🛑 To stop all services, run: ./stop-local.sh"
echo "🔄 To restart services, run: ./restart-local.sh"
echo ""
echo "🔍 Debug Tips:"
echo "   • Check service logs: tail -f logs/[service].log"
echo "   • Test API: curl http://localhost:3000/api/v1/health"
echo "   • Test MCP: curl http://localhost:3001/health"
echo "   • Open ChatBot: open http://localhost:3002"
