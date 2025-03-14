import { getPublicClient } from '@aztec/ethereum';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { createBlobArchiveClient } from '../archive/factory.js';
import type { BlobSinkConfig } from './config.js';
import { BlobSinkServer } from './server.js';

// If data store settings are provided, the store is created and returned.
// Otherwise, undefined is returned and an in memory store will be used.
async function getDataStoreConfig(config?: BlobSinkConfig): Promise<AztecAsyncKVStore | undefined> {
  if (!config?.dataStoreConfig) {
    return undefined;
  }
  return await createStore('blob-sink', 1, config.dataStoreConfig);
}

/**
 * Creates a blob sink service from the provided config.
 */
export async function createBlobSinkServer(
  config: BlobSinkConfig = {},
  telemetry?: TelemetryClient,
): Promise<BlobSinkServer> {
  const store = await getDataStoreConfig(config);
  const archiveClient = createBlobArchiveClient(config);
  const { l1ChainId, l1RpcUrls } = config;
  const l1PublicClient = l1ChainId && l1RpcUrls ? getPublicClient({ l1ChainId, l1RpcUrls }) : undefined;

  return new BlobSinkServer(config, store, archiveClient, l1PublicClient, telemetry);
}
