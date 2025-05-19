// GENERATED FILE - DO NOT EDIT, RUN yarn remake-constants in yarn-project/constants
// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.27;

/**
 * @title Constants Library
 * @author Aztec Labs
 * @notice Library that contains constants used throughout the Aztec protocol
 */
library Constants {
  // Prime field modulus
  uint256 internal constant P =
    21888242871839275222246405745257275088548364400416034343698204186575808495617;

  uint256 internal constant MAX_FIELD_VALUE =
    21888242871839275222246405745257275088548364400416034343698204186575808495616;
  uint256 internal constant L1_TO_L2_MSG_SUBTREE_HEIGHT = 4;
  uint256 internal constant MAX_L2_TO_L1_MSGS_PER_TX = 8;
  uint256 internal constant INITIAL_L2_BLOCK_NUM = 1;
  uint256 internal constant BLOBS_PER_BLOCK = 3;
  uint256 internal constant AZTEC_MAX_EPOCH_DURATION = 48;
  uint256 internal constant GENESIS_ARCHIVE_ROOT =
    1002640778211850180189505934749257244705296832326768971348723156503780793518;
  uint256 internal constant FEE_JUICE_ADDRESS = 5;
  uint256 internal constant BLOB_PUBLIC_INPUTS = 6;
  uint256 internal constant BLOB_PUBLIC_INPUTS_BYTES = 112;
  uint256 internal constant PROPOSED_BLOCK_HEADER_LENGTH_BYTES = 348;
  uint256 internal constant ROOT_ROLLUP_PUBLIC_INPUTS_LENGTH = 1020;
  uint256 internal constant NUM_MSGS_PER_BASE_PARITY = 4;
  uint256 internal constant NUM_BASE_PARITY_PER_ROOT_PARITY = 4;
}
