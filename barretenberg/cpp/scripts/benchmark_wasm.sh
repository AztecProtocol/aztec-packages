#!/usr/bin/env bash
set -eu

BENCHMARK=${1:-chonk_bench}
COMMAND=${2:-./bin/$BENCHMARK --benchmark_filter=ChonkBench/Full/6}
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}

# Move above script dir.
cd $(dirname $0)/..

# Configure and build.
cmake --preset wasm-threads
cmake --build --preset wasm-threads --target $BENCHMARK

cd build-wasm-threads
# Consistency with _wasm.sh targets / shorter $COMMAND.
cp ./bin/$BENCHMARK ./bin/$BENCHMARK.js ./bin/$BENCHMARK.wasm . 2>/dev/null || cp ./bin/$BENCHMARK.js ./bin/$BENCHMARK.wasm .
HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY ../scripts/wasm-run --dir=.. $COMMAND