import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import type { TelemetryClient } from '@aztec/telemetry-client';

import type { BlobSinkConfig } from './config.js';
import { BlobSinkServer } from './server.js';

// If data store settings are provided, the store is created and returned.
// Otherwise, undefined is returned and an in memory store will be used.
async function getDataStore(config?: BlobSinkConfig): Promise<AztecAsyncKVStore | undefined> {
  if (!config?.dataDirectory || (!config?.dataStoreMapSizeKB && !config?.blobSinkMapSizeKb)) {
    return undefined;
  }
  return await createStore('blob-sink', 1, {
    ...config,
    // re-assigning to make TypeScript happy
    dataDirectory: config.dataDirectory,
    dataStoreMapSizeKB: (config.blobSinkMapSizeKb ?? config.dataStoreMapSizeKB)!,
  });
}

/**
 * Creates a blob sink service from the provided config.
 */
export async function createBlobSinkServer(
  config: BlobSinkConfig,
  telemetry?: TelemetryClient,
): Promise<BlobSinkServer> {
  const store = await getDataStore(config);

  return new BlobSinkServer(config, store, telemetry);
}
