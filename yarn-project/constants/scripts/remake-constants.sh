#!/usr/bin/env bash

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
additional_input="$repo_root/noir-projects/noir-protocol-circuits/crates/types/src/blob_data/tx_blob_data.nr:MAX_TX_BLOB_DATA_SIZE_IN_FIELDS"
typescript_output="$repo_root/yarn-project/constants/src/constants.gen.ts"

"$repo_root/yarn-project/node_modules/.bin/constants-codegen" \
  --include "$additional_input" \
  --typescript "$typescript_output"
