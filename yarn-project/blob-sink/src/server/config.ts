import {
  type L1ContractAddresses,
  type L1ReaderConfig,
  l1ContractAddressesMapping,
  l1ReaderConfigMappings,
} from '@aztec/ethereum';
import { type ConfigMappingsType, getConfigFromMappings, pickConfigMappings } from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';

export type BlobSinkConfig = {
  port?: number;
  archiveApiUrl?: string;
  dataStoreConfig?: DataStoreConfig;
} & Partial<Pick<L1ReaderConfig, 'l1ChainId' | 'l1RpcUrls'> & Pick<L1ContractAddresses, 'rollupAddress'>>;

export const blobSinkConfigMappings: ConfigMappingsType<BlobSinkConfig> = {
  port: {
    env: 'BLOB_SINK_PORT',
    description: 'The port to run the blob sink server on',
  },
  dataStoreConfig: {
    ...dataConfigMappings,
    description: 'The configuration for the data store',
  },
  archiveApiUrl: {
    env: 'BLOB_SINK_ARCHIVE_API_URL',
    description: 'The URL of the archive API',
  },
  ...pickConfigMappings(l1ReaderConfigMappings, ['l1ChainId', 'l1RpcUrls']),
  ...pickConfigMappings(l1ContractAddressesMapping, ['rollupAddress']),
};

/**
 * Returns the blob sink configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The blob sink configuration.
 */
export function getBlobSinkConfigFromEnv(): BlobSinkConfig {
  return getConfigFromMappings<BlobSinkConfig>(blobSinkConfigMappings);
}
