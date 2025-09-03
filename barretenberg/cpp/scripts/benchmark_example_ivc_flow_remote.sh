#!/usr/bin/env bash
set -eu

TARGET=${1:-"bb"}
#FLOW=${2:-"ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc"}
#FLOW=${2:-"ecdsar1+transfer_1_recursions+private_fpc"}
#FLOW=${2:-"ecdsar1+transfer_1_recursions+sponsored_fpc"}
#FLOW=${2:-"ecdsar1+transfer_1_recursions+sponsored_fpc"}
FLOW=${2:-"schnorr+deploy_tokenContract_with_registration+sponsored_fpc"}
BUILD_DIR="build"

# Move above script dir.
cd $(dirname $0)/..

scp $BB_SSH_KEY ../../yarn-project/end-to-end/example-app-ivc-inputs-out/$FLOW/ivc-inputs.msgpack $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/

# Measure the benchmarks with ops time counting

./scripts/benchmark_remote.sh "$TARGET"\
                              "./$TARGET prove -o output --ivc_inputs_path ivc-inputs.msgpack --scheme client_ivc\
                              --print_bench"\
                              clang20\
                              "$BUILD_DIR"
