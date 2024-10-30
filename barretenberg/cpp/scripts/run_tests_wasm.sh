#!/usr/bin/env bash
set -eu

TEST_SUITE=${1:-transcript_tests}
COMMAND=${2:-./bin/$TEST_SUITE}
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}

# Move above script dir.
cd $(dirname $0)/..

# Configure and build.
cmake --preset wasm-threads
cmake --build --preset wasm-threads --target $TEST_SUITE

cd build-wasm-threads
# Consistency with _wasm.sh targets / shorter $COMMAND.
cp ./bin/$TEST_SUITE .
wasmtime run --env HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY -Wthreads=y -Sthreads=y --dir=.. $COMMAND