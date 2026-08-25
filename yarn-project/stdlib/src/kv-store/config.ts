import { type L1ContractAddresses, pickL1ContractAddressMappings } from '@aztec/ethereum/l1-contract-addresses';
import { type ConfigMappingsType, getConfigFromMappings, numberConfigHelper } from '@aztec/foundation/config';

/**
 * Slots in the LMDB reader table. Every concurrent cursor and every open read-only snapshot holds one, so this bounds
 * how many reads a store can have in flight at once.
 */
export const DEFAULT_DATA_STORE_MAX_READERS = 16;

export type DataStoreConfig = {
  dataDirectory?: string;
  dataStoreMapSizeKb: number;
  dataStoreMaxReaders?: number;
} & Partial<Pick<L1ContractAddresses, 'rollupAddress'>>;

export const dataConfigMappings: ConfigMappingsType<DataStoreConfig> = {
  dataDirectory: {
    env: 'DATA_DIRECTORY',
    description: 'Optional dir to store data. If omitted will store in memory.',
  },
  dataStoreMapSizeKb: {
    env: 'DATA_STORE_MAP_SIZE_KB',
    description: 'The maximum possible size of a data store DB in KB. Can be overridden by component-specific options.',
    ...numberConfigHelper(128 * 1_024 * 1_024), // Defaulted to 128 GB
  },
  dataStoreMaxReaders: {
    env: 'DATA_STORE_MAX_READERS',
    description: 'Maximum number of concurrent readers (cursors and read-only snapshots) on a data store DB.',
    ...numberConfigHelper(DEFAULT_DATA_STORE_MAX_READERS),
  },
  ...pickL1ContractAddressMappings('rollupAddress'),
};

/**
 * Returns the archiver configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The archiver configuration.
 */
export function getDataConfigFromEnv(): DataStoreConfig {
  return getConfigFromMappings<DataStoreConfig>(dataConfigMappings);
}
