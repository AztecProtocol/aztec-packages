#!/usr/bin/env bash

set -euo pipefail

target_dir=$(mktemp -d)
trap 'rm -rf "$target_dir"' EXIT

bb_executable="${BB_EXECUTABLE_PATH:-/home/sarkoxed/.secret/aztec-packages/barretenberg/cpp/build-coverage/bin/bb}"
coverage_dir="${BB_COVERAGE_DIR:-/home/sarkoxed/.secret/aztec-packages/barretenberg/cpp/build-coverage/profiles}"
coverage_run_id="${BB_COVERAGE_RUN_ID:-$(tr -d '-' < /proc/sys/kernel/random/uuid)}"
path_to_program="${1:?missing path to program}"
path_to_witness="${2:?missing path to witness}"

mkdir -p "$coverage_dir"

run_bb() {
    local step="${1:?missing coverage step}"
    shift
    local coverage_file="${coverage_dir}/${coverage_run_id}_${step}_%p.profraw"

    LLVM_PROFILE_FILE="$coverage_file" "$bb_executable" "$@"
}

if ! run_bb write_vk write_vk -b "$path_to_program" -o "$target_dir"; then
    echo "bb write_vk failed for program: $path_to_program" >&2
    exit 1
fi

if ! run_bb prove prove -b "$path_to_program" -w "$path_to_witness" -k "$target_dir/vk" -o "$target_dir"; then
    echo "bb prove failed for program: $path_to_program" >&2
    exit 1
fi

if ! run_bb verify verify -k "$target_dir/vk" -p "$target_dir/proof" -i "$target_dir/public_inputs"; then
    echo "bb verify failed for program: $path_to_program" >&2
    exit 1
fi
