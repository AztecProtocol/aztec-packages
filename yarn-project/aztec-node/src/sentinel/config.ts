import { type ConfigMappingsType, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';

export type SentinelConfig = {
  sentinelHistoryLengthInEpochs: number;
  sentinelHistoricEpochPerformanceLengthInEpochs: number;
  sentinelEnabled: boolean;
  sentinelEpochEndBufferSlots: number;
};

export const sentinelConfigMappings: ConfigMappingsType<SentinelConfig> = {
  sentinelHistoryLengthInEpochs: {
    description: 'The number of L2 epochs kept of history for each validator for computing their stats.',
    env: 'SENTINEL_HISTORY_LENGTH_IN_EPOCHS',
    ...numberConfigHelper(24),
  },
  /**
   * The number of L2 epochs kept of per-epoch performance history for each validator. End-of-epoch
   * activity is recorded here and used to decide consecutive-epoch inactivity slashing.
   * This value must be large enough so that we have epoch performance for every validator
   * for at least slashInactivityConsecutiveEpochThreshold. Assuming this value is 3,
   * and the committee size is 48, and we have 10k validators, then we pick 48 out of 10k each draw.
   * For any fixed element, per-draw prob = 48/10000 = 0.0048.
   * After n draws, count ~ Binomial(n, 0.0048). We want P(X >= 3).
   * Results (exact binomial):
   * - 90% chance: n = 1108
   * - 95% chance: n = 1310
   * - 99% chance: n = 1749
   */
  sentinelHistoricEpochPerformanceLengthInEpochs: {
    description: 'The number of L2 epochs kept of per-epoch performance history for each validator.',
    env: 'SENTINEL_HISTORIC_EPOCH_PERFORMANCE_LENGTH_IN_EPOCHS',
    ...numberConfigHelper(2000),
  },
  sentinelEnabled: {
    description: 'Whether the sentinel is enabled or not.',
    env: 'SENTINEL_ENABLED',
    ...booleanConfigHelper(false),
  },
  /**
   * Number of L2 slots to wait after the end of an epoch before computing the epoch's performance.
   * The buffer allows P2P attestations and the local archiver to settle. Higher values reduce the
   * risk of misjudging late-arriving activity at the cost of delayed slashing.
   */
  sentinelEpochEndBufferSlots: {
    description: 'Number of L2 slots after the end of an epoch before the sentinel evaluates it.',
    env: 'SENTINEL_EPOCH_END_BUFFER_SLOTS',
    ...numberConfigHelper(2),
  },
};
