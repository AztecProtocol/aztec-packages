import { type Logger, createLogger } from '@aztec/foundation/log';

import { MemoryBlobStore } from '../blobstore/memory_blob_store.js';
import {
  type BlobFileStoreMetadata,
  createReadOnlyFileStoreBlobClients,
  createWritableFileStoreBlobClient,
} from '../filestore/factory.js';
import type { FileStoreBlobClient } from '../filestore/filestore_blob_client.js';
import { type BlobClientConfig, hasRemoteBlobSources } from './config.js';
import { HttpBlobClient } from './http.js';
import type { BlobClientInterface } from './interface.js';
import { LocalBlobClient } from './local.js';

export interface CreateBlobClientDeps {
  logger?: Logger;
  /** FileStore clients for reading blobs */
  fileStoreClients?: FileStoreBlobClient[];
  /** FileStore client for uploading blobs */
  fileStoreUploadClient?: FileStoreBlobClient;
}

export function createBlobClient(config?: BlobClientConfig, deps?: CreateBlobClientDeps): BlobClientInterface {
  const log = deps?.logger ?? createLogger('blob-client');
  if (!hasRemoteBlobSources(config)) {
    log.info(`Creating local blob client.`);
    const blobStore = new MemoryBlobStore();
    return new LocalBlobClient(blobStore);
  }

  log.info(`Creating blob client.`, {
    l1ConsensusHostUrls: config?.l1ConsensusHostUrls,
    archiveApiUrl: config?.archiveApiUrl,
    fileStoreCount: deps?.fileStoreClients?.length ?? 0,
    hasFileStoreUpload: !!deps?.fileStoreUploadClient,
  });
  return new HttpBlobClient(config, {
    logger: log,
    fileStoreClients: deps?.fileStoreClients,
    fileStoreUploadClient: deps?.fileStoreUploadClient,
  });
}

/**
 * Configuration required for creating a blob client with file stores.
 * Extends BlobClientConfig with the metadata needed to construct file store paths.
 */
export interface BlobClientWithFileStoresConfig extends BlobClientConfig {
  l1ChainId: number;
  rollupVersion: number;
  rollupAddress: { toString(): string };
}

/**
 * Creates a BlobClient with FileStore clients for reading and uploading blobs.
 * This is a convenience function that handles the common pattern of:
 * 1. Building BlobFileStoreMetadata from config
 * 2. Creating read-only FileStore clients
 * 3. Creating a writable FileStore client for uploads
 * 4. Creating the BlobClient with these dependencies
 * 5. Starting the client (uploads initial healthcheck file if upload client is configured)
 *
 * @param config - Configuration containing blob client settings and chain metadata
 * @param logger - Optional logger for the blob client
 * @returns A BlobClientInterface configured with file store support, already started
 */
export async function createBlobClientWithFileStores(
  config: BlobClientWithFileStoresConfig,
  logger?: Logger,
): Promise<BlobClientInterface> {
  const log = logger ?? createLogger('blob-client');

  const fileStoreMetadata: BlobFileStoreMetadata = {
    l1ChainId: config.l1ChainId,
    rollupVersion: config.rollupVersion,
    rollupAddress: config.rollupAddress.toString(),
  };

  // Disable internal retries for blob file stores — retry logic is handled by HttpBlobClient.
  // Set a configurable timeout (default 10s) to avoid hanging on slow stores.
  const httpOptions = {
    retryBackoff: [] as number[],
    timeoutMs: config.blobFileStoreTimeoutMs ?? 10_000,
  };

  const [fileStoreClients, fileStoreUploadClient] = await Promise.all([
    createReadOnlyFileStoreBlobClients(config.blobFileStoreUrls, fileStoreMetadata, log, httpOptions),
    createWritableFileStoreBlobClient(config.blobFileStoreUploadUrl, fileStoreMetadata, log),
  ]);

  const client = createBlobClient(config, {
    logger: log,
    fileStoreClients,
    fileStoreUploadClient,
  });

  await client.start?.();

  return client;
}
