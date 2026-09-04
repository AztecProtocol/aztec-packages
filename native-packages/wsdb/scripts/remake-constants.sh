#!/usr/bin/env bash

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
codegen_dir="$repo_root/protocol/constants-codegen"
cpp_output="$repo_root/native-packages/wsdb/cpp/src/common/aztec_constants.hpp"
cpp_selection="$repo_root/native-packages/wsdb/scripts/constants-codegen/cpp.json"

# Write via temp file + rename: configures for several cmake presets can run concurrently,
# each regenerating this header.
tmp_dir=$(mktemp -d "$(dirname "$cpp_output")/.constants-gen.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT
tmp_output="$tmp_dir/aztec_constants.hpp"

"$codegen_dir/scripts/generate.sh" --cpp "$tmp_output" --selection "$cpp_selection"

mv "$tmp_output" "$cpp_output"
