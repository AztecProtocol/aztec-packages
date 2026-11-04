#!/usr/bin/env bash
set -eu

BENCHMARK=${1:?usage: benchmark_wasm.sh <bench_target> [command]}
COMMAND=${2:-./bin/$BENCHMARK}
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}

# Move above script dir.
cd $(dirname $0)/..

# Configure and build.
# BB_BENCH op counts are compiled out of wasm by default; add -DENABLE_WASM_BENCH=ON here if you
# need them (timings are unaffected either way).
cmake --preset wasm-threads
cmake --build --preset wasm-threads --target $BENCHMARK

cd build-wasm-threads
# Consistency with _wasm.sh targets / shorter $COMMAND.
cp ./bin/$BENCHMARK .
# Wasmtime 46 needs shared memory enabled explicitly. Older wasmtimes don't know the option.
shared_memory=$(wasmtime run -W help 2>&1 | grep -q shared-memory && echo -Wshared-memory=y || true)
wasmtime run --env HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY -Wthreads=y $shared_memory -Sthreads=y --dir=.. $COMMAND