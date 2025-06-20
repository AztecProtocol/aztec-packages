import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { testL2TipsStore } from '@aztec/stdlib/block/test';

import { L2TipsKVStore } from './l2_tips_store.js';

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
