#!/bin/sh
set -eu
# move above script folder
cd $(dirname $0)/..
# TODO(AD): revisit whether we need to strip at all or if there's a better release flag
if [ "$(cmake -L -N -Bbuild-wasm | grep CMAKE_BUILD_TYPE | cut -d '=' -f2)" = "Debug" ]; then
    echo "build-wasm is a debug build, keeping debug symbols"
else
    echo "build-wasm-threads is not debug build, stripping"
    ./src/wasi-sdk-20.0/bin/llvm-strip ./build-wasm/bin/barretenberg.wasm
fi
if [ "$(cmake -L -N -Bbuild-wasm-threads | grep CMAKE_BUILD_TYPE | cut -d '=' -f2)" = "Debug" ]; then
    echo "build-wasm-threads is a debug build, keeping debug symbols"
else
    echo "build-wasm-threads is not debug build, stripping"
    ./src/wasi-sdk-20.0/bin/llvm-strip ./build-wasm-threads/bin/barretenberg.wasm
fi
