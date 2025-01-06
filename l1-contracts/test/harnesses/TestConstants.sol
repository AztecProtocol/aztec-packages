// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.

pragma solidity >=0.8.27;

library TestConstants {
  uint256 internal constant ETHEREUM_SLOT_DURATION = 12;
  uint256 internal constant AZTEC_SLOT_DURATION = 24;
  uint256 internal constant AZTEC_EPOCH_DURATION = 16;
  uint256 internal constant AZTEC_TARGET_COMMITTEE_SIZE = 48;
  uint256 internal constant AZTEC_EPOCH_PROOF_CLAIM_WINDOW_IN_L2_SLOTS = 13;
  uint256 internal constant AZTEC_MINIMUM_STAKE = 100e18;
  uint256 internal constant AZTEC_SLASHING_QUORUM = 6;
  uint256 internal constant AZTEC_SLASHING_ROUND_SIZE = 10;
}
