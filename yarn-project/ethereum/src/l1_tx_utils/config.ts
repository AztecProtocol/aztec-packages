import {
  type ConfigMappingsType,
  bigintConfigHelper,
  booleanConfigHelper,
  getConfigFromMappings,
  getDefaultConfig,
  numberConfigHelper,
} from '@aztec/foundation/config';

export interface L1TxUtilsConfig {
  /**
   * How much to increase calculated gas limit.
   */
  gasLimitBufferPercentage?: number;
  /**
   * Maximum gas price in gwei
   */
  maxGwei?: bigint;
  /**
   * Maximum blob fee per gas in gwei
   */
  maxBlobGwei?: bigint;
  /**
   * Priority fee bump percentage
   */
  priorityFeeBumpPercentage?: number;
  /**
   * How much to increase priority fee by each attempt (percentage)
   */
  priorityFeeRetryBumpPercentage?: number;
  /**
   * Fixed priority fee per gas in Gwei. Overrides any priority fee bump percentage config
   */
  fixedPriorityFeePerGas?: number;
  /**
   * Maximum number of speed-up attempts
   */
  maxAttempts?: number;
  /**
   * How often to check tx status
   */
  checkIntervalMs?: number;
  /**
   * How long before considering tx stalled
   */
  stallTimeMs?: number;
  /**
   * How long to wait for a tx to be mined before giving up
   */
  txTimeoutMs?: number;
  /**
   * How many attempts will be done to get a tx after it was sent?
   * First attempt is done at 1s, second at 2s, third at 3s, etc.
   */
  txPropagationMaxQueryAttempts?: number;
  /**
   * Whether to attempt to cancel a tx if it's not mined after txTimeoutMs
   */
  cancelTxOnTimeout?: boolean;
}

export const l1TxUtilsConfigMappings: ConfigMappingsType<L1TxUtilsConfig> = {
  gasLimitBufferPercentage: {
    description: 'How much to increase calculated gas limit by (percentage)',
    env: 'L1_GAS_LIMIT_BUFFER_PERCENTAGE',
    ...numberConfigHelper(20),
  },
  maxGwei: {
    description: 'Maximum gas price in gwei',
    env: 'L1_GAS_PRICE_MAX',
    ...bigintConfigHelper(500n),
  },
  maxBlobGwei: {
    description: 'Maximum blob fee per gas in gwei',
    env: 'L1_BLOB_FEE_PER_GAS_MAX',
    ...bigintConfigHelper(1_500n),
  },
  priorityFeeBumpPercentage: {
    description: 'How much to increase priority fee by each attempt (percentage)',
    env: 'L1_PRIORITY_FEE_BUMP_PERCENTAGE',
    ...numberConfigHelper(20),
  },
  priorityFeeRetryBumpPercentage: {
    description: 'How much to increase priority fee by each retry attempt (percentage)',
    env: 'L1_PRIORITY_FEE_RETRY_BUMP_PERCENTAGE',
    ...numberConfigHelper(50),
  },
  fixedPriorityFeePerGas: {
    description: 'Fixed priority fee per gas in Gwei. Overrides any priority fee bump percentage',
    env: 'L1_FIXED_PRIORITY_FEE_PER_GAS',
    ...numberConfigHelper(0),
  },
  maxAttempts: {
    description: 'Maximum number of speed-up attempts',
    env: 'L1_TX_MONITOR_MAX_ATTEMPTS',
    ...numberConfigHelper(3),
  },
  checkIntervalMs: {
    description: 'How often to check tx status',
    env: 'L1_TX_MONITOR_CHECK_INTERVAL_MS',
    ...numberConfigHelper(1_000),
  },
  stallTimeMs: {
    description: 'How long before considering tx stalled',
    env: 'L1_TX_MONITOR_STALL_TIME_MS',
    ...numberConfigHelper(24_000), // 24s, 2 ethereum slots
  },
  txTimeoutMs: {
    description: 'How long to wait for a tx to be mined before giving up. Set to 0 to disable.',
    env: 'L1_TX_MONITOR_TX_TIMEOUT_MS',
    ...numberConfigHelper(120_000), // 2 mins
  },
  txPropagationMaxQueryAttempts: {
    description: 'How many attempts will be done to get a tx after it was sent',
    env: 'L1_TX_PROPAGATION_MAX_QUERY_ATTEMPTS',
    ...numberConfigHelper(3),
  },
  cancelTxOnTimeout: {
    description: "Whether to attempt to cancel a tx if it's not mined after txTimeoutMs",
    env: 'L1_TX_MONITOR_CANCEL_TX_ON_TIMEOUT',
    ...booleanConfigHelper(true),
  },
};

export const defaultL1TxUtilsConfig = getDefaultConfig<L1TxUtilsConfig>(l1TxUtilsConfigMappings);

export function getL1TxUtilsConfigEnvVars(): L1TxUtilsConfig {
  return getConfigFromMappings(l1TxUtilsConfigMappings);
}
