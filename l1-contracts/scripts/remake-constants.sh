#!/usr/bin/env bash

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
codegen_dir="$repo_root/protocol/constants-codegen"
solidity_output="$repo_root/l1-contracts/src/core/libraries/ConstantsGen.sol"
solidity_selection="$repo_root/l1-contracts/scripts/constants-codegen/solidity.json"

"$codegen_dir/scripts/generate.sh" --solidity "$solidity_output" --selection "$solidity_selection"

(cd "$repo_root/l1-contracts" && forge fmt "$solidity_output")

# The archive root the tests deploy the rollup with: the one the checkpoint fixtures build on. Any field element would
# do, since L1 only checks that each checkpoint builds on the tip and the tests use a mock verifier, so it is taken
# from the fixtures rather than from the protocol's genesis, and the fixtures never need regenerating when that moves.
genesis_output="$repo_root/l1-contracts/test/harnesses/GenesisGen.sol"
archive_root=$(jq -re '.checkpoint.header.lastArchiveRoot' "$repo_root/l1-contracts/test/fixtures/empty_checkpoint_1.json")
cat >"$genesis_output" <<SOL
// GENERATED FILE - DO NOT EDIT. Generated from test/fixtures/empty_checkpoint_1.json by scripts/remake-constants.sh.
// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

/**
 * @title Genesis
 * @notice The archive root the checkpoint fixtures build on, which the tests deploy the rollup with.
 */
library Genesis {
  uint256 internal constant ARCHIVE_ROOT = $archive_root;
}
SOL
(cd "$repo_root/l1-contracts" && forge fmt "$genesis_output")
