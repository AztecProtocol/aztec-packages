import { type ConfigMappingsType, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';

export type SentinelConfig = {
  sentinelHistoryLengthInEpochs: number;
  sentinelEnabled: boolean;
};

export const sentinelConfigMappings: ConfigMappingsType<SentinelConfig> = {
  sentinelHistoryLengthInEpochs: {
    description: 'The number of L2 epochs kept of history for each validator for computing their stats.',
    env: 'SENTINEL_HISTORY_LENGTH_IN_EPOCHS',
    ...numberConfigHelper(24),
  },
  sentinelEnabled: {
    description: 'Whether the sentinel is enabled or not.',
    env: 'SENTINEL_ENABLED',
    ...booleanConfigHelper(false),
  },
};
