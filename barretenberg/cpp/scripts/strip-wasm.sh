#!/bin/sh
cd build-wasm
if [ "$(cmake -L -N | grep CMAKE_BUILD_TYPE | cut -d '=' -f2)" = "Debug" ]; then
    echo "build-wasm is a debug build, keeping debug symbols"
else
    echo "build-wasm-threads is not debug build, stripping"
    ./src/wasi-sdk-20.0/bin/llvm-strip ./bin/barretenberg.wasm
fi
cd ../build-wasm-threads
if [ "$(cmake -L -N | grep CMAKE_BUILD_TYPE | cut -d '=' -f2)" = "Debug" ]; then
    echo "build-wasm-threads is a debug build, keeping debug symbols"
else
    echo "build-wasm-threads is not debug build, stripping"
    ./src/wasi-sdk-20.0/bin/llvm-strip ./bin/barretenberg.wasm
fi
