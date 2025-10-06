#!/bin/bash

# Install All Dependencies - POC Banking Chat
# This script installs dependencies for all microservices

echo "📦 Installing dependencies for all POC Banking Chat services..."
echo "================================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Track progress
TOTAL=0
SUCCESS=0
FAILED=0

# Function to install dependencies
install_service() {
    local name=$1
    local path=$2
    
    TOTAL=$((TOTAL + 1))
    
    echo -e "${YELLOW}Installing $name...${NC}"
    
    if [ -d "$path" ]; then
        cd "$path" || exit 1
        
        if npm install --silent; then
            echo -e "${GREEN}✓ $name dependencies installed${NC}"
            SUCCESS=$((SUCCESS + 1))
        else
            echo -e "${RED}✗ Failed to install $name dependencies${NC}"
            FAILED=$((FAILED + 1))
        fi
        
        cd - > /dev/null || exit 1
    else
        echo -e "${RED}✗ Directory not found: $path${NC}"
        FAILED=$((FAILED + 1))
    fi
    
    echo ""
}

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT" || exit 1

echo "Project root: $PROJECT_ROOT"
echo ""

# Install root dependencies
echo -e "${YELLOW}Installing root dependencies...${NC}"
npm install --silent
echo -e "${GREEN}✓ Root dependencies installed${NC}"
echo ""

# Install service dependencies
install_service "API Gateway" "poc-api-gateway"
install_service "NLP Service" "poc-nlp-service"
install_service "NLU Service" "poc-nlu-service"
install_service "MCP Service" "poc-mcp-service"
install_service "Banking Service" "poc-banking-service"
install_service "Chat Backend" "poc-chat-backend"
install_service "Agent UI" "poc-agent-ui"
install_service "Frontend" "poc-frontend"
install_service "Legacy Backend" "poc-backend"

echo "================================================================"
echo "Summary:"
echo "--------"
echo -e "Total Services:   $TOTAL"
echo -e "Successful:       ${GREEN}$SUCCESS${NC}"
echo -e "Failed:           ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All dependencies installed successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Configure environment variables (copy .env.example to .env)"
    echo "  2. Start services: ./deployment-scripts/start-all-services.sh"
    echo "  3. Test services: ./deployment-scripts/test-all-services.sh"
    echo ""
    exit 0
else
    echo -e "${RED}⚠️  Some installations failed. Please check the errors above.${NC}"
    echo ""
    exit 1
fi
