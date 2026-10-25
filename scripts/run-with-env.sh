#!/bin/bash

# Safely load the documented root development environment as dotenv data before running a monorepo
# command. This keeps npm workspace and Docker Compose launches on the same
# configuration without requiring a duplicate root .env file.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
# An explicit path selects a deployment/database and must never fall back.
if [ -n "${APP_ENV_FILE+x}" ] && [ ! -f "${APP_ENV_FILE:-}" ]; then
  echo "Error: explicitly selected APP_ENV_FILE is missing or is not a file" >&2
  exit 1
fi
APP_ENV_FILE="${APP_ENV_FILE:-$ROOT_DIR/.env.development}"

if [ ! -f "$APP_ENV_FILE" ]; then
  if [ -f "$ROOT_DIR/.env.example" ]; then
    echo "Warning: $APP_ENV_FILE not found; using $ROOT_DIR/.env.example" >&2
    APP_ENV_FILE="$ROOT_DIR/.env.example"
  else
    echo "Error: no root environment file found" >&2
    exit 1
  fi
fi

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <command> [arguments...]" >&2
  exit 2
fi

cd "$ROOT_DIR"
exec node "$ROOT_DIR/deployment-scripts/run-with-env.cjs" "$APP_ENV_FILE" "$@"
