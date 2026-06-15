#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)"
REPO_ROOT="$(cd "$CODEGEN/.." && pwd)"
NODE="node --experimental-strip-types --experimental-transform-types --no-warnings"

$NODE "$CODEGEN/src/generate.ts" \
  --schema "$DIR/../schema/schema.jsonc" \
  --lang ts \
  --server \
  --client \
  --out "$DIR/src/generated"

(cd "$REPO_ROOT/ipc-runtime" && ./bootstrap.sh)
(cd "$REPO_ROOT/ipc-runtime/ts" && yarn install --immutable && yarn build)
rm -rf "$DIR/node_modules"
(cd "$DIR" && npm install --no-package-lock --quiet)
(cd "$DIR" && node_modules/.bin/tsc --noEmit)
