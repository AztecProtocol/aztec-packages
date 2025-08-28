// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {
  StakingQueueConfig,
  CompressedStakingQueueConfig,
  StakingQueueConfigLib
} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";

contract StakingQueueConfigTest is Test {
  using StakingQueueConfigLib for StakingQueueConfig;
  using StakingQueueConfigLib for CompressedStakingQueueConfig;

  function test_compressAndDecompress(
    uint32 _bootstrapValidatorSetSize,
    uint32 _bootstrapFlushSize,
    uint32 _normalFlushSizeMin,
    uint32 _normalFlushSizeQuotient,
    uint32 _maxQueueFlushSize
  ) public pure {
    StakingQueueConfig memory a = StakingQueueConfig({
      bootstrapValidatorSetSize: _bootstrapValidatorSetSize,
      bootstrapFlushSize: _bootstrapFlushSize,
      normalFlushSizeMin: _normalFlushSizeMin,
      normalFlushSizeQuotient: _normalFlushSizeQuotient,
      maxQueueFlushSize: _maxQueueFlushSize
    });

    CompressedStakingQueueConfig b = a.compress();
    StakingQueueConfig memory c = b.decompress();

    assertEq(c.bootstrapValidatorSetSize, a.bootstrapValidatorSetSize, "Bootstrap validator set size");
    assertEq(c.bootstrapFlushSize, a.bootstrapFlushSize, "Bootstrap flush size");
    assertEq(c.normalFlushSizeMin, a.normalFlushSizeMin, "Normal flush size min");
    assertEq(c.normalFlushSizeQuotient, a.normalFlushSizeQuotient, "Normal flush size quotient");
    assertEq(c.maxQueueFlushSize, a.maxQueueFlushSize, "Max queue flush size");
  }
}
