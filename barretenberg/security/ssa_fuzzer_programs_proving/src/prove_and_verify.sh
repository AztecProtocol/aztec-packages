#!/usr/bin/env bash

set -euo pipefail

target_dir=$(mktemp -d)
trap 'rm -rf "$target_dir"' EXIT

bb_executable="${BB_EXECUTABLE_PATH:-/root/.bb/bb}"
path_to_program="${1:?missing path to program}"
path_to_witness="${2:?missing path to witness}"

if ! "$bb_executable" write_vk -b "$path_to_program" -o "$target_dir"; then
    echo "bb write_vk failed for program: $path_to_program" >&2
    exit 1
fi

if ! "$bb_executable" prove -b "$path_to_program" -w "$path_to_witness" -k "$target_dir/vk" -o "$target_dir"; then
    echo "bb prove failed for program: $path_to_program" >&2
    exit 1
fi

if ! "$bb_executable" verify -k "$target_dir/vk" -p "$target_dir/proof" -i "$target_dir/public_inputs"; then
    echo "bb verify failed for program: $path_to_program" >&2
    exit 1
fi
