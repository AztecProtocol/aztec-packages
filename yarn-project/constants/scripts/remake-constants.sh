#!/usr/bin/env bash

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
typescript_output="$repo_root/yarn-project/constants/src/constants.gen.ts"

# Mimic the published package: embed the input snapshot as prepack would, then run the bin on its
# defaults. Once this package is consumed as a pinned npm dependency the embed step goes away.
"$repo_root/protocol/constants-codegen/scripts/embed-inputs.sh"
"$repo_root/yarn-project/node_modules/.bin/constants-codegen" --typescript "$typescript_output"
