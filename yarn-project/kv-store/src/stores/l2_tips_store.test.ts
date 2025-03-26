import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { L2TipsKVStore } from './l2_tips_store.js';
import { testL2TipsStore } from './l2_tips_store_suite.test.js';

describe('L2TipsStore', () => {
  let kvStore: AztecAsyncKVStore;

  beforeEach(async () => {
    kvStore = await openTmpStore('test', true);
  });

  afterEach(async () => {
    await kvStore.delete();
  });

  testL2TipsStore(async () => {
    kvStore = await openTmpStore('test', true);
    return new L2TipsKVStore(kvStore, 'test');
  });
});
