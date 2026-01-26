#!/bin/bash

# POC Chat Backend - Docker Start Script
# This script helps you start the chat backend with Docker

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    print_success "Docker is running"
}

# Function to check if ports are available
check_ports() {
    local ports=("3006" "5432" "6379")
    local ports_in_use=()
    
    for port in "${ports[@]}"; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
            ports_in_use+=($port)
        fi
    done
    
    if [ ${#ports_in_use[@]} -ne 0 ]; then
        print_warning "The following ports are already in use: ${ports_in_use[*]}"
        print_info "You may need to stop services using these ports or modify docker-compose.yml"
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        print_success "All required ports are available"
    fi
}

# Function to check environment file
check_env_file() {
    if [ "$1" = "production" ]; then
        if [ ! -f .env ]; then
            print_warning ".env file not found"
            print_info "Copying .env.production template..."
            cp .env.production .env
            print_warning "Please edit .env file with your production values before continuing"
            print_info "Required: JWT_SECRET, DB_PASSWORD, REDIS_PASSWORD, ALLOWED_ORIGINS"
            read -p "Press enter when ready to continue..."
        fi
    else
        if [ ! -f .env.development ]; then
            print_error ".env.development file not found"
            exit 1
        fi
    fi
    print_success "Environment configuration found"
}

# Main script
main() {
    echo ""
    print_info "🚀 POC Chat Backend - Docker Startup"
    echo ""
    
    # Default to development
    ENV=${1:-dev}
    
    if [ "$ENV" = "prod" ] || [ "$ENV" = "production" ]; then
        print_info "Starting in PRODUCTION mode"
        COMPOSE_FILE="docker-compose.yml"
        ENV_MODE="production"
    else
        print_info "Starting in DEVELOPMENT mode"
        COMPOSE_FILE="docker-compose.dev.yml"
        ENV_MODE="development"
    fi
    
    echo ""
    print_info "Running pre-flight checks..."
    
    # Run checks
    check_docker
    check_ports
    check_env_file "$ENV_MODE"
    
    echo ""
    print_info "Starting Docker containers..."
    
    # Build and start containers
    if docker-compose -f "$COMPOSE_FILE" up -d --build; then
        echo ""
        print_success "Containers started successfully!"
        
        echo ""
        print_info "Waiting for services to be healthy..."
        sleep 5
        
        # Check health
        if docker-compose -f "$COMPOSE_FILE" ps | grep -q "healthy"; then
            print_success "Services are healthy"
        else
            print_warning "Some services may still be starting up"
        fi
        
        echo ""
        print_info "📊 Service Status:"
        docker-compose -f "$COMPOSE_FILE" ps
        
        echo ""
        print_success "Chat Backend is running!"
        echo ""
        print_info "🌐 Endpoints:"
        echo "   - HTTP API:    http://localhost:3006/api"
        echo "   - WebSocket:   ws://localhost:3006/socket.io"
        echo "   - Health:      http://localhost:3006/health"
        echo "   - Metrics:     http://localhost:3006/api/metrics"
        echo ""
        print_info "💾 Database:"
        echo "   - PostgreSQL:  localhost:5432"
        echo "   - Redis:       localhost:6379"
        echo ""
        print_info "📝 View logs:"
        echo "   docker-compose -f $COMPOSE_FILE logs -f"
        echo ""
        print_info "🛑 Stop services:"
        echo "   docker-compose -f $COMPOSE_FILE down"
        echo ""
        
    else
        echo ""
        print_error "Failed to start containers"
        print_info "Check logs with: docker-compose -f $COMPOSE_FILE logs"
        exit 1
    fi
}

# Show usage if --help
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [dev|prod]"
    echo ""
    echo "Options:"
    echo "  dev, development    Start in development mode (default)"
    echo "  prod, production    Start in production mode"
    echo ""
    echo "Examples:"
    echo "  $0                  # Start in development mode"
    echo "  $0 dev              # Start in development mode"
    echo "  $0 prod             # Start in production mode"
    exit 0
fi

# Run main function
main "$@"
