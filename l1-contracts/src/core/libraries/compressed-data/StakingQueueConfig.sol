// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {SafeCast} from "@oz/utils/math/SafeCast.sol";

type CompressedStakingQueueConfig is uint256;

/**
 * If the number of validators in the rollup is 0, and the number of validators in the queue is less than `bootstrapValidatorSetSize`,
 * then `getEntryQueueFlushSize` will return 0.
 *
 * If the number of validators in the rollup is 0, and the number of validators in the queue is greater than or equal to `bootstrapValidatorSetSize`,
 * then `getEntryQueueFlushSize` will return `bootstrapFlushSize`.
 *
 * If the number of validators in the rollup is greater than 0 and less than `bootstrapValidatorSetSize`, then `getEntryQueueFlushSize` will return `bootstrapFlushSize`.
 *
 * If the number of validators in the rollup is greater than or equal to `bootstrapValidatorSetSize`, then `getEntryQueueFlushSize` will return Max( `normalFlushSizeMin`, `activeAttesterCount` / `normalFlushSizeQuotient`).
 *
 * NOTE: We will NEVER flush more than `MAX_QUEUE_FLUSH_SIZE` validators: it is applied as a Max at the end of every calculation.
 * This is to prevent a situation where flushing the queue would exceed the block gas limit.
 */
struct StakingQueueConfig {
  uint256 bootstrapValidatorSetSize;
  uint256 bootstrapFlushSize;
  uint256 normalFlushSizeMin;
  uint256 normalFlushSizeQuotient;
}

library StakingQueueConfigLib {
  using SafeCast for uint256;

  uint256 private constant MASK_64BIT = 0xFFFFFFFFFFFFFFFF;

  function compress(StakingQueueConfig memory _config)
    internal
    pure
    returns (CompressedStakingQueueConfig)
  {
    uint256 value = 0;
    value |= uint256(_config.normalFlushSizeQuotient.toUint64());
    value |= uint256(_config.normalFlushSizeMin.toUint64()) << 64;
    value |= uint256(_config.bootstrapFlushSize.toUint64()) << 128;
    value |= uint256(_config.bootstrapValidatorSetSize.toUint64()) << 192;

    return CompressedStakingQueueConfig.wrap(value);
  }

  function decompress(CompressedStakingQueueConfig _compressedConfig)
    internal
    pure
    returns (StakingQueueConfig memory)
  {
    uint256 value = CompressedStakingQueueConfig.unwrap(_compressedConfig);

    return StakingQueueConfig({
      bootstrapValidatorSetSize: (value >> 192) & MASK_64BIT,
      bootstrapFlushSize: (value >> 128) & MASK_64BIT,
      normalFlushSizeMin: (value >> 64) & MASK_64BIT,
      normalFlushSizeQuotient: (value) & MASK_64BIT
    });
  }
}
