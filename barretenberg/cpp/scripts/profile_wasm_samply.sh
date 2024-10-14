# This is to be run locally not in a container, so the user must handle samply installation.
#!/usr/bin/env bash
set -eu

BENCHMARK=${1:-client_ivc_bench}
COMMAND=${2:-./bin/$BENCHMARK --benchmark_filter=ClientIVCBench/Full/6}
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}

# Move above script dir.
cd $(dirname $0)/..

# Configure and build.
cmake --preset wasm-threads -DCMAKE_MESSAGE_LOG_LEVEL=Warning
cmake --build --preset wasm-threads --target $BENCHMARK

cd build-wasm-threads
# Consistency with _wasm.sh targets / shorter $COMMAND.
cp ./bin/$BENCHMARK .
samply record wasmtime run --profile=perfmap --env HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY -Wthreads=y -Sthreads=y --dir=.. $COMMAND