#!/usr/bin/env bash
set -eu

BENCHMARK=${1:-commit_bench}

# Move above script dir.
cd $(dirname $0)/..

# Configure and build.
cmake --preset wasm-bench
cmake --build --preset wasm-bench --target $BENCHMARK

cd build-wasm-bench
scp $BB_SSH_KEY ./bin/commit_bench $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build-wasm-bench
ssh $BB_SSH_KEY $BB_SSH_INSTANCE \
  "cd $BB_SSH_SCP_PATH/build-wasm-bench ; /home/ubuntu/.wasmtime/bin/wasmtime run -Wthreads=y -Sthreads=y ./bin/commit_bench"
