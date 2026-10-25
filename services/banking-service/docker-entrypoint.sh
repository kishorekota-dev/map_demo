#!/bin/sh
set -eu
cd "$(dirname "$0")"
node database/scripts/bootstrap.js
if [ "$#" -gt 0 ]; then
  exec "$@"
fi
exec node server.js
