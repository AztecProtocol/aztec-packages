import { type ConfigMappingsType, getConfigFromMappings } from '@aztec/foundation/config';

/**
 * The configuration for the blob sink client
 */
export interface BlobSinkConfig {
  /**
   * The URL of the blob sink
   */
  blobSinkUrl?: string;

  /**
   * The URL of the L1 RPC Execution client
   */
  l1RpcUrl?: string;

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
  l1RpcUrl: {
    env: 'ETHEREUM_HOST',
    description: 'The URL of the L1 RPC Execution client',
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
};

/**
 * Returns the blob sink configuration from the environment variables.
 * @returns The blob sink configuration.
 */
export function getBlobSinkConfigFromEnv(): BlobSinkConfig {
  return getConfigFromMappings<BlobSinkConfig>(blobSinkConfigMapping);
}
