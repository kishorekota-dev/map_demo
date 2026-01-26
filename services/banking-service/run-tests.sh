#!/bin/bash

# POC Banking - Quick Test Runner
# Runs all API tests and generates reports

set -e

echo "======================================"
echo "POC Banking - Quick Test Runner"
echo "======================================"
echo ""

# Check if services are running
echo "Checking if services are running..."
if ! curl -s -f http://localhost:3001/health > /dev/null 2>&1; then
    echo "❌ Services are not running!"
    echo ""
    echo "Start services first:"
    echo "  cd poc-banking-service"
    echo "  docker-compose -f docker-compose-banking.yml up -d"
    echo ""
    exit 1
fi

echo "✅ Services are running"
echo ""

# Ask which test to run
echo "Select test suite to run:"
echo "  1) Bash test suite (comprehensive, uses cURL)"
echo "  2) Node.js test suite (better error handling)"
echo "  3) Both test suites"
echo ""
read -p "Enter choice [1-3]: " choice

case $choice in
    1)
        echo ""
        echo "Running Bash test suite..."
        echo ""
        cd tests
        chmod +x e2e-api-test.sh
        ./e2e-api-test.sh
        ;;
    2)
        echo ""
        echo "Running Node.js test suite..."
        echo ""
        cd tests
        if [ ! -d "node_modules" ]; then
            echo "Installing dependencies..."
            npm install
        fi
        npm test
        ;;
    3)
        echo ""
        echo "Running both test suites..."
        echo ""
        cd tests
        
        # Install Node.js dependencies if needed
        if [ ! -d "node_modules" ]; then
            echo "Installing dependencies..."
            npm install
        fi
        
        # Run Bash tests
        echo ""
        echo "=== Running Bash Test Suite ==="
        chmod +x e2e-api-test.sh
        ./e2e-api-test.sh
        
        # Run Node.js tests
        echo ""
        echo "=== Running Node.js Test Suite ==="
        npm test
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
echo "======================================"
echo "Test execution complete!"
echo "Check test-results/ directory for detailed reports"
echo "======================================"
