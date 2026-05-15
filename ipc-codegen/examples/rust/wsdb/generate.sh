#!/usr/bin/env bash
# Generate WSDB Rust bindings from the committed schema.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODEGEN="$SCRIPT_DIR/../../.."
SCHEMA="$CODEGEN/schemas/wsdb_schema.json"
NODE_FLAGS="--experimental-strip-types --experimental-transform-types --no-warnings"

echo "Generating Rust WSDB bindings..."
node $NODE_FLAGS "$CODEGEN/src/generate.ts" \
  --schema "$SCHEMA" \
  --lang rust \
  --out "$SCRIPT_DIR/src/generated" \
  --server --client --uds --ffi \
  --prefix Wsdb \
  --skeleton "$SCRIPT_DIR/src"

echo "Done. Generated files in src/generated/, skeleton in src/"
