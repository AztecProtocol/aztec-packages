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
  --ffi \
  --out "$DIR/src/generated" \
  --cpp-namespace echo

cmake -S "$DIR" -B "$DIR/build"
cmake --build "$DIR/build" --target echo_server echo_client golden_test ffi_test async_relay_test

# The service as a wasi reactor, which the TS package's tests run through ipc-runtime's wasm host
# (its asynchronous instances included). Exceptions are standard wasm exceptions, as in
# barretenberg's wasm builds; clang's post-link wasm-opt step is kept off PATH, since a binaryen
# found there may not read them.
mkdir -p "$DIR/build-wasm"
PATH=/usr/bin:/bin /opt/wasi-sdk/bin/clang++ --target=wasm32-wasip1 -std=c++20 -O2 \
  -fwasm-exceptions -mllvm -wasm-use-legacy-eh=false -mexec-model=reactor -Wl,--export-dynamic \
  -I"$DIR/src" -I"$DIR/src/generated" -I"$DIR/build/_deps/msgpack_c-src/include" \
  -I"$CODEGEN/../ipc-runtime/cpp" -DMSGPACK_NO_BOOST \
  "$DIR/src/echo_service.cpp" "$DIR/src/echo_handlers.cpp" \
  "$DIR/src/generated/echo_ffi.cpp" "$DIR/src/generated/echo_ffi_async.cpp" \
  -lunwind -o "$DIR/build-wasm/echo_cpp.wasm"
