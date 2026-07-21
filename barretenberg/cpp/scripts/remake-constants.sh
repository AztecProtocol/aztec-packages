#!/usr/bin/env bash

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
codegen_dir="$repo_root/protocol/constants-codegen"
cpp_output="$repo_root/barretenberg/cpp/src/barretenberg/aztec/aztec_constants.hpp"

# Write via temp file + rename: configures for several cmake presets can run concurrently,
# each regenerating this header.
tmp_dir=$(mktemp -d "$(dirname "$cpp_output")/.constants-gen.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT
tmp_output="$tmp_dir/aztec_constants.hpp"

node "$codegen_dir/src/cli.ts" \
  --input "$repo_root/noir-projects/noir-protocol-circuits/crates/types/src/constants.nr" \
  --cpp "$tmp_output"

clang-format-20 --style="file:$repo_root/barretenberg/cpp/.clang-format" -i "$tmp_output"

mv "$tmp_output" "$cpp_output"
