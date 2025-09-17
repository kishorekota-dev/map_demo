#!/bin/bash

# Restart Local Development Services

echo "🔄 Restarting Local Development Services"
echo "======================================="

# Stop services first
./stop-local.sh

# Wait a moment
sleep 2

# Start services again
./start-local.sh
