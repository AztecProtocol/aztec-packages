import { getPublicClient } from '@aztec/ethereum';
import { createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { createStore } from '@aztec/kv-store/lmdb-v2';
import type { TelemetryClient } from '@aztec/telemetry-client';

import { hasRemoteBlobSinkSources } from '../client/config.js';
import { HttpBlobSinkClient } from '../client/http.js';
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
  const blobClient = hasRemoteBlobSinkSources(config)
    ? new HttpBlobSinkClient(config, {
        onBlobDeserializationError: 'trace',
        logger: createLogger('blob-sink:server:http'),
      })
    : undefined;
  const { l1ChainId, l1RpcUrls } = config;
  const l1PublicClient = l1ChainId && l1RpcUrls ? getPublicClient({ l1ChainId, l1RpcUrls }) : undefined;

  return new BlobSinkServer(config, store, blobClient, l1PublicClient, telemetry);
}
