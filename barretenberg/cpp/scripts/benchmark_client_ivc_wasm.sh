#!/usr/bin/env bash
set -eu

TARGET="client_ivc_bench"
BENCHMARK_OUT=$TARGET
FILTER="ClientIVCBench/Full/6$"
BUILD_DIR=build-wasm-op-count-time

# Move above script dir.
cd $(dirname $0)/..

# Measure the benchmarks with ops time counting
./scripts/benchmark_wasm_remote.sh client_ivc_bench\
                                    "./client_ivc_bench --benchmark_filter=$FILTER\
                                                        --benchmark_out=../$TARGET.json\
                                                        --benchmark_out_format=json"\
                                                        wasm-op-count-time\
                                                        build-wasm-op-count-time

# Retrieve output from benching instance
cd $BUILD_DIR
scp $BB_SSH_KEY $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/$TARGET.json .

# Analyze the results
cd ../
python3 ./scripts/analyze_client_ivc_bench.py
