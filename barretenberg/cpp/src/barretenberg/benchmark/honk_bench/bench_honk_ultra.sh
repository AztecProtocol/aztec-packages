#!/bin/bash

# This script is used to compare the results of honk_bench between baseline (master) and
# the branch from which the script is run. Simply check out the branch of interest, ensure 
# it is up to date with local master, and run the script.

echo -e '\nBenchmarking UltraHonk'
# Set some directories
BASE_DIR="$HOME/aztec-packages/barretenberg/cpp"
BUILD_DIR="$BASE_DIR/build-bench"
BENCH_RESULTS_DIR="$BASE_DIR/tmp_bench_results"
BENCH_TOOLS_DIR="$BUILD_DIR/_deps/benchmark-src/tools"

# Install requirements (numpy + scipy) for comparison script if necessary.
# Note: By default, installation will occur in $HOME/.local/bin.
pip3 install --user -r $BUILD_DIR/_deps/benchmark-src/requirements.txt

# Create temporary directory for honk_bench results (json)
cd $BASE_DIR
mkdir $BENCH_RESULTS_DIR

# 
echo -e '\nBuilding and running UltraHonk benchmarks..'
cmake --preset bench -DMULTITHREADING=1 > /dev/null && cmake --build --preset bench --target ultra_honk_bench
cd build-bench
HONK_BENCH_RESULTS="$BENCH_RESULTS_DIR/honk_bench.json"
HONK_BENCH_DEBUG_RESULTS="$BENCH_RESULTS_DIR/honk_bench.txt"

./bin/ultra_honk_bench --benchmark_format=json > $HONK_BENCH_RESULTS 2> $HONK_BENCH_DEBUG_RESULTS