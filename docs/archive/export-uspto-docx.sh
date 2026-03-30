#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
SOURCE_FILE="${SCRIPT_DIR}/PATENT-USPTO-STYLE-DRAFT.md"
OUTPUT_FILE="${1:-${SCRIPT_DIR}/white-paper-banking-chat-uspto-style-draft.docx}"

if ! command -v pandoc >/dev/null 2>&1; then
  echo "pandoc is required but was not found on PATH" >&2
  exit 1
fi

cd "${ROOT_DIR}"

pandoc \
  "${SOURCE_FILE}" \
  --from gfm \
  --to docx \
  --standalone \
  --output "${OUTPUT_FILE}"

echo "DOCX created at ${OUTPUT_FILE}"