#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)"

"$CODEGEN/bin/ipc-codegen.mjs" \
  --schema "$DIR/../schema/schema.jsonc" \
  --lang zig \
  --server \
  --client \
  --ffi \
  --out "$DIR/src/generated"

(cd "$DIR" && zig build)
