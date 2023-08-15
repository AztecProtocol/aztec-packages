#!/bin/bash

# This script is used to compare the results of honk_bench between baseline (master) and
# the branch from which the script is run. Simply check out the branch of interest, ensure 
# it is up to date with local master, and run the script.

echo -e '\nComparing Native and Simulator execution.'
# Set some directories
BASE_DIR="$HOME/aztec-packages/circuits/cpp/barretenberg/cpp"
BUILD_DIR="$BASE_DIR/build-bench"
BENCH_RESULTS_DIR="$BASE_DIR/tmp_bench_results"
BENCH_TOOLS_DIR="$BUILD_DIR/_deps/benchmark-src/tools"

# Install requirements (numpy + scipy) for comparison script if necessary.
# Note: By default, installation will occur in $HOME/.local/bin.
pip3 install --user scipy==1.5.4

# Create temporary directory for honk_bench results (json)
cd $BASE_DIR
mkdir $BENCH_RESULTS_DIR

# Build and run the benchmarks 
echo -e '\nBuilding native benchmarks.'
cmake --preset bench > /dev/null && cmake --build --preset bench --target native_bench
cd build-bench
NATIVE_BENCH_RESULTS="$BENCH_RESULTS_DIR/native_bench.json"
echo -e '\nRunning native benchmarks.'
./bin/native_bench --benchmark_format=json > $NATIVE_BENCH_RESULTS

echo -e '\nBuilding simulator benchmarks.'
cd ..
cmake --preset bench > /dev/null && cmake --build --preset bench --target simulator_bench
cd build-bench
SIMULATOR_BENCH_RESULTS="$BENCH_RESULTS_DIR/simulator_bench.json"
echo -e '\nRunning simulator benchmarks.'
./bin/simulator_bench --benchmark_format=json > $SIMULATOR_BENCH_RESULTS

# Call compare.py on the results (json) to get high level statistics. 
# See docs at https://github.com/google/benchmark/blob/main/docs/tools.md for more details.
$BENCH_TOOLS_DIR/compare.py benchmarks $NATIVE_BENCH_RESULTS $SIMULATOR_BENCH_RESULTS

# Delete the temporary results directory and its contents
rm -r $BENCH_RESULTS_DIR