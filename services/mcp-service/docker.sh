#!/bin/bash

# MCP Service Docker Management Script
# Manages Docker deployment of the MCP Service

set -e

echo "╔════════════════════════════════════════╗"
echo "║   MCP Service - Docker Manager         ║"
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

# Check docker-compose command
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    DOCKER_COMPOSE="docker compose"
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env from .env.docker...${NC}"
    cp .env.docker .env
    echo -e "${GREEN}✓ .env file created${NC}"
    echo -e "${YELLOW}⚠ Please review and update .env with your configuration${NC}"
fi

# Parse command
COMMAND=${1:-up}
DETACHED=""

if [ "$COMMAND" = "up" ]; then
    if [ "$2" = "-d" ] || [ "$2" = "--detach" ]; then
        DETACHED="-d"
    fi
fi

echo ""
echo -e "${BLUE}MCP Service Docker Manager${NC}"
echo ""

case $COMMAND in
    up|start)
        echo -e "${BLUE}Starting MCP Service...${NC}"
        $DOCKER_COMPOSE up --build $DETACHED
        
        if [ -n "$DETACHED" ]; then
            echo ""
            echo -e "${GREEN}✓ MCP Service started in detached mode${NC}"
            echo ""
            echo "Service URLs:"
            echo "  MCP Service:  http://localhost:3004"
            echo "  Health Check: http://localhost:3004/health"
            echo "  API Info:     http://localhost:3004/api"
            echo "  Tools:        http://localhost:3004/api/mcp/tools"
            echo "  WebSocket:    ws://localhost:3004"
            echo ""
            echo "Useful commands:"
            echo "  View logs:    ./docker.sh logs"
            echo "  Stop service: ./docker.sh stop"
            echo "  View status:  ./docker.sh status"
            echo "  Run tests:    ./docker.sh test"
            echo ""
        fi
        ;;
        
    down|stop)
        echo -e "${BLUE}Stopping MCP Service...${NC}"
        $DOCKER_COMPOSE down
        echo -e "${GREEN}✓ MCP Service stopped${NC}"
        ;;
        
    restart)
        echo -e "${BLUE}Restarting MCP Service...${NC}"
        $DOCKER_COMPOSE restart
        echo -e "${GREEN}✓ MCP Service restarted${NC}"
        ;;
        
    logs)
        $DOCKER_COMPOSE logs -f
        ;;
        
    ps|status)
        $DOCKER_COMPOSE ps
        echo ""
        echo -e "${BLUE}Container Details:${NC}"
        docker ps --filter "name=mcp-service" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        ;;
        
    build)
        echo -e "${BLUE}Building MCP Service image...${NC}"
        $DOCKER_COMPOSE build
        echo -e "${GREEN}✓ Build complete${NC}"
        ;;
        
    clean)
        echo -e "${YELLOW}⚠ This will remove the container and logs${NC}"
        read -p "Are you sure? (yes/no): " -r
        if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            echo -e "${BLUE}Cleaning up...${NC}"
            $DOCKER_COMPOSE down -v
            rm -rf logs/*
            echo -e "${GREEN}✓ Cleanup complete${NC}"
        else
            echo "Cleanup cancelled"
        fi
        ;;
        
    health)
        echo -e "${BLUE}Checking MCP Service health...${NC}"
        echo ""
        
        if curl -s http://localhost:3004/health > /dev/null 2>&1; then
            echo -e "${GREEN}✓ MCP Service is healthy${NC}"
            echo ""
            curl -s http://localhost:3004/health | python3 -m json.tool
        else
            echo -e "${RED}✗ MCP Service is not responding${NC}"
            echo "Check if the service is running: ./docker.sh status"
        fi
        echo ""
        ;;
        
    test)
        echo -e "${BLUE}Testing MCP Service...${NC}"
        echo ""
        
        # Wait for service to be ready
        echo "Waiting for service to be ready..."
        sleep 3
        
        # Test health endpoint
        echo "1. Testing health endpoint..."
        if curl -s http://localhost:3004/health > /dev/null; then
            echo -e "   ${GREEN}✓ Health check passed${NC}"
        else
            echo -e "   ${RED}✗ Health check failed${NC}"
        fi
        
        # Test tools endpoint
        echo "2. Testing tools endpoint..."
        TOOL_COUNT=$(curl -s http://localhost:3004/api/mcp/tools | python3 -c "import sys, json; print(json.load(sys.stdin).get('count', 0))" 2>/dev/null || echo "0")
        if [ "$TOOL_COUNT" -gt 0 ]; then
            echo -e "   ${GREEN}✓ Tools endpoint working (${TOOL_COUNT} tools)${NC}"
        else
            echo -e "   ${RED}✗ Tools endpoint failed${NC}"
        fi
        
        # Test categories endpoint
        echo "3. Testing categories endpoint..."
        if curl -s http://localhost:3004/api/mcp/categories > /dev/null; then
            echo -e "   ${GREEN}✓ Categories endpoint working${NC}"
        else
            echo -e "   ${RED}✗ Categories endpoint failed${NC}"
        fi
        
        echo ""
        echo -e "${GREEN}✓ Basic tests complete${NC}"
        ;;
        
    shell)
        echo -e "${BLUE}Opening shell in MCP Service container...${NC}"
        docker exec -it mcp-service sh
        ;;
        
    logs-clear)
        echo -e "${BLUE}Clearing logs...${NC}"
        rm -rf logs/*
        mkdir -p logs
        echo -e "${GREEN}✓ Logs cleared${NC}"
        ;;
        
    *)
        echo "MCP Service Docker Manager"
        echo ""
        echo "Usage: $0 <command> [options]"
        echo ""
        echo "Commands:"
        echo "  up, start [-d]    Start MCP Service (optionally in detached mode)"
        echo "  down, stop        Stop MCP Service"
        echo "  restart           Restart MCP Service"
        echo "  logs              View logs (follow mode)"
        echo "  ps, status        Show service status"
        echo "  build             Build Docker image"
        echo "  clean             Remove container and logs"
        echo "  health            Check service health"
        echo "  test              Run basic tests"
        echo "  shell             Open shell in container"
        echo "  logs-clear        Clear all logs"
        echo ""
        echo "Examples:"
        echo "  $0 up -d          # Start in background"
        echo "  $0 logs           # View logs"
        echo "  $0 health         # Check health"
        echo "  $0 test           # Run tests"
        echo ""
        exit 1
        ;;
esac
