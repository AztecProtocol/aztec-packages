import { describeBlobStore } from './blob_store_test_suite.js';
import { MemoryBlobStore } from './memory_blob_store.js';

describe('MemoryBlobStore', () => {
  describeBlobStore(() => new MemoryBlobStore());
});
