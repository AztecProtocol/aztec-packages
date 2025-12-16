import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { describeAttestationPool } from './attestation_pool_test_suite.js';
import { KvAttestationPool } from './kv_attestation_pool.js';

describe('KV Attestation Pool', () => {
  let kvAttestationPool: KvAttestationPool;
  let store: AztecAsyncKVStore;

  beforeEach(async () => {
    store = await openTmpStore('test');
    kvAttestationPool = new KvAttestationPool(store);
  });

  afterEach(() => store.close());

  describeAttestationPool(() => kvAttestationPool);
});
