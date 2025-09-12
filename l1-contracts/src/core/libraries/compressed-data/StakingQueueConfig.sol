// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {SafeCast} from "@oz/utils/math/SafeCast.sol";

type CompressedStakingQueueConfig is uint256;

/**
 * If the number of validators in the rollup is 0, and the number of validators in the queue is less than
 * `bootstrapValidatorSetSize`, then `getEntryQueueFlushSize` will return 0.
 *
 * If the number of validators in the rollup is 0, and the number of validators in the queue is greater than or equal to
 * `bootstrapValidatorSetSize`, then `getEntryQueueFlushSize` will return `bootstrapFlushSize`.
 *
 * If the number of validators in the rollup is greater than 0 and less than `bootstrapValidatorSetSize`, then
 * `getEntryQueueFlushSize` will return `bootstrapFlushSize`.
 *
 * If the number of validators in the rollup is greater than or equal to `bootstrapValidatorSetSize`, then
 * `getEntryQueueFlushSize` will return Max( `normalFlushSizeMin`, `activeAttesterCount` / `normalFlushSizeQuotient`).
 *
 * NOTE: If the normalFlushSizeMin is 0 and the validator set is empty, above will return max(0, 0) and it won't be
 * possible to add validators. This can close the queue even if there are members in the validator set if a very high
 * `normalFlushSizeQuotient` is used.
 *
 * NOTE: We will NEVER flush more than `maxQueueFlushSize` validators: it is applied as a Max at the end of every
 * calculation.
 * This can be used to prevent a situation where flushing the queue would exceed the block gas limit.
 */
struct StakingQueueConfig {
  uint256 bootstrapValidatorSetSize;
  uint256 bootstrapFlushSize;
  uint256 normalFlushSizeMin;
  uint256 normalFlushSizeQuotient;
  uint256 maxQueueFlushSize;
}

library StakingQueueConfigLib {
  using SafeCast for uint256;

  uint256 private constant MASK_32BIT = 0xFFFFFFFF;

  function compress(StakingQueueConfig memory _config) internal pure returns (CompressedStakingQueueConfig) {
    uint256 value = 0;
    value |= uint256(_config.maxQueueFlushSize.toUint32());
    value |= uint256(_config.normalFlushSizeQuotient.toUint32()) << 32;
    value |= uint256(_config.normalFlushSizeMin.toUint32()) << 64;
    value |= uint256(_config.bootstrapFlushSize.toUint32()) << 96;
    value |= uint256(_config.bootstrapValidatorSetSize.toUint32()) << 128;

    return CompressedStakingQueueConfig.wrap(value);
  }

  function decompress(CompressedStakingQueueConfig _compressedConfig) internal pure returns (StakingQueueConfig memory) {
    uint256 value = CompressedStakingQueueConfig.unwrap(_compressedConfig);

    return StakingQueueConfig({
      bootstrapValidatorSetSize: (value >> 128) & MASK_32BIT,
      bootstrapFlushSize: (value >> 96) & MASK_32BIT,
      normalFlushSizeMin: (value >> 64) & MASK_32BIT,
      normalFlushSizeQuotient: (value >> 32) & MASK_32BIT,
      maxQueueFlushSize: value & MASK_32BIT
    });
  }
}
