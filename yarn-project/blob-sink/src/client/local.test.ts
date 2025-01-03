import { MemoryBlobStore } from '../blobstore/memory_blob_store.js';
import { runBlobSinkClientTests } from './blob-sink-client-tests.js';
import { LocalBlobSinkClient } from './local.js';

describe('LocalBlobSinkClient', () => {
  runBlobSinkClientTests(async () => {
    const store = new MemoryBlobStore();
    const client = new LocalBlobSinkClient(store);
    return {
      client,
      cleanup: async () => {
        // No cleanup needed for memory store
      },
    };
  });
});
