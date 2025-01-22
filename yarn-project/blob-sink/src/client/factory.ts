import { MemoryBlobStore } from '../blobstore/memory_blob_store.js';
import { HttpBlobSinkClient } from './http.js';
import { type BlobSinkClientInterface } from './interface.js';
import { LocalBlobSinkClient } from './local.js';

export function createBlobSinkClient(blobSinkUrl?: string): BlobSinkClientInterface {
  if (!blobSinkUrl) {
    const blobStore = new MemoryBlobStore();
    return new LocalBlobSinkClient(blobStore);
  }

  return new HttpBlobSinkClient(blobSinkUrl);
}
