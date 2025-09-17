#!/bin/bash

# Enhanced Local Development Startup Script with HTTP MCP Server
# Starts all services for local development including HTTP MCP server

echo "🚀 Starting Enhanced Local Development Environment (HTTP MCP)..."
echo "=============================================================="

# Create logs directory
mkdir -p logs

# Debug mode check
DEBUG_MODE=${DEBUG:-false}
if [ "$DEBUG_MODE" = "true" ]; then
    echo "🐛 Debug mode enabled - verbose logging activated"
    set -x
fi

# Function to log with timestamp
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ℹ️  $1"
}

log_success() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1"
}

log_warn() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1"
}

log_debug() {
    if [ "$DEBUG_MODE" = "true" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🐛 DEBUG: $1"
    fi
}

# Function to check if a port is in use
check_port() {
    local port=$1
    log_debug "Checking if port $port is available..."
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        log_warn "Port $port is already in use"
        if [ "$DEBUG_MODE" = "true" ]; then
            echo "Processes using port $port:"
            lsof -Pi :$port -sTCP:LISTEN
        fi
        return 1
    fi
    log_debug "Port $port is available"
    return 0
}

# Function to wait for service to be ready
wait_for_service() {
    local url=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1
    
    log_info "⏳ Waiting for $service_name to be ready..."
    log_debug "Testing URL: $url with max $max_attempts attempts"
    
    while [ $attempt -le $max_attempts ]; do
        log_debug "Attempt $attempt/$max_attempts for $service_name"
        
        if curl -s "$url" >/dev/null 2>&1; then
            log_success "$service_name is ready!"
            log_debug "$service_name responded successfully on attempt $attempt"
            return 0
        fi
        
        if [ $((attempt % 5)) -eq 0 ]; then
            log_info "⏳ Still waiting for $service_name (attempt $attempt/$max_attempts)..."
        fi
        
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log_error "$service_name failed to start after $max_attempts attempts"
    log_debug "Final URL test failed for: $url"
    return 1
}

# Function to check service health
check_service_health() {
    local url=$1
    local service_name=$2
    
    log_debug "Checking health of $service_name at $url"
    
    if curl -s "$url" >/dev/null 2>&1; then
        log_success "$service_name is healthy"
        if [ "$DEBUG_MODE" = "true" ]; then
            echo "Health response from $service_name:"
            curl -s "$url" | jq . 2>/dev/null || curl -s "$url"
        fi
        return 0
    else
        log_warn "$service_name health check failed"
        return 1
    fi
}

# Check required ports
log_info "🔍 Checking required ports..."
REQUIRED_PORTS=(3000 3001 3002)
for port in "${REQUIRED_PORTS[@]}"; do
    if ! check_port $port; then
        if [ $port -eq 5432 ] || [ $port -eq 6379 ]; then
            log_info "ℹ️  Database ports should be handled by Docker"
        else
            log_error "Port $port is required but already in use"
            log_error "Please stop the service using port $port and try again"
            if [ "$DEBUG_MODE" = "true" ]; then
                echo "To kill processes on port $port:"
                echo "lsof -ti:$port | xargs kill -9"
            fi
            exit 1
        fi
    fi
done
log_success "All required ports are available"

# Check if Docker containers are running
log_info "🐳 Checking Docker containers..."
log_debug "Looking for PostgreSQL container patterns: credit_card_postgres, enterprise-banking-db"
log_debug "Looking for Redis container patterns: credit_card_redis, enterprise-banking-cache"

if ! docker ps | grep -q "credit_card_postgres\|enterprise-banking-db"; then
    log_warn "PostgreSQL container not found. Starting Docker services..."
    log_debug "Running: docker compose up -d postgres redis"
    docker compose up -d postgres redis
    sleep 5
    log_debug "Docker services startup completed"
fi

if ! docker ps | grep -q "credit_card_redis\|enterprise-banking-cache"; then
    log_warn "Redis container not found. Starting Docker services..."
    log_debug "Running: docker compose up -d postgres redis"
    docker compose up -d postgres redis
    sleep 5
    log_debug "Docker services startup completed"
fi

log_success "Docker containers are ready"

# Install dependencies if needed
log_info "📦 Checking dependencies..."

# Backend dependencies
log_debug "Checking backend dependencies in packages/backend"
cd packages/backend
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
    log_info "📦 Installing backend dependencies..."
    log_debug "Running npm install in $(pwd)"
    npm install
    log_debug "Backend npm install completed"
fi

# Check for missing dependencies
log_info "🔍 Checking for missing backend dependencies..."
missing_deps=()

if ! npm list helmet >/dev/null 2>&1; then
    log_info "📦 Installing missing helmet..."
    npm install helmet
    missing_deps+=("helmet")
fi
if ! npm list express-rate-limit >/dev/null 2>&1; then
    log_info "📦 Installing missing express-rate-limit..."
    npm install express-rate-limit
    missing_deps+=("express-rate-limit")
fi
if ! npm list redis >/dev/null 2>&1; then
    log_info "📦 Installing missing redis..."
    npm install redis
    missing_deps+=("redis")
fi

if [ ${#missing_deps[@]} -eq 0 ]; then
    log_success "All backend dependencies are present"
else
    log_info "Installed missing dependencies: ${missing_deps[*]}"
fi

# ChatBot UI dependencies
log_debug "Checking chatbot-ui dependencies in packages/chatbot-ui"
cd ../chatbot-ui
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
    log_info "📦 Installing chatbot-ui dependencies..."
    log_debug "Running npm install in $(pwd)"
    npm install
    log_debug "ChatBot UI npm install completed"
fi

cd ../..
log_success "All dependencies are installed"

# Start services in background
log_info "🚀 Starting services..."
log_debug "Services will be started in the following order:"
log_debug "1. Backend API (port 3000)"
log_debug "2. HTTP MCP Server (port 3001)" 
log_debug "3. ChatBot UI (port 3002)"

# 1. Start Backend API
log_info "🔧 Starting Backend API (port 3000)..."
cd packages/backend
log_debug "Starting backend with: NODE_ENV=development npm run dev"

# Set debug environment variables
export DEBUG=true
export NODE_ENV=development
export MCP_DEBUG=true

NODE_ENV=development npm run dev > ../../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../../logs/backend.pid
log_debug "Backend API started with PID: $BACKEND_PID"
log_debug "Backend logs: tail -f logs/backend.log"
cd ../..

# Wait for backend to be ready
if wait_for_service "http://localhost:3000/api/v1/health" "Backend API"; then
    check_service_health "http://localhost:3000/api/v1/health" "Backend API"
else
    log_error "Backend API failed to start"
    if [ "$DEBUG_MODE" = "true" ]; then
        echo "Backend logs:"
        tail -20 logs/backend.log
    fi
    exit 1
fi

# 2. Start HTTP MCP Server
log_info "🔧 Starting HTTP MCP Server (port 3001)..."
cd packages/backend
log_debug "Starting MCP server with: MCP_PORT=3001 API_BASE_URL=http://localhost:3000/api/v1 npm run mcp:start:http"

# Set MCP specific environment variables
export MCP_PORT=3001
export API_BASE_URL=http://localhost:3000/api/v1
export MCP_DEBUG=true

MCP_PORT=3001 API_BASE_URL=http://localhost:3000/api/v1 npm run mcp:start:http > ../../logs/mcp-server-http.log 2>&1 &
MCP_PID=$!
echo $MCP_PID > ../../logs/mcp-server-http.pid
log_debug "HTTP MCP Server started with PID: $MCP_PID"
log_debug "MCP Server logs: tail -f logs/mcp-server-http.log"
cd ../..

# Wait for MCP server to be ready
if wait_for_service "http://localhost:3001/health" "HTTP MCP Server"; then
    check_service_health "http://localhost:3001/health" "HTTP MCP Server"
    check_service_health "http://localhost:3001/tools" "HTTP MCP Server Tools"
else
    log_error "HTTP MCP Server failed to start"
    if [ "$DEBUG_MODE" = "true" ]; then
        echo "MCP Server logs:"
        tail -20 logs/mcp-server-http.log
    fi
    exit 1
fi

# 3. Start ChatBot UI
log_info "🔧 Starting ChatBot UI (port 3002)..."
cd packages/chatbot-ui
log_debug "Starting ChatBot UI with environment variables:"
log_debug "NEXT_PUBLIC_MCP_SERVER_URL=http://localhost:3001"
log_debug "NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1"
log_debug "NEXT_PUBLIC_DEBUG=true"

# Set UI specific environment variables
export NEXT_PUBLIC_MCP_SERVER_URL=http://localhost:3001
export NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
export NEXT_PUBLIC_DEBUG=true

NEXT_PUBLIC_MCP_SERVER_URL=http://localhost:3001 \
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1 \
NEXT_PUBLIC_DEBUG=true \
npm run dev > ../../logs/chatbot-ui.log 2>&1 &
CHATBOT_PID=$!
echo $CHATBOT_PID > ../../logs/chatbot-ui.pid
log_debug "ChatBot UI started with PID: $CHATBOT_PID"
log_debug "ChatBot UI logs: tail -f logs/chatbot-ui.log"
cd ../..

# Wait for ChatBot UI to be ready
if wait_for_service "http://localhost:3002" "ChatBot UI"; then
    check_service_health "http://localhost:3002" "ChatBot UI"
else
    log_error "ChatBot UI failed to start"
    if [ "$DEBUG_MODE" = "true" ]; then
        echo "ChatBot UI logs:"
        tail -20 logs/chatbot-ui.log
    fi
    exit 1
fi

# Final health checks
log_info "🔍 Performing final health checks..."
ALL_HEALTHY=true

if ! check_service_health "http://localhost:3000/api/v1/health" "Backend API"; then
    ALL_HEALTHY=false
fi

if ! check_service_health "http://localhost:3001/health" "HTTP MCP Server"; then
    ALL_HEALTHY=false
fi

if ! check_service_health "http://localhost:3002" "ChatBot UI"; then
    ALL_HEALTHY=false
fi

if [ "$ALL_HEALTHY" = "true" ]; then
    log_success "All services are healthy!"
else
    log_warn "Some services may have health issues"
fi

echo ""
log_success "🎉 All services started successfully!"
echo "=================================="
echo ""
echo "📊 Service Status:"
echo "   • Backend API:      http://localhost:3000 (PID: $BACKEND_PID)"
echo "   • HTTP MCP Server:  http://localhost:3001 (PID: $MCP_PID)"
echo "   • ChatBot UI:       http://localhost:3002 (PID: $CHATBOT_PID)"
echo "   • PostgreSQL:       localhost:5432 (Docker)"
echo "   • Redis:            localhost:6379 (Docker)"
echo ""
echo "🔗 Quick Links:"
echo "   • API Health:       http://localhost:3000/api/v1/health"
echo "   • MCP Health:       http://localhost:3001/health"
echo "   • MCP Tools:        http://localhost:3001/tools"
echo "   • ChatBot App:      http://localhost:3002"
echo ""
echo "📁 Log Files:"
echo "   • Backend:          tail -f logs/backend.log"
echo "   • MCP Server:       tail -f logs/mcp-server-http.log"
echo "   • ChatBot UI:       tail -f logs/chatbot-ui.log"
echo ""
echo "🐛 Debug Commands:"
echo "   • Enable debug:     export DEBUG=true && ./start-local-http-mcp.sh"
echo "   • Check processes:  ps aux | grep node"
echo "   • Check ports:      lsof -i :3000 -i :3001 -i :3002"
echo "   • View all logs:    tail -f logs/*.log"
echo ""
echo "🛑 To stop all services: ./stop-local.sh"
echo "📊 To check status:      ./status-local.sh"
echo ""
log_success "✨ Development environment is ready! ✨"

if [ "$DEBUG_MODE" = "true" ]; then
    echo ""
    echo "🐛 Debug Information:"
    echo "   • Environment variables set:"
    echo "     - DEBUG=true"
    echo "     - NODE_ENV=development"
    echo "     - MCP_DEBUG=true"
    echo "     - NEXT_PUBLIC_DEBUG=true"
    echo "   • Process IDs saved to logs/*.pid files"
    echo "   • Verbose logging enabled in all services"
    echo "   • Health checks completed successfully"
fi
