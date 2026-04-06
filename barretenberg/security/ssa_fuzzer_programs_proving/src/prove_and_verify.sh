#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd "$script_dir/.." && pwd)"
target_dir=$(mktemp -d)
trap 'rm -rf "$target_dir"' EXIT

bb_executable="${BB_EXECUTABLE_PATH:-/root/.bb/bb}"
path_to_program="${1:?missing path to program}"
path_to_witness="${2:?missing path to witness}"
test_name="${3:-$(basename "$path_to_program")}"
enable_solidity_verify="${ENABLE_SOLIDITY_VERIFY:-1}"
solidity_verifier_target="${SOLIDITY_VERIFIER_TARGET:-evm-no-zk}"
solidity_verifier_optimized="${SOLIDITY_VERIFIER_OPTIMIZED:-0}"

case "$solidity_verifier_target" in
    evm)
        has_zk="true"
        ;;
    evm-no-zk)
        has_zk="false"
        ;;
    *)
        echo "unsupported solidity verifier target: $solidity_verifier_target" >&2
        exit 1
        ;;
esac

bb_target_flags=(--verifier_target "$solidity_verifier_target")
solidity_verifier_flags=("${bb_target_flags[@]}")

if [[ "$solidity_verifier_optimized" == "1" ]]; then
    solidity_verifier_flags+=(--optimized)
fi

if ! "$bb_executable" write_vk -b "$path_to_program" -o "$target_dir" "${bb_target_flags[@]}"; then
    echo "bb write_vk failed for program: $path_to_program" >&2
    exit 1
fi

if ! "$bb_executable" prove -b "$path_to_program" -w "$path_to_witness" -k "$target_dir/vk" -o "$target_dir" "${bb_target_flags[@]}"; then
    echo "bb prove failed for program: $path_to_program" >&2
    exit 1
fi

if ! "$bb_executable" verify -k "$target_dir/vk" -p "$target_dir/proof" -i "$target_dir/public_inputs" "${bb_target_flags[@]}"; then
    echo "bb verify failed for program: $path_to_program" >&2
    exit 1
fi

if [[ "$enable_solidity_verify" == "1" ]]; then
    if ! "$bb_executable" write_solidity_verifier -k "$target_dir/vk" -o "$target_dir/Verifier.sol" "${solidity_verifier_flags[@]}"; then
        echo "bb write_solidity_verifier failed for program: $path_to_program" >&2
        exit 1
    fi

    if ! TEST_NAME="$test_name" \
        PROOF="$target_dir/proof" \
        PUBLIC_INPUTS="$target_dir/public_inputs" \
        VERIFIER_PATH="$target_dir/Verifier.sol" \
        HAS_ZK="$has_zk" \
        node "$project_dir/src/solidity_verify.mjs"; then
        echo "solidity verifier failed for program: $path_to_program" >&2
        exit 1
    fi
fi
