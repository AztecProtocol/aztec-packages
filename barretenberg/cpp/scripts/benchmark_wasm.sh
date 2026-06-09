#!/usr/bin/env bash
set -eu

BENCHMARK=${1:?usage: benchmark_wasm.sh <bench_target> [command]}
COMMAND=${2:-./bin/$BENCHMARK}
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}

# ENABLE_WASM_BENCH=1 compiles the BB_BENCH per-stage instrumentation into the wasm build
# (off by default so plain wall-clock runs carry no instrumentation overhead). Pair it with
# BB_BENCH=1 at runtime to get the Stage1..Stage7 hierarchical breakdown. Dev-only.
cmake_extra=()
if [ "${ENABLE_WASM_BENCH:-0}" != "0" ]; then
  cmake_extra+=(-DENABLE_WASM_BENCH=ON)
fi

# Move above script dir.
cd $(dirname $0)/..

# Configure and build.
cmake --preset wasm-threads "${cmake_extra[@]}"
cmake --build --preset wasm-threads --target $BENCHMARK

cd build-wasm-threads
# Consistency with _wasm.sh targets / shorter $COMMAND.
cp ./bin/$BENCHMARK .
# Forward BB_BENCH so the in-wasm reporter prints the per-stage breakdown when requested.
wasmtime run --env HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY --env BB_BENCH=${BB_BENCH:-} \
  -Wthreads=y -Sthreads=y --dir=.. $COMMAND