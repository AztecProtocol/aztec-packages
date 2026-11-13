#!/usr/bin/env bash

set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
codegen_dir="$repo_root/protocol/constants-codegen"
solidity_output="$repo_root/l1-contracts/src/core/libraries/ConstantsGen.sol"
solidity_selection="$repo_root/l1-contracts/scripts/constants-codegen/solidity.json"

"$codegen_dir/scripts/generate.sh" --solidity "$solidity_output" --selection "$solidity_selection"

(cd "$repo_root/l1-contracts" && forge fmt "$solidity_output")

# The tests' genesis archive root, from the protocol-genesis package. It is not a protocol constant: it belongs to a
# protocol release's contracts, which are built after these.
genesis_output="$repo_root/l1-contracts/test/harnesses/GenesisGen.sol"
archive_root=$(jq -re '.outputs.archiveRoot' "$repo_root/protocol/genesis/genesis.json")
cat >"$genesis_output" <<SOL
// GENERATED FILE - DO NOT EDIT. Generated from protocol/genesis/genesis.json by scripts/remake-constants.sh.
// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

/**
 * @title Genesis
 * @notice The canonical genesis archive root, as the checkpoint fixtures start from it.
 */
library Genesis {
  uint256 internal constant ARCHIVE_ROOT = $archive_root;
}
SOL
(cd "$repo_root/l1-contracts" && forge fmt "$genesis_output")
