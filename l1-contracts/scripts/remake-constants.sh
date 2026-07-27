#!/usr/bin/env bash

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
codegen_dir="$repo_root/protocol/constants-codegen"
solidity_output="$repo_root/l1-contracts/src/core/libraries/ConstantsGen.sol"
solidity_selection="$repo_root/l1-contracts/scripts/constants-codegen/solidity.json"

node "$codegen_dir/src/cli.ts" --solidity "$solidity_output" --selection "$solidity_selection"

(cd "$repo_root/l1-contracts" && forge fmt "$solidity_output")
