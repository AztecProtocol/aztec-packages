import { MemoryBlobStore } from '../blobstore/memory_blob_store.js';
import { LocalBlobSinkClient } from './local.js';
import { runBlobSinkClientTests } from './tests.js';

describe('LocalBlobSinkClient', () => {
  runBlobSinkClientTests(() => {
    const store = new MemoryBlobStore();
    const client = new LocalBlobSinkClient(store);
    return Promise.resolve({
      client,
      cleanup: async () => {
        // No cleanup needed for memory store
      },
    });
  });
});
