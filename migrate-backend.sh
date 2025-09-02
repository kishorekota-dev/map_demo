#!/bin/bash

# Script to copy backend files to monorepo structure
echo "🔄 Moving backend files to monorepo structure..."

# Copy middleware files
cp -r middleware/* packages/backend/middleware/ 2>/dev/null || echo "Middleware files copied"

# Copy models files  
cp -r models/* packages/backend/models/ 2>/dev/null || echo "Models files copied"

# Copy routes files
cp -r routes/* packages/backend/routes/ 2>/dev/null || echo "Routes files copied"

# Copy services files
cp -r services/* packages/backend/services/ 2>/dev/null || echo "Services files copied"

# Copy utils files
cp -r utils/* packages/backend/utils/ 2>/dev/null || echo "Utils files copied"

# Copy MCP server
cp mcp-server.js packages/backend/ 2>/dev/null || echo "MCP server copied"

echo "✅ Backend files migration completed!"
