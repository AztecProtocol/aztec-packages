#!/usr/bin/env bash

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
types_dir="$repo_root/noir-projects/noir-protocol-circuits/crates/types/src"
typescript_output="$repo_root/yarn-project/constants/src/constants.gen.ts"

"$repo_root/yarn-project/node_modules/.bin/constants-codegen" \
  --input "$types_dir/constants.nr" \
  --typescript "$typescript_output"
