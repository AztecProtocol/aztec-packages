import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { describeBlobStore } from './blob_store_test_suite.js';
import { DiskBlobStore } from './disk_blob_store.js';

describe('DiskBlobStore', () => {
  describeBlobStore(async () => new DiskBlobStore(await openTmpStore('test')));
});
