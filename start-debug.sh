#!/bin/bash

# Debug Mode Service Startup Script
# Starts all services with comprehensive DEBUG logging enabled
# Enterprise Banking HTTP MCP System with Enhanced Debug Tracing
# Compatible with bash 3.2+ (macOS default)

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Enhanced logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_debug() {
    echo -e "${PURPLE}[DEBUG]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_startup() {
    echo -e "${CYAN}[STARTUP]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_health() {
    echo -e "${WHITE}[HEALTH]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Display startup banner
echo -e "${WHITE}"
echo "████████████████████████████████████████████████████████████████"
echo "██                                                            ██"
echo "██    🐛 DEBUG MODE SERVICE STARTUP 🐛                       ██"
echo "██                                                            ██"
echo "██    Enterprise Banking HTTP MCP System                     ██"
echo "██    with Enhanced Debug Tracing                            ██"
echo "██                                                            ██"
echo "████████████████████████████████████████████████████████████████"
echo -e "${NC}"
echo ""

log_startup "Initializing DEBUG mode startup sequence..."

# Force enable debug mode
export DEBUG=true
export NODE_ENV=development

# Enhanced debug environment variables
export MCP_DEBUG=true
export NEXT_PUBLIC_DEBUG=true
export LOG_LEVEL=DEBUG
export LOG_REQUESTS=true
export LOG_RESPONSES=true
export LOG_DATABASE=true
export LOG_PERFORMANCE=true
export SANITIZE_LOGS=true

log_debug "Debug environment variables configured:"
log_debug "  DEBUG=true"
log_debug "  NODE_ENV=development"
log_debug "  MCP_DEBUG=true"
log_debug "  NEXT_PUBLIC_DEBUG=true"
log_debug "  LOG_LEVEL=DEBUG"
log_debug "  LOG_REQUESTS=true"
log_debug "  LOG_RESPONSES=true"
log_debug "  LOG_DATABASE=true"
log_debug "  LOG_PERFORMANCE=true"
log_debug "  SANITIZE_LOGS=true"

# Create enhanced logs directory structure
log_startup "Setting up enhanced logging infrastructure..."
mkdir -p logs/debug
mkdir -p logs/performance
mkdir -p logs/security
mkdir -p logs/services

# Create debug session log
DEBUG_SESSION_ID="debug-$(date +%Y%m%d-%H%M%S)"
DEBUG_LOG_FILE="logs/debug/session-${DEBUG_SESSION_ID}.log"

log_debug "Debug session ID: $DEBUG_SESSION_ID"
log_debug "Debug session log: $DEBUG_LOG_FILE"

# Start logging to debug session file
exec 1> >(tee -a "$DEBUG_LOG_FILE")
exec 2> >(tee -a "$DEBUG_LOG_FILE" >&2)

log_startup "Debug session logging initialized"

# Service configuration with debug ports (compatible with bash 3.2+)
SERVICES="backend:3000 mcp-server:3001 chatbot-ui:3002"

# Enhanced port checking with debug info
check_port_detailed() {
    local port=$1
    local service_name=$2
    
    log_debug "Checking port $port for $service_name..."
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        log_error "Port $port is already in use (required for $service_name)"
        echo ""
        echo "Processes using port $port:"
        lsof -Pi :$port -sTCP:LISTEN
        echo ""
        echo "To kill processes on this port:"
        echo "  lsof -ti:$port | xargs kill -9"
        echo ""
        return 1
    else
        log_debug "Port $port is available for $service_name"
        return 0
    fi
}

# Enhanced service health checking
check_service_health_detailed() {
    local url=$1
    local service_name=$2
    local timeout=${3:-30}
    
    log_health "Performing detailed health check for $service_name"
    log_debug "Health check URL: $url"
    log_debug "Timeout: ${timeout}s"
    
    local attempt=1
    local max_attempts=$timeout
    
    while [ $attempt -le $max_attempts ]; do
        if [ $((attempt % 10)) -eq 1 ] || [ $attempt -eq $max_attempts ]; then
            log_health "Health check attempt $attempt/$max_attempts for $service_name"
        fi
        
        if curl -s -f "$url" >/dev/null 2>&1; then
            log_success "$service_name health check passed!"
            
            # Get detailed health response
            local health_response=$(curl -s "$url" 2>/dev/null)
            if echo "$health_response" | jq . >/dev/null 2>&1; then
                log_debug "$service_name health response:"
                echo "$health_response" | jq .
            else
                log_debug "$service_name health response: $health_response"
            fi
            
            return 0
        fi
        
        sleep 1
        attempt=$((attempt + 1))
    done
    
    log_error "$service_name health check failed after $max_attempts attempts"
    return 1
}

# Enhanced dependency checking
check_dependencies_detailed() {
    local service_path=$1
    local service_name=$2
    
    log_startup "Checking dependencies for $service_name in $service_path"
    
    cd "$service_path"
    
    # Check if package.json exists
    if [ ! -f "package.json" ]; then
        log_error "package.json not found in $service_path"
        return 1
    fi
    
    log_debug "package.json found for $service_name"
    
    # Check node_modules
    if [ ! -d "node_modules" ]; then
        log_warn "node_modules not found for $service_name, installing..."
        npm install
        log_success "Dependencies installed for $service_name"
    else
        log_debug "node_modules exists for $service_name"
        
        # Check for package-lock.json consistency
        if [ -f "package-lock.json" ] && [ "package-lock.json" -nt "node_modules" ]; then
            log_warn "package-lock.json is newer than node_modules, reinstalling..."
            npm ci
            log_success "Dependencies updated for $service_name"
        else
            log_debug "Dependencies are up to date for $service_name"
        fi
    fi
    
    # Check for missing critical dependencies
    local missing_deps=()
    
    if [ "$service_name" = "backend" ]; then
        for dep in express helmet cors morgan compression; do
            if ! npm list "$dep" >/dev/null 2>&1; then
                missing_deps+=("$dep")
            fi
        done
    elif [ "$service_name" = "chatbot-ui" ]; then
        for dep in next react react-dom; do
            if ! npm list "$dep" >/dev/null 2>&1; then
                missing_deps+=("$dep")
            fi
        done
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_warn "Missing critical dependencies for $service_name: ${missing_deps[*]}"
        npm install "${missing_deps[@]}"
        log_success "Missing dependencies installed for $service_name"
    else
        log_debug "All critical dependencies present for $service_name"
    fi
    
    cd - >/dev/null
}

# Docker service management with debug info
manage_docker_services() {
    log_startup "Managing Docker services for debug environment..."
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    
    log_debug "Docker is running"
    
    # Check existing containers
    log_debug "Checking existing Docker containers..."
    
    local postgres_running=false
    local redis_running=false
    
    if docker ps --format "table {{.Names}}" | grep -E "(postgres|postgresql)" >/dev/null; then
        postgres_running=true
        log_debug "PostgreSQL container is running"
    fi
    
    if docker ps --format "table {{.Names}}" | grep -E "(redis|cache)" >/dev/null; then
        redis_running=true
        log_debug "Redis container is running"
    fi
    
    if [ "$postgres_running" = false ] || [ "$redis_running" = false ]; then
        log_startup "Starting required Docker services..."
        docker compose up -d postgres redis
        
        # Wait for services to be ready
        log_debug "Waiting for Docker services to initialize..."
        sleep 10
        
        log_success "Docker services started"
    else
        log_debug "All required Docker services are already running"
    fi
    
    # Show container status
    log_debug "Docker container status:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(postgres|redis|Names)"
}

# Enhanced service startup with debug logging
start_service_with_debug() {
    local service_name=$1
    local service_path=$2
    local port=$3
    local start_command=$4
    local env_vars=$5
    
    log_startup "Starting $service_name with debug logging..."
    
    # Create service-specific log files
    local service_log="logs/services/${service_name}.log"
    local debug_log="logs/debug/${service_name}-debug.log"
    local performance_log="logs/performance/${service_name}-perf.log"
    
    log_debug "Service logs:"
    log_debug "  Main log: $service_log"
    log_debug "  Debug log: $debug_log"
    log_debug "  Performance log: $performance_log"
    
    cd "$service_path"
    
    # Set service-specific environment variables
    if [ -n "$env_vars" ]; then
        log_debug "Setting environment variables for $service_name:"
        eval "export $env_vars"
        for var in $env_vars; do
            log_debug "  $var"
        done
    fi
    
    # Start the service
    log_startup "Executing start command for $service_name..."
    log_debug "Command: $start_command"
    log_debug "Working directory: $(pwd)"
    
    # Start service with comprehensive logging
    eval "$start_command" > "../../$service_log" 2>&1 &
    local service_pid=$!
    
    # Save PID
    echo "$service_pid" > "../../logs/services/${service_name}.pid"
    
    log_success "$service_name started with PID: $service_pid"
    log_debug "PID saved to logs/services/${service_name}.pid"
    
    cd - >/dev/null
    
    # Wait for service to be ready
    local health_url="http://localhost:$port"
    if [ "$service_name" = "backend" ]; then
        health_url="http://localhost:$port/api/v1/health"
    elif [ "$service_name" = "mcp-server" ]; then
        health_url="http://localhost:$port/health"
    fi
    
    log_startup "Waiting for $service_name to be ready..."
    if check_service_health_detailed "$health_url" "$service_name" 60; then
        log_success "$service_name is ready and healthy!"
    else
        log_error "$service_name failed to start properly"
        log_error "Check the logs: tail -f $service_log"
        return 1
    fi
    
    return 0
}

# Test debug endpoints
test_debug_endpoints() {
    log_startup "Testing debug endpoints and functionality..."
    
    # Test backend debug logging
    log_debug "Testing backend API debug endpoints..."
    
    # Health check with request tracing
    local test_request_id="DEBUG-TEST-$(date +%s)"
    curl -s -H "X-Request-ID: $test_request_id" "http://localhost:3000/api/v1/health" >/dev/null
    log_debug "Backend health test completed with Request ID: $test_request_id"
    
    # Test authentication debug logging
    curl -s -X POST -H "Content-Type: application/json" \
        -d '{"email":"debug@test.com","password":"wrongpassword"}' \
        "http://localhost:3000/api/v1/auth/login" >/dev/null
    log_debug "Authentication debug test completed (expected failure)"
    
    # Test MCP server debug endpoints
    log_debug "Testing MCP server debug endpoints..."
    curl -s "http://localhost:3001/health" >/dev/null
    curl -s "http://localhost:3001/tools" >/dev/null
    log_debug "MCP server debug tests completed"
    
    # Test chatbot UI debug
    log_debug "Testing ChatBot UI debug endpoints..."
    curl -s "http://localhost:3002" >/dev/null
    log_debug "ChatBot UI debug test completed"
    
    log_success "All debug endpoints tested successfully!"
}

# Display debug information and commands
display_debug_info() {
    echo ""
    echo -e "${WHITE}════════════════════════════════════════════════════════════════"
    echo -e "                    🐛 DEBUG MODE ACTIVE 🐛"
    echo -e "════════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    echo -e "${CYAN}📊 Service Status:${NC}"
    echo "   • Backend API:      http://localhost:3000 (Debug Enabled)"
    echo "   • HTTP MCP Server:  http://localhost:3001 (Debug Enabled)"
    echo "   • ChatBot UI:       http://localhost:3002 (Debug Enabled)"
    echo "   • PostgreSQL:       localhost:5432 (Docker)"
    echo "   • Redis:            localhost:6379 (Docker)"
    echo ""
    
    echo -e "${CYAN}🔗 Debug Endpoints:${NC}"
    echo "   • API Health:       http://localhost:3000/api/v1/health"
    echo "   • API Status:       http://localhost:3000/api"
    echo "   • MCP Health:       http://localhost:3001/health"
    echo "   • MCP Tools:        http://localhost:3001/tools"
    echo "   • ChatBot App:      http://localhost:3002"
    echo ""
    
    echo -e "${CYAN}📁 Debug Log Files:${NC}"
    echo "   • Session Log:      $DEBUG_LOG_FILE"
    echo "   • Backend:          tail -f logs/services/backend.log"
    echo "   • MCP Server:       tail -f logs/services/mcp-server.log"
    echo "   • ChatBot UI:       tail -f logs/services/chatbot-ui.log"
    echo "   • All Services:     tail -f logs/services/*.log"
    echo ""
    
    echo -e "${CYAN}🐛 Debug Commands:${NC}"
    echo "   • View all logs:    tail -f logs/services/*.log"
    echo "   • Debug session:    tail -f $DEBUG_LOG_FILE"
    echo "   • Test endpoints:   ./test-debug-logging.sh"
    echo "   • Backend debug:    ./test-backend-debug.sh"
    echo "   • Check processes:  ps aux | grep node"
    echo "   • Check ports:      lsof -i :3000 -i :3001 -i :3002"
    echo ""
    
    echo -e "${CYAN}🔍 Debug Environment:${NC}"
    echo "   • DEBUG=true"
    echo "   • NODE_ENV=development"
    echo "   • MCP_DEBUG=true"
    echo "   • NEXT_PUBLIC_DEBUG=true"
    echo "   • LOG_LEVEL=DEBUG"
    echo "   • LOG_REQUESTS=true"
    echo "   • LOG_RESPONSES=true"
    echo ""
    
    echo -e "${CYAN}🧪 Testing Commands:${NC}"
    echo "   • Test auth flow:   curl -X POST -H 'Content-Type: application/json' \\"
    echo "                         -d '{\"email\":\"test@example.com\",\"password\":\"wrongpass\"}' \\"
    echo "                         http://localhost:3000/api/v1/auth/login"
    echo ""
    echo "   • Test with trace:  curl -H 'X-Request-ID: TEST-123' \\"
    echo "                         http://localhost:3000/api/v1/health"
    echo ""
    echo "   • MCP tools test:   curl http://localhost:3001/tools"
    echo ""
    
    echo -e "${CYAN}🛑 Management Commands:${NC}"
    echo "   • Stop all:         ./stop-local.sh"
    echo "   • Check status:     ./status-local.sh"
    echo "   • Restart debug:    ./start-debug.sh"
    echo ""
    
    echo -e "${WHITE}════════════════════════════════════════════════════════════════"
    echo -e "           ✨ DEBUG ENVIRONMENT READY FOR DEVELOPMENT ✨"
    echo -e "════════════════════════════════════════════════════════════════${NC}"
}

# Main execution flow
main() {
    # Check if any services are already running
    log_startup "Checking for existing services..."
    
    local conflicts=false
    for service_info in $SERVICES; do
        local service_name=$(echo "$service_info" | cut -d':' -f1)
        local port=$(echo "$service_info" | cut -d':' -f2)
        if ! check_port_detailed "$port" "$service_name"; then
            conflicts=true
        fi
    done
    
    if [ "$conflicts" = true ]; then
        log_error "Port conflicts detected. Please stop existing services first."
        echo ""
        echo "Quick fix: ./stop-local.sh"
        exit 1
    fi
    
    # Setup Docker services
    manage_docker_services
    
    # Check dependencies for all services
    log_startup "Checking dependencies for all services..."
    check_dependencies_detailed "packages/backend" "backend"
    check_dependencies_detailed "packages/chatbot-ui" "chatbot-ui"
    
    # Start all services with debug logging
    log_startup "Starting all services with debug logging enabled..."
    
    # Start Backend API
    if ! start_service_with_debug "backend" "packages/backend" "3000" \
        "npm run dev" \
        "DEBUG=true NODE_ENV=development MCP_DEBUG=true LOG_LEVEL=DEBUG LOG_REQUESTS=true LOG_RESPONSES=true"; then
        log_error "Failed to start backend service"
        exit 1
    fi
    
    # Start HTTP MCP Server
    if ! start_service_with_debug "mcp-server" "packages/backend" "3001" \
        "MCP_PORT=3001 API_BASE_URL=http://localhost:3000/api/v1 npm run mcp:start:http" \
        "MCP_PORT=3001 API_BASE_URL=http://localhost:3000/api/v1 MCP_DEBUG=true DEBUG=true"; then
        log_error "Failed to start MCP server"
        exit 1
    fi
    
    # Start ChatBot UI
    if ! start_service_with_debug "chatbot-ui" "packages/chatbot-ui" "3002" \
        "npm run dev" \
        "NEXT_PUBLIC_MCP_SERVER_URL=http://localhost:3001 NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1 NEXT_PUBLIC_DEBUG=true"; then
        log_error "Failed to start ChatBot UI"
        exit 1
    fi
    
    # Test debug functionality
    sleep 5
    test_debug_endpoints
    
    # Final success message
    log_success "🎉 All services started successfully in DEBUG mode!"
    
    # Display comprehensive debug information
    display_debug_info
    
    # Save session info
    cat > "logs/debug/session-${DEBUG_SESSION_ID}.info" << EOF
Debug Session: $DEBUG_SESSION_ID
Started: $(date)
Services:
  - Backend API: http://localhost:3000 (PID: $(cat logs/services/backend.pid 2>/dev/null || echo "unknown"))
  - MCP Server: http://localhost:3001 (PID: $(cat logs/services/mcp-server.pid 2>/dev/null || echo "unknown"))
  - ChatBot UI: http://localhost:3002 (PID: $(cat logs/services/chatbot-ui.pid 2>/dev/null || echo "unknown"))

Environment Variables:
  DEBUG=true
  NODE_ENV=development
  MCP_DEBUG=true
  NEXT_PUBLIC_DEBUG=true
  LOG_LEVEL=DEBUG

Log Files:
  - Session: $DEBUG_LOG_FILE
  - Backend: logs/services/backend.log
  - MCP: logs/services/mcp-server.log
  - UI: logs/services/chatbot-ui.log
EOF
    
    log_success "Debug session info saved to logs/debug/session-${DEBUG_SESSION_ID}.info"
}

# Execute main function
main "$@"
