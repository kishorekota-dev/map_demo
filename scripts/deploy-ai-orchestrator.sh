#!/bin/bash

###############################################################################
# POC AI Orchestrator - Deployment Script
# 
# This script deploys the AI Orchestrator service
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_DIR="$ROOT_DIR/poc-ai-orchestrator"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Print banner
print_banner() {
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "       POC AI Orchestrator - Deployment Script            "
    echo "═══════════════════════════════════════════════════════════"
    echo ""
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js v18 or higher."
        exit 1
    fi
    
    local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        log_error "Node.js version must be 18 or higher. Current: $(node -v)"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed."
        exit 1
    fi
    
    # Check PostgreSQL
    if ! command -v psql &> /dev/null; then
        log_warning "PostgreSQL client is not installed. Database initialization may fail."
    fi
    
    # Check if service directory exists
    if [ ! -d "$SERVICE_DIR" ]; then
        log_error "Service directory not found: $SERVICE_DIR"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    cd "$SERVICE_DIR"
    
    if [ -f "package-lock.json" ]; then
        npm ci
    else
        npm install
    fi
    
    log_success "Dependencies installed"
}

# Setup environment
setup_environment() {
    log_info "Setting up environment..."
    
    cd "$SERVICE_DIR"
    
    if [ ! -f ".env.development" ]; then
        if [ -f ".env.example" ]; then
            log_info "Creating .env.development from .env.example..."
            cp .env.example .env.development
            log_warning "Please update .env.development with your configuration"
        else
            log_error ".env.example not found"
            exit 1
        fi
    else
        log_info ".env.development already exists"
    fi
    
    log_success "Environment setup complete"
}

# Initialize database
initialize_database() {
    log_info "Initializing database..."
    
    # Load environment variables
    if [ -f "$SERVICE_DIR/.env.development" ]; then
        export $(grep -v '^#' "$SERVICE_DIR/.env.development" | xargs)
    fi
    
    DB_HOST=${DB_HOST:-localhost}
    DB_PORT=${DB_PORT:-5432}
    DB_NAME=${DB_NAME:-ai_orchestrator_dev}
    DB_USERNAME=${DB_USERNAME:-postgres}
    
    # Check if database exists
    if command -v psql &> /dev/null; then
        log_info "Checking database connection..."
        
        if PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
            log_info "Database $DB_NAME already exists"
        else
            log_info "Creating database..."
            if [ -f "$ROOT_DIR/scripts/init-ai-orchestrator-db.sql" ]; then
                PGPASSWORD=$DB_PASSWORD psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -f "$ROOT_DIR/scripts/init-ai-orchestrator-db.sql"
                log_success "Database initialized"
            else
                log_error "Database initialization script not found"
                exit 1
            fi
        fi
    else
        log_warning "PostgreSQL client not found. Skipping database initialization."
        log_warning "Please run the database initialization manually."
    fi
}

# Create logs directory
create_logs_directory() {
    log_info "Creating logs directory..."
    
    cd "$SERVICE_DIR"
    mkdir -p logs
    chmod 755 logs
    
    log_success "Logs directory created"
}

# Build service (if needed)
build_service() {
    log_info "Building service..."
    
    cd "$SERVICE_DIR"
    
    # No build step needed for this Node.js service
    log_info "No build step required"
}

# Start service
start_service() {
    log_info "Starting AI Orchestrator service..."
    
    cd "$SERVICE_DIR"
    
    # Check if PM2 is installed
    if command -v pm2 &> /dev/null; then
        log_info "Starting with PM2..."
        pm2 start src/server.js --name "ai-orchestrator" --env development
        pm2 save
        log_success "Service started with PM2"
    else
        log_info "PM2 not found. Starting with node..."
        NODE_ENV=development node src/server.js &
        echo $! > ai-orchestrator.pid
        log_success "Service started (PID: $(cat ai-orchestrator.pid))"
    fi
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    local max_attempts=30
    local attempt=1
    local port=${PORT:-3007}
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "http://localhost:$port/health" > /dev/null 2>&1; then
            log_success "Service is healthy!"
            curl -s "http://localhost:$port/health" | jq . || cat
            return 0
        fi
        
        log_info "Waiting for service to be ready... ($attempt/$max_attempts)"
        sleep 2
        attempt=$((attempt + 1))
    done
    
    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# Print service info
print_service_info() {
    local port=${PORT:-3007}
    
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "          AI Orchestrator Deployment Complete             "
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "Service URL:     http://localhost:$port"
    echo "Health Check:    http://localhost:$port/health"
    echo "API Endpoint:    http://localhost:$port/api/orchestrator"
    echo ""
    echo "Features:"
    echo "  • LangGraph workflow execution"
    echo "  • Intent-based processing"
    echo "  • Human-in-the-loop"
    echo "  • MCP tool integration"
    echo "  • Session management"
    echo ""
    echo "Management Commands:"
    echo "  View logs:     pm2 logs ai-orchestrator"
    echo "  Restart:       pm2 restart ai-orchestrator"
    echo "  Stop:          pm2 stop ai-orchestrator"
    echo "  Status:        pm2 status"
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo ""
}

# Cleanup on error
cleanup_on_error() {
    log_error "Deployment failed. Cleaning up..."
    
    if command -v pm2 &> /dev/null; then
        pm2 delete ai-orchestrator 2>/dev/null || true
    fi
    
    if [ -f "$SERVICE_DIR/ai-orchestrator.pid" ]; then
        kill $(cat "$SERVICE_DIR/ai-orchestrator.pid") 2>/dev/null || true
        rm "$SERVICE_DIR/ai-orchestrator.pid"
    fi
}

# Main deployment function
main() {
    print_banner
    
    # Set trap for cleanup on error
    trap cleanup_on_error ERR
    
    check_prerequisites
    install_dependencies
    setup_environment
    create_logs_directory
    initialize_database
    build_service
    start_service
    
    # Wait a bit before health check
    sleep 5
    
    if health_check; then
        print_service_info
    else
        log_error "Deployment completed but health check failed"
        log_info "Check logs for errors: pm2 logs ai-orchestrator"
        exit 1
    fi
}

# Run main function
main "$@"
