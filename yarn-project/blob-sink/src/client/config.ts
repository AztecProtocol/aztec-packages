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
}

export const blobSinkConfigMapping: ConfigMappingsType<BlobSinkConfig> = {
  blobSinkUrl: {
    env: 'SEQ_BLOB_SINK_URL',
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
};

/**
 * Returns the blob sink configuration from the environment variables.
 * @returns The blob sink configuration.
 */
export function getBlobSinkConfigFromEnv(): BlobSinkConfig {
  return getConfigFromMappings<BlobSinkConfig>(blobSinkConfigMapping);
}
