import type { EpochCache } from '@aztec/epoch-cache';
import { createLogger } from '@aztec/foundation/log';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import type { P2PClient } from '@aztec/p2p';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { CheckpointReexecutionTracker } from '@aztec/stdlib/checkpoint';
import type { ChainConfig } from '@aztec/stdlib/config';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';

import type { SentinelConfig } from './config.js';
import { Sentinel } from './sentinel.js';
import { SentinelStore } from './store.js';

export async function createSentinel(
  epochCache: EpochCache,
  archiver: L2BlockSource,
  p2p: P2PClient,
  reexecutionTracker: CheckpointReexecutionTracker,
  config: SentinelConfig & DataStoreConfig & SlasherConfig & Pick<ChainConfig, 'l1ChainId' | 'rollupAddress'>,
  logger = createLogger('node:sentinel'),
): Promise<Sentinel | undefined> {
  if (!config.sentinelEnabled) {
    return undefined;
  }
  const kvStore = await createStore('sentinel', SentinelStore.SCHEMA_VERSION, config, logger.getBindings());
  const storeHistoryLength = config.sentinelHistoryLengthInEpochs * epochCache.getL1Constants().epochDuration;
  const storeHistoricEpochPerformanceLength = config.sentinelHistoricEpochPerformanceLengthInEpochs;
  const sentinelStore = new SentinelStore(kvStore, {
    historyLength: storeHistoryLength,
    historicEpochPerformanceLength: storeHistoricEpochPerformanceLength,
  });
  return new Sentinel(epochCache, archiver, p2p, sentinelStore, reexecutionTracker, config, logger);
}
