#!/bin/bash

# Docker Environment Setup and Test Script
echo "🐳 Setting up Credit Card Enterprise Docker Environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if Docker is installed and running
check_docker() {
    print_status "Checking Docker installation..."
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    print_success "Docker is installed and running"
}

# Check if Docker Compose is available
check_docker_compose() {
    print_status "Checking Docker Compose..."
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not available. Please install Docker Compose."
        exit 1
    fi
    
    print_success "Docker Compose is available"
}

# Clean up existing containers and volumes
cleanup() {
    print_status "Cleaning up existing containers and volumes..."
    
    # Stop and remove containers
    docker-compose down -v --remove-orphans 2>/dev/null || true
    
    # Remove dangling images
    docker image prune -f 2>/dev/null || true
    
    print_success "Cleanup completed"
}

# Build and start services
start_services() {
    print_status "Building and starting services..."
    
    # Build images
    print_status "Building Docker images..."
    docker-compose build --no-cache
    
    if [ $? -ne 0 ]; then
        print_error "Failed to build Docker images"
        return 1
    fi
    
    # Start infrastructure services first (postgres, redis)
    print_status "Starting infrastructure services..."
    docker-compose up -d postgres redis
    
    # Wait for database to be ready
    print_status "Waiting for database to be ready..."
    sleep 30
    
    # Run data seeder
    print_status "Seeding database with sample data..."
    docker-compose up data-seeder
    
    if [ $? -ne 0 ]; then
        print_error "Failed to seed database"
        return 1
    fi
    
    # Start application services
    print_status "Starting application services..."
    docker-compose up -d backend web-ui agent-ui chatbot-ui
    
    print_success "All services started successfully"
}

# Test services
test_services() {
    print_status "Testing services..."
    
    # Wait for services to be ready
    print_status "Waiting for services to be ready..."
    sleep 60
    
    # Test database
    print_status "Testing database connection..."
    if docker-compose exec -T postgres pg_isready -U credit_card_user -d credit_card_enterprise > /dev/null 2>&1; then
        print_success "Database is ready"
    else
        print_error "Database is not ready"
        return 1
    fi
    
    # Test backend health
    print_status "Testing backend API..."
    local backend_health=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null)
    if [ "$backend_health" = "200" ]; then
        print_success "Backend API is healthy"
    else
        print_error "Backend API is not responding (HTTP $backend_health)"
        return 1
    fi
    
    # Test API endpoints
    print_status "Testing API endpoints..."
    local users_response=$(curl -s http://localhost:3001/api/v1/users 2>/dev/null)
    if echo "$users_response" | grep -q "users"; then
        print_success "Users API endpoint is working"
    else
        print_error "Users API endpoint failed"
        return 1
    fi
    
    local accounts_response=$(curl -s http://localhost:3001/api/v1/accounts 2>/dev/null)
    if echo "$accounts_response" | grep -q "accounts"; then
        print_success "Accounts API endpoint is working"
    else
        print_error "Accounts API endpoint failed"
        return 1
    fi
    
    # Test UI accessibility
    print_status "Testing UI services..."
    
    # Test Web UI
    local web_ui_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
    if [ "$web_ui_status" = "200" ]; then
        print_success "Web UI is accessible"
    else
        print_warning "Web UI might still be starting (HTTP $web_ui_status)"
    fi
    
    # Test Agent UI  
    local agent_ui_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3002 2>/dev/null)
    if [ "$agent_ui_status" = "200" ]; then
        print_success "Agent UI is accessible"
    else
        print_warning "Agent UI might still be starting (HTTP $agent_ui_status)"
    fi
    
    # Test ChatBot UI
    local chatbot_ui_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3003 2>/dev/null)
    if [ "$chatbot_ui_status" = "200" ]; then
        print_success "ChatBot UI is accessible"
    else
        print_warning "ChatBot UI might still be starting (HTTP $chatbot_ui_status)"
    fi
    
    print_success "Service testing completed"
}

# Show service status
show_status() {
    print_status "Service Status:"
    docker-compose ps
    
    echo ""
    print_status "Service URLs:"
    echo "  🔧 Backend API:    http://localhost:3001"
    echo "  💻 Web UI:         http://localhost:3000"
    echo "  👥 Agent UI:       http://localhost:3002"
    echo "  🤖 ChatBot UI:     http://localhost:3003"
    echo "  🗄️  PostgreSQL:    localhost:5432"
    echo "  📦 Redis:          localhost:6379"
}

# Show logs
show_logs() {
    if [ "$1" ]; then
        print_status "Showing logs for $1..."
        docker-compose logs -f "$1"
    else
        print_status "Showing logs for all services..."
        docker-compose logs -f
    fi
}

# Main function
main() {
    case "${1:-start}" in
        "start")
            check_docker
            check_docker_compose
            cleanup
            start_services
            test_services
            show_status
            echo ""
            print_success "🎉 Credit Card Enterprise environment is ready!"
            echo ""
            print_status "Sample Login Credentials:"
            echo "  • Super Admin: super_admin.john.smith@company.com / password123"
            echo "  • Customer: any customer email / password123"
            ;;
        "stop")
            print_status "Stopping all services..."
            docker-compose down
            print_success "All services stopped"
            ;;
        "restart")
            print_status "Restarting services..."
            docker-compose restart
            show_status
            ;;
        "logs")
            show_logs "$2"
            ;;
        "status")
            show_status
            ;;
        "clean")
            print_status "Cleaning up everything..."
            docker-compose down -v --remove-orphans
            docker system prune -f
            print_success "Cleanup completed"
            ;;
        "test")
            test_services
            ;;
        *)
            echo "Usage: $0 {start|stop|restart|logs [service]|status|clean|test}"
            echo ""
            echo "Commands:"
            echo "  start   - Start all services (default)"
            echo "  stop    - Stop all services"
            echo "  restart - Restart all services"
            echo "  logs    - Show logs (optionally for specific service)"
            echo "  status  - Show service status"
            echo "  clean   - Clean up everything"
            echo "  test    - Test all services"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
