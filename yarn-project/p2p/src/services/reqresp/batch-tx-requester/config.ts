import { type ConfigMappingsType, numberConfigHelper } from '@aztec/foundation/config';

export const DEFAULT_BATCH_TX_REQUESTER_SMART_PARALLEL_WORKER_COUNT = 10;
export const DEFAULT_BATCH_TX_REQUESTER_DUMB_PARALLEL_WORKER_COUNT = 10;
export const DEFAULT_BATCH_TX_REQUESTER_TX_BATCH_SIZE = 8;
export const DEFAULT_BATCH_TX_REQUESTER_BAD_PEER_THRESHOLD = 2;

export interface BatchTxRequesterConfig {
  /** Max concurrent requests to smart peers. */
  batchTxRequesterSmartParallelWorkerCount: number;
  /** Max concurrent requests to dumb peers. */
  batchTxRequesterDumbParallelWorkerCount: number;
  /** Max transactions per request / chunk size. */
  batchTxRequesterTxBatchSize: number;
  /** Failures before a peer is considered bad (see > threshold logic). */
  batchTxRequesterBadPeerThreshold: number;
}

export const batchTxRequesterConfigMappings: ConfigMappingsType<BatchTxRequesterConfig> = {
  batchTxRequesterSmartParallelWorkerCount: {
    env: 'P2P_BATCH_TX_REQUESTER_SMART_PARALLEL_WORKER_COUNT',
    description: 'Max concurrent requests to smart peers for batch tx requester.',
    ...numberConfigHelper(DEFAULT_BATCH_TX_REQUESTER_SMART_PARALLEL_WORKER_COUNT),
  },
  batchTxRequesterDumbParallelWorkerCount: {
    env: 'P2P_BATCH_TX_REQUESTER_DUMB_PARALLEL_WORKER_COUNT',
    description: 'Max concurrent requests to dumb peers for batch tx requester.',
    ...numberConfigHelper(DEFAULT_BATCH_TX_REQUESTER_DUMB_PARALLEL_WORKER_COUNT),
  },
  batchTxRequesterTxBatchSize: {
    env: 'P2P_BATCH_TX_REQUESTER_TX_BATCH_SIZE',
    description: 'Max transactions per request / chunk size for batch tx requester.',
    ...numberConfigHelper(DEFAULT_BATCH_TX_REQUESTER_TX_BATCH_SIZE),
  },
  batchTxRequesterBadPeerThreshold: {
    env: 'P2P_BATCH_TX_REQUESTER_BAD_PEER_THRESHOLD',
    description: 'Failures before a peer is considered bad (see > threshold logic).',
    ...numberConfigHelper(DEFAULT_BATCH_TX_REQUESTER_BAD_PEER_THRESHOLD),
  },
};
