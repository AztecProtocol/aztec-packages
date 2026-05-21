#!/usr/bin/env bash
set -eu

REPO_ROOT=$(git rev-parse --show-toplevel)
NO_CD=1 source "$REPO_ROOT/ci3/source"
source "$REPO_ROOT/barretenberg/cpp/scripts/pinned_chonk_inputs.sh"

TARGET=${1:-"bb"}
#FLOW=${2:-"ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc"}
#FLOW=${2:-"ecdsar1+transfer_1_recursions+private_fpc"}
#FLOW=${2:-"ecdsar1+transfer_1_recursions+sponsored_fpc"}
#FLOW=${2:-"ecdsar1+transfer_1_recursions+sponsored_fpc"}
FLOW=${2:-"schnorr+deploy_tokenContract_with_registration+sponsored_fpc"}
BUILD_DIR="build-no-avm"
INPUT_PATH="$(pinned_chonk_inputs_dir)/$FLOW/ivc-inputs.msgpack"

ensure_pinned_chonk_inputs "$(pinned_chonk_inputs_dir)"

cd "$REPO_ROOT/barretenberg/cpp"

scp $BB_SSH_KEY "$INPUT_PATH" $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/

# Measure the benchmarks with ops time counting

./scripts/benchmark_remote.sh "$TARGET"\
                              "./$TARGET prove -o output --ivc_inputs_path ivc-inputs.msgpack --scheme chonk\
                              --print_bench"\
                              clang20-no-avm\
                              "$BUILD_DIR"
