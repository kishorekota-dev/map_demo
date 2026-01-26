#!/bin/bash

# POC Banking - Complete Setup and Test Script
# This script starts services, waits for them to be ready, and runs tests

set -e

echo "======================================"
echo "POC Banking - Setup and Test"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Step 1: Check prerequisites
echo "Step 1: Checking prerequisites..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    exit 1
fi

if ! command -v curl &> /dev/null; then
    echo -e "${RED}❌ curl is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

# Step 2: Start services
echo "Step 2: Starting services..."
# Use simplified compose file for current monolithic structure
docker-compose -f docker-compose-banking-simple.yml up -d --build

echo -e "${GREEN}✅ Services started${NC}"
echo ""

# Step 3: Wait for services to be ready
echo "Step 3: Waiting for services to be ready..."
MAX_WAIT=60
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
    if curl -s -f http://localhost:3001/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ API Gateway is ready${NC}"
        break
    fi
    echo "Waiting for API Gateway... ($ELAPSED/$MAX_WAIT seconds)"
    sleep 5
    ELAPSED=$((ELAPSED + 5))
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo -e "${RED}❌ Services failed to start in time${NC}"
    echo "Check logs:"
    echo "  docker-compose -f docker-compose-banking.yml logs"
    exit 1
fi

# Wait for customer service
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
    if curl -s -f http://localhost:3010/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Customer Service is ready${NC}"
        break
    fi
    echo "Waiting for Customer Service... ($ELAPSED/$MAX_WAIT seconds)"
    sleep 5
    ELAPSED=$((ELAPSED + 5))
done

echo ""
echo -e "${GREEN}✅ All services are ready!${NC}"
echo ""

# Step 4: Run tests
echo "Step 4: Running API tests..."
echo ""

cd tests

# Install Node.js dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing test dependencies..."
    npm install
    echo ""
fi

# Make bash script executable
chmod +x e2e-api-test.sh

# Run bash tests
echo "Running Bash test suite..."
echo ""
./e2e-api-test.sh

TEST_EXIT_CODE=$?

echo ""
echo "======================================"
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
else
    echo -e "${YELLOW}⚠️  Some tests failed. Check logs for details.${NC}"
fi
echo "======================================"
echo ""
echo "Test results saved to: tests/test-results/"
echo ""
echo "Next steps:"
echo "  - View HTML report: open tests/test-results/report_*.html"
echo "  - View logs: docker-compose -f docker-compose-banking.yml logs"
echo "  - Stop services: docker-compose -f docker-compose-banking.yml down"
echo ""

exit $TEST_EXIT_CODE
