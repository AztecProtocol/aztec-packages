import { l1ContractAddressesMapping } from '@aztec/ethereum/l1-contract-addresses';
import { type ConfigMappingsType, getConfigFromMappings, numberConfigHelper } from '@aztec/foundation/config';
import type { EthAddress } from '@aztec/foundation/eth-address';

export type DataStoreConfig = {
  dataDirectory: string | undefined;
  dataStoreMapSizeKB: number;
  l1Contracts?: { rollupAddress: EthAddress };
};

export const dataConfigMappings: ConfigMappingsType<DataStoreConfig> = {
  dataDirectory: {
    env: 'DATA_DIRECTORY',
    description: 'Optional dir to store data. If omitted will store in memory.',
  },
  dataStoreMapSizeKB: {
    env: 'DATA_STORE_MAP_SIZE_KB',
    description: 'The maximum possible size of a data store DB in KB. Can be overridden by component-specific options.',
    ...numberConfigHelper(128 * 1_024 * 1_024), // Defaulted to 128 GB
  },
  l1Contracts: {
    description: 'The deployed L1 contract addresses',
    nested: {
      rollupAddress: l1ContractAddressesMapping.rollupAddress,
    },
  },
};

/**
 * Returns the archiver configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The archiver configuration.
 */
export function getDataConfigFromEnv(): DataStoreConfig {
  return getConfigFromMappings<DataStoreConfig>(dataConfigMappings);
}
