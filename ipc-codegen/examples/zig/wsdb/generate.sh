#!/usr/bin/env bash
# Generate WSDB Zig bindings from the committed schema.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$SCRIPT_DIR/../../.." && pwd)"

mkdir -p "$SCRIPT_DIR/src/generated"

node --experimental-strip-types --experimental-transform-types --no-warnings \
  "$CODEGEN/src/generate.ts" \
  --schema "$CODEGEN/schemas/wsdb_schema.json" \
  --lang zig \
  --out "$SCRIPT_DIR/src/generated" \
  --server --client --uds --ffi \
  --prefix Wsdb
