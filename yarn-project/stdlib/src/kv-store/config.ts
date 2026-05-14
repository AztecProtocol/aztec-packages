import { type L1ContractAddresses, pickL1ContractAddressMappings } from '@aztec/ethereum/l1-contract-addresses';
import {
  type ConfigMappingsType,
  composeConfigMappings,
  getConfigFromMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';

type OwnDataStoreConfig = {
  dataDirectory?: string;
  dataStoreMapSizeKb: number;
};

export type DataStoreConfig = OwnDataStoreConfig & Partial<Pick<L1ContractAddresses, 'rollupAddress'>>;

const ownDataStoreConfigMappings: ConfigMappingsType<OwnDataStoreConfig> = {
  dataDirectory: {
    env: 'DATA_DIRECTORY',
    description: 'Optional dir to store data. If omitted will store in memory.',
  },
  dataStoreMapSizeKb: {
    env: 'DATA_STORE_MAP_SIZE_KB',
    description: 'The maximum possible size of a data store DB in KB. Can be overridden by component-specific options.',
    ...numberConfigHelper(128 * 1_024 * 1_024), // Defaulted to 128 GB
  },
};

export const dataConfigMappings: ConfigMappingsType<DataStoreConfig> = composeConfigMappings(
  ownDataStoreConfigMappings,
  pickL1ContractAddressMappings('rollupAddress'),
);

/**
 * Returns the archiver configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The archiver configuration.
 */
export function getDataConfigFromEnv(): DataStoreConfig {
  return getConfigFromMappings<DataStoreConfig>(dataConfigMappings);
}
