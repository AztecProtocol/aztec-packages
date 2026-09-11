#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)"
NODE="node --experimental-strip-types --experimental-transform-types --no-warnings"

$NODE "$CODEGEN/src/generate.ts" \
  --schema "$DIR/../schema/schema.jsonc" \
  --lang cpp \
  --server \
  --client \
  --ffi \
  --out "$DIR/src/generated" \
  --cpp-namespace echo \
  --cpp-ffi-context echo::EchoCtx \
  --cpp-ffi-context-include echo_handlers.hpp

cmake -S "$DIR" -B "$DIR/build"
cmake --build "$DIR/build" --target echo_server echo_client golden_test ffi_test
