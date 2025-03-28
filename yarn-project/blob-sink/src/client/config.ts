import { type ConfigMappingsType, getConfigFromMappings } from '@aztec/foundation/config';

import { type BlobSinkArchiveApiConfig, blobSinkArchiveApiConfigMappings } from '../archive/config.js';

/**
 * The configuration for the blob sink client
 */
export interface BlobSinkConfig extends BlobSinkArchiveApiConfig {
  /**
   * The URL of the blob sink
   */
  blobSinkUrl?: string;

  /**
   * List of URLs for L1 RPC Execution clients
   */
  l1RpcUrls?: string[];

  /**
   * The URL of the L1 consensus client
   */
  l1ConsensusHostUrl?: string;

  /**
   * The API key for the L1 consensus client. Added end of URL as "?key=<api-key>" unless a header is defined
   */
  l1ConsensusHostApiKey?: string;

  /**
   * The header name for the L1 consensus client API key, if needed. Added as "<api-key-header>: <api-key>"
   */
  l1ConsensusHostApiKeyHeader?: string;
}

export const blobSinkConfigMapping: ConfigMappingsType<BlobSinkConfig> = {
  blobSinkUrl: {
    env: 'BLOB_SINK_URL',
    description: 'The URL of the blob sink',
  },
  l1RpcUrls: {
    env: 'ETHEREUM_HOSTS',
    description: 'List of URLs for L1 RPC Execution clients',
    parseEnv: (val: string) => val.split(',').map(url => url.trim()),
  },
  l1ConsensusHostUrl: {
    env: 'L1_CONSENSUS_HOST_URL',
    description: 'The URL of the L1 consensus client',
  },
  l1ConsensusHostApiKey: {
    env: 'L1_CONSENSUS_HOST_API_KEY',
    description:
      'The API key for the L1 consensus client, if needed. Added end of URL as "?key=<api-key>" unless a header is defined',
  },
  l1ConsensusHostApiKeyHeader: {
    env: 'L1_CONSENSUS_HOST_API_KEY_HEADER',
    description:
      'The header name for the L1 consensus client API key, if needed. Added as "<api-key-header>: <api-key>"',
  },
  ...blobSinkArchiveApiConfigMappings,
};

/**
 * Returns the blob sink configuration from the environment variables.
 * @returns The blob sink configuration.
 */
export function getBlobSinkConfigFromEnv(): BlobSinkConfig {
  return getConfigFromMappings<BlobSinkConfig>(blobSinkConfigMapping);
}
