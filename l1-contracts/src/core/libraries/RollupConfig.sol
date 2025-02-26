// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.

pragma solidity >=0.8.27;

library RollupConfig {
  uint256 internal constant DEFAULT_ETHEREUM_SLOT_DURATION = 12;
  uint256 internal constant DEFAULT_AZTEC_SLOT_DURATION = 24;
  uint256 internal constant DEFAULT_AZTEC_EPOCH_DURATION = 16;
  uint256 internal constant DEFAULT_AZTEC_TARGET_COMMITTEE_SIZE = 48;
  uint256 internal constant DEFAULT_AZTEC_PROOF_SUBMISSION_WINDOW = DEFAULT_AZTEC_EPOCH_DURATION * 2 - 1;
  uint256 internal constant DEFAULT_AZTEC_MINIMUM_STAKE = 100e18;
  uint256 internal constant DEFAULT_AZTEC_SLASHING_QUORUM = 6;
  uint256 internal constant DEFAULT_AZTEC_SLASHING_ROUND_SIZE = 10;
}
