#!/usr/bin/env bash
# Generate WSDB types and server dispatch from committed schema.
# Run this before `zig build`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CODEGEN="$REPO_ROOT/barretenberg/codegen"

mkdir -p "$SCRIPT_DIR/src/generated"

echo "Generating WSDB types for Zig..."
CODEGEN_DIR="$CODEGEN" OUT_DIR="$SCRIPT_DIR/src/generated" \
  node --experimental-strip-types --experimental-transform-types --no-warnings \
  "$SCRIPT_DIR/generate_zig.ts"
echo "Done."
