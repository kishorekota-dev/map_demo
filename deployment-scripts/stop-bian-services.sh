#!/bin/bash

# Stop all POC Banking services

echo "Stopping POC Banking services..."

docker-compose -f docker-compose-banking.yml down

echo ""
echo "Services stopped successfully."
echo ""
echo "To remove volumes (WARNING: deletes all data):"
echo "  docker-compose -f docker-compose-banking.yml down -v"
