#!/bin/sh
(cd ./build-wasm/bin && gzip barretenberg.wasm -c > barretenberg.wasm.gz)
(cd ./build-wasm-threads/bin && gzip barretenberg.wasm -c > barretenberg.wasm.gz)
