import { type L1ContractAddresses, pickL1ContractAddressMappings } from '@aztec/ethereum/l1-contract-addresses';
import { type ConfigMappingsType, getConfigFromMappings, numberConfigHelper } from '@aztec/foundation/config';

export type DataStoreConfig = {
  dataDirectory?: string;
  dataStoreMapSizeKb: number;
  l1ChainId?: number;
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
  l1ChainId: {
    env: 'L1_CHAIN_ID',
    ...numberConfigHelper(31337),
    description: 'The chain ID of the ethereum host.',
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
