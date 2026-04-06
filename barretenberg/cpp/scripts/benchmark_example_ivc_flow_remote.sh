#!/usr/bin/env bash
# Benchmark a real IVC flow on the remote EC2 instance.
# Compares pipelined vs baseline circuit construction.
#
# Usage:
#   ./benchmark_example_ivc_flow_remote.sh [TARGET] [FLOW]
#
# Prerequisites: BB_SSH_KEY, BB_SSH_INSTANCE, BB_SSH_CPP_PATH env vars.
# Also requires inputs at yarn-project/end-to-end/example-app-ivc-inputs-out/$FLOW/
# (run barretenberg/cpp/scripts/test_chonk_standalone_vks_havent_changed.sh --download_pinned_inputs first)
set -eu

TARGET=${1:-"bb"}
FLOW=${2:-"ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc"}
BUILD_DIR="build"
INPUTS_DIR="../../yarn-project/end-to-end/example-app-ivc-inputs-out"

# Move above script dir.
cd $(dirname $0)/..

# Upload inputs
scp $BB_SSH_KEY $INPUTS_DIR/$FLOW/ivc-inputs.msgpack $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/

BB_CMD="./$TARGET prove -o output --ivc_inputs_path ivc-inputs.msgpack --scheme chonk -v"

# Measure the benchmarks: baseline then pipelined, 3 runs each
./scripts/benchmark_remote.sh "$TARGET"\
                              "echo '=== BASELINE ===' && for i in 1 2 3; do NO_PIPELINE=1 /usr/bin/time -f 'baseline wall=%es' $BB_CMD 2>&1 | grep -E 'wall='; done && echo '=== PIPELINED ===' && for i in 1 2 3; do /usr/bin/time -f 'pipelined wall=%es' $BB_CMD 2>&1 | grep -E 'wall='; done"\
                              clang20-no-avm\
                              "$BUILD_DIR"
