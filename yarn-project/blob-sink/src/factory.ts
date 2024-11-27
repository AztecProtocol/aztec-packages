import { type AztecKVStore } from '@aztec/kv-store';
import { createStore } from '@aztec/kv-store/lmdb';
import { type TelemetryClient } from '@aztec/telemetry-client';

import { type BlobSinkConfig } from './config.js';
import { BlobSinkServer } from './server.js';

// If data store settings are provided, the store is created and returned.
// Otherwise, undefined is returned and an in memory store will be used.
async function getDataStoreConfig(config?: BlobSinkConfig): Promise<AztecKVStore | undefined> {
  if (!config?.dataDirectory) {
    return undefined;
  }
  return await createStore('blob-sink', config);
}

/**
 * Creates a blob sink service from the provided config.
 */
export async function createBlobSinkServer(
  config?: BlobSinkConfig,
  telemetry?: TelemetryClient,
): Promise<BlobSinkServer> {
  const store = await getDataStoreConfig(config);

  return new BlobSinkServer(config, store, telemetry);
}
