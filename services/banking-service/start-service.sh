#!/bin/bash

# POC Banking Service - Quick Start Script
# This script starts the banking service with Docker Compose

echo "========================================="
echo "POC Banking Service - Quick Start"
echo "========================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker Desktop."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Stop any existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose-banking-simple.yml down

# Build and start services
echo "🏗️  Building and starting services..."
docker-compose -f docker-compose-banking-simple.yml up -d --build

# Wait for services to be healthy
echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
echo ""
echo "🏥 Checking service health..."
HEALTH_RESPONSE=$(curl -s http://localhost:3005/health)

if [ $? -eq 0 ]; then
    echo "✅ Banking Service is healthy!"
    echo "$HEALTH_RESPONSE" | jq .
else
    echo "❌ Banking Service is not responding"
    exit 1
fi

echo ""
echo "========================================="
echo "✅ POC Banking Service is running!"
echo "========================================="
echo ""
echo "📊 Service URLs:"
echo "  - Banking Service: http://localhost:3005"
echo "  - Health Check:    http://localhost:3005/health"
echo "  - API Docs:        http://localhost:3005/api/docs"
echo "  - Database:        localhost:5432"
echo "  - pgAdmin:         http://localhost:5050"
echo ""
echo "🔐 Authentication:"
echo "  - Login:   POST http://localhost:3005/api/v1/auth/login"
echo "  - Profile: GET  http://localhost:3005/api/v1/auth/me"
echo ""
echo "🧪 Test Credentials:"
echo "  - admin / Password123!"
echo "  - manager / Password123!"
echo "  - james.patterson / Password123!"
echo ""
echo "📝 Quick Test:"
echo "  curl -X POST http://localhost:3005/api/v1/auth/login \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"username\":\"admin\",\"password\":\"Password123!\"}'"
echo ""
echo "📚 Documentation:"
echo "  - API Spec:       ./openapi.yaml"
echo "  - Postman:        ./postman-collection.json"
echo "  - Quick Ref:      ./API-QUICK-REFERENCE.md"
echo "  - Full Docs:      ./API-DOCUMENTATION.md"
echo ""
echo "🔧 Manage Services:"
echo "  - View logs:  docker-compose -f docker-compose-banking-simple.yml logs -f"
echo "  - Stop:       docker-compose -f docker-compose-banking-simple.yml down"
echo "  - Restart:    docker-compose -f docker-compose-banking-simple.yml restart"
echo ""
