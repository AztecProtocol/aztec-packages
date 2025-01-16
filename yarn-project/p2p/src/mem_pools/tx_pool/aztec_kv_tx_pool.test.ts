import { openTmpStore } from '@aztec/kv-store/lmdb';

import { AztecKVTxPool } from './aztec_kv_tx_pool.js';
import { describeTxPool } from './tx_pool_test_suite.js';

describe('KV TX pool', () => {
  let txPool: AztecKVTxPool;
  beforeEach(() => {
    txPool = new AztecKVTxPool(openTmpStore());
  });

  describeTxPool(() => txPool);
});
