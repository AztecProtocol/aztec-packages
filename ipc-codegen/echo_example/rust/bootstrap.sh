#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)"
NODE="node --experimental-strip-types --experimental-transform-types --no-warnings"

$NODE "$CODEGEN/src/generate.ts" \
  --schema "$DIR/../schema/schema.json" \
  --lang rust \
  --server \
  --client \
  --uds \
  --out "$DIR/src/generated" \
  --prefix Echo

(cd "$DIR" && cargo build --quiet)
