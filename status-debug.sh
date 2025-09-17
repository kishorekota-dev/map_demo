#!/bin/bash

# Debug Mode Status Check Script
# Displays comprehensive status of debug environment
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

# Logging functions
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

log_status() {
    echo -e "${CYAN}[STATUS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Display status banner
echo -e "${WHITE}"
echo "████████████████████████████████████████████████████████████████"
echo "██                                                            ██"
echo "██    📊 DEBUG ENVIRONMENT STATUS 📊                         ██"
echo "██                                                            ██"
echo "██    Enterprise Banking HTTP MCP System                     ██"
echo "██    Comprehensive Debug Status Check                       ██"
echo "██                                                            ██"
echo "████████████████████████████████████████████████████████████████"
echo -e "${NC}"
echo ""

# Service configuration (compatible with bash 3.2+)
SERVICES="backend:3000 mcp-server:3001 chatbot-ui:3002"

# Function to check service health
check_service_health() {
    local service_name=$1
    local port=$2
    local url=$3
    
    # Check if port is in use
    if ! lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "   ❌ $service_name: Not running (port $port free)"
        return 1
    fi
    
    # Get process info
    local pid=$(lsof -ti:$port | head -1)
    local process_info=$(ps -p "$pid" -o pid,comm,args --no-headers 2>/dev/null || echo "Unknown")
    
    # Check HTTP health if URL provided
    if [ -n "$url" ]; then
        if curl -s -f "$url" >/dev/null 2>&1; then
            echo "   ✅ $service_name: Running healthy (PID: $pid, Port: $port) ✨"
            
            # Show health response if it's JSON
            local health_response=$(curl -s "$url" 2>/dev/null)
            if echo "$health_response" | jq . >/dev/null 2>&1; then
                echo "      Health: $(echo "$health_response" | jq -c .)"
            elif [ -n "$health_response" ]; then
                echo "      Health: $health_response"
            fi
        else
            echo "   ⚠️  $service_name: Running but unhealthy (PID: $pid, Port: $port)"
        fi
    else
        echo "   ✅ $service_name: Running (PID: $pid, Port: $port)"
    fi
    
    # Show process details
    echo "      Process: $process_info"
    
    return 0
}

# Function to check Docker services
check_docker_services() {
    echo -e "${CYAN}🐳 Docker Services Status:${NC}"
    
    if ! docker info >/dev/null 2>&1; then
        echo "   ❌ Docker: Not running or not accessible"
        return 1
    fi
    
    echo "   ✅ Docker: Running"
    
    # Check specific containers
    local postgres_status=$(docker ps --filter "name=postgres" --format "{{.Status}}" 2>/dev/null | head -1)
    local redis_status=$(docker ps --filter "name=redis" --format "{{.Status}}" 2>/dev/null | head -1)
    
    if [ -n "$postgres_status" ]; then
        echo "   ✅ PostgreSQL: $postgres_status"
    else
        echo "   ❌ PostgreSQL: Not running"
    fi
    
    if [ -n "$redis_status" ]; then
        echo "   ✅ Redis: $redis_status"
    else
        echo "   ❌ Redis: Not running"
    fi
    
    # Show all relevant containers
    local containers=$(docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(postgres|redis|Names)" || echo "No relevant containers")
    if [ "$containers" != "No relevant containers" ]; then
        echo ""
        echo "   Container Details:"
        echo "$containers" | sed 's/^/      /'
    fi
}

# Function to check environment variables
check_environment() {
    echo -e "${CYAN}🌍 Debug Environment Variables:${NC}"
    
    local env_vars=(
        "DEBUG"
        "NODE_ENV"
        "MCP_DEBUG"
        "NEXT_PUBLIC_DEBUG"
        "LOG_LEVEL"
        "LOG_REQUESTS"
        "LOG_RESPONSES"
        "LOG_DATABASE"
        "LOG_PERFORMANCE"
        "SANITIZE_LOGS"
    )
    
    local debug_enabled=false
    
    for var in "${env_vars[@]}"; do
        local value=$(printenv "$var" 2>/dev/null || echo "")
        if [ -n "$value" ]; then
            if [[ "$value" =~ ^(true|TRUE|1|yes|YES)$ ]]; then
                echo "   ✅ $var: $value"
                if [ "$var" = "DEBUG" ] || [ "$var" = "MCP_DEBUG" ]; then
                    debug_enabled=true
                fi
            else
                echo "   ⚠️  $var: $value"
            fi
        else
            echo "   ❌ $var: Not set"
        fi
    done
    
    echo ""
    if [ "$debug_enabled" = true ]; then
        echo "   🐛 Debug mode: ENABLED"
    else
        echo "   ⚠️  Debug mode: NOT ENABLED"
    fi
}

# Function to check log files
check_log_files() {
    echo -e "${CYAN}📁 Log Files Status:${NC}"
    
    if [ ! -d "logs" ]; then
        echo "   ❌ Logs directory: Not found"
        return 1
    fi
    
    echo "   ✅ Logs directory: Present"
    
    # Check log subdirectories
    local log_dirs=("debug" "services" "performance" "security")
    for dir in "${log_dirs[@]}"; do
        if [ -d "logs/$dir" ]; then
            local file_count=$(find "logs/$dir" -type f | wc -l | tr -d ' ')
            echo "   ✅ logs/$dir: $file_count files"
            
            # Show recent files
            local recent_files=$(find "logs/$dir" -type f -name "*.log" -o -name "*.info" -o -name "*.summary" | head -3)
            if [ -n "$recent_files" ]; then
                echo "$recent_files" | while read -r file; do
                    local size=$(ls -lh "$file" | awk '{print $5}')
                    local modified=$(ls -l "$file" | awk '{print $6, $7, $8}')
                    echo "      • $(basename "$file") ($size, $modified)"
                done
            fi
        else
            echo "   ❌ logs/$dir: Directory missing"
        fi
    done
    
    # Check for PID files
    if [ -d "logs/services" ]; then
        local pid_files=$(find "logs/services" -name "*.pid" | wc -l | tr -d ' ')
        echo "   📌 Active PID files: $pid_files"
        
        find "logs/services" -name "*.pid" | while read -r pidfile; do
            local service=$(basename "$pidfile" .pid)
            local pid=$(cat "$pidfile" 2>/dev/null || echo "invalid")
            if kill -0 "$pid" 2>/dev/null; then
                echo "      ✅ $service: PID $pid (running)"
            else
                echo "      ❌ $service: PID $pid (not running)"
            fi
        done
    fi
}

# Function to test endpoints
test_endpoints() {
    echo -e "${CYAN}🔗 Endpoint Testing:${NC}"
    
    # Test backend endpoints
    local endpoints=(
        "http://localhost:3000/api/v1/health|Backend Health"
        "http://localhost:3000/api|Backend API Info"
        "http://localhost:3001/health|MCP Health"
        "http://localhost:3001/tools|MCP Tools"
        "http://localhost:3002|ChatBot UI"
    )
    
    for endpoint_info in "${endpoints[@]}"; do
        local url=$(echo "$endpoint_info" | cut -d'|' -f1)
        local name=$(echo "$endpoint_info" | cut -d'|' -f2)
        
        local response_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
        local response_time=$(curl -s -o /dev/null -w "%{time_total}" "$url" 2>/dev/null || echo "0.000")
        
        if [ "$response_code" = "200" ]; then
            echo "   ✅ $name: HTTP $response_code (${response_time}s)"
        elif [ "$response_code" = "000" ]; then
            echo "   ❌ $name: Connection failed"
        else
            echo "   ⚠️  $name: HTTP $response_code (${response_time}s)"
        fi
    done
}

# Function to check system resources
check_system_resources() {
    echo -e "${CYAN}💻 System Resources:${NC}"
    
    # Memory usage
    local memory_info=$(free -h 2>/dev/null || vm_stat | head -4)
    if command -v free >/dev/null 2>&1; then
        echo "   Memory: $(free -h | grep Mem | awk '{print $3 "/" $2 " (" $3/$2*100 "% used)"}')"
    else
        # macOS
        local total_mem=$(sysctl -n hw.memsize | awk '{print $1/1024/1024/1024 " GB"}')
        echo "   Memory: $total_mem total"
    fi
    
    # Disk usage for current directory
    local disk_usage=$(df -h . | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')
    echo "   Disk: $disk_usage"
    
    # CPU load (if available)
    if command -v uptime >/dev/null 2>&1; then
        local load_avg=$(uptime | awk -F'load average:' '{print $2}' | sed 's/^[[:space:]]*//')
        echo "   Load: $load_avg"
    fi
    
    # Node.js processes
    local node_count=$(ps aux | grep -E "(node|npm)" | grep -v grep | wc -l | tr -d ' ')
    echo "   Node.js processes: $node_count"
}

# Function to display recent debug activity
show_recent_activity() {
    echo -e "${CYAN}📈 Recent Debug Activity:${NC}"
    
    # Recent log entries from services
    local recent_logs=()
    
    for service in "${!SERVICES[@]}"; do
        local log_file="logs/services/${service}.log"
        if [ -f "$log_file" ]; then
            local last_modified=$(ls -l "$log_file" | awk '{print $6, $7, $8}')
            local size=$(ls -lh "$log_file" | awk '{print $5}')
            echo "   📄 $service.log: $size (modified: $last_modified)"
            
            # Show last few lines if file is recent (modified in last hour)
            if find "$log_file" -mmin -60 | grep -q "$log_file"; then
                echo "      Recent entries:"
                tail -3 "$log_file" 2>/dev/null | sed 's/^/         /' || echo "         (no recent entries)"
            fi
        else
            echo "   ❌ $service.log: Not found"
        fi
    done
    
    # Recent debug sessions
    if [ -d "logs/debug" ]; then
        local recent_sessions=$(find "logs/debug" -name "session-*.info" -mtime -1 | head -3)
        if [ -n "$recent_sessions" ]; then
            echo ""
            echo "   Recent debug sessions:"
            echo "$recent_sessions" | while read -r session_file; do
                local session_time=$(grep "Started:" "$session_file" | cut -d' ' -f2-)
                local session_id=$(basename "$session_file" .info | sed 's/session-//')
                echo "      • $session_id ($session_time)"
            done
        fi
    fi
}

# Function to display management commands
show_management_commands() {
    echo -e "${CYAN}🛠️  Management Commands:${NC}"
    
    echo "   Debug Operations:"
    echo "      • Start debug mode:    ./start-debug.sh"
    echo "      • Stop debug mode:     ./stop-debug.sh"
    echo "      • Check status:        ./status-debug.sh"
    echo ""
    
    echo "   Testing:"
    echo "      • Test debug logging:  ./test-debug-logging.sh"
    echo "      • Test backend debug:  ./test-backend-debug.sh"
    echo "      • API demo:            ./test-api-demo.sh"
    echo ""
    
    echo "   Logs:"
    echo "      • View all logs:       tail -f logs/services/*.log"
    echo "      • Backend logs:        tail -f logs/services/backend.log"
    echo "      • MCP logs:            tail -f logs/services/mcp-server.log"
    echo "      • UI logs:             tail -f logs/services/chatbot-ui.log"
    echo ""
    
    echo "   Quick Checks:"
    echo "      • Check ports:         lsof -i :3000 -i :3001 -i :3002"
    echo "      • Check processes:     ps aux | grep node"
    echo "      • Docker status:       docker ps"
}

# Main execution flow
main() {
    log_status "Performing comprehensive debug environment status check..."
    echo ""
    
    # Service status
    echo -e "${CYAN}🚀 Service Status:${NC}"
    local services_running=0
    local total_services=3  # backend, mcp-server, chatbot-ui
    
    for service_info in $SERVICES; do
        local service_name=$(echo "$service_info" | cut -d':' -f1)
        local port=$(echo "$service_info" | cut -d':' -f2)
        local health_url=""
        
        # Set health check URL based on service
        case "$service_name" in
            "backend")
                health_url="http://localhost:$port/api/v1/health"
                ;;
            "mcp-server")
                health_url="http://localhost:$port/health"
                ;;
            "chatbot-ui")
                health_url="http://localhost:$port"
                ;;
        esac
        
        if check_service_health "$service_name" "$port" "$health_url"; then
            services_running=$((services_running + 1))
        fi
    done
    
    echo ""
    
    # Overall status summary
    if [ $services_running -eq $total_services ]; then
        echo -e "${GREEN}📊 Overall Status: ALL SERVICES RUNNING ($services_running/$total_services) ✨${NC}"
    elif [ $services_running -gt 0 ]; then
        echo -e "${YELLOW}📊 Overall Status: PARTIAL ($services_running/$total_services services running) ⚠️${NC}"
    else
        echo -e "${RED}📊 Overall Status: NO SERVICES RUNNING (0/$total_services) ❌${NC}"
    fi
    
    echo ""
    
    # Additional checks
    check_docker_services
    echo ""
    
    check_environment
    echo ""
    
    check_log_files
    echo ""
    
    test_endpoints
    echo ""
    
    check_system_resources
    echo ""
    
    show_recent_activity
    echo ""
    
    show_management_commands
    
    # Final summary
    echo ""
    echo -e "${WHITE}════════════════════════════════════════════════════════════════"
    
    if [ $services_running -eq $total_services ]; then
        echo -e "              ✨ DEBUG ENVIRONMENT IS FULLY OPERATIONAL ✨"
    elif [ $services_running -gt 0 ]; then
        echo -e "              ⚠️  DEBUG ENVIRONMENT IS PARTIALLY OPERATIONAL ⚠️"
    else
        echo -e "              ❌ DEBUG ENVIRONMENT IS NOT RUNNING ❌"
        echo ""
        echo "                    To start: ./start-debug.sh"
    fi
    
    echo -e "════════════════════════════════════════════════════════════════${NC}"
}

# Execute main function
main "$@"
