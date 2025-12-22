import { MemoryBlobStore } from '../blobstore/memory_blob_store.js';
import { LocalBlobClient } from './local.js';
import { runBlobClientTests } from './tests.js';

describe('LocalBlobClient', () => {
  runBlobClientTests(() => {
    const store = new MemoryBlobStore();
    const client = new LocalBlobClient(store);
    return Promise.resolve({
      client,
      cleanup: async () => {
        // No cleanup needed for memory store
      },
    });
  });
});
