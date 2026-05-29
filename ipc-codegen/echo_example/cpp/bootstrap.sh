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
  --out "$DIR/src/generated" \
  --prefix Echo \
  --cpp-namespace echo

rm -rf "$DIR/src/generated/ipc_codegen"
cp -R "$CODEGEN/cpp/include/ipc_codegen" "$DIR/src/generated/ipc_codegen"

cmake -S "$DIR" -B "$DIR/build"
cmake --build "$DIR/build" --target echo_server echo_client
