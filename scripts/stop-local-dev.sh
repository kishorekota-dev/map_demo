#!/bin/bash

###############################################################################
# POC Banking System - Stop Local Development Services
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}Stopping POC Banking System${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Function to print colored messages
print_info() {
    echo -e "${BLUE}ℹ ${1}${NC}"
}

print_success() {
    echo -e "${GREEN}✓ ${1}${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ ${1}${NC}"
}

print_error() {
    echo -e "${RED}✗ ${1}${NC}"
}

# Navigate to project root
cd "$PROJECT_ROOT"

# Check if docker-compose.local.yml exists
if [ ! -f "docker-compose.local.yml" ]; then
    print_error "docker-compose.local.yml not found in project root"
    exit 1
fi

# Parse command line arguments
REMOVE_VOLUMES=false
if [ "$1" = "--volumes" ] || [ "$1" = "-v" ]; then
    REMOVE_VOLUMES=true
    print_warning "Will also remove volumes (data will be deleted)"
fi

# Stop and remove containers
print_info "Stopping services..."
if [ "$REMOVE_VOLUMES" = true ]; then
    docker compose -f docker-compose.local.yml down -v
    print_success "Services stopped and volumes removed"
else
    docker compose -f docker-compose.local.yml down
    print_success "Services stopped"
fi

echo ""
print_success "POC Banking System stopped successfully!"
echo ""

if [ "$REMOVE_VOLUMES" = false ]; then
    print_info "To also remove data volumes, run:"
    echo "  $0 --volumes"
    echo ""
fi
