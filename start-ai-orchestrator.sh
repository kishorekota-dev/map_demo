#!/bin/bash

###############################################################################
# Start AI Orchestrator - Local Development
###############################################################################

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "       Starting AI Orchestrator Service (Development)     "
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check if in correct directory
if [ ! -d "poc-ai-orchestrator" ]; then
    echo -e "${YELLOW}Warning: poc-ai-orchestrator directory not found${NC}"
    echo "Please run this script from the map_demo root directory"
    exit 1
fi

cd poc-ai-orchestrator

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}Installing dependencies...${NC}"
    npm install
fi

# Check if .env.development exists
if [ ! -f ".env.development" ]; then
    echo -e "${YELLOW}Creating .env.development from .env.example...${NC}"
    cp .env.example .env.development
    echo -e "${YELLOW}Please update .env.development with your configuration${NC}"
    echo ""
fi

# Start the service
echo -e "${GREEN}Starting AI Orchestrator on port 3007...${NC}"
echo ""
NODE_ENV=development node src/server.js
