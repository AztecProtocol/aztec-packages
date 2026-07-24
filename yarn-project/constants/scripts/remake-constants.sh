#!/usr/bin/env bash

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
typescript_output="$repo_root/yarn-project/constants/src/constants.gen.ts"

# The bin reads the inputs embedded when @aztec/constants-codegen was built; rebuilding the
# package (make constants-codegen) picks up constants.nr changes.
"$repo_root/yarn-project/node_modules/.bin/constants-codegen" --typescript "$typescript_output"
