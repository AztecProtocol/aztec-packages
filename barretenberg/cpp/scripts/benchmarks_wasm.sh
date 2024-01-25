#!/usr/bin/env bash
set -eu

# Move above script dir.
cd $(dirname $0)/..

# Configure and build.
cmake --preset wasm-bench
cmake --build --preset wasm-bench --target commit_bench --target goblin_bench

cd build-wasm-bench
# github markdown style, works in comments and descriptions
echo -e "<details><summary>Commit</summary>"
echo -e '\n```'
wasmtime run --wasm-features=threads --wasi-modules=experimental-wasi-threads ./bin/goblin_bench
echo -e '```\n'
echo -e "</details>"
echo -e '\n```'
