#!/bin/bash

# Debug Mode Service Stop Script
# Stops all services and cleans up debug resources
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

log_shutdown() {
    echo -e "${CYAN}[SHUTDOWN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Display shutdown banner
echo -e "${WHITE}"
echo "████████████████████████████████████████████████████████████████"
echo "██                                                            ██"
echo "██    🛑 DEBUG MODE SERVICE SHUTDOWN 🛑                      ██"
echo "██                                                            ██"
echo "██    Enterprise Banking HTTP MCP System                     ██"
echo "██    Graceful Debug Environment Cleanup                     ██"
echo "██                                                            ██"
echo "████████████████████████████████████████████████████████████████"
echo -e "${NC}"
echo ""

log_shutdown "Initializing debug environment cleanup..."

# Service configuration (compatible with bash 3.2+)
SERVICES="backend:3000 mcp-server:3001 chatbot-ui:3002"

# Function to stop service by PID
stop_service_by_pid() {
    local service_name=$1
    local pid_file="logs/services/${service_name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        log_shutdown "Stopping $service_name (PID: $pid)..."
        
        if kill -0 "$pid" 2>/dev/null; then
            # Try graceful shutdown first
            log_debug "Sending SIGTERM to $service_name (PID: $pid)"
            kill -TERM "$pid" 2>/dev/null || true
            
            # Wait for graceful shutdown
            local attempt=1
            while [ $attempt -le 10 ] && kill -0 "$pid" 2>/dev/null; do
                log_debug "Waiting for $service_name to stop gracefully... (attempt $attempt/10)"
                sleep 1
                attempt=$((attempt + 1))
            done
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                log_warn "$service_name didn't stop gracefully, forcing shutdown..."
                kill -KILL "$pid" 2>/dev/null || true
                sleep 2
            fi
            
            if ! kill -0 "$pid" 2>/dev/null; then
                log_success "$service_name stopped successfully"
            else
                log_error "Failed to stop $service_name (PID: $pid)"
            fi
        else
            log_debug "$service_name (PID: $pid) was not running"
        fi
        
        # Remove PID file
        rm -f "$pid_file"
        log_debug "Removed PID file: $pid_file"
    else
        log_debug "No PID file found for $service_name"
    fi
}

# Function to stop service by port
stop_service_by_port() {
    local service_name=$1
    local port=$2
    
    log_shutdown "Checking for $service_name on port $port..."
    
    local pids=$(lsof -ti:$port 2>/dev/null || true)
    
    if [ -n "$pids" ]; then
        log_debug "Found processes on port $port: $pids"
        
        for pid in $pids; do
            local process_info=$(ps -p "$pid" -o pid,ppid,comm,args --no-headers 2>/dev/null || echo "Unknown process")
            log_debug "Stopping process: $process_info"
            
            # Try graceful shutdown
            kill -TERM "$pid" 2>/dev/null || true
            sleep 2
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                log_warn "Force killing process $pid on port $port"
                kill -KILL "$pid" 2>/dev/null || true
                sleep 1
            fi
        done
        
        # Verify port is free
        if ! lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            log_success "Port $port is now free"
        else
            log_error "Port $port is still in use"
        fi
    else
        log_debug "No processes found on port $port"
    fi
}

# Function to clean up log files
cleanup_logs() {
    local keep_recent=${1:-false}
    
    log_shutdown "Cleaning up debug log files..."
    
    if [ "$keep_recent" = true ]; then
        log_debug "Keeping recent logs, cleaning old ones..."
        
        # Keep last 5 debug sessions
        find logs/debug -name "session-*.log" -type f | sort -r | tail -n +6 | xargs rm -f 2>/dev/null || true
        find logs/debug -name "session-*.info" -type f | sort -r | tail -n +6 | xargs rm -f 2>/dev/null || true
        
        # Keep last 24 hours of service logs
        find logs/services -name "*.log" -type f -mtime +1 -exec rm -f {} \; 2>/dev/null || true
        
        log_debug "Old logs cleaned, recent logs preserved"
    else
        # Clean all log files if requested
        log_debug "Would you like to clean all logs? (This will remove debug history)"
        echo -n "Clean all logs? [y/N]: "
        read -r response
        
        if [[ "$response" =~ ^[Yy]$ ]]; then
            rm -rf logs/debug/* logs/services/* logs/performance/* logs/security/* 2>/dev/null || true
            log_success "All debug logs cleaned"
        else
            log_debug "Logs preserved"
        fi
    fi
}

# Function to save debug session summary
save_session_summary() {
    log_shutdown "Saving debug session summary..."
    
    local session_end=$(date)
    local session_summary="logs/debug/shutdown-$(date +%Y%m%d-%H%M%S).summary"
    
    cat > "$session_summary" << EOF
Debug Session Shutdown Summary
=============================

Shutdown Time: $session_end
Services Stopped:
EOF
    
    for service_info in $SERVICES; do
        local service_name=$(echo "$service_info" | cut -d':' -f1)
        local port=$(echo "$service_info" | cut -d':' -f2)
        echo "  - $service_name (port $port)" >> "$session_summary"
    done
    
    cat >> "$session_summary" << EOF

Process Information at Shutdown:
$(ps aux | grep -E "(node|npm)" | grep -v grep || echo "No Node.js processes found")

Port Status After Cleanup:
$(lsof -i :3000 -i :3001 -i :3002 2>/dev/null || echo "All target ports are free")

Log Files Available:
$(find logs -name "*.log" -type f 2>/dev/null | sort || echo "No log files found")

Docker Status:
$(docker ps --format "table {{.Names}}\t{{.Status}}" 2>/dev/null || echo "Docker not available")
EOF
    
    log_success "Session summary saved to: $session_summary"
}

# Function to display final status
display_final_status() {
    echo ""
    echo -e "${WHITE}════════════════════════════════════════════════════════════════"
    echo -e "                    🛑 SHUTDOWN COMPLETE 🛑"
    echo -e "════════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    echo -e "${CYAN}📊 Final Status:${NC}"
    
    local all_stopped=true
    for service_info in $SERVICES; do
        local service_name=$(echo "$service_info" | cut -d':' -f1)
        local port=$(echo "$service_info" | cut -d':' -f2)
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            echo "   ❌ $service_name (port $port): Still running"
            all_stopped=false
        else
            echo "   ✅ $service_name (port $port): Stopped"
        fi
    done
    
    echo ""
    
    if [ "$all_stopped" = true ]; then
        echo -e "${GREEN}🎉 All services stopped successfully!${NC}"
    else
        echo -e "${YELLOW}⚠️  Some services may still be running. Check manually if needed.${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}🔧 Next Steps:${NC}"
    echo "   • To restart in debug mode:  ./start-debug.sh"
    echo "   • To start normally:         ./start-local-http-mcp.sh"
    echo "   • To check status:           ./status-local.sh"
    echo "   • To view logs:              ls -la logs/"
    echo ""
    
    echo -e "${CYAN}📁 Available Logs:${NC}"
    if [ -d "logs" ]; then
        find logs -name "*.log" -o -name "*.summary" -o -name "*.info" | head -10 | while read -r logfile; do
            echo "   • $logfile"
        done
        
        local log_count=$(find logs -name "*.log" -o -name "*.summary" -o -name "*.info" | wc -l)
        if [ "$log_count" -gt 10 ]; then
            echo "   • ... and $((log_count - 10)) more files"
        fi
    else
        echo "   • No log directory found"
    fi
    
    echo ""
    echo -e "${WHITE}════════════════════════════════════════════════════════════════"
    echo -e "              ✨ READY FOR NEXT DEBUG SESSION ✨"
    echo -e "════════════════════════════════════════════════════════════════${NC}"
}

# Main execution flow
main() {
    # Check if logs directory exists
    if [ ! -d "logs" ]; then
        log_debug "No logs directory found, creating..."
        mkdir -p logs/debug logs/services logs/performance logs/security
    fi
    
    # Stop services by PID first (cleaner)
    log_shutdown "Stopping services using saved PIDs..."
    
    for service_info in $SERVICES; do
        local service_name=$(echo "$service_info" | cut -d':' -f1)
        stop_service_by_pid "$service_name"
    done
    
    # Stop any remaining services by port
    log_shutdown "Checking for remaining services on target ports..."
    
    for service_info in $SERVICES; do
        local service_name=$(echo "$service_info" | cut -d':' -f1)
        local port=$(echo "$service_info" | cut -d':' -f2)
        stop_service_by_port "$service_name" "$port"
    done
    
    # Check for any other Node.js processes that might be our services
    log_shutdown "Checking for other related processes..."
    
    local node_processes=$(ps aux | grep -E "(node.*backend|node.*mcp|node.*chatbot|npm.*dev)" | grep -v grep | awk '{print $2}' || true)
    
    if [ -n "$node_processes" ]; then
        log_warn "Found additional Node.js processes that might be related:"
        ps aux | grep -E "(node.*backend|node.*mcp|node.*chatbot|npm.*dev)" | grep -v grep
        
        echo ""
        echo -n "Stop these processes too? [y/N]: "
        read -r response
        
        if [[ "$response" =~ ^[Yy]$ ]]; then
            for pid in $node_processes; do
                log_shutdown "Stopping additional process: $pid"
                kill -TERM "$pid" 2>/dev/null || true
                sleep 1
                kill -KILL "$pid" 2>/dev/null || true
            done
            log_success "Additional processes stopped"
        fi
    fi
    
    # Clean up environment variables (for current session)
    log_shutdown "Cleaning up debug environment variables..."
    unset DEBUG NODE_ENV MCP_DEBUG NEXT_PUBLIC_DEBUG LOG_LEVEL
    unset LOG_REQUESTS LOG_RESPONSES LOG_DATABASE LOG_PERFORMANCE SANITIZE_LOGS
    log_debug "Debug environment variables cleared"
    
    # Save session summary
    save_session_summary
    
    # Handle log cleanup
    log_shutdown "Log cleanup options..."
    echo ""
    echo "Log Cleanup Options:"
    echo "  1) Keep recent logs (recommended)"
    echo "  2) Clean all logs"
    echo "  3) Keep all logs"
    echo ""
    echo -n "Choose option [1-3, default: 1]: "
    read -r cleanup_choice
    
    case "$cleanup_choice" in
        2)
            cleanup_logs false
            ;;
        3)
            log_debug "All logs preserved"
            ;;
        *)
            cleanup_logs true
            ;;
    esac
    
    # Final status check and display
    sleep 2
    display_final_status
}

# Execute main function with error handling
set +e
main "$@"
exit_code=$?

if [ $exit_code -eq 0 ]; then
    log_success "Debug environment shutdown completed successfully"
else
    log_error "Debug environment shutdown completed with errors (exit code: $exit_code)"
fi

exit $exit_code
