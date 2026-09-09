#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)"
NODE="node --experimental-strip-types --experimental-transform-types --no-warnings"

$NODE "$CODEGEN/src/generate.ts" \
  --schema "$DIR/../schema/schema.jsonc" \
  --lang rust \
  --server \
  --client \
  --uds \
  --ffi \
  --out "$DIR/src/generated"

(cd "$DIR" && cargo build --locked --quiet)
# The generated FFI entry and the FFI client backend, linked into one crate: the
# client calls the service in-process (tests/ffi_roundtrip.rs).
(cd "$DIR" && cargo test --locked --quiet --features ffi)
