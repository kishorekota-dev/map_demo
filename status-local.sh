#!/bin/bash

# Check Local Development Environment Status

echo "🔍 Local Development Environment Status"
echo "======================================="

# Function to check service status
check_service() {
    local url=$1
    local name=$2
    local port=$3
    
    if curl -s "$url" >/dev/null 2>&1; then
        echo "✅ $name: Running (http://localhost:$port)"
    else
        echo "❌ $name: Not responding (http://localhost:$port)"
    fi
}

# Function to check Docker service
check_docker_service() {
    local container_name=$1
    local service_name=$2
    local port=$3
    
    if docker ps | grep -q "$container_name"; then
        echo "✅ $service_name: Running (Docker, port $port)"
    else
        echo "❌ $service_name: Not running (Docker)"
    fi
}

# Function to check process by PID file
check_process() {
    local service_name=$1
    local pid_file="logs/${service_name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "✅ $service_name: Process running (PID: $pid)"
        else
            echo "❌ $service_name: Process not running (stale PID file)"
        fi
    else
        echo "❓ $service_name: No PID file found"
    fi
}

echo ""
echo "📊 Docker Services:"
check_docker_service "credit_card_postgres\|enterprise-banking-db" "PostgreSQL" "5432"
check_docker_service "credit_card_redis\|enterprise-banking-cache" "Redis" "6379"

echo ""
echo "🚀 Local Services:"
check_service "http://localhost:3000/api/v1/health" "Backend API" "3000"
check_service "http://localhost:3001/health" "HTTP MCP Server" "3001"
check_service "http://localhost:3002" "ChatBot UI" "3002"

echo ""
echo "🔧 Process Status:"
check_process "backend"
check_process "mcp-server-http"
check_process "chatbot-ui"

echo ""
echo "🌐 Port Usage:"
for port in 3000 3001 3002 5432 6379; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        local process=$(lsof -Pi :$port -sTCP:LISTEN -c 'node,postgres,redis' | tail -n +2 | awk '{print $1}' | head -1)
        echo "   Port $port: Used by $process"
    else
        echo "   Port $port: Available"
    fi
done

echo ""
echo "📁 Recent Log Activity:"
if [ -d "logs" ]; then
    echo "   Backend: $(tail -1 logs/backend.log 2>/dev/null || echo 'No logs')"
    echo "   MCP Server: $(tail -1 logs/mcp-server-http.log 2>/dev/null || echo 'No logs')"
    echo "   ChatBot: $(tail -1 logs/chatbot-ui.log 2>/dev/null || echo 'No logs')"
else
    echo "   No logs directory found"
fi

echo ""
echo "🔗 Quick Links:"
echo "   • Backend API: http://localhost:3000/api/v1"
echo "   • API Health: http://localhost:3000/api/v1/health"
echo "   • MCP Server: http://localhost:3001"
echo "   • MCP Health: http://localhost:3001/health"
echo "   • MCP Tools: http://localhost:3001/tools"
echo "   • ChatBot UI: http://localhost:3002"
echo "   • API Docs: http://localhost:3000/api/v1/docs (if available)"
echo ""
echo "💡 Commands:"
echo "   • View backend logs: tail -f logs/backend.log"
echo "   • View MCP logs: tail -f logs/mcp-server-http.log"
echo "   • View UI logs: tail -f logs/chatbot-ui.log"
echo "   • Test API: curl http://localhost:3000/api/v1/health"
echo "   • Test MCP: curl http://localhost:3001/health"
echo "   • Start HTTP MCP: ./start-local-http-mcp.sh"
