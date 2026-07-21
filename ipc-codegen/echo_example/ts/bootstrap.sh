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

# ipc-runtime is built by the Makefile (ipc-codegen depends on it) so its ts/dest
# is ready for the file: link below; don't reinstall the shared ipc-runtime/ts
# here — concurrent build units doing so corrupt its node_modules.
rm -rf "$DIR/node_modules"
(cd "$DIR" && npm install --no-package-lock --quiet)
(cd "$DIR" && node_modules/.bin/tsc --noEmit)
