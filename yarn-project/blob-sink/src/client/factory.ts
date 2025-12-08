import { type Logger, createLogger } from '@aztec/foundation/log';

import { MemoryBlobStore } from '../blobstore/memory_blob_store.js';
import type { FileStoreBlobClient } from '../filestore/filestore_blob_client.js';
import { type BlobSinkConfig, hasRemoteBlobSinkSources } from './config.js';
import { HttpBlobSinkClient } from './http.js';
import type { BlobSinkClientInterface } from './interface.js';
import { LocalBlobSinkClient } from './local.js';

export interface CreateBlobSinkClientDeps {
  logger?: Logger;
  /** FileStore clients for reading blobs */
  fileStoreClients?: FileStoreBlobClient[];
  /** FileStore client for uploading blobs */
  fileStoreUploadClient?: FileStoreBlobClient;
}

export function createBlobSinkClient(
  config?: BlobSinkConfig,
  deps?: CreateBlobSinkClientDeps,
): BlobSinkClientInterface {
  const log = deps?.logger ?? createLogger('blob-sink:client');
  if (!hasRemoteBlobSinkSources(config)) {
    log.info(`Creating local blob sink client.`);
    const blobStore = new MemoryBlobStore();
    return new LocalBlobSinkClient(blobStore);
  }

  log.info(`Creating HTTP blob sink client.`, {
    blobSinkUrl: config?.blobSinkUrl,
    l1ConsensusHostUrls: config?.l1ConsensusHostUrls,
    archiveApiUrl: config?.archiveApiUrl,
    fileStoreCount: deps?.fileStoreClients?.length ?? 0,
    hasFileStoreUpload: !!deps?.fileStoreUploadClient,
  });
  return new HttpBlobSinkClient(config, {
    logger: log,
    fileStoreClients: deps?.fileStoreClients,
    fileStoreUploadClient: deps?.fileStoreUploadClient,
  });
}
