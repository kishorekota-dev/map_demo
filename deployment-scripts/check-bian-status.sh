#!/bin/bash

# Check status of all POC Banking services

echo "======================================"
echo "POC Banking Services Status"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_service() {
    local name=$1
    local port=$2
    
    if curl -s -f "http://localhost:$port/health" > /dev/null 2>&1; then
        echo -e "$name (Port $port): ${GREEN}HEALTHY${NC} ✓"
    else
        echo -e "$name (Port $port): ${RED}UNHEALTHY${NC} ✗"
    fi
}

echo "Services:"
check_service "API Gateway      " 3001
check_service "Customer Service " 3010
check_service "Account Service  " 3011
check_service "Card Service     " 3012
check_service "Payment Service  " 3013
check_service "Fraud Service    " 3014
check_service "Auth Service     " 3015

echo ""
echo "Infrastructure:"

# Check PostgreSQL
if docker ps | grep -q "poc-banking-postgres"; then
    echo -e "PostgreSQL: ${GREEN}RUNNING${NC} ✓"
else
    echo -e "PostgreSQL: ${RED}STOPPED${NC} ✗"
fi

# Check pgAdmin
if curl -s -f "http://localhost:5050" > /dev/null 2>&1; then
    echo -e "pgAdmin:    ${GREEN}RUNNING${NC} ✓"
else
    echo -e "pgAdmin:    ${RED}STOPPED${NC} ✗"
fi

echo ""
echo "Docker Containers:"
docker-compose -f docker-compose-banking.yml ps

echo ""
echo "Quick Commands:"
echo "  View logs:    docker-compose -f docker-compose-banking.yml logs -f"
echo "  Stop all:     docker-compose -f docker-compose-banking.yml down"
echo "  Restart all:  docker-compose -f docker-compose-banking.yml restart"
echo "  Test API:     curl http://localhost:3001/health"
