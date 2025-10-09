import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { describeContractDataStore } from './contract_data_store_test_suite.js';
import { KVContractDataStore } from './kv_contract_data_store.js';

describe('KVContractDataStore', () => {
  let contractStore: KVContractDataStore;

  beforeEach(async () => {
    const store = await openTmpStore('contract_data_store_test');
    contractStore = new KVContractDataStore(store);
  });

  describeContractDataStore('ContractDataStore', () => contractStore);
});
