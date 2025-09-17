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
    21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617;

  uint256 internal constant MAX_FIELD_VALUE =
    21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_616;
  uint256 internal constant L1_TO_L2_MSG_SUBTREE_HEIGHT = 4;
  uint256 internal constant MAX_L2_TO_L1_MSGS_PER_TX = 8;
  uint256 internal constant INITIAL_L2_BLOCK_NUM = 1;
  uint256 internal constant BLOBS_PER_BLOCK = 3;
  uint256 internal constant AZTEC_MAX_EPOCH_DURATION = 48;
  uint256 internal constant GENESIS_ARCHIVE_ROOT =
    19_162_035_140_838_596_506_349_442_774_820_653_374_703_500_378_808_526_655_220_525_977_359_188_446_398;
  uint256 internal constant FEE_JUICE_ADDRESS = 5;
  uint256 internal constant BLS12_POINT_COMPRESSED_BYTES = 48;
  uint256 internal constant PROPOSED_BLOCK_HEADER_LENGTH_BYTES = 284;
  uint256 internal constant ROOT_ROLLUP_PUBLIC_INPUTS_LENGTH = 158;
  uint256 internal constant NUM_MSGS_PER_BASE_PARITY = 4;
  uint256 internal constant NUM_BASE_PARITY_PER_ROOT_PARITY = 4;
}
