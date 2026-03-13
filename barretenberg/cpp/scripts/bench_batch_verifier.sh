#!/usr/bin/env bash
# Benchmark the batch verifier service with realistic pinned IVC inputs.
#
# Usage:
#   ./scripts/bench_batch_verifier.sh               # Run locally
#   ./scripts/bench_batch_verifier.sh --remote       # Run on remote benchmark machine
#
# This script:
#   1. Downloads pinned IVC inputs from S3 (if not already cached)
#   2. Builds and runs chonk_bench with IVC_INPUTS_DIR pointing to the inputs
#   3. Filters to only run the BatchVerifyService benchmark
set -eu

cd "$(dirname "$0")/.."

# Pinned inputs config (kept in sync with test_chonk_standalone_vks_havent_changed.sh)
pinned_short_hash="b99f5b94"
pinned_url="https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol/bb-chonk-inputs-${pinned_short_hash}.tar.gz"
inputs_cache_dir="/tmp/bb-chonk-inputs-${pinned_short_hash}"

function download_inputs {
    local dest="$1"
    if [[ -d "$dest" ]] && ls "$dest"/*/ivc-inputs.msgpack &>/dev/null; then
        echo "Using cached pinned inputs at $dest"
        return
    fi
    echo "Downloading pinned IVC inputs (hash: $pinned_short_hash)..."
    mkdir -p "$dest"
    curl -s -f "$pinned_url" | tar -xz -C "$dest"
    echo "Inputs downloaded to $dest ($(ls "$dest" | wc -l) flows)"
}

PRESET=${PRESET:-clang20-no-avm}
BUILD_DIR=${BUILD_DIR:-build}
BENCHMARK=chonk_bench
FILTER="BatchVerify"

if [[ "${1:-}" == "--remote" ]]; then
    # Remote mode: build locally, download inputs on remote, run there
    cmake --preset "$PRESET"
    cmake --build --preset "$PRESET" --target "$BENCHMARK"

    source scripts/_benchmark_remote_lock.sh

    cd "$BUILD_DIR"
    scp $BB_SSH_KEY ./bin/$BENCHMARK "$BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/"

    # Download inputs on remote and run
    ssh $BB_SSH_KEY "$BB_SSH_INSTANCE" bash -c "'
        set -eu
        INPUTS_DIR=/tmp/bb-chonk-inputs-${pinned_short_hash}
        if [[ ! -d \$INPUTS_DIR ]] || ! ls \$INPUTS_DIR/*/ivc-inputs.msgpack &>/dev/null; then
            echo \"Downloading pinned inputs on remote...\"
            mkdir -p \$INPUTS_DIR
            curl -s -f \"${pinned_url}\" | tar -xz -C \$INPUTS_DIR
        fi
        cd $BB_SSH_CPP_PATH/build
        HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16} IVC_INPUTS_DIR=\$INPUTS_DIR ./chonk_bench --benchmark_filter=$FILTER
    '"
else
    # Local mode
    download_inputs "$inputs_cache_dir"

    cmake --preset "$PRESET"
    cmake --build --preset "$PRESET" --target "$BENCHMARK"

    cd "$BUILD_DIR"
    IVC_INPUTS_DIR="$inputs_cache_dir" ./bin/$BENCHMARK --benchmark_filter="$FILTER"
fi
