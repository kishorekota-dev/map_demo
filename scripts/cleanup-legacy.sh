#!/bin/bash
# Cleanup script for POC Banking Chat System
# This script removes legacy, duplicate, and unnecessary files
# 
# Run with: ./deployment-scripts/cleanup-legacy.sh
# 
# DRY RUN (see what would be deleted): ./deployment-scripts/cleanup-legacy.sh --dry-run

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
    DRY_RUN=true
    echo -e "${YELLOW}DRY RUN MODE - No files will be deleted${NC}"
    echo ""
fi

delete_item() {
    local item="$1"
    local full_path="$ROOT_DIR/$item"
    
    if [[ -e "$full_path" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            echo -e "${YELLOW}Would delete:${NC} $item"
        else
            rm -rf "$full_path"
            echo -e "${GREEN}Deleted:${NC} $item"
        fi
    else
        echo -e "${RED}Not found:${NC} $item"
    fi
}

echo "=========================================="
echo "POC Banking Chat - Legacy Cleanup Script"
echo "=========================================="
echo ""

# ===========================================
# 1. LEGACY DIRECTORIES
# ===========================================
echo -e "${YELLOW}1. Removing legacy directories...${NC}"

# Legacy POC directory (replaced by poc-frontend and microservices)
delete_item "poc"

# Legacy poc-backend (replaced by poc-chat-backend)
delete_item "poc-backend"

# MCP sample folder (real service is poc-mcp-service)
delete_item "mcp_sample"

echo ""

# ===========================================
# 2. ROOT-LEVEL LEGACY CODE (Credit Card Enterprise API)
# ===========================================
echo -e "${YELLOW}2. Removing root-level legacy code folders...${NC}"

# These belong to the old Credit Card Enterprise API, not the POC microservices
delete_item "routes"
delete_item "middleware"
delete_item "models"
delete_item "utils"

echo ""

# ===========================================
# 3. ROOT-LEVEL LEGACY FILES
# ===========================================
echo -e "${YELLOW}3. Removing root-level legacy files...${NC}"

# Old Credit Card Enterprise API server
delete_item "server.js"

# Standalone MCP files (real MCP is in poc-mcp-service)
delete_item "mcp-server.js"
delete_item "mcp-example.js"
delete_item "mcp-package.json"
delete_item "mcp-config.json"

echo ""

# ===========================================
# 4. BACKUP AND OLD FILES
# ===========================================
echo -e "${YELLOW}4. Removing backup and old files...${NC}"

# .bak files
delete_item "poc-banking-service/routes/auth.js.bak"
delete_item "packages/chatbot-ui/src/services/chatbot.ts.bak"
delete_item "packages/chatbot-ui/src/services/dialogflow.ts.bak"

# -old files
delete_item "poc-frontend/README.old.md"
delete_item "poc-agent-ui/server-old.js"
delete_item "packages/backend/routes/auth-old.js"
delete_item "packages/backend/routes/auth-new.js"
delete_item "diagrams/chatbot-architecture-fig1-old.png"

echo ""

# ===========================================
# 5. OBSOLETE DOCUMENTATION (Archive candidates)
# ===========================================
echo -e "${YELLOW}5. Moving obsolete documentation to docs/archive...${NC}"

ARCHIVE_DIR="$ROOT_DIR/docs/archive"

if [[ "$DRY_RUN" == "false" ]]; then
    mkdir -p "$ARCHIVE_DIR"
fi

archive_doc() {
    local doc="$1"
    local full_path="$ROOT_DIR/$doc"
    
    if [[ -f "$full_path" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            echo -e "${YELLOW}Would archive:${NC} $doc -> docs/archive/"
        else
            mv "$full_path" "$ARCHIVE_DIR/"
            echo -e "${GREEN}Archived:${NC} $doc"
        fi
    fi
}

# Archive fix and summary documents (implementation is complete)
archive_doc "ALL-FIXES-COMPLETE.md"
archive_doc "AUTHENTICATION-FIX-SUMMARY.md"
archive_doc "AUTHENTICATION-FIX.md"
archive_doc "BACKEND-SESSION-SYNC-FIX.md"
archive_doc "CHAT-BACKEND-PORT-FIX.md"
archive_doc "COMPLETE-ANALYSIS-SUMMARY.md"
archive_doc "CONFIGURATION-REVIEW-SUMMARY.md"
archive_doc "DOCKER-MCP-SETUP-COMPLETE.md"
archive_doc "ENHANCED-SEED-DATA-SUMMARY.md"
archive_doc "ENTERPRISE_SETUP_COMPLETE.md"
archive_doc "FEASIBILITY-VALIDATION.md"
archive_doc "FRONTEND-BACKEND-FIX-SUMMARY.md"
archive_doc "IMPLEMENTATION-SUMMARY.md"
archive_doc "MCP-SERVICE-MIGRATION-SUMMARY.md"
archive_doc "MCP-SETUP-COMPLETE.md"
archive_doc "MICROSERVICES-REVIEW-COMPLETE.md"
archive_doc "MONOREPO-PROGRESS.md"
archive_doc "NLU-INTEGRATION-COMPLETE.md"
archive_doc "NLU-SERVICE-RUNTIME-FIXES.md"
archive_doc "POC-BANKING-COMPLETE.md"
archive_doc "POC-BANKING-IMPLEMENTATION-COMPLETE.md"
archive_doc "POC-BANKING-TEST-RESULTS.md"
archive_doc "QUICK-FIX-INSTRUCTIONS.md"
archive_doc "SECURITY-FIX-CREDENTIALS.md"
archive_doc "SESSION-CREATION-FIX.md"
archive_doc "SESSION-FIX-COMPLETE.md"
archive_doc "AI-ORCHESTRATOR-COMPLETE.md"
archive_doc "BIAN-IMPLEMENTATION-COMPLETE.md"
archive_doc "MCP-OPENAPI-INTEGRATION-COMPLETE.md"
archive_doc "MCP-SERVICE-COMPLETE.md"
archive_doc "MCP-SERVICE-MODULAR-UPDATE.md"

echo ""

# ===========================================
# 6. DUPLICATE TEST SCRIPTS
# ===========================================
echo -e "${YELLOW}6. Removing duplicate test scripts...${NC}"

# These have equivalents in deployment-scripts or poc-*/
delete_item "test-banking-quick.sh"
delete_item "test-banking-simple.sh"
delete_item "test-debug-logging.sh"
delete_item "status-debug.sh"
delete_item "status-local.sh"
delete_item "test-api-advanced.sh"
delete_item "test-api-demo.sh"
delete_item "test-backend-debug.sh"
delete_item "test-enterprise-api.sh"

echo ""

# ===========================================
# 7. DUPLICATE DOCKER SCRIPTS
# ===========================================
echo -e "${YELLOW}7. Consolidating Docker-related files...${NC}"

# Keep main docker-compose files, remove redundant ones
delete_item "docker-compose-mcp-standalone.yml"
delete_item "docker-run-enterprise.sh"

echo ""

# ===========================================
# 8. CONFIG FOLDER CLEANUP
# ===========================================
echo -e "${YELLOW}8. Cleaning up config folder...${NC}"

# Python config files (not used by Node.js microservices)
delete_item "config/enhance_training.py"
delete_item "config/test_dialogflow.py"
delete_item "config/upload_dialogflow.py"
delete_item "config/requirements.txt"

echo ""

# ===========================================
# SUMMARY
# ===========================================
echo ""
echo "=========================================="
echo -e "${GREEN}Cleanup complete!${NC}"
echo "=========================================="

if [[ "$DRY_RUN" == "true" ]]; then
    echo ""
    echo -e "${YELLOW}This was a DRY RUN. To actually delete files, run without --dry-run${NC}"
fi

echo ""
echo "Remaining services structure:"
echo "  - poc-frontend/      (React Chat UI)"
echo "  - poc-chat-backend/  (Socket.IO + REST)"
echo "  - poc-banking-service/ (Banking domain)"
echo "  - poc-ai-orchestrator/ (LangGraph)"
echo "  - poc-mcp-service/   (MCP tools)"
echo "  - poc-nlu-service/   (DialogFlow)"
echo "  - poc-api-gateway/   (API Gateway)"
echo "  - poc-agent-ui/      (Agent Dashboard)"
echo ""
