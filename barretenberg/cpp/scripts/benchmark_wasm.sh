#!/usr/bin/env bash
set -eu

BENCHMARK=${1:-goblin_bench}
COMMAND=${2:-./$BENCHMARK}
PRESET=${3:-wasm-threads}
BUILD_DIR=${4:-build-wasm-threads}
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}

# Move above script dir.
cd $(dirname $0)/..

# Configure and build.
cmake --preset $PRESET
cmake --build --preset $PRESET --target $BENCHMARK

cd $BUILD_DIR
# Consistency with _wasm.sh targets / shorter $COMMAND.
cp ./bin/$BENCHMARK .
wasmtime run --env HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY -Wthreads=y -Sthreads=y --dir=.. $COMMAND