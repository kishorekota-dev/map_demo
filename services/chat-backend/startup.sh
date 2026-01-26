#!/bin/bash

# POC Chat Backend Startup Script
# Development environment configuration and service startup

set -e

echo "🚀 Starting POC Chat Backend..."
echo "=================================="

# Get the directory of this script
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js to continue."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
print_status "Node.js version: $NODE_VERSION"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm to continue."
    exit 1
fi

# Check if package.json exists
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the poc-chat-backend directory."
    exit 1
fi

# Create logs directory if it doesn't exist
if [ ! -d "logs" ]; then
    print_status "Creating logs directory..."
    mkdir -p logs
fi

# Check if .env.development exists, if not copy from template
if [ ! -f ".env" ]; then
    if [ -f ".env.development" ]; then
        print_status "Copying .env.development to .env..."
        cp .env.development .env
    else
        print_warning ".env file not found. Creating default environment..."
        cat > .env << EOF
# POC Chat Backend Environment Configuration
PORT=3006
NODE_ENV=development
LOG_LEVEL=debug

# JWT Configuration
JWT_SECRET=dev-jwt-secret-change-me-in-production-2024
JWT_EXPIRY=24h

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:8080,http://localhost:8081

# Microservice URLs
API_GATEWAY_URL=http://localhost:3001
BANKING_SERVICE_URL=http://localhost:3005
NLP_SERVICE_URL=http://localhost:3002
NLU_SERVICE_URL=http://localhost:3003
MCP_SERVICE_URL=http://localhost:3004

# Chat Configuration
MAX_MESSAGE_LENGTH=2000
MAX_CONVERSATION_HISTORY=100
MESSAGE_RATE_LIMIT=60
CONVERSATION_TIMEOUT=1800000

# Agent Configuration
MAX_CONCURRENT_AGENTS=10
AGENT_RESPONSE_TIMEOUT=30000
AGENT_RETRY_ATTEMPTS=3
DEFAULT_AGENT=banking-assistant

# Session Configuration
SESSION_TTL=3600000
MAX_SESSIONS_PER_USER=5
EOF
    fi
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_status "Installing dependencies..."
    npm install
    if [ $? -eq 0 ]; then
        print_success "Dependencies installed successfully"
    else
        print_error "Failed to install dependencies"
        exit 1
    fi
else
    print_status "Dependencies already installed, checking for updates..."
    npm outdated --depth=0 || true
fi

# Function to check if a service is running
check_service() {
    local url=$1
    local service_name=$2
    
    if curl -s --connect-timeout 3 "$url/health" > /dev/null 2>&1; then
        print_success "$service_name is running at $url"
        return 0
    else
        print_warning "$service_name is not responding at $url"
        return 1
    fi
}

# Check dependent services
print_status "Checking dependent microservices..."

check_service "http://localhost:3001" "API Gateway" || print_warning "API Gateway not available - some features may not work"
check_service "http://localhost:3005" "Banking Service" || print_warning "Banking Service not available - banking features may not work"
check_service "http://localhost:3002" "NLP Service" || print_warning "NLP Service not available - text analysis may not work"
check_service "http://localhost:3003" "NLU Service" || print_warning "NLU Service not available - intent detection may not work"
check_service "http://localhost:3004" "MCP Service" || print_warning "MCP Service not available - tool calling may not work"

# Function to start the service with different options
start_service() {
    local mode=$1
    
    case $mode in
        "dev")
            print_status "Starting Chat Backend in development mode with auto-restart..."
            if command -v nodemon &> /dev/null; then
                nodemon server.js
            else
                print_warning "nodemon not found globally, installing locally..."
                npm install --save-dev nodemon
                npx nodemon server.js
            fi
            ;;
        "debug")
            print_status "Starting Chat Backend in debug mode..."
            node --inspect=9229 server.js
            ;;
        "production")
            print_status "Starting Chat Backend in production mode..."
            NODE_ENV=production node server.js
            ;;
        *)
            print_status "Starting Chat Backend..."
            node server.js
            ;;
    esac
}

# Check command line arguments
if [ "$1" = "dev" ] || [ "$1" = "development" ]; then
    start_service "dev"
elif [ "$1" = "debug" ]; then
    start_service "debug"
elif [ "$1" = "prod" ] || [ "$1" = "production" ]; then
    start_service "production"
elif [ "$1" = "test" ]; then
    print_status "Running tests..."
    npm test
elif [ "$1" = "install" ]; then
    print_status "Installing dependencies only..."
    npm install
    print_success "Dependencies installed. Run './startup.sh' to start the service."
elif [ "$1" = "health" ]; then
    print_status "Checking service health..."
    if check_service "http://localhost:3006" "POC Chat Backend"; then
        print_success "Chat Backend is healthy"
        exit 0
    else
        print_error "Chat Backend is not running or unhealthy"
        exit 1
    fi
elif [ "$1" = "logs" ]; then
    print_status "Showing recent logs..."
    if [ -f "logs/chat-backend.log" ]; then
        tail -f logs/chat-backend.log
    else
        print_warning "Log file not found. Service may not be running."
    fi
elif [ "$1" = "stop" ]; then
    print_status "Stopping Chat Backend service..."
    pkill -f "node.*server.js" || print_warning "No running Chat Backend processes found"
    print_success "Stop command completed"
elif [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "POC Chat Backend Startup Script"
    echo "Usage: $0 [mode]"
    echo ""
    echo "Modes:"
    echo "  (no args)   - Start normally"
    echo "  dev         - Start with auto-restart (nodemon)"
    echo "  debug       - Start with Node.js debugger"
    echo "  prod        - Start in production mode"
    echo "  test        - Run tests"
    echo "  install     - Install dependencies only"
    echo "  health      - Check service health"
    echo "  logs        - Show recent logs"
    echo "  stop        - Stop running service"
    echo "  --help, -h  - Show this help"
    echo ""
    echo "Environment: Development configuration will be loaded from .env.development"
    echo "Port: Service will run on port 3006 (configurable via PORT env var)"
    echo "Dependencies: Other microservices should be running for full functionality"
else
    start_service "normal"
fi