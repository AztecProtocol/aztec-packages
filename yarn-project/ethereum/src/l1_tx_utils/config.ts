import {
  type ConfigMappingsType,
  booleanConfigHelper,
  floatConfigHelper,
  getConfigFromMappings,
  getDefaultConfig,
  numberConfigHelper,
  optionalNumberConfigHelper,
} from '@aztec/foundation/config';

export interface L1TxUtilsConfig {
  /**
   * How much to increase calculated gas limit.
   */
  gasLimitBufferPercentage?: number;
  /**
   * Maximum gas price in gwei
   */
  maxGwei?: number;
  /**
   * Maximum blob fee per gas in gwei
   */
  maxBlobGwei?: number;
  /**
   * Priority fee bump percentage
   */
  priorityFeeBumpPercentage?: number;
  /**
   * How much to increase priority fee by each attempt (percentage)
   */
  priorityFeeRetryBumpPercentage?: number;
  /**
   * Minimum priority fee per gas in Gwei. Acts as a floor for the computed priority fee.
   */
  minimumPriorityFeePerGas?: number;
  /**
   * Maximum number of speed-up attempts
   */
  maxSpeedUpAttempts?: number;
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
   * Whether to attempt to cancel a tx if it's not mined after txTimeoutMs
   */
  cancelTxOnTimeout?: boolean;
  /**
   * How long to wait for a cancellation tx to be mined after its last attempt before giving up
   */
  txCancellationFinalTimeoutMs?: number;
  /**
   * How long a tx nonce can be unseen in the mempool before considering it dropped
   */
  txUnseenConsideredDroppedMs?: number;
  /** Enable tx delayer. When true, wraps the viem client to intercept and delay txs. Test-only. */
  enableDelayer?: boolean;
  /** Max seconds into an L1 slot for tx inclusion. Txs sent later are deferred to next slot. Only used when enableDelayer is true. */
  txDelayerMaxInclusionTimeIntoSlot?: number;
  /** How many seconds an L1 slot lasts. */
  ethereumSlotDuration?: number;
}

export const l1TxUtilsConfigMappings: ConfigMappingsType<L1TxUtilsConfig> = {
  gasLimitBufferPercentage: {
    description: 'How much to increase calculated gas limit by (percentage)',
    env: 'L1_GAS_LIMIT_BUFFER_PERCENTAGE',
    ...numberConfigHelper(20),
  },
  maxGwei: {
    description: 'Maximum gas price in gwei to be used for transactions.',
    env: 'L1_GAS_PRICE_MAX',
    fallback: ['L1_FEE_PER_GAS_GWEI_MAX'],
    ...floatConfigHelper(2000),
  },
  maxBlobGwei: {
    description: 'Maximum blob fee per gas in gwei',
    env: 'L1_BLOB_FEE_PER_GAS_MAX',
    fallback: ['L1_BLOB_FEE_PER_GAS_GWEI_MAX'],
    ...floatConfigHelper(3000),
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
  minimumPriorityFeePerGas: {
    description:
      'Minimum priority fee per gas in Gwei. Acts as a floor for the computed priority fee. If network conditions require a higher fee, the higher fee will be used.',
    env: 'L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI',
    fallback: ['L1_FIXED_PRIORITY_FEE_PER_GAS', 'L1_FIXED_PRIORITY_FEE_PER_GAS_GWEI'],
    deprecatedFallback: [
      {
        env: 'L1_FIXED_PRIORITY_FEE_PER_GAS',
        message: deprecatedFixedFeeMessage('L1_FIXED_PRIORITY_FEE_PER_GAS'),
      },
      {
        env: 'L1_FIXED_PRIORITY_FEE_PER_GAS_GWEI',
        message: deprecatedFixedFeeMessage('L1_FIXED_PRIORITY_FEE_PER_GAS_GWEI'),
      },
    ],
    ...floatConfigHelper(0),
  },
  maxSpeedUpAttempts: {
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
    ...numberConfigHelper(12_000), // 12s, 1 ethereum slot
  },
  txTimeoutMs: {
    description: 'How long to wait for a tx to be mined before giving up. Set to 0 to disable.',
    env: 'L1_TX_MONITOR_TX_TIMEOUT_MS',
    ...numberConfigHelper(120_000), // 2 mins
  },
  cancelTxOnTimeout: {
    description: "Whether to attempt to cancel a tx if it's not mined after txTimeoutMs",
    env: 'L1_TX_MONITOR_CANCEL_TX_ON_TIMEOUT',
    ...booleanConfigHelper(true),
  },
  txCancellationFinalTimeoutMs: {
    description: 'How long to wait for a cancellation tx after its last attempt before giving up',
    env: 'L1_TX_MONITOR_TX_CANCELLATION_TIMEOUT_MS',
    ...numberConfigHelper(24 * 12 * 1000), // 24 L1 blocks
  },
  txUnseenConsideredDroppedMs: {
    description: 'How long a tx nonce can be unseen in the mempool before considering it dropped',
    env: 'L1_TX_MONITOR_TX_UNSEEN_CONSIDERED_DROPPED_MS',
    ...numberConfigHelper(6 * 12 * 1000), // 6 L1 blocks
  },
  enableDelayer: {
    description: 'Enable tx delayer for testing.',
    ...booleanConfigHelper(false),
  },
  txDelayerMaxInclusionTimeIntoSlot: {
    description: 'Max seconds into L1 slot for tx inclusion when delayer is enabled.',
    ...optionalNumberConfigHelper(),
  },
  ethereumSlotDuration: {
    env: 'ETHEREUM_SLOT_DURATION',
    description: 'How many seconds an L1 slot lasts.',
    ...numberConfigHelper(12),
  },
};

// We abuse the fact that all mappings above have a non null default value and force-type this to Required
export const defaultL1TxUtilsConfig = getDefaultConfig<L1TxUtilsConfig>(
  l1TxUtilsConfigMappings,
) as Required<L1TxUtilsConfig>;

export function getL1TxUtilsConfigEnvVars(): L1TxUtilsConfig {
  return getConfigFromMappings(l1TxUtilsConfigMappings);
}

function deprecatedFixedFeeMessage(envVar: string): string {
  return (
    `Environment variable ${envVar} is deprecated. It is now used as a MINIMUM priority fee rather than a fixed value. ` +
    'Please use L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI instead. If network conditions require a higher fee, the higher fee will be used.'
  );
}
