#!/usr/bin/env bash
set -eu

TARGET=${1:-"client_ivc_bench"}
BENCHMARK="ClientIVCBench/Full/6"
BUILD_DIR="build-op-count-time"
FILTER="${BENCHMARK}$" # '$' to ensure only specified bench is run

# Move above script dir.
cd $(dirname $0)/..

# Measure the benchmarks with ops time counting
./scripts/benchmark_remote.sh "$TARGET"\
                              "./$TARGET --benchmark_filter=$FILTER\
                                         --benchmark_out=$TARGET.json\
                                         --benchmark_out_format=json"\
                              op-count-time\
                              "$BUILD_DIR"

# Retrieve output from benching instance
cd $BUILD_DIR
scp $BB_SSH_KEY $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/$TARGET.json .

# Analyze the results
cd ../
python3 ./scripts/analyze_client_ivc_bench.py --json "$TARGET.json" --benchmark "$BENCHMARK" --prefix "$BUILD_DIR"
