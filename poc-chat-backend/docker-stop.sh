#!/bin/bash

# POC Chat Backend - Docker Stop Script
# This script helps you stop the chat backend Docker services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

main() {
    echo ""
    print_info "🛑 Stopping POC Chat Backend"
    echo ""
    
    # Determine which compose file to use
    ENV=${1:-dev}
    REMOVE_VOLUMES=${2:-false}
    
    if [ "$ENV" = "prod" ] || [ "$ENV" = "production" ]; then
        COMPOSE_FILE="docker-compose.yml"
    else
        COMPOSE_FILE="docker-compose.dev.yml"
    fi
    
    # Check if containers are running
    if ! docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
        print_warning "No running containers found"
        exit 0
    fi
    
    print_info "Stopping containers..."
    
    if [ "$REMOVE_VOLUMES" = "--volumes" ] || [ "$REMOVE_VOLUMES" = "-v" ]; then
        print_warning "This will also remove all data volumes (database data will be lost!)"
        read -p "Are you sure? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_info "Cancelled"
            exit 0
        fi
        docker-compose -f "$COMPOSE_FILE" down -v
        print_success "Containers stopped and volumes removed"
    else
        docker-compose -f "$COMPOSE_FILE" down
        print_success "Containers stopped"
        print_info "Data volumes preserved. Use '$0 $ENV --volumes' to remove data."
    fi
    
    echo ""
}

# Show usage
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [dev|prod] [--volumes]"
    echo ""
    echo "Options:"
    echo "  dev, development    Stop development containers (default)"
    echo "  prod, production    Stop production containers"
    echo "  --volumes, -v       Also remove data volumes (WARNING: deletes all data)"
    echo ""
    echo "Examples:"
    echo "  $0                     # Stop dev containers, keep data"
    echo "  $0 dev                 # Stop dev containers, keep data"
    echo "  $0 prod                # Stop prod containers, keep data"
    echo "  $0 dev --volumes       # Stop dev containers and remove all data"
    exit 0
fi

main "$@"
