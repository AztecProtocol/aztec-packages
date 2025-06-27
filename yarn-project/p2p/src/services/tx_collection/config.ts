import { type ConfigMappingsType, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';
import { MAX_RPC_TXS_LEN } from '@aztec/stdlib/interfaces/server';

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
};
