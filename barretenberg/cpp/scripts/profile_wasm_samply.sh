# This is to be run locally not in a container, so the user must handle samply installation.
#!/usr/bin/env bash
set -eu

BENCHMARK=${1:?usage: profile_wasm_samply.sh <bench_target> [command]}
COMMAND=${2:-./bin/$BENCHMARK}
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}

# Move above script dir.
cd $(dirname $0)/..

# Configure and build.
cmake --preset wasm-threads -DCMAKE_MESSAGE_LOG_LEVEL=Warning
cmake --build --preset wasm-threads --target $BENCHMARK

cd build-wasm-threads
# samply wraps the Node-driven wasm-run command. Emscripten's perfmap support
# is provided by the JS glue; samply attaches to the launched Node process.
HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY samply record ../scripts/wasm-run --dir=.. $COMMAND