import { MemoryBlobStore } from '../blobstore/memory_blob_store.js';
import type { BlobSinkConfig } from './config.js';
import { HttpBlobSinkClient } from './http.js';
import type { BlobSinkClientInterface } from './interface.js';
import { LocalBlobSinkClient } from './local.js';

export function createBlobSinkClient(config?: BlobSinkConfig): BlobSinkClientInterface {
  if (!config?.blobSinkUrl && !config?.l1ConsensusHostUrl && !config?.archiveApiUrl && !config?.l1ChainId) {
    const blobStore = new MemoryBlobStore();
    return new LocalBlobSinkClient(blobStore);
  }

  return new HttpBlobSinkClient(config);
}
