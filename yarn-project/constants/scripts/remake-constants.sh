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
additional_input="$repo_root/noir-projects/noir-protocol-circuits/crates/types/src/blob_data/tx_blob_data.nr:MAX_TX_BLOB_DATA_SIZE_IN_FIELDS"
typescript_output="$repo_root/yarn-project/constants/src/constants.gen.ts"
cpp_output="$repo_root/barretenberg/cpp/src/barretenberg/aztec/aztec_constants.hpp"
pil_output="$repo_root/barretenberg/cpp/pil/vm2/constants_gen.pil"
solidity_output="$repo_root/l1-contracts/src/core/libraries/ConstantsGen.sol"

temp_dir=""
if [ "$check" -eq 1 ]; then
  temp_dir=$(mktemp -d)
  trap 'rm -rf "$temp_dir"' EXIT
  typescript_output="$temp_dir/constants.gen.ts"
  cpp_output="$temp_dir/aztec_constants.hpp"
  pil_output="$temp_dir/constants_gen.pil"
  solidity_output="$temp_dir/ConstantsGen.sol"
fi

node "$codegen_dir/src/cli.ts" \
  --input "$repo_root/noir-projects/noir-protocol-circuits/crates/types/src/constants.nr" \
  --include "$additional_input" \
  --typescript "$typescript_output" \
  --cpp "$cpp_output" \
  --pil "$pil_output" \
  --solidity "$solidity_output"

clang-format-20 --style="file:$repo_root/barretenberg/cpp/.clang-format" -i "$cpp_output"
(cd "$repo_root/l1-contracts" && forge fmt "$solidity_output")

if [ "$check" -eq 1 ]; then
  failed=0
  if ! diff -u "$repo_root/yarn-project/constants/src/constants.gen.ts" "$typescript_output"; then
    failed=1
  fi
  if ! diff -u "$repo_root/barretenberg/cpp/src/barretenberg/aztec/aztec_constants.hpp" "$cpp_output"; then
    failed=1
  fi
  if ! diff -u "$repo_root/barretenberg/cpp/pil/vm2/constants_gen.pil" "$pil_output"; then
    failed=1
  fi
  if ! diff -u "$repo_root/l1-contracts/src/core/libraries/ConstantsGen.sol" "$solidity_output"; then
    failed=1
  fi
  exit "$failed"
fi
