import { getPublicClient } from '@aztec/ethereum';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { createBlobArchiveClient } from '../archive/factory.js';
import { DiskBlobStore } from '../blobstore/disk_blob_store.js';
import type { BlobStore } from '../blobstore/interface.js';
import { MemoryBlobStore } from '../blobstore/memory_blob_store.js';
import type { BlobSinkConfig } from './config.js';
import { BlobSinkServer } from './server.js';

// If data store settings are provided, the store is created and returned.
// Otherwise, undefined is returned and an in memory store will be used.
async function getDataStore(config: BlobSinkConfig): Promise<BlobStore> {
  if (!config?.dataDirectory || !config?.dataStoreMapSizeKB) {
    return new MemoryBlobStore();
  }

  const db = await createStore('blob-sink', 1, {
    l1Contracts: config.l1Contracts ?? {},
    dataDirectory: config.dataDirectory,
    dataStoreMapSizeKB: config.dataStoreMapSizeKB,
  });

  return new DiskBlobStore(db);
}

/**
 * Creates a blob sink service from the provided config.
 */
export async function createBlobSinkServer(
  config: BlobSinkConfig,
  telemetry?: TelemetryClient,
): Promise<BlobSinkServer> {
  const store = await getDataStore(config);
  const archiveClient = createBlobArchiveClient(config);
  const { l1ChainId, l1RpcUrls } = config;
  const l1PublicClient = l1ChainId && l1RpcUrls ? getPublicClient({ l1ChainId, l1RpcUrls }) : undefined;

  return new BlobSinkServer(config, store, archiveClient, l1PublicClient, telemetry);
}
