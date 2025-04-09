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
   * List of URLs for L1 consensus clients
   */
  l1ConsensusHostUrls?: string[];

  /**
   * List of API keys for the corresponding L1 consensus client URLs. Added at the end of the URL as "?key=<api-key>" unless a header is defined
   */
  l1ConsensusHostApiKeys?: string[];

  /**
   * List of header names for the corresponding L1 consensus client API keys, if needed. Added as "<api-key-header>: <api-key>"
   */
  l1ConsensusHostApiKeyHeaders?: string[];
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
  l1ConsensusHostUrls: {
    env: 'L1_CONSENSUS_HOST_URLS',
    description: 'List of URLS for L1 consensus clients',
    parseEnv: (val: string) => val.split(',').map(url => url.trim().replace(/\/$/, '')),
  },
  l1ConsensusHostApiKeys: {
    env: 'L1_CONSENSUS_HOST_API_KEYS',
    description:
      'List of API keys for the corresponding L1 consensus clients, if needed. Added to the end of the corresponding URL as "?key=<api-key>" unless a header is defined',
    parseEnv: (val: string) => val.split(',').map(url => url.trim()),
  },
  l1ConsensusHostApiKeyHeaders: {
    env: 'L1_CONSENSUS_HOST_API_KEY_HEADERS',
    description:
      'List of header names for the corresponding L1 consensus client API keys, if needed. Added to the corresponding request as "<api-key-header>: <api-key>"',
    parseEnv: (val: string) => val.split(',').map(url => url.trim()),
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
