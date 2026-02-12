import {
  type ConfigMappingsType,
  booleanConfigHelper,
  enumConfigHelper,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { MAX_RPC_TXS_LEN } from '@aztec/stdlib/interfaces/api-limit';

export type MissingTxsCollectorType = 'new' | 'old';

export type TxCollectionConfig = {
  /** How long to wait before starting reqresp for fast collection  */
  txCollectionFastNodesTimeoutBeforeReqRespMs: number;
  /** How often to collect from configured nodes */
  txCollectionSlowNodesIntervalMs: number;
  /** How ofter to collect from peers */
  txCollectionSlowReqRespIntervalMs: number;
  /** How long to wait for a reqresp response during slow collection */
  txCollectionSlowReqRespTimeoutMs: number;
  /** How often to reconcile found txs with the tx pool */
  txCollectionReconcileIntervalMs: number;
  /** Whether to disable the slow collection loop if we are dealing with any immediate requests */
  txCollectionDisableSlowDuringFastRequests: boolean;
  /** How many ms to wait between retried request to a node via RPC during fast collection */
  txCollectionFastNodeIntervalMs: number;
  /** A comma-separated list of Aztec node RPC URLs to use for tx collection */
  txCollectionNodeRpcUrls: string[];
  /** Maximum number of parallel requests to make to a node during fast collection */
  txCollectionFastMaxParallelRequestsPerNode: number;
  /** Maximum number of transactions to request from a node in a single batch */
  txCollectionNodeRpcMaxBatchSize: number;
  /** Which collector implementation to use for missing txs collection */
  txCollectionMissingTxsCollectorType: MissingTxsCollectorType;
  /** A comma-separated list of file store URLs (s3://, gs://, file://, http://) for tx collection */
  txCollectionFileStoreUrls: string[];
  /** Delay in ms before file store collection starts after slow collection is triggered */
  txCollectionFileStoreSlowDelayMs: number;
  /** Delay in ms before file store collection starts after fast collection is triggered */
  txCollectionFileStoreFastDelayMs: number;
  /** Number of concurrent workers for fast file store collection */
  txCollectionFileStoreFastWorkerCount: number;
  /** Number of concurrent workers for slow file store collection */
  txCollectionFileStoreSlowWorkerCount: number;
  /** Base backoff time in ms for fast file store collection retries */
  txCollectionFileStoreFastBackoffBaseMs: number;
  /** Base backoff time in ms for slow file store collection retries */
  txCollectionFileStoreSlowBackoffBaseMs: number;
  /** Max backoff time in ms for fast file store collection retries */
  txCollectionFileStoreFastBackoffMaxMs: number;
  /** Max backoff time in ms for slow file store collection retries */
  txCollectionFileStoreSlowBackoffMaxMs: number;
};

export const txCollectionConfigMappings: ConfigMappingsType<TxCollectionConfig> = {
  txCollectionFastNodesTimeoutBeforeReqRespMs: {
    env: 'TX_COLLECTION_FAST_NODES_TIMEOUT_BEFORE_REQ_RESP_MS',
    description: 'How long to wait before starting reqresp for fast collection',
    ...numberConfigHelper(200),
  },
  txCollectionSlowNodesIntervalMs: {
    env: 'TX_COLLECTION_SLOW_NODES_INTERVAL_MS',
    description: 'How often to collect from configured nodes in the slow collection loop',
    ...numberConfigHelper(12_000),
  },
  txCollectionSlowReqRespIntervalMs: {
    env: 'TX_COLLECTION_SLOW_REQ_RESP_INTERVAL_MS',
    description: 'How often to collect from peers via reqresp in the slow collection loop',
    ...numberConfigHelper(12_000),
  },
  txCollectionSlowReqRespTimeoutMs: {
    env: 'TX_COLLECTION_SLOW_REQ_RESP_TIMEOUT_MS',
    description: 'How long to wait for a reqresp response during slow collection',
    ...numberConfigHelper(20_000),
  },
  txCollectionReconcileIntervalMs: {
    env: 'TX_COLLECTION_RECONCILE_INTERVAL_MS',
    description: 'How often to reconcile found txs from the tx pool',
    ...numberConfigHelper(60_000),
  },
  txCollectionDisableSlowDuringFastRequests: {
    env: 'TX_COLLECTION_DISABLE_SLOW_DURING_FAST_REQUESTS',
    description: 'Whether to disable the slow collection loop if we are dealing with any immediate requests',
    ...booleanConfigHelper(true),
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
  txCollectionMissingTxsCollectorType: {
    env: 'TX_COLLECTION_MISSING_TXS_COLLECTOR_TYPE',
    description: 'Which collector implementation to use for missing txs collection (new or old)',
    ...enumConfigHelper(['new', 'old'] as const, 'new'),
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
  txCollectionFileStoreSlowDelayMs: {
    env: 'TX_COLLECTION_FILE_STORE_SLOW_DELAY_MS',
    description: 'Delay before file store collection starts after slow collection',
    ...numberConfigHelper(24_000),
  },
  txCollectionFileStoreFastDelayMs: {
    env: 'TX_COLLECTION_FILE_STORE_FAST_DELAY_MS',
    description: 'Delay before file store collection starts after fast collection',
    ...numberConfigHelper(2_000),
  },
  txCollectionFileStoreFastWorkerCount: {
    env: 'TX_COLLECTION_FILE_STORE_FAST_WORKER_COUNT',
    description: 'Number of concurrent workers for fast file store collection',
    ...numberConfigHelper(5),
  },
  txCollectionFileStoreSlowWorkerCount: {
    env: 'TX_COLLECTION_FILE_STORE_SLOW_WORKER_COUNT',
    description: 'Number of concurrent workers for slow file store collection',
    ...numberConfigHelper(2),
  },
  txCollectionFileStoreFastBackoffBaseMs: {
    env: 'TX_COLLECTION_FILE_STORE_FAST_BACKOFF_BASE_MS',
    description: 'Base backoff time in ms for fast file store collection retries',
    ...numberConfigHelper(1_000),
  },
  txCollectionFileStoreSlowBackoffBaseMs: {
    env: 'TX_COLLECTION_FILE_STORE_SLOW_BACKOFF_BASE_MS',
    description: 'Base backoff time in ms for slow file store collection retries',
    ...numberConfigHelper(5_000),
  },
  txCollectionFileStoreFastBackoffMaxMs: {
    env: 'TX_COLLECTION_FILE_STORE_FAST_BACKOFF_MAX_MS',
    description: 'Max backoff time in ms for fast file store collection retries',
    ...numberConfigHelper(5_000),
  },
  txCollectionFileStoreSlowBackoffMaxMs: {
    env: 'TX_COLLECTION_FILE_STORE_SLOW_BACKOFF_MAX_MS',
    description: 'Max backoff time in ms for slow file store collection retries',
    ...numberConfigHelper(30_000),
  },
};
