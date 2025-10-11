#!/bin/bash

# Docker Compose Startup Script for MCP Service
# Starts MCP Service with Banking Service and PostgreSQL

set -e

echo "╔════════════════════════════════════════╗"
echo "║   Starting MCP Service (Docker)        ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗ Docker is not running${NC}"
    echo "Please start Docker and try again"
    exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}⚠ docker-compose not found, using docker compose${NC}"
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env from .env.docker.example...${NC}"
    cp .env.docker.example .env
    echo -e "${GREEN}✓ .env file created${NC}"
    echo -e "${YELLOW}⚠ Please review and update .env with your configuration${NC}"
fi

# Parse command line arguments
COMMAND=${1:-up}
DETACHED=""

if [ "$COMMAND" = "up" ]; then
    if [ "$2" = "-d" ] || [ "$2" = "--detach" ]; then
        DETACHED="-d"
    fi
fi

echo ""
echo -e "${BLUE}Configuration:${NC}"
echo "  Docker Compose file: docker-compose-mcp.yml"
echo "  Command: $COMMAND"
echo ""

case $COMMAND in
    up)
        echo -e "${BLUE}Starting services...${NC}"
        $DOCKER_COMPOSE -f docker-compose-mcp.yml up --build $DETACHED
        
        if [ -n "$DETACHED" ]; then
            echo ""
            echo -e "${GREEN}✓ Services started in detached mode${NC}"
            echo ""
            echo "Service URLs:"
            echo "  MCP Service:     http://localhost:3004"
            echo "  Banking Service: http://localhost:3005"
            echo "  PostgreSQL:      localhost:5432"
            echo ""
            echo "Useful commands:"
            echo "  View logs:       docker-compose -f docker-compose-mcp.yml logs -f"
            echo "  Stop services:   docker-compose -f docker-compose-mcp.yml down"
            echo "  View status:     docker-compose -f docker-compose-mcp.yml ps"
            echo ""
        fi
        ;;
        
    down)
        echo -e "${BLUE}Stopping services...${NC}"
        $DOCKER_COMPOSE -f docker-compose-mcp.yml down
        echo -e "${GREEN}✓ Services stopped${NC}"
        ;;
        
    restart)
        echo -e "${BLUE}Restarting services...${NC}"
        $DOCKER_COMPOSE -f docker-compose-mcp.yml restart
        echo -e "${GREEN}✓ Services restarted${NC}"
        ;;
        
    logs)
        SERVICE=${2:-}
        if [ -n "$SERVICE" ]; then
            $DOCKER_COMPOSE -f docker-compose-mcp.yml logs -f "$SERVICE"
        else
            $DOCKER_COMPOSE -f docker-compose-mcp.yml logs -f
        fi
        ;;
        
    ps|status)
        $DOCKER_COMPOSE -f docker-compose-mcp.yml ps
        ;;
        
    clean)
        echo -e "${YELLOW}⚠ This will remove all containers, volumes, and data${NC}"
        read -p "Are you sure? (yes/no): " -r
        if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            echo -e "${BLUE}Cleaning up...${NC}"
            $DOCKER_COMPOSE -f docker-compose-mcp.yml down -v
            echo -e "${GREEN}✓ Cleanup complete${NC}"
        else
            echo "Cleanup cancelled"
        fi
        ;;
        
    health)
        echo -e "${BLUE}Checking service health...${NC}"
        echo ""
        
        # Check MCP Service
        if curl -s http://localhost:3004/health > /dev/null 2>&1; then
            echo -e "${GREEN}✓ MCP Service is healthy${NC}"
            curl -s http://localhost:3004/health | python3 -m json.tool | head -10
        else
            echo -e "${RED}✗ MCP Service is not responding${NC}"
        fi
        
        echo ""
        
        # Check Banking Service
        if curl -s http://localhost:3005/health > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Banking Service is healthy${NC}"
        else
            echo -e "${RED}✗ Banking Service is not responding${NC}"
        fi
        
        echo ""
        ;;
        
    test)
        echo -e "${BLUE}Testing MCP Service...${NC}"
        echo ""
        
        # Wait for services to be ready
        echo "Waiting for services to be ready..."
        sleep 5
        
        # Test MCP Service health
        echo "Testing MCP Service health..."
        curl -s http://localhost:3004/health | python3 -m json.tool
        
        echo ""
        echo "Testing MCP Service tools..."
        curl -s http://localhost:3004/api/mcp/tools | python3 -m json.tool | head -30
        
        echo ""
        echo -e "${GREEN}✓ Tests complete${NC}"
        ;;
        
    *)
        echo "Usage: $0 {up|down|restart|logs|ps|status|clean|health|test}"
        echo ""
        echo "Commands:"
        echo "  up [-d]     Start services (optionally in detached mode)"
        echo "  down        Stop services"
        echo "  restart     Restart services"
        echo "  logs [svc]  View logs (optionally for specific service)"
        echo "  ps|status   Show service status"
        echo "  clean       Remove all containers and volumes"
        echo "  health      Check service health"
        echo "  test        Run basic tests"
        echo ""
        echo "Examples:"
        echo "  $0 up -d                    # Start in background"
        echo "  $0 logs poc-mcp-service     # View MCP Service logs"
        echo "  $0 health                   # Check all services"
        exit 1
        ;;
esac
