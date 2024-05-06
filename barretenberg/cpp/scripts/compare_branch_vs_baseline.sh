#!/usr/bin/env bash

# This script is used to compare a suite of benchmarks between baseline (default: master) and
# the branch from which the script is run. Simply check out the branch of interest, ensure
# it is up to date with local master, and run the script.

# Specify the benchmark suite and the "baseline" branch against which to compare
BENCHMARK=${1:?"Please provide the name of a benchmark target."}
COMMAND=${2:-./$BENCHMARK}
BASELINE_BRANCH="master"


echo -e "\nComparing $BENCHMARK between $BASELINE_BRANCH and current branch:"
# Set some directories
BASE_DIR="$HOME/aztec-packages/barretenberg/cpp"
BUILD_DIR="$BASE_DIR/build-bench" # matches build dir specified in bench preset
BENCH_RESULTS_DIR="$BASE_DIR/tmp_bench_results"
BENCH_TOOLS_DIR="$BUILD_DIR/_deps/benchmark-src/tools"

# Install requirements (numpy + scipy) for comparison script if necessary.
# Note: By default, installation will occur in $HOME/.local/bin.
pip3 install --user -r $BUILD_DIR/_deps/benchmark-src/requirements.txt

# Create temporary directory for benchmark results (json)
cd $BASE_DIR
mkdir $BENCH_RESULTS_DIR

# Build and run bench in current branch
echo -e "\nConfiguring and building $BENCHMARK in current feature branch..\n"
# rm -rf $BUILD_DIR
cmake --preset bench > /dev/null && cmake --build --preset bench --target $BENCHMARK
cd build-bench
BRANCH_RESULTS="$BENCH_RESULTS_DIR/results_branch.json"
echo -e "\nRunning $COMMAND in feature branch.."
bin/$COMMAND --benchmark_format=json > $BRANCH_RESULTS

# Checkout baseline branch, run benchmarks, save results in json format
echo -e "\nConfiguring and building $BENCHMARK in $BASELINE_BRANCH branch..\n"
git checkout master > /dev/null
cd $BASE_DIR
rm -rf $BUILD_DIR
cmake --preset bench > /dev/null && cmake --build --preset bench --target $BENCHMARK
cd build-bench
BASELINE_RESULTS="$BENCH_RESULTS_DIR/results_baseline.json"
echo -e "\nRunning $COMMAND in master.."
bin/$COMMAND --benchmark_format=json > $BASELINE_RESULTS

# Call compare.py on the results (json) to get high level statistics.
# See docs at https://github.com/google/benchmark/blob/main/docs/tools.md for more details.
$BENCH_TOOLS_DIR/compare.py benchmarks $BASELINE_RESULTS $BRANCH_RESULTS

# Return to branch from which the script was called
git checkout -

# Delete the temporary results directory and its contents
rm -r $BENCH_RESULTS_DIR
