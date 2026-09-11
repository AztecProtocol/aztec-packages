#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)"
NODE="node --experimental-strip-types --no-warnings"

$NODE "$CODEGEN/src/generate.ts" \
  --schema "$DIR/../schema/schema.jsonc" \
  --lang cpp \
  --server \
  --client \
  --out "$DIR/src/generated" \
  --cpp-namespace echo

cmake -S "$DIR" -B "$DIR/build"
cmake --build "$DIR/build" --target echo_server echo_client golden_test
