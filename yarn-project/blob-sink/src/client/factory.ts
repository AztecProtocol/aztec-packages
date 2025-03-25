import { MemoryBlobStore } from '../blobstore/memory_blob_store.js';
import type { BlobSinkConfig } from './config.js';
import { HttpBlobSinkClient } from './http.js';
import type { BlobSinkClientInterface } from './interface.js';
import { LocalBlobSinkClient } from './local.js';

export function createBlobSinkClient(config?: BlobSinkConfig): BlobSinkClientInterface {
  if (
    !config?.blobSinkUrl &&
    (!config?.l1ConsensusHostUrls || config?.l1ConsensusHostUrls?.length == 0) &&
    !config?.archiveApiUrl
  ) {
    const blobStore = new MemoryBlobStore();
    return new LocalBlobSinkClient(blobStore);
  }

  return new HttpBlobSinkClient(config);
}
