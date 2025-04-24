import { type L1ReaderConfig, l1ReaderConfigMappings } from '@aztec/ethereum';
import { type ConfigMappingsType, getConfigFromMappings } from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';
import { type ChainConfig, chainConfigMappings } from '@aztec/stdlib/config';

import {
  type BlobSinkConfig as BlobSinkClientConfig,
  blobSinkConfigMapping as blobSinkClientConfigMapping,
} from '../client/config.js';

export type BlobSinkConfig = {
  port?: number;
} & Omit<BlobSinkClientConfig, 'blobSinkUrl'> &
  Partial<DataStoreConfig> &
  Partial<L1ReaderConfig> &
  Partial<ChainConfig>;

export const blobSinkConfigMappings: ConfigMappingsType<BlobSinkConfig> = {
  port: {
    env: 'BLOB_SINK_PORT',
    description: 'The port to run the blob sink server on',
  },
  ...blobSinkClientConfigMapping,
  ...dataConfigMappings,
  ...chainConfigMappings,
  ...l1ReaderConfigMappings,
};

/**
 * Returns the blob sink configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The blob sink configuration.
 */
export function getBlobSinkConfigFromEnv(): BlobSinkConfig {
  return getConfigFromMappings<BlobSinkConfig>(blobSinkConfigMappings);
}
