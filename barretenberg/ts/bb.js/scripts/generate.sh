#!/usr/bin/env bash
# Generate bb.js's TypeScript client from the checked-in bb schema, via
# ipc-codegen. Other languages generate their own: see
# barretenberg/rust/bootstrap.sh for the Rust crate.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(git rev-parse --show-toplevel)
BBAPI="$ROOT/barretenberg/cpp/src/barretenberg/bbapi"

# bb.js keeps its historical API surface (poseidon2Hash, Poseidon2Hash), so the
# Bb service prefix is stripped from identifiers; wire tags keep it.
node --experimental-strip-types --experimental-transform-types --no-warnings \
  "$ROOT/ipc-codegen/src/generate.ts" \
  --schema "$BBAPI/bb_schema.json" \
  --lang ts \
  --client \
  --strip-method-prefix \
  --strip-type-prefix \
  --out src/generated \
  --curve-constants "$BBAPI/bb_curve_constants.json"
