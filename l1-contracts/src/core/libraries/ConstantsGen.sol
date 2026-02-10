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
  uint256 internal constant L1_TO_L2_MSG_SUBTREE_HEIGHT = 10;
  uint256 internal constant MAX_L2_TO_L1_MSGS_PER_TX = 8;
  uint256 internal constant INITIAL_CHECKPOINT_NUMBER = 1;
  uint256 internal constant MAX_CHECKPOINTS_PER_EPOCH = 32;
  uint256 internal constant GENESIS_ARCHIVE_ROOT =
    9_682_850_228_538_071_369_704_502_076_456_077_473_410_427_336_083_826_595_120_404_283_897_422_804_423;
  uint256 internal constant EMPTY_EPOCH_OUT_HASH =
    355_785_372_471_781_095_838_790_036_702_437_931_769_306_153_278_986_832_745_847_530_947_941_691_539;
  uint256 internal constant FEE_JUICE_ADDRESS = 5;
  uint256 internal constant BLS12_POINT_COMPRESSED_BYTES = 48;
  uint256 internal constant ROOT_ROLLUP_PUBLIC_INPUTS_LENGTH = 111;
  uint256 internal constant NUM_MSGS_PER_BASE_PARITY = 256;
  uint256 internal constant NUM_BASE_PARITY_PER_ROOT_PARITY = 4;
}
