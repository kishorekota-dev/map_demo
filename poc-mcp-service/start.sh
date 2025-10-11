#!/bin/bash

# MCP Service Startup Script
# Starts the standalone MCP service for banking operations

set -e

echo "╔════════════════════════════════════════╗"
echo "║   Starting POC MCP Service             ║"
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

# Check if .env exists, if not copy from .env.development
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env from .env.development...${NC}"
    cp .env.development .env
    echo -e "${GREEN}✓ .env file created${NC}"
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
fi

# Load environment variables
source .env

# Display configuration
echo -e "${BLUE}Configuration:${NC}"
echo "  Port: ${PORT}"
echo "  Node Environment: ${NODE_ENV}"
echo "  Banking Service: ${BANKING_SERVICE_URL}"
echo "  Log Level: ${LOG_LEVEL}"
echo ""

# Check if Banking Service is running
echo -e "${BLUE}Checking Banking Service...${NC}"
if curl -s "${BANKING_SERVICE_URL}/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Banking Service is running${NC}"
else
    echo -e "${YELLOW}⚠ Banking Service may not be running at ${BANKING_SERVICE_URL}${NC}"
    echo -e "${YELLOW}  MCP Service will start but may not function properly${NC}"
fi
echo ""

# Start the service
echo -e "${GREEN}Starting MCP Service...${NC}"
echo ""

# Check if PM2 should be used
if [ "$USE_PM2" = "true" ] && command -v pm2 &> /dev/null; then
    echo -e "${BLUE}Starting with PM2...${NC}"
    pm2 start src/server.js --name poc-mcp-service
    pm2 logs poc-mcp-service
else
    echo -e "${BLUE}Starting with Node.js...${NC}"
    node src/server.js
fi
