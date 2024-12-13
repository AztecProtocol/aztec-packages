import { type EthAddress } from '@aztec/foundation/eth-address';

import { type EpochCacheConfig } from './config.js';
import { EpochCache } from './epoch_cache.js';

export function createEpochCache(config: EpochCacheConfig, rollupAddress: EthAddress): Promise<EpochCache> {
  return EpochCache.create(rollupAddress, config);
}
