import { openTmpStore } from '@aztec/kv-store/lmdb';

import { describeBlobStore } from './blob_store_test_suite.js';
import { DiskBlobStore } from './disk_blob_store.js';

describe('DiskBlobStore', () => {
  describeBlobStore(() => new DiskBlobStore(openTmpStore()));
});
