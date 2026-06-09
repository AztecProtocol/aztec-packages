#!/usr/bin/env bash
# This script automates the process of benchmarking WASM on a remote EC2 instance.
# Prerequisites:
# 1. Define the following environment variables:
#    - BB_SSH_KEY: SSH key for EC2 instance, e.g., '-i key.pem'
#    - BB_SSH_INSTANCE: EC2 instance URL
#    - BB_SSH_CPP_PATH: Path to barretenberg/cpp in a cloned repository on the EC2 instance
set -eu

BENCHMARK=${1:-goblin_bench}
COMMAND=${2:-./$BENCHMARK}
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}

# ENABLE_WASM_BENCH=1 compiles the BB_BENCH per-stage instrumentation into the wasm build
# (off by default so plain runs carry no instrumentation overhead). Pair with BB_BENCH=1 at
# runtime for the Stage1..Stage7 hierarchical breakdown. Dev-only.
cmake_extra=()
if [ "${ENABLE_WASM_BENCH:-0}" != "0" ]; then
  cmake_extra+=(-DENABLE_WASM_BENCH=ON)
fi

# Move above script dir.
cd $(dirname $0)/..

# Configure and build.
cmake --preset wasm-threads "${cmake_extra[@]}"
cmake --build --preset wasm-threads --target $BENCHMARK

source scripts/_benchmark_remote_lock.sh

cd build-wasm-threads
# ensure folder structure
ssh $BB_SSH_KEY $BB_SSH_INSTANCE "mkdir -p $BB_SSH_CPP_PATH/build-wasm-threads"
# copy build wasm threads
scp $BB_SSH_KEY ./bin/$BENCHMARK $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build-wasm-threads
# run wasm benchmarking
ssh $BB_SSH_KEY $BB_SSH_INSTANCE \
  "cd $BB_SSH_CPP_PATH/build-wasm-threads ; /home/ubuntu/.wasmtime/bin/wasmtime run --env HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY --env BB_BENCH=${BB_BENCH:-} --env HOME -Wthreads=y -Wshared-memory=y -Sthreads=y --dir=\$HOME/.bb-crs --dir=.. $COMMAND"
