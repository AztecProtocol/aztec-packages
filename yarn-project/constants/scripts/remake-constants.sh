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

temp_dir=""
if [ "$check" -eq 1 ]; then
  temp_dir=$(mktemp -d)
  trap 'rm -rf "$temp_dir"' EXIT
  typescript_output="$temp_dir/constants.gen.ts"
fi

node "$codegen_dir/src/cli.ts" \
  --input "$repo_root/noir-projects/noir-protocol-circuits/crates/types/src/constants.nr" \
  --include "$additional_input" \
  --typescript "$typescript_output"

if [ "$check" -eq 1 ]; then
  diff -u "$repo_root/yarn-project/constants/src/constants.gen.ts" "$typescript_output"
fi
