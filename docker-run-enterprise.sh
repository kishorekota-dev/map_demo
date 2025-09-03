#!/bin/bash

# Enterprise Banking Docker Compose Management Script
# This script manages the complete enterprise banking ecosystem

set -e

COMPOSE_FILE="docker-compose-enterprise.yml"
PROJECT_NAME="enterprise-banking"

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

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    print_success "Docker is running"
}

# Function to check if Docker Compose is available
check_docker_compose() {
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not available. Please install Docker Compose."
        exit 1
    fi
    print_success "Docker Compose is available"
}

# Function to create required directories
create_directories() {
    print_status "Creating required directories..."
    
    # Create config directory for credentials
    mkdir -p ./config
    
    # Create logs directory
    mkdir -p ./logs
    
    # Create backup directory
    mkdir -p ./backups
    
    print_success "Directories created"
}

# Function to check if all required files exist
check_required_files() {
    print_status "Checking required files..."
    
    if [ ! -f "$COMPOSE_FILE" ]; then
        print_error "Docker Compose file $COMPOSE_FILE not found"
        exit 1
    fi
    
    # Check if Dockerfiles exist
    local dockerfiles=(
        "./packages/backend/Dockerfile"
        "./packages/web-ui/Dockerfile"
        "./packages/agent-ui/Dockerfile"
        "./packages/chatbot-ui/Dockerfile"
        "./packages/mcp-server/Dockerfile"
    )
    
    for dockerfile in "${dockerfiles[@]}"; do
        if [ ! -f "$dockerfile" ]; then
            print_warning "Dockerfile not found: $dockerfile"
        fi
    done
    
    print_success "Required files check completed"
}

# Function to start all services
start_all() {
    print_status "Starting Enterprise Banking ecosystem..."
    
    # Start core services first (database, cache)
    print_status "Starting core infrastructure services..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d postgres redis
    
    # Wait for databases to be ready
    print_status "Waiting for databases to be ready..."
    sleep 30
    
    # Start MCP server
    print_status "Starting MCP server..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d mcp-server
    
    # Start backend API
    print_status "Starting backend API..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d backend
    
    # Wait for backend to be ready
    print_status "Waiting for backend to be ready..."
    sleep 20
    
    # Start UI applications
    print_status "Starting UI applications..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d web-ui agent-ui chatbot-ui
    
    # Start data seeder
    print_status "Starting data seeder..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d data-seeder
    
    print_success "All services started successfully!"
    print_services_info
}

# Function to start specific service groups
start_core() {
    print_status "Starting core services (database, cache, backend, MCP)..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d postgres redis backend mcp-server
    print_success "Core services started"
}

start_ui() {
    print_status "Starting UI services..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d web-ui agent-ui chatbot-ui
    print_success "UI services started"
}

start_chatbot() {
    print_status "Starting ChatBot and dependencies..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d postgres redis backend mcp-server chatbot-ui
    print_success "ChatBot ecosystem started"
}

# Function to stop all services
stop_all() {
    print_status "Stopping all services..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME down
    print_success "All services stopped"
}

# Function to restart all services
restart_all() {
    print_status "Restarting all services..."
    stop_all
    sleep 5
    start_all
}

# Function to show service status
status() {
    print_status "Service status:"
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME ps
}

# Function to show logs
logs() {
    local service=$1
    if [ -z "$service" ]; then
        print_status "Showing logs for all services..."
        docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME logs -f
    else
        print_status "Showing logs for service: $service"
        docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME logs -f "$service"
    fi
}

# Function to clean up everything
cleanup() {
    print_warning "This will remove all containers, volumes, and networks. Are you sure? (y/N)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        print_status "Cleaning up..."
        docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME down -v --remove-orphans
        docker system prune -f
        print_success "Cleanup completed"
    else
        print_status "Cleanup cancelled"
    fi
}

# Function to show service information
print_services_info() {
    echo ""
    print_success "🏦 Enterprise Banking Services are running!"
    echo ""
    echo "📍 Service URLs:"
    echo "   🖥️  Backend API:      http://localhost:3000"
    echo "   🤖 MCP Server:       http://localhost:3001"
    echo "   💬 ChatBot UI:       http://localhost:3002"
    echo "   🌐 Customer Portal:  http://localhost:3003"
    echo "   👥 Agent Portal:     http://localhost:3004"
    echo "   🗄️  PgAdmin:         http://localhost:8080 (admin profile)"
    echo "   📊 Redis Commander: http://localhost:8081 (admin profile)"
    echo ""
    echo "🔐 Default Credentials:"
    echo "   Admin: superadmin@creditcard.com / admin123"
    echo "   Demo:  demo@creditcard.com / admin123"
    echo "   Agent: agent@creditcard.com / admin123"
    echo ""
    echo "📚 API Documentation: http://localhost:3000/api-docs"
    echo "🏥 Health Checks:     http://localhost:3000/health"
    echo ""
}

# Function to build all images
build() {
    print_status "Building all Docker images..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME build --no-cache
    print_success "All images built successfully"
}

# Function to show help
show_help() {
    echo "Enterprise Banking Docker Management Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  start-all      Start all services (full ecosystem)"
    echo "  start-core     Start core services (DB, API, MCP)"
    echo "  start-ui       Start UI services only"
    echo "  start-chatbot  Start ChatBot and dependencies"
    echo "  stop           Stop all services"
    echo "  restart        Restart all services"
    echo "  status         Show service status"
    echo "  logs [service] Show logs (all services or specific service)"
    echo "  build          Build all Docker images"
    echo "  cleanup        Remove all containers and volumes"
    echo "  help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start-all              # Start complete ecosystem"
    echo "  $0 start-chatbot          # Start only ChatBot components"
    echo "  $0 logs chatbot-ui         # Show ChatBot UI logs"
    echo "  $0 logs                    # Show all service logs"
    echo ""
}

# Main script logic
main() {
    local command=${1:-help}
    
    case $command in
        "start-all")
            check_docker
            check_docker_compose
            create_directories
            check_required_files
            start_all
            ;;
        "start-core")
            check_docker
            check_docker_compose
            start_core
            ;;
        "start-ui")
            check_docker
            check_docker_compose
            start_ui
            ;;
        "start-chatbot")
            check_docker
            check_docker_compose
            create_directories
            check_required_files
            start_chatbot
            ;;
        "stop")
            stop_all
            ;;
        "restart")
            check_docker
            check_docker_compose
            restart_all
            ;;
        "status")
            status
            ;;
        "logs")
            logs $2
            ;;
        "build")
            check_docker
            check_docker_compose
            build
            ;;
        "cleanup")
            cleanup
            ;;
        "help"|"--help"|"-h")
            show_help
            ;;
        *)
            print_error "Unknown command: $command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
