#!/bin/bash

# POC Banking - Quick Service Status Check

echo "========================================"
echo "POC Banking - Service Status"
echo "========================================"
echo ""

# Check if services are running
if docker ps | grep -q "poc-banking"; then
    echo "✅ Docker containers are running"
    echo ""
    
    # Check API Gateway
    if curl -s -f http://localhost:3001/health > /dev/null 2>&1; then
        echo "✅ API Gateway (3001) - HEALTHY"
    else
        echo "❌ API Gateway (3001) - UNHEALTHY"
    fi
    
    # Check Customer Service
    if curl -s -f http://localhost:3010/health > /dev/null 2>&1; then
        echo "✅ Customer Service (3010) - HEALTHY"
    else
        echo "❌ Customer Service (3010) - UNHEALTHY"
    fi
    
    # Check PostgreSQL
    if docker exec poc-banking-postgres pg_isready -U banking_user -d customer_db > /dev/null 2>&1; then
        echo "✅ PostgreSQL (5432) - HEALTHY"
    else
        echo "❌ PostgreSQL (5432) - UNHEALTHY"
    fi
    
    echo ""
    echo "Quick Commands:"
    echo "  Run tests:     ./run-tests.sh"
    echo "  View logs:     docker-compose -f docker-compose-banking.yml logs -f"
    echo "  Restart:       docker-compose -f docker-compose-banking.yml restart"
    echo "  Stop:          docker-compose -f docker-compose-banking.yml down"
    
else
    echo "❌ Services are NOT running"
    echo ""
    echo "Start services with:"
    echo "  docker-compose -f docker-compose-banking.yml up -d"
    echo ""
    echo "Or run complete setup:"
    echo "  ./setup-and-test.sh"
fi

echo ""
