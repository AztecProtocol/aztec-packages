import { type ConfigMappingsType, getConfigFromMappings, numberConfigHelper } from '@aztec/foundation/config';

/** World State synchronizer configuration values. */
export interface WorldStateConfig {
  /** The frequency in which to check. */
  worldStateBlockCheckIntervalMS: number;

  /** Size of the batch for each get-blocks request from the synchronizer to the archiver. */
  worldStateBlockRequestBatchSize?: number;

  /** The map size to be provided to LMDB for each world state tree DB, optional, will inherit from the general dataStoreMapSizeKb if not specified*/
  worldStateDbMapSizeKb?: number;

  /** The map size to be provided to LMDB for each world state archive tree, optional, will inherit from the general worldStateDbMapSizeKb if not specified*/
  archiveTreeMapSizeKb?: number;

  /** The map size to be provided to LMDB for each world state nullifier tree, optional, will inherit from the general worldStateDbMapSizeKb if not specified*/
  nullifierTreeMapSizeKb?: number;

  /** The map size to be provided to LMDB for each world state note hash tree, optional, will inherit from the general worldStateDbMapSizeKb if not specified*/
  noteHashTreeMapSizeKb?: number;

  /** The map size to be provided to LMDB for each world state message tree, optional, will inherit from the general worldStateDbMapSizeKb if not specified*/
  messageTreeMapSizeKb?: number;

  /** The map size to be provided to LMDB for each world state public data tree, optional, will inherit from the general worldStateDbMapSizeKb if not specified*/
  publicDataTreeMapSizeKb?: number;

  /** Optional directory for the world state DB, if unspecified will default to the general data directory */
  worldStateDataDirectory?: string;

  /** The number of historic checkpoints worth of blocks to maintain */
  worldStateCheckpointHistory: number;
}

export const worldStateConfigMappings: ConfigMappingsType<WorldStateConfig> = {
  worldStateBlockCheckIntervalMS: {
    env: 'WS_BLOCK_CHECK_INTERVAL_MS',
    parseEnv: (val: string) => +val,
    defaultValue: 100,
    description: 'The frequency in which to check.',
  },
  worldStateBlockRequestBatchSize: {
    env: 'WS_BLOCK_REQUEST_BATCH_SIZE',
    parseEnv: (val: string | undefined) => (val ? +val : undefined),
    description: 'Size of the batch for each get-blocks request from the synchronizer to the archiver.',
  },
  worldStateDbMapSizeKb: {
    env: 'WS_DB_MAP_SIZE_KB',
    parseEnv: (val: string | undefined) => (val ? +val : undefined),
    description: 'The maximum possible size of the world state DB in KB. Overwrites the general dataStoreMapSizeKb.',
  },
  archiveTreeMapSizeKb: {
    env: 'ARCHIVE_TREE_MAP_SIZE_KB',
    parseEnv: (val: string | undefined) => (val ? +val : undefined),
    description:
      'The maximum possible size of the world state archive tree in KB. Overwrites the general worldStateDbMapSizeKb.',
  },
  nullifierTreeMapSizeKb: {
    env: 'NULLIFIER_TREE_MAP_SIZE_KB',
    parseEnv: (val: string | undefined) => (val ? +val : undefined),
    description:
      'The maximum possible size of the world state nullifier tree in KB. Overwrites the general worldStateDbMapSizeKb.',
  },
  noteHashTreeMapSizeKb: {
    env: 'NOTE_HASH_TREE_MAP_SIZE_KB',
    parseEnv: (val: string | undefined) => (val ? +val : undefined),
    description:
      'The maximum possible size of the world state note hash tree in KB. Overwrites the general worldStateDbMapSizeKb.',
  },
  messageTreeMapSizeKb: {
    env: 'MESSAGE_TREE_MAP_SIZE_KB',
    parseEnv: (val: string | undefined) => (val ? +val : undefined),
    description:
      'The maximum possible size of the world state message tree in KB. Overwrites the general worldStateDbMapSizeKb.',
  },
  publicDataTreeMapSizeKb: {
    env: 'PUBLIC_DATA_TREE_MAP_SIZE_KB',
    parseEnv: (val: string | undefined) => (val ? +val : undefined),
    description:
      'The maximum possible size of the world state public data tree in KB. Overwrites the general worldStateDbMapSizeKb.',
  },
  worldStateDataDirectory: {
    env: 'WS_DATA_DIRECTORY',
    description: 'Optional directory for the world state database',
  },
  worldStateCheckpointHistory: {
    env: 'WS_NUM_HISTORIC_CHECKPOINTS',
    description:
      'The number of historic checkpoints worth of blocks to maintain. Values less than 1 mean all history is maintained',
    fallback: ['WS_NUM_HISTORIC_BLOCKS'],
    ...numberConfigHelper(64),
  },
};

/**
 * Returns the configuration values for the world state synchronizer.
 * @returns The configuration values for the world state synchronizer.
 */
export function getWorldStateConfigFromEnv(): WorldStateConfig {
  return getConfigFromMappings<WorldStateConfig>(worldStateConfigMappings);
}
