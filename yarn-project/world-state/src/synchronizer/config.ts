import { type ConfigMappingsType, booleanConfigHelper, getConfigFromMappings } from '@aztec/foundation/config';

/** World State synchronizer configuration values. */
export interface WorldStateConfig {
  /** The frequency in which to check. */
  worldStateBlockCheckIntervalMS: number;

  /** Whether to follow only the proven chain. */
  worldStateProvenBlocksOnly: boolean;

  /** Size of the batch for each get-blocks request from the synchronizer to the archiver. */
  worldStateBlockRequestBatchSize?: number;

  /** The maximum size of the combined world state db in KB, optional, will inherit from the general dataStoreMapSizeKB if not specified*/
  worldStateDbMapSizeKb?: number;

  /** Optional directory for the world state DB, if unspecified will default to the general data directory */
  worldStateDataDirectory?: string;
}

export const worldStateConfigMappings: ConfigMappingsType<WorldStateConfig> = {
  worldStateBlockCheckIntervalMS: {
    env: 'WS_BLOCK_CHECK_INTERVAL_MS',
    parseEnv: (val: string) => +val,
    defaultValue: 100,
    description: 'The frequency in which to check.',
  },
  worldStateProvenBlocksOnly: {
    env: 'WS_PROVEN_BLOCKS_ONLY',
    description: 'Whether to follow only the proven chain.',
    ...booleanConfigHelper(),
  },
  worldStateBlockRequestBatchSize: {
    env: 'WS_BLOCK_REQUEST_BATCH_SIZE',
    parseEnv: (val: string | undefined) => (val ? +val : undefined),
    description: 'Size of the batch for each get-blocks request from the synchronizer to the archiver.',
  },
  worldStateDbMapSizeKb: {
    env: 'WS_DB_MAP_SIZE_KB',
    parseEnv: (val: string | undefined) => (val ? +val : undefined),
    description: 'The maximum possible size of the world state DB',
  },
  worldStateDataDirectory: {
    env: 'WS_DATA_DIRECTORY',
    description: 'Optional directory for the world state database',
  },
};

/**
 * Returns the configuration values for the world state synchronizer.
 * @returns The configuration values for the world state synchronizer.
 */
export function getWorldStateConfigFromEnv(): WorldStateConfig {
  return getConfigFromMappings<WorldStateConfig>(worldStateConfigMappings);
}
