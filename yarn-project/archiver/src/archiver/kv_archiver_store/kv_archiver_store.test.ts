import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { describeArchiverDataStore } from '../archiver_store_test_suite.js';
import { KVArchiverDataStore } from './kv_archiver_store.js';

describe('KVArchiverDataStore', () => {
  let archiverStore: KVArchiverDataStore;

  beforeEach(async () => {
    archiverStore = new KVArchiverDataStore(await openTmpStore('archiver_test'));
  });

  describeArchiverDataStore('ArchiverStore', () => archiverStore);
});
