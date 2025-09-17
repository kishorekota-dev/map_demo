#!/bin/bash

# Stop Local Development Services

set -e

echo "🛑 Stopping Local Development Services"
echo "======================================"

# Function to stop a service by PID file
stop_service() {
    local service_name=$1
    local pid_file="logs/${service_name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "🛑 Stopping $service_name (PID: $pid)..."
            kill "$pid"
            rm "$pid_file"
            echo "✅ $service_name stopped"
        else
            echo "⚠️  $service_name was already stopped"
            rm "$pid_file"
        fi
    else
        echo "⚠️  No PID file found for $service_name"
    fi
}

# Stop all services
stop_service "backend"
stop_service "mcp-server"
stop_service "chatbot-ui"

# Kill any remaining Node.js processes on our ports
echo "🧹 Cleaning up any remaining processes..."

# Find and kill processes on our ports
for port in 3000 3001 3002; do
    pid=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$pid" ]; then
        echo "🛑 Killing process on port $port (PID: $pid)"
        kill -9 "$pid" 2>/dev/null || true
    fi
done

echo ""
echo "✅ All local services stopped!"
echo ""
echo "💡 Docker services (PostgreSQL, Redis) are still running."
echo "   To stop them: docker compose down"
