#!/bin/bash

# POC Banking Chatbot - Stop Development Services Script
# This script stops all running microservices

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

print_header "Stopping POC Banking Chatbot Services"

# Create logs directory if it doesn't exist
mkdir -p logs

# Function to stop a service by PID file
stop_service() {
    local service_name=$1
    local pid_file="logs/${service_name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        
        if kill -0 "$pid" 2>/dev/null; then
            print_status "Stopping $service_name (PID: $pid)..."
            
            # Try graceful shutdown first
            kill -TERM "$pid" 2>/dev/null || true
            
            # Wait up to 10 seconds for graceful shutdown
            local count=0
            while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
                sleep 1
                count=$((count + 1))
            done
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                print_warning "Force killing $service_name..."
                kill -KILL "$pid" 2>/dev/null || true
            fi
            
            # Clean up PID file
            rm -f "$pid_file"
            print_status "$service_name stopped successfully"
        else
            print_warning "$service_name was not running (stale PID file)"
            rm -f "$pid_file"
        fi
    else
        print_warning "No PID file found for $service_name"
    fi
}

# Function to stop services by port
stop_by_port() {
    local port=$1
    local service_name=$2
    
    print_status "Checking for processes on port $port ($service_name)..."
    
    # Find process using the port
    local pid=$(lsof -ti:$port 2>/dev/null || true)
    
    if [ -n "$pid" ]; then
        print_status "Found process $pid using port $port, stopping..."
        kill -TERM "$pid" 2>/dev/null || true
        
        # Wait for process to stop
        sleep 2
        
        # Force kill if still running
        if kill -0 "$pid" 2>/dev/null; then
            print_warning "Force killing process on port $port..."
            kill -KILL "$pid" 2>/dev/null || true
        fi
        
        print_status "Process on port $port stopped"
    else
        print_status "No process found on port $port"
    fi
}

# Stop services by PID files first
services=("poc-api-gateway" "poc-banking-service" "poc-nlp-service" "poc-nlu-service" "poc-mcp-service")

for service in "${services[@]}"; do
    stop_service "$service"
done

# Also stop by ports as backup
print_status "Checking for any remaining processes on service ports..."

# Stop services by port (in reverse dependency order)
stop_by_port 3001 "API Gateway"
stop_by_port 3005 "Banking Service" 
stop_by_port 3003 "NLU Service"
stop_by_port 3002 "NLP Service"
stop_by_port 3004 "MCP Service"

# Clean up any remaining PID files
print_status "Cleaning up PID files..."
rm -f logs/*.pid

# Clean up environment files if they exist
print_status "Cleaning up temporary environment files..."
for service in "${services[@]}"; do
    if [ -f "$service/.env" ]; then
        rm -f "$service/.env"
        print_status "Removed temporary .env file from $service"
    fi
done

print_header "All Services Stopped"

echo ""
echo -e "${GREEN}✅ All POC Banking Chatbot services have been stopped${NC}"
echo ""
echo "Verify no services are running:"
echo "  • Check ports: netstat -tlnp | grep -E ':(3001|3002|3003|3004|3005)'"
echo "  • Check processes: ps aux | grep -E '(poc-|node)'"
echo ""
echo -e "${YELLOW}To start services again, run: ./scripts/start-dev.sh${NC}"