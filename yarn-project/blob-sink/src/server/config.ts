import { type ConfigMappingsType, getConfigFromMappings } from '@aztec/foundation/config';
import { pickConfigMappings } from '@aztec/foundation/config';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/kv-store/config';
import type { ChainConfig } from '@aztec/stdlib/config';
import { chainConfigMappings } from '@aztec/stdlib/config';

export type BlobSinkConfig = {
  port?: number;
  archiveApiUrl?: string;
  dataStoreConfig?: DataStoreConfig;
} & Partial<Pick<ChainConfig, 'l1ChainId'>>;

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
  ...pickConfigMappings(chainConfigMappings, ['l1ChainId']),
};

/**
 * Returns the blob sink configuration from the environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The blob sink configuration.
 */
export function getBlobSinkConfigFromEnv(): BlobSinkConfig {
  return getConfigFromMappings<BlobSinkConfig>(blobSinkConfigMappings);
}
