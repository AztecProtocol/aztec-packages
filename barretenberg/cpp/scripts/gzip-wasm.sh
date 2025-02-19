#!/bin/sh
if [ -z "${NO_STRIP:-}" ]; then
  (cd ./build-wasm/bin && gzip barretenberg.wasm -c > barretenberg.wasm.gz)
  (cd ./build-wasm-threads/bin && gzip barretenberg.wasm -c > barretenberg.wasm.gz)
else
  (cd ./build-wasm/bin && gzip barretenberg-debug.wasm -c > barretenberg.wasm.gz)
  (cd ./build-wasm-threads/bin && gzip barretenberg-debug.wasm -c > barretenberg.wasm.gz)
fi
