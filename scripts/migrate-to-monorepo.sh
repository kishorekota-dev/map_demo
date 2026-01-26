#!/bin/bash
# POC Banking Chat - Monorepo Migration Script
# This script reorganizes the codebase into a clean monorepo structure
#
# Usage: ./scripts/migrate-to-monorepo.sh [--dry-run]
#
# IMPORTANT: Backup your code before running!

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DRY_RUN=false
[[ "$1" == "--dry-run" ]] && DRY_RUN=true && echo -e "${YELLOW}DRY RUN MODE${NC}\n"

log() { echo -e "${BLUE}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
success() { echo -e "${GREEN}[DONE]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

run_cmd() {
  if $DRY_RUN; then
    echo -e "${YELLOW}  Would run:${NC} $1"
  else
    eval "$1"
  fi
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  POC Banking Chat - Monorepo Migration ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ===========================================
# STEP 1: Create directory structure
# ===========================================
log "Creating directory structure..."

DIRS=(
  "services"
  "docker"
  "docs/getting-started"
  "docs/architecture"
  "docs/architecture/diagrams"
  "docs/api"
  "docs/api/openapi"
  "docs/guides"
  "docs/services"
  "docs/reference"
  "docs/archive"
  "archive/legacy"
  "archive/packages-enterprise"
)

for dir in "${DIRS[@]}"; do
  run_cmd "mkdir -p '$ROOT_DIR/$dir'"
done
success "Directory structure created"

# ===========================================
# STEP 2: Move services to services/
# ===========================================
log "Moving services to services/ directory..."

SERVICE_MOVES=(
  "poc-frontend:frontend"
  "poc-api-gateway:api-gateway"
  "poc-chat-backend:chat-backend"
  "poc-banking-service:banking-service"
  "poc-nlu-service:nlu-service"
  "poc-mcp-service:mcp-service"
  "poc-ai-orchestrator:ai-orchestrator"
  "poc-agent-ui:agent-ui"
)

for move in "${SERVICE_MOVES[@]}"; do
  IFS=':' read -r src dst <<< "$move"
  if [[ -d "$ROOT_DIR/$src" ]] && [[ ! -d "$ROOT_DIR/services/$dst" ]]; then
    run_cmd "mv '$ROOT_DIR/$src' '$ROOT_DIR/services/$dst'"
    success "Moved $src -> services/$dst"
  elif [[ -d "$ROOT_DIR/services/$dst" ]]; then
    warn "services/$dst already exists, skipping"
  else
    warn "$src not found, skipping"
  fi
done

# ===========================================
# STEP 3: Archive legacy directories
# ===========================================
log "Archiving legacy directories..."

LEGACY_DIRS=(
  "poc"
  "poc-backend"
  "mcp_sample"
  "routes"
  "middleware"
  "models"
  "utils"
  "tools"
)

for dir in "${LEGACY_DIRS[@]}"; do
  if [[ -d "$ROOT_DIR/$dir" ]]; then
    run_cmd "mv '$ROOT_DIR/$dir' '$ROOT_DIR/archive/legacy/'"
    success "Archived $dir"
  fi
done

# Archive packages/ (enterprise monorepo attempt)
if [[ -d "$ROOT_DIR/packages" ]]; then
  run_cmd "mv '$ROOT_DIR/packages' '$ROOT_DIR/archive/packages-enterprise'"
  success "Archived packages/"
fi

# ===========================================
# STEP 4: Move Docker files
# ===========================================
log "Consolidating Docker files..."

DOCKER_FILES=(
  "docker-compose.yml"
  "docker-compose-full-stack.yml:docker-compose.full.yml"
  "docker-compose-enterprise.yml"
  "docker-compose-mcp.yml"
  "docker-compose.local.yml"
)

for file in "${DOCKER_FILES[@]}"; do
  IFS=':' read -r src dst <<< "$file"
  [[ -z "$dst" ]] && dst="$src"
  if [[ -f "$ROOT_DIR/$src" ]]; then
    run_cmd "mv '$ROOT_DIR/$src' '$ROOT_DIR/docker/$dst'"
    success "Moved $src -> docker/$dst"
  fi
done

# Remove redundant docker files
DOCKER_REMOVE=(
  "docker-compose-mcp-standalone.yml"
  "docker-run-enterprise.sh"
)
for file in "${DOCKER_REMOVE[@]}"; do
  if [[ -f "$ROOT_DIR/$file" ]]; then
    run_cmd "rm '$ROOT_DIR/$file'"
    success "Removed redundant $file"
  fi
done

# ===========================================
# STEP 5: Move diagrams
# ===========================================
log "Moving diagrams..."

if [[ -d "$ROOT_DIR/diagrams" ]]; then
  run_cmd "mv '$ROOT_DIR/diagrams/'* '$ROOT_DIR/docs/architecture/diagrams/' 2>/dev/null || true"
  run_cmd "rmdir '$ROOT_DIR/diagrams' 2>/dev/null || true"
fi

DIAGRAM_FILES=(
  "architecture.mermaid"
  "architecture-complete.mermaid"
  "sequence-flow-complete.mermaid"
  "*.excalidraw"
)

for pattern in "${DIAGRAM_FILES[@]}"; do
  for file in $ROOT_DIR/$pattern; do
    if [[ -f "$file" ]]; then
      run_cmd "mv '$file' '$ROOT_DIR/docs/architecture/diagrams/'"
    fi
  done
done
success "Diagrams moved"

# ===========================================
# STEP 6: Move API docs
# ===========================================
log "Moving API documentation..."

if [[ -d "$ROOT_DIR/api-docs" ]]; then
  run_cmd "mv '$ROOT_DIR/api-docs/'* '$ROOT_DIR/docs/api/openapi/' 2>/dev/null || true"
  run_cmd "rmdir '$ROOT_DIR/api-docs' 2>/dev/null || true"
  success "API docs moved"
fi

# ===========================================
# STEP 7: Archive legacy documentation
# ===========================================
log "Archiving legacy documentation..."

# Documentation to archive (completed work, fix notes, etc.)
ARCHIVE_DOCS=(
  "*-COMPLETE.md"
  "*-FIX*.md"
  "*-SUMMARY.md"
  "MONOREPO-PROGRESS.md"
  "FEASIBILITY-VALIDATION.md"
  "QUICK-FIX-INSTRUCTIONS.md"
  "README-BIAN-SERVICES.md"
  "README-ENTERPRISE.md"
  "README-MCP.md"
  "README-MONOREPO.md"
)

for pattern in "${ARCHIVE_DOCS[@]}"; do
  for file in $ROOT_DIR/$pattern; do
    if [[ -f "$file" ]]; then
      run_cmd "mv '$file' '$ROOT_DIR/docs/archive/'"
    fi
  done
done
success "Legacy docs archived"

# ===========================================
# STEP 8: Consolidate scripts
# ===========================================
log "Consolidating scripts..."

# Move deployment-scripts contents to scripts/
if [[ -d "$ROOT_DIR/deployment-scripts" ]]; then
  run_cmd "mv '$ROOT_DIR/deployment-scripts/'* '$ROOT_DIR/scripts/' 2>/dev/null || true"
  run_cmd "rmdir '$ROOT_DIR/deployment-scripts' 2>/dev/null || true"
fi

# Remove duplicate/obsolete scripts
REMOVE_SCRIPTS=(
  "start-local.sh"
  "start-local-http-mcp.sh"
  "start-local-simple.sh"
  "stop-local.sh"
  "status-local.sh"
  "status-debug.sh"
  "start-debug.sh"
  "stop-debug.sh"
  "restart-local.sh"
  "test-api-advanced.sh"
  "test-api-demo.sh"
  "test-banking-quick.sh"
  "test-banking-simple.sh"
  "test-debug-logging.sh"
  "test-backend-debug.sh"
  "test-enterprise-api.sh"
  "docker-mcp.sh"
)

for script in "${REMOVE_SCRIPTS[@]}"; do
  if [[ -f "$ROOT_DIR/$script" ]]; then
    run_cmd "rm '$ROOT_DIR/$script'"
  fi
done
success "Scripts consolidated"

# ===========================================
# STEP 9: Remove legacy root files
# ===========================================
log "Removing legacy root files..."

REMOVE_FILES=(
  "server.js"
  "mcp-server.js"
  "mcp-example.js"
  "mcp-package.json"
  "mcp-config.json"
  "debug-config.json"
  "missing-components-integration.dot"
)

for file in "${REMOVE_FILES[@]}"; do
  if [[ -f "$ROOT_DIR/$file" ]]; then
    run_cmd "rm '$ROOT_DIR/$file'"
    success "Removed $file"
  fi
done

# ===========================================
# STEP 10: Update package.json
# ===========================================
log "Updating package.json..."

if [[ -f "$ROOT_DIR/package.new.json" ]]; then
  run_cmd "mv '$ROOT_DIR/package.json' '$ROOT_DIR/archive/legacy/package.old.json'"
  run_cmd "mv '$ROOT_DIR/package.new.json' '$ROOT_DIR/package.json'"
  success "package.json updated"
fi

# ===========================================
# STEP 11: Update service package.json names
# ===========================================
log "Updating service package names..."

SERVICE_NAMES=(
  "frontend:@poc-banking/frontend"
  "api-gateway:@poc-banking/api-gateway"
  "chat-backend:@poc-banking/chat-backend"
  "banking-service:@poc-banking/banking-service"
  "nlu-service:@poc-banking/nlu-service"
  "mcp-service:@poc-banking/mcp-service"
  "ai-orchestrator:@poc-banking/ai-orchestrator"
  "agent-ui:@poc-banking/agent-ui"
)

for item in "${SERVICE_NAMES[@]}"; do
  IFS=':' read -r dir name <<< "$item"
  pkg="$ROOT_DIR/services/$dir/package.json"
  if [[ -f "$pkg" ]] && ! $DRY_RUN; then
    # Update name field using sed (cross-platform)
    if command -v jq &> /dev/null; then
      jq ".name = \"$name\"" "$pkg" > "$pkg.tmp" && mv "$pkg.tmp" "$pkg"
    else
      sed -i.bak "s/\"name\": \"[^\"]*\"/\"name\": \"$name\"/" "$pkg" && rm -f "$pkg.bak"
    fi
    success "Updated $dir package name"
  fi
done

# ===========================================
# STEP 12: Create .gitkeep files
# ===========================================
log "Creating .gitkeep files for empty directories..."

GITKEEP_DIRS=(
  "docs/getting-started"
  "docs/api"
  "docs/services"
  "docs/reference"
  "archive/legacy"
)

for dir in "${GITKEEP_DIRS[@]}"; do
  if [[ -d "$ROOT_DIR/$dir" ]]; then
    run_cmd "touch '$ROOT_DIR/$dir/.gitkeep'"
  fi
done

# ===========================================
# SUMMARY
# ===========================================
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Migration Complete!                   ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "New structure:"
echo "  services/          - All microservices"
echo "  docs/              - Consolidated documentation"
echo "  scripts/           - All scripts"
echo "  docker/            - Docker configurations"
echo "  archive/           - Legacy code (safe to delete later)"
echo ""

if $DRY_RUN; then
  echo -e "${YELLOW}This was a DRY RUN. Run without --dry-run to apply changes.${NC}"
else
  echo "Next steps:"
  echo "  1. Run 'npm install' to reinstall dependencies"
  echo "  2. Run 'npm run validate' to verify environment"
  echo "  3. Run 'npm run dev' to start development"
  echo "  4. Review and delete archive/ when ready"
fi
