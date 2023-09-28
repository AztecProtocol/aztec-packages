#!/bin/sh
set -eu

# Build the wasms and strip debug symbols.
cd ../cpp
cmake --preset wasm-threads && cmake --build --preset wasm-threads
cmake --preset wasm && cmake --build --preset wasm
./scripts/strip-wasm.sh

# Copy the wasm to its home in the bb.js dest folder.
# We only need the threads wasm, as node always uses threads.
# When building the the browser bundle, both wasms are inlined directly
mkdir -p ../ts/dest
cp build-wasm-threads/bin/barretenberg.wasm ../ts/dest/barretenberg-threads.wasm

# Make symlinks to point to this file from location fetchCode reads from.
cd ../ts/dest
mkdir -p ./node/barretenberg_wasm
mkdir -p ./node-cjs/barretenberg_wasm
ln -s ../../barretenberg-threads.wasm ./node/barretenberg_wasm/barretenberg-threads.wasm
ln -s ../../barretenberg-threads.wasm ./node-cjs/barretenberg_wasm/barretenberg-threads.wasm