import { type ConfigMapping, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';

export const DEFAULT_INDIVIDUAL_REQUEST_TIMEOUT_MS = 2000;
export const DEFAULT_OVERALL_REQUEST_TIMEOUT_MS = 4000;
export const DEFAULT_MAX_CONCURRENT_PEERS = 10;
export const DEFAULT_TXS_PER_BATCH = 5;

// For use in tests.
export const DEFAULT_P2P_REQRESP_CONFIG: P2PReqRespConfig = {
  overallRequestTimeoutMs: DEFAULT_OVERALL_REQUEST_TIMEOUT_MS,
  individualRequestTimeoutMs: DEFAULT_INDIVIDUAL_REQUEST_TIMEOUT_MS,
  aggressiveMode: false,
  maxConcurrentPeers: DEFAULT_MAX_CONCURRENT_PEERS,
  txsPerBatch: DEFAULT_TXS_PER_BATCH,
};

export interface P2PReqRespConfig {
  /**
   * The overall timeout for a request response operation.
   */
  overallRequestTimeoutMs: number;

  /**
   * The timeout for an individual request response peer interaction.
   */
  individualRequestTimeoutMs: number;

  /**
   * Flag to determine whether to use aggressive mode for the request response protocol.
   * In aggressive mode, all peers request all transactions in the batch simultaneously.
   */
  aggressiveMode: boolean;

  /**
   * The maximum number of concurrent peers to try to request the same txs from.
   */
  maxConcurrentPeers: number;

  /**
   * The number of transactions to send in a batch.
   */
  txsPerBatch: number;
}

export const p2pReqRespConfigMappings: Record<keyof P2PReqRespConfig, ConfigMapping> = {
  overallRequestTimeoutMs: {
    env: 'P2P_REQRESP_OVERALL_REQUEST_TIMEOUT_MS',
    description: 'The overall timeout for a request response operation.',
    ...numberConfigHelper(DEFAULT_OVERALL_REQUEST_TIMEOUT_MS),
  },
  individualRequestTimeoutMs: {
    env: 'P2P_REQRESP_INDIVIDUAL_REQUEST_TIMEOUT_MS',
    description: 'The timeout for an individual request response peer interaction.',
    ...numberConfigHelper(DEFAULT_INDIVIDUAL_REQUEST_TIMEOUT_MS),
  },
  aggressiveMode: {
    env: 'P2P_REQRESP_AGGRESSIVE_MODE',
    description: 'Flag to determine whether to use aggressive mode for the request response protocol.',
    ...booleanConfigHelper(false),
  },
  maxConcurrentPeers: {
    env: 'P2P_REQRESP_MAX_CONCURRENT_PEERS',
    description: 'The maximum number of concurrent peers to try to request the same txs from.',
    ...numberConfigHelper(DEFAULT_MAX_CONCURRENT_PEERS),
  },
  txsPerBatch: {
    env: 'P2P_REQRESP_TXS_PER_BATCH',
    description: 'The number of transactions to send in a batch.',
    ...numberConfigHelper(DEFAULT_TXS_PER_BATCH),
  },
};
