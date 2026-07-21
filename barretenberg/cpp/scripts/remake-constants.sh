#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -gt 1 ]; then
  echo "Usage: $0 [--check]" >&2
  exit 1
fi

check=0
case "${1:-}" in
  "") ;;
  --check) check=1 ;;
  *)
    echo "Usage: $0 [--check]" >&2
    exit 1
    ;;
esac

repo_root=$(git rev-parse --show-toplevel)
codegen_dir="$repo_root/protocol/constants-codegen"
cpp_output="$repo_root/barretenberg/cpp/src/barretenberg/aztec/aztec_constants.hpp"

temp_dir=""
if [ "$check" -eq 1 ]; then
  temp_dir=$(mktemp -d)
  trap 'rm -rf "$temp_dir"' EXIT
  cpp_output="$temp_dir/aztec_constants.hpp"
fi

node "$codegen_dir/src/cli.ts" \
  --input "$repo_root/noir-projects/noir-protocol-circuits/crates/types/src/constants.nr" \
  --cpp "$cpp_output"

clang-format-20 --style="file:$repo_root/barretenberg/cpp/.clang-format" -i "$cpp_output"

if [ "$check" -eq 1 ]; then
  diff -u "$repo_root/barretenberg/cpp/src/barretenberg/aztec/aztec_constants.hpp" "$cpp_output"
fi
