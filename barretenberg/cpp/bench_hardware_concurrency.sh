#!/usr/bin/env bash

# Script to benchmark bb prove with different HARDWARE_CONCURRENCY values
# Usage: ./bench_hardware_concurrency.sh [concurrency_values...]
# Example: ./bench_hardware_concurrency.sh 1 2 4 8 16 32

REPO_ROOT=$(git rev-parse --show-toplevel)

# Use ci3 script base.
source $REPO_ROOT/ci3/source_bootstrap

# Base command - use absolute path from repo root
BASE_CMD="$REPO_ROOT/barretenberg/cpp/build-no-avm/bin/bb prove --scheme client_ivc --output_path /tmp --ivc_inputs_path $REPO_ROOT/yarn-project/end-to-end/example-app-ivc-inputs-out/ecdsar1+transfer_0_recursions+private_fpc/ivc-inputs.msgpack"

# Use provided arguments or default values
if [ $# -eq 0 ]; then
    CONCURRENCY_VALUES=(1 2 4 8 16 32)
else
    CONCURRENCY_VALUES=("$@")
fi

DISABLE_AZTEC_VM=1 barretenberg/cpp/bootstrap.sh

echo "Testing HARDWARE_CONCURRENCY values: ${CONCURRENCY_VALUES[@]}"

for concurrency in "${CONCURRENCY_VALUES[@]}"; do
    echo ""
    echo "Running with HARDWARE_CONCURRENCY=$concurrency"
    echo "---------------------------------------------"

    # Run the command with specified concurrency
    DENOISE=$DENOISE BB_BENCH=1 HARDWARE_CONCURRENCY=$concurrency denoise "$BASE_CMD"
    echo "============================================="
done

echo ""
echo "Benchmark complete!"
