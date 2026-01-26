#!/bin/bash
# POC Banking Chat - Stop All Services
# Usage: ./scripts/stop-all.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  POC Banking Chat - Stopping Services  ${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

PIDS_FILE="$ROOT_DIR/.pids"

# Stop from PID file if exists
if [[ -f "$PIDS_FILE" ]]; then
  while read -r line; do
    pid=$(echo "$line" | cut -d' ' -f1)
    name=$(echo "$line" | cut -d' ' -f2-)
    if kill -0 "$pid" 2>/dev/null; then
      echo -e "${YELLOW}Stopping $name (PID: $pid)...${NC}"
      kill "$pid" 2>/dev/null || true
      echo -e "${GREEN}✓ $name stopped${NC}"
    fi
  done < "$PIDS_FILE"
  rm -f "$PIDS_FILE"
fi

# Also kill by port as fallback
PORTS=(3001 3002 3003 3004 3005 3006 3007 8081)
for port in "${PORTS[@]}"; do
  pid=$(lsof -ti:$port 2>/dev/null || true)
  if [[ -n "$pid" ]]; then
    echo -e "${YELLOW}Killing process on port $port (PID: $pid)...${NC}"
    kill -9 $pid 2>/dev/null || true
  fi
done

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  All services stopped!                 ${NC}"
echo -e "${GREEN}========================================${NC}"
