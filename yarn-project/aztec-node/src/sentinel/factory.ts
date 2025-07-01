import type { EpochCache } from '@aztec/epoch-cache';
import { createLogger } from '@aztec/foundation/log';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import type { P2PClient } from '@aztec/p2p';
import type { SlasherConfig } from '@aztec/slasher/config';
import type { L2BlockSource } from '@aztec/stdlib/block';

import type { SentinelConfig } from './config.js';
import { Sentinel } from './sentinel.js';
import { SentinelStore } from './store.js';

export async function createSentinel(
  epochCache: EpochCache,
  archiver: L2BlockSource,
  p2p: P2PClient,
  config: SentinelConfig & DataStoreConfig & SlasherConfig,
  logger = createLogger('node:sentinel'),
): Promise<Sentinel | undefined> {
  if (!config.sentinelEnabled) {
    return undefined;
  }
  const kvStore = await createStore(
    'sentinel',
    SentinelStore.SCHEMA_VERSION,
    config,
    createLogger('node:sentinel:lmdb'),
  );
  const storeHistoryLength = config.sentinelHistoryLengthInEpochs * epochCache.getL1Constants().epochDuration;
  const sentinelStore = new SentinelStore(kvStore, { historyLength: storeHistoryLength });
  return new Sentinel(epochCache, archiver, p2p, sentinelStore, config, logger);
}
