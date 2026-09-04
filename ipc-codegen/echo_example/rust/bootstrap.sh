#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)"
NODE="node --experimental-strip-types --no-warnings"

$NODE "$CODEGEN/src/generate.ts" \
  --schema "$DIR/../schema/schema.jsonc" \
  --lang rust \
  --server \
  --client \
  --uds \
  --ffi \
  --out "$DIR/src/generated"

(cd "$DIR" && cargo build --locked --quiet)
# Compile-check the generated FFI backend (not linked into the binaries).
(cd "$DIR" && cargo check --locked --quiet --features ffi)
