#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)"
NODE="node --experimental-strip-types --no-warnings"

$NODE "$CODEGEN/src/generate.ts" \
  --schema "$DIR/../schema/schema.jsonc" \
  --lang zig \
  --server \
  --client \
  --uds \
  --ffi \
  --out "$DIR/src/generated"

(cd "$DIR" && zig build)
