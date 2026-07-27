#!/usr/bin/env bash

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
codegen_dir="$repo_root/protocol/constants-codegen"
solidity_output="$repo_root/l1-contracts/src/core/libraries/ConstantsGen.sol"

node "$codegen_dir/src/cli.ts" --solidity "$solidity_output"

(cd "$repo_root/l1-contracts" && forge fmt "$solidity_output")
