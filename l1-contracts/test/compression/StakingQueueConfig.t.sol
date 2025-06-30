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
    uint64 _bootstrapValidatorSetSize,
    uint64 _bootstrapFlushSize,
    uint64 _normalFlushSizeMin,
    uint64 _normalFlushSizeQuotient
  ) public pure {
    StakingQueueConfig memory a = StakingQueueConfig({
      bootstrapValidatorSetSize: _bootstrapValidatorSetSize,
      bootstrapFlushSize: _bootstrapFlushSize,
      normalFlushSizeMin: _normalFlushSizeMin,
      normalFlushSizeQuotient: _normalFlushSizeQuotient
    });

    CompressedStakingQueueConfig b = a.compress();
    StakingQueueConfig memory c = b.decompress();

    assertEq(
      c.bootstrapValidatorSetSize, a.bootstrapValidatorSetSize, "Bootstrap validator set size"
    );
    assertEq(c.bootstrapFlushSize, a.bootstrapFlushSize, "Bootstrap flush size");
    assertEq(c.normalFlushSizeMin, a.normalFlushSizeMin, "Normal flush size min");
    assertEq(c.normalFlushSizeQuotient, a.normalFlushSizeQuotient, "Normal flush size quotient");
  }
}
