#!/bin/sh
(cd ./build-wasm/bin && gzip barretenberg.wasm -c > barretenberg.wasm.gz)
(cd ./build-wasm-threads-assert/bin && gzip barretenberg.wasm -c > barretenberg.wasm.gz)
