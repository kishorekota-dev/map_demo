#!/bin/bash
# Final cleanup script for map_demo monorepo
# Usage: bash CLEANUP.sh

set -e
cd /workspaces/map_demo

echo "🧹 Cleaning up repository..."

# 1. Move remaining markdown files to docs/archive/
echo "📄 Moving remaining docs to archive..."
for f in \
  AI-ORCHESTRATOR-*.md \
  API-QUICK-REFERENCE.md \
  ARCHITECTURE-*.md \
  BACKEND_DEBUG_GUIDE.md \
  BIAN-ARCHITECTURE.md \
  COMPLETE_ARCHITECTURE_DOCUMENTATION.md \
  DATABASE-IMPLEMENTATION.md \
  DEBUG_*.md \
  DEPLOYMENT-GUIDE.md \
  DEVELOPMENT_SETUP.md \
  DIALOGFLOW_SETUP_GUIDE.md \
  DOCKER*.md \
  ENTERPRISE_SETUP_COMPLETE.md \
  FINAL_SECURITY_REPORT.md \
  INTEGRATION-ARCHITECTURE-DETAILED.md \
  LANGGRAPH-MCP-INTEGRATION-ANALYSIS.md \
  LOCAL*.md \
  MCP-*.md \
  MICROSERVICES-ARCHITECTURE.md \
  MIGRATION-GUIDE.md \
  NLU-QUICK-REFERENCE.md \
  POC-BANKING-TEST-RESULTS.md \
  SECURITY*.md \
  TECHNICAL-IMPLEMENTATION-GUIDE.md \
  "white+paper_banking_chat.md"
do
  [ -f "$f" ] && mv "$f" docs/archive/ && echo "  Moved: $f"
done 2>/dev/null || true

# 2. Delete backup/old files
echo "🗑️ Removing backup files..."
rm -f README.old.md package.old.json ecosystem.config.old.js RUN-MIGRATION.sh

# 3. Delete archive folder (legacy code)
echo "🗑️ Removing archive folder..."
rm -rf archive/

# 4. Delete config folder (old dialogflow scripts)
echo "🗑️ Removing config folder..."
rm -rf config/

# 5. Clean up any leftover node_modules in wrong places
echo "🧹 Cleaning up stray node_modules..."
rm -rf node_modules 2>/dev/null || true

# 6. Show final structure
echo ""
echo "✅ Cleanup complete! Final root structure:"
ls -la

echo ""
echo "📁 Services:"
ls services/

echo ""
echo "📁 Docker:"
ls docker/

echo ""
echo "📁 Docs:"
ls docs/
