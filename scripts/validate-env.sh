#!/bin/bash

# POC Banking Chatbot - Environment Validation Script
# This script validates environment configurations for all microservices

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

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

# Check if we're in the correct directory
if [ ! -f ".env.development" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

print_header "POC Banking Chatbot - Environment Validation"

# Function to validate environment variables
validate_env() {
    local env_file=$1
    local service_name=$2
    
    print_status "Validating environment for $service_name..."
    
    if [ ! -f "$env_file" ]; then
        print_error "Environment file not found: $env_file"
        return 1
    fi
    
    # Source the environment file
    source "$env_file"
    
    # Validate required variables
    local errors=0
    
    # Check NODE_ENV
    if [ -z "$NODE_ENV" ]; then
        print_error "NODE_ENV not set in $env_file"
        errors=$((errors + 1))
    else
        print_status "NODE_ENV: $NODE_ENV"
    fi
    
    # Check JWT_SECRET
    if [ -z "$JWT_SECRET" ]; then
        print_error "JWT_SECRET not set in $env_file"
        errors=$((errors + 1))
    elif [ "$JWT_SECRET" = "your-super-secret-jwt-key-change-in-production" ]; then
        print_warning "JWT_SECRET is using default value in $env_file"
    else
        print_status "JWT_SECRET: [SET]"
    fi
    
    # Check LOG_LEVEL
    if [ -z "$LOG_LEVEL" ]; then
        print_warning "LOG_LEVEL not set in $env_file, will use default"
    else
        print_status "LOG_LEVEL: $LOG_LEVEL"
    fi
    
    return $errors
}

# Function to check service connectivity
check_service_urls() {
    print_status "Validating service URL configurations..."
    
    # Load environment
    source .env.development
    
    # Define expected services and ports
    declare -A services=(
        ["API_GATEWAY"]="$API_GATEWAY_URL"
        ["BANKING_SERVICE"]="$BANKING_SERVICE_URL"
        ["NLP_SERVICE"]="$NLP_SERVICE_URL"
        ["NLU_SERVICE"]="$NLU_SERVICE_URL"
        ["MCP_SERVICE"]="$MCP_SERVICE_URL"
    )
    
    # Validate URLs
    for service_name in "${!services[@]}"; do
        local url="${services[$service_name]}"
        
        if [ -z "$url" ]; then
            print_error "$service_name URL not configured"
        else
            print_status "$service_name: $url"
            
            # Extract port from URL
            local port=$(echo "$url" | sed -n 's/.*:\([0-9]*\).*/\1/p')
            
            if [ -n "$port" ]; then
                # Check if port is in expected range
                if [ "$port" -ge 3001 ] && [ "$port" -le 3005 ]; then
                    print_success "Port $port is in expected range"
                else
                    print_warning "Port $port is outside expected range (3001-3005)"
                fi
            fi
        fi
    done
}

# Function to check for port conflicts
check_port_conflicts() {
    print_status "Checking for port conflicts..."
    
    local ports=(3001 3002 3003 3004 3005)
    local conflicts=0
    
    for port in "${ports[@]}"; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            local process=$(lsof -Pi :$port -sTCP:LISTEN -F p | grep -o '[0-9]*' | head -1)
            local process_name=$(ps -p $process -o comm= 2>/dev/null || echo "unknown")
            print_warning "Port $port is already in use by process $process ($process_name)"
            conflicts=$((conflicts + 1))
        else
            print_success "Port $port is available"
        fi
    done
    
    if [ $conflicts -gt 0 ]; then
        print_error "Found $conflicts port conflicts"
        return 1
    else
        print_success "No port conflicts detected"
        return 0
    fi
}

# Function to validate service directories and files
validate_service_structure() {
    print_status "Validating service directory structure..."
    
    local services=("poc-api-gateway" "poc-banking-service" "poc-nlp-service" "poc-nlu-service" "poc-mcp-service")
    local errors=0
    
    for service in "${services[@]}"; do
        print_status "Checking $service..."
        
        # Check if directory exists
        if [ ! -d "$service" ]; then
            print_error "Service directory not found: $service"
            errors=$((errors + 1))
            continue
        fi
        
        # Check for package.json
        if [ ! -f "$service/package.json" ]; then
            print_error "package.json not found in $service"
            errors=$((errors + 1))
        else
            print_success "$service/package.json found"
        fi
        
        # Check for server.js
        if [ ! -f "$service/server.js" ]; then
            print_error "server.js not found in $service"
            errors=$((errors + 1))
        else
            print_success "$service/server.js found"
        fi
        
        # Check for config directory
        if [ ! -d "$service/config" ]; then
            print_warning "config directory not found in $service"
        else
            print_success "$service/config directory found"
        fi
        
        # Check for development environment file
        if [ ! -f "$service/.env.development" ]; then
            print_warning "Development environment file not found in $service"
        else
            print_success "$service/.env.development found"
        fi
    done
    
    return $errors
}

# Function to validate dependencies
validate_dependencies() {
    print_status "Checking Node.js and npm versions..."
    
    # Check Node.js version
    if command -v node >/dev/null 2>&1; then
        local node_version=$(node --version)
        print_status "Node.js version: $node_version"
        
        # Check if version is >= 18
        local major_version=$(echo "$node_version" | sed 's/v\([0-9]*\).*/\1/')
        if [ "$major_version" -ge 18 ]; then
            print_success "Node.js version is compatible"
        else
            print_error "Node.js version must be >= 18.0.0"
            return 1
        fi
    else
        print_error "Node.js is not installed"
        return 1
    fi
    
    # Check npm version
    if command -v npm >/dev/null 2>&1; then
        local npm_version=$(npm --version)
        print_status "npm version: $npm_version"
        print_success "npm is available"
    else
        print_error "npm is not installed"
        return 1
    fi
}

# Function to generate environment summary
generate_summary() {
    print_header "Environment Configuration Summary"
    
    source .env.development
    
    echo ""
    echo "Service Configuration:"
    echo "  • API Gateway:     http://localhost:3001"
    echo "  • Banking Service: http://localhost:3005"
    echo "  • NLP Service:     http://localhost:3002"
    echo "  • NLU Service:     http://localhost:3003"
    echo "  • MCP Service:     http://localhost:3004"
    echo ""
    echo "Environment Settings:"
    echo "  • Node Environment: ${NODE_ENV:-development}"
    echo "  • Log Level:        ${LOG_LEVEL:-info}"
    echo "  • JWT Expiry:       ${JWT_EXPIRY:-24h}"
    echo ""
    echo "Development Features:"
    echo "  • Debug Logging:    ${DEBUG_REQUESTS:-false}"
    echo "  • Mock Services:    ${MOCK_EXTERNAL_SERVICES:-false}"
    echo "  • Metrics:          ${METRICS_ENABLED:-false}"
    echo ""
    echo "External Dependencies:"
    echo "  • Redis:            ${REDIS_URL:-redis://localhost:6379}"
    echo "  • Consul:           ${CONSUL_HOST:-localhost}:${CONSUL_PORT:-8500}"
    echo "  • Database:         ${DATABASE_URL:-not configured}"
    echo ""
}

# Main validation process
main() {
    local total_errors=0
    
    # Validate Node.js dependencies
    if ! validate_dependencies; then
        total_errors=$((total_errors + 1))
    fi
    
    # Validate service structure
    if ! validate_service_structure; then
        total_errors=$((total_errors + 1))
    fi
    
    # Check service URL configurations
    check_service_urls
    
    # Check for port conflicts
    if ! check_port_conflicts; then
        total_errors=$((total_errors + 1))
    fi
    
    # Validate individual service environments
    services=("poc-api-gateway" "poc-banking-service" "poc-nlp-service" "poc-nlu-service" "poc-mcp-service")
    
    for service in "${services[@]}"; do
        if [ -f "$service/.env.development" ]; then
            if ! validate_env "$service/.env.development" "$service"; then
                total_errors=$((total_errors + 1))
            fi
        fi
    done
    
    # Generate summary
    generate_summary
    
    # Final result
    if [ $total_errors -eq 0 ]; then
        print_header "Validation Successful"
        print_success "All environment configurations are valid!"
        print_status "You can now run: ./scripts/start-dev.sh"
        return 0
    else
        print_header "Validation Failed"
        print_error "Found $total_errors error(s) in environment configuration"
        print_status "Please fix the errors before starting services"
        return 1
    fi
}

# Run main validation
main