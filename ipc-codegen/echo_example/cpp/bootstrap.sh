#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)"
NODE="node --experimental-strip-types --experimental-transform-types --no-warnings"

$NODE "$CODEGEN/src/generate.ts" \
  --schema "$DIR/../schema/schema.json" \
  --lang cpp \
  --server \
  --client \
  --uds \
  --out "$DIR/generated" \
  --prefix Echo \
  --cpp-namespace echo

cmake -S "$DIR" -B "$DIR/build"
cmake --build "$DIR/build" --target echo_server echo_client
