#!/bin/sh
/opt/wasi-sdk/bin/llvm-strip ./build-wasm/bin/barretenberg.wasm
/opt/wasi-sdk/bin/llvm-strip ./build-wasm-threads/bin/barretenberg.wasm
