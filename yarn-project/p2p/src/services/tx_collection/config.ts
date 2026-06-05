import { type ConfigMappingsType, numberConfigHelper } from '@aztec/foundation/config';
import { MAX_RPC_TXS_LEN } from '@aztec/stdlib/interfaces/api-limit';

export type TxCollectionConfig = {
  /** How long to wait before starting reqresp for fast collection  */
  txCollectionFastNodesTimeoutBeforeReqRespMs: number;
  /** How many ms to wait between retried request to a node via RPC during fast collection */
  txCollectionFastNodeIntervalMs: number;
  /** A comma-separated list of Aztec node RPC URLs to use for tx collection */
  txCollectionNodeRpcUrls: string[];
  /** Maximum number of parallel requests to make to a node during fast collection */
  txCollectionFastMaxParallelRequestsPerNode: number;
  /** Maximum number of transactions to request from a node in a single batch */
  txCollectionNodeRpcMaxBatchSize: number;
  /** A comma-separated list of file store URLs (s3://, gs://, file://, http://) for tx collection */
  txCollectionFileStoreUrls: string[];
  /** Delay in ms from reqresp start before file store collection begins */
  txCollectionFileStoreFastDelayMs: number;
  /** Number of concurrent workers for fast file store collection */
  txCollectionFileStoreFastWorkerCount: number;
  /** Base backoff time in ms for fast file store collection retries */
  txCollectionFileStoreFastBackoffBaseMs: number;
  /** Max backoff time in ms for fast file store collection retries */
  txCollectionFileStoreFastBackoffMaxMs: number;
};

export const txCollectionConfigMappings: ConfigMappingsType<TxCollectionConfig> = {
  txCollectionFastNodesTimeoutBeforeReqRespMs: {
    env: 'TX_COLLECTION_FAST_NODES_TIMEOUT_BEFORE_REQ_RESP_MS',
    description: 'How long to wait before starting reqresp for fast collection',
    ...numberConfigHelper(200),
  },
  txCollectionFastNodeIntervalMs: {
    env: 'TX_COLLECTION_FAST_NODE_INTERVAL_MS',
    description: 'How many ms to wait between retried request to a node via RPC during fast collection',
    ...numberConfigHelper(500),
  },
  txCollectionNodeRpcUrls: {
    env: 'TX_COLLECTION_NODE_RPC_URLS',
    fallback: ['PROVER_COORDINATION_NODE_URLS'],
    description: 'A comma-separated list of Aztec node RPC URLs to use for tx collection',
    parseEnv: (val: string) =>
      val
        .split(',')
        .map(url => url.trim().replace(/\/$/, ''))
        .filter(url => url.length > 0),
    defaultValue: [],
  },
  txCollectionFastMaxParallelRequestsPerNode: {
    env: 'TX_COLLECTION_FAST_MAX_PARALLEL_REQUESTS_PER_NODE',
    description: 'Maximum number of parallel requests to make to a node during fast collection',
    ...numberConfigHelper(4),
  },
  txCollectionNodeRpcMaxBatchSize: {
    env: 'TX_COLLECTION_NODE_RPC_MAX_BATCH_SIZE',
    description: 'Maximum number of transactions to request from a node in a single batch',
    ...numberConfigHelper(MAX_RPC_TXS_LEN),
  },
  txCollectionFileStoreUrls: {
    env: 'TX_COLLECTION_FILE_STORE_URLS',
    description: 'A comma-separated list of file store URLs (s3://, gs://, file://, http://) for tx collection',
    parseEnv: (val: string) =>
      val
        .split(',')
        .map(url => url.trim())
        .filter(url => url.length > 0),
    defaultValue: [],
  },
  txCollectionFileStoreFastDelayMs: {
    env: 'TX_COLLECTION_FILE_STORE_FAST_DELAY_MS',
    description: 'Delay in ms from reqresp start before file store collection begins',
    ...numberConfigHelper(2_000),
  },
  txCollectionFileStoreFastWorkerCount: {
    env: 'TX_COLLECTION_FILE_STORE_FAST_WORKER_COUNT',
    description: 'Number of concurrent workers for fast file store collection',
    ...numberConfigHelper(5),
  },
  txCollectionFileStoreFastBackoffBaseMs: {
    env: 'TX_COLLECTION_FILE_STORE_FAST_BACKOFF_BASE_MS',
    description: 'Base backoff time in ms for fast file store collection retries',
    ...numberConfigHelper(1_000),
  },
  txCollectionFileStoreFastBackoffMaxMs: {
    env: 'TX_COLLECTION_FILE_STORE_FAST_BACKOFF_MAX_MS',
    description: 'Max backoff time in ms for fast file store collection retries',
    ...numberConfigHelper(5_000),
  },
};
