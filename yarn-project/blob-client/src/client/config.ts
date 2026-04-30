import {
  type ConfigMappingsType,
  SecretValue,
  booleanConfigHelper,
  getConfigFromMappings,
  optionalNumberConfigHelper,
} from '@aztec/foundation/config';

import { type BlobArchiveApiConfig, blobArchiveApiConfigMappings } from '../archive/config.js';

/**
 * The configuration for the blob client
 */
export interface BlobClientConfig extends BlobArchiveApiConfig {
  /**
   * List of URLs for L1 RPC Execution clients
   */
  l1RpcUrls?: string[];

  /**
   * List of URLs of the Ethereum consensus nodes that services will connect to (comma separated)
   */
  l1ConsensusHostUrls?: string[];

  /**
   * List of API keys for the corresponding L1 consensus client URLs. Added at the end of the URL as "?key=<api-key>" unless a header is defined
   */
  l1ConsensusHostApiKeys?: SecretValue<string>[];

  /**
   * List of header names for the corresponding L1 consensus client API keys, if needed. Added as "<api-key-header>: <api-key>"
   */
  l1ConsensusHostApiKeyHeaders?: string[];

  /**
   * The map size to be provided to LMDB for each blob sink DB, optional, will inherit from the general dataStoreMapSizeKb if not specified
   */
  blobSinkMapSizeKb?: number;

  /**
   * Whether to allow having no blob sources configured during startup
   */
  blobAllowEmptySources?: boolean;

  /**
   * URLs for reading blobs from filestore (s3://, gs://, file://, https://). Tried in order until blobs are found.
   */
  blobFileStoreUrls?: string[];

  /**
   * URL for uploading blobs to filestore (s3://, gs://, file://)
   */
  blobFileStoreUploadUrl?: string;

  /**
   * Interval in minutes for uploading healthcheck file to file store (default: 60 = 1 hour)
   */
  blobHealthcheckUploadIntervalMinutes?: number;

  /** Timeout for HTTP requests to the L1 RPC node in ms. */
  l1HttpTimeoutMS?: number;

  /** Whether to prefer filestores over consensus clients when fetching blobs. Default: false (consensus first). */
  blobPreferFilestores?: boolean;

  /** Timeout in ms for HTTP requests to the blob file store. Default: 10000 (10s). */
  blobFileStoreTimeoutMs?: number;
}

export const blobClientConfigMapping: ConfigMappingsType<BlobClientConfig> = {
  l1RpcUrls: {
    env: 'ETHEREUM_HOSTS',
    description: 'List of URLs for L1 RPC Execution clients',
    parseEnv: (val: string) => val.split(',').map(url => url.trim()),
  },
  l1ConsensusHostUrls: {
    env: 'L1_CONSENSUS_HOST_URLS',
    description: 'List of URLs of the Ethereum consensus nodes that services will connect to (comma separated)',
    parseEnv: (val: string) => val.split(',').map(url => url.trim().replace(/\/$/, '')),
  },
  l1ConsensusHostApiKeys: {
    env: 'L1_CONSENSUS_HOST_API_KEYS',
    description:
      'List of API keys for the corresponding L1 consensus clients, if needed. Added to the end of the corresponding URL as "?key=<api-key>" unless a header is defined',
    parseEnv: (val: string) => val.split(',').map(key => new SecretValue(key.trim())),
  },
  l1ConsensusHostApiKeyHeaders: {
    env: 'L1_CONSENSUS_HOST_API_KEY_HEADERS',
    description:
      'List of header names for the corresponding L1 consensus client API keys, if needed. Added to the corresponding request as "<api-key-header>: <api-key>"',
    parseEnv: (val: string) => val.split(',').map(url => url.trim()),
  },
  blobSinkMapSizeKb: {
    env: 'BLOB_SINK_MAP_SIZE_KB',
    description: 'The maximum possible size of the blob sink DB in KB. Overwrites the general dataStoreMapSizeKb.',
    ...optionalNumberConfigHelper(),
  },
  blobAllowEmptySources: {
    env: 'BLOB_ALLOW_EMPTY_SOURCES',
    description: 'Whether to allow having no blob sources configured during startup',
    ...booleanConfigHelper(false),
  },
  blobFileStoreUrls: {
    env: 'BLOB_FILE_STORE_URLS',
    description: 'URLs for filestore blob archive, comma-separated. Tried in order until blobs are found.',
    parseEnv: (val: string) =>
      val
        .split(',')
        .map(url => url.trim())
        .filter(url => url.length > 0),
  },
  blobFileStoreUploadUrl: {
    env: 'BLOB_FILE_STORE_UPLOAD_URL',
    description: 'URL for uploading blobs to filestore (s3://, gs://, file://)',
  },
  blobHealthcheckUploadIntervalMinutes: {
    env: 'BLOB_HEALTHCHECK_UPLOAD_INTERVAL_MINUTES',
    description: 'Interval in minutes for uploading healthcheck file to file store (default: 60 = 1 hour)',
    ...optionalNumberConfigHelper(),
  },
  l1HttpTimeoutMS: {
    env: 'ETHEREUM_HTTP_TIMEOUT_MS',
    description: 'Timeout for HTTP requests to the L1 RPC node in ms.',
    ...optionalNumberConfigHelper(),
  },
  blobPreferFilestores: {
    env: 'BLOB_PREFER_FILESTORES',
    description: 'Whether to prefer filestores over consensus clients when fetching blobs. Default: false.',
    ...booleanConfigHelper(false),
  },
  blobFileStoreTimeoutMs: {
    env: 'BLOB_FILE_STORE_TIMEOUT_MS',
    description: 'Timeout in ms for HTTP requests to the blob file store. Default: 10000 (10s).',
    ...optionalNumberConfigHelper(),
  },
  ...blobArchiveApiConfigMappings,
};

/**
 * Returns the blob client configuration from the environment variables.
 * @returns The blob client configuration.
 */
export function getBlobClientConfigFromEnv(): BlobClientConfig {
  return getConfigFromMappings<BlobClientConfig>(blobClientConfigMapping);
}

/**
 * Returns whether the given blob client config has any remote sources defined.
 */
export function hasRemoteBlobSources(config: BlobClientConfig = {}): boolean {
  return !!(config.l1ConsensusHostUrls?.length || config.archiveApiUrl || config.blobFileStoreUrls?.length);
}
