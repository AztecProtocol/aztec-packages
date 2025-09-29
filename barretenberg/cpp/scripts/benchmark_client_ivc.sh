#!/usr/bin/env bash
set -eu

TARGET=${1:-"client_ivc_bench"}
BENCHMARK="ClientIVCBench/Full/5"
BUILD_DIR="build"
FILTER="${BENCHMARK}$" # '$' to ensure only specified bench is run

# Move above script dir.
cd $(dirname $0)/..

# Measure the benchmarks with ops time counting
./scripts/benchmark_remote.sh "$TARGET"\
                              "BB_BENCH=1 ./$TARGET --benchmark_filter=$FILTER\
                                         --benchmark_out=$TARGET.json\
                                         --benchmark_out_format=json"\
                              clang20\
                              "$BUILD_DIR"

# Retrieve output from benching instance
cd $BUILD_DIR
scp $BB_SSH_KEY $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/$TARGET.json .
