#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)"

"$CODEGEN/bin/ipc-codegen.mjs" \
  --schema "$DIR/../schema/schema.jsonc" \
  --lang rust \
  --server \
  --client \
  --ffi \
  --out "$DIR/src/generated"

# With the FFI exports, so the shared library is the one the TS package's napi transport loads.
(cd "$DIR" && cargo build --locked --quiet --features ffi)
# The generated FFI exports and the FFI client backend, linked into one crate: the
# client calls the service in-process (tests/ffi_roundtrip.rs).
(cd "$DIR" && cargo test --locked --quiet --features ffi)
# The same FFI exports as a wasi reactor, which is what the TS package's wasm
# transport runs. A cdylib on wasm32-wasip1 needs no linker flags of its own:
# the exported echo_ipc_ffi_* symbols are the whole contract.
(cd "$DIR" && cargo build --locked --quiet --lib --release \
  --target wasm32-wasip1 --no-default-features --features ffi)
