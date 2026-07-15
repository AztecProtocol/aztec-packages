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
solidity_output="$repo_root/l1-contracts/src/core/libraries/ConstantsGen.sol"

temp_dir=""
if [ "$check" -eq 1 ]; then
  temp_dir=$(mktemp -d)
  trap 'rm -rf "$temp_dir"' EXIT
  solidity_output="$temp_dir/ConstantsGen.sol"
fi

if [ "$check" -eq 0 ]; then
  (cd "$codegen_dir" && yarn install --immutable && yarn build)
elif [ ! -f "$codegen_dir/dest/cli.js" ]; then
  echo "constants-codegen must be built before running --check" >&2
  exit 1
fi

node "$codegen_dir/dest/cli.js" \
  --input "$repo_root/noir-projects/noir-protocol-circuits/crates/types/src/constants.nr" \
  --solidity "$solidity_output"

(cd "$repo_root/l1-contracts" && forge fmt "$solidity_output")

if [ "$check" -eq 1 ]; then
  diff -u "$repo_root/l1-contracts/src/core/libraries/ConstantsGen.sol" "$solidity_output"
fi
