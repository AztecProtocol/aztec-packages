import {
  type L1ContractAddresses,
  type L1ReaderConfig,
  l1ContractAddressesMapping,
  l1ReaderConfigMappings,
} from '@aztec/ethereum';
import { type ConfigMappingsType, getConfigFromMappings, pickConfigMappings } from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';

import { type BlobSinkArchiveApiConfig, blobSinkArchiveApiConfigMappings } from '../archive/config.js';

export type BlobSinkConfig = {
  port?: number;
  archiveApiUrl?: string;
} & BlobSinkArchiveApiConfig &
  Partial<Pick<L1ReaderConfig, 'l1RpcUrls'> & Pick<L1ContractAddresses, 'rollupAddress'>> &
  Partial<DataStoreConfig>;

export const blobSinkConfigMappings: ConfigMappingsType<BlobSinkConfig> = {
  port: {
    env: 'BLOB_SINK_PORT',
    description: 'The port to run the blob sink server on',
  },

  ...blobSinkArchiveApiConfigMappings,
  ...pickConfigMappings(l1ReaderConfigMappings, ['l1RpcUrls']),
  ...pickConfigMappings(l1ContractAddressesMapping, ['rollupAddress']),
  ...dataConfigMappings,
};

/**
 * Returns the blob sink configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The blob sink configuration.
 */
export function getBlobSinkConfigFromEnv(): BlobSinkConfig {
  return getConfigFromMappings<BlobSinkConfig>(blobSinkConfigMappings);
}
