#!/usr/bin/env bash

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
codegen_dir="$repo_root/protocol/constants-codegen"
additional_input="$repo_root/noir-projects/noir-protocol-circuits/crates/types/src/blob_data/tx_blob_data.nr:MAX_TX_BLOB_DATA_SIZE_IN_FIELDS"
typescript_output="$repo_root/yarn-project/constants/src/constants.gen.ts"

node "$codegen_dir/src/cli.ts" \
  --input "$repo_root/noir-projects/noir-protocol-circuits/crates/types/src/constants.nr" \
  --include "$additional_input" \
  --typescript "$typescript_output"
