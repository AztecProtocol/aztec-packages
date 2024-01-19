import { EthAddress } from '@aztec/circuits.js';
import { AztecLmdbStore } from '@aztec/kv-store';

import { describeArchiverDataStore } from '../archiver_store_test_suite.js';
import { KVArchiverDataStore } from './kv_archiver_store.js';

describe('KVArchiverDataStore', () => {
  let archiverStore: KVArchiverDataStore;

  beforeEach(async () => {
    archiverStore = new KVArchiverDataStore(await AztecLmdbStore.create(EthAddress.random()));
  });

  describeArchiverDataStore('ArchiverStore', () => archiverStore);
});
