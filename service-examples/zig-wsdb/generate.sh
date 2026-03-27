#!/usr/bin/env bash
# Generate WSDB types for Zig from the committed schema.
# Uses the codegen CLI — no custom generate scripts needed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CODEGEN="$REPO_ROOT/barretenberg/codegen"

mkdir -p "$SCRIPT_DIR/src/generated"

node --experimental-strip-types --experimental-transform-types --no-warnings \
  "$CODEGEN/src/generate.ts" \
  --schema "$CODEGEN/schemas/wsdb_schema.json" \
  --lang zig \
  --out "$SCRIPT_DIR/src/generated"
