import { mockTx } from '@aztec/circuit-types';
import { openTmpStore } from '@aztec/kv-store/lmdb';

import { AztecKVTxPool } from './aztec_kv_tx_pool.js';
import { describeTxPool } from './tx_pool_test_suite.js';

describe('KV TX pool', () => {
  let txPool: AztecKVTxPool;
  beforeEach(() => {
    txPool = new AztecKVTxPool(openTmpStore(), openTmpStore());
  });

  describeTxPool(() => txPool);

  it('Returns archived txs and purges archived txs once the archived tx limit is reached', async () => {
    // set the archived tx limit to 2
    txPool = new AztecKVTxPool(openTmpStore(), openTmpStore(), undefined, 2);

    const tx1 = mockTx(1);
    const tx2 = mockTx(2);
    const tx3 = mockTx(3);
    const tx4 = mockTx(4);
    const tx5 = mockTx(5);
    await txPool.addTxs([tx1, tx2, tx3, tx4, tx5]);

    // delete two txs and assert that they are properly archived
    await txPool.deleteTxs([tx1.getTxHash(), tx2.getTxHash()]);
    expect(txPool.getArchivedTxByHash(tx1.getTxHash())).toEqual(tx1);
    expect(txPool.getArchivedTxByHash(tx2.getTxHash())).toEqual(tx2);

    // delete a single tx and assert that the first tx is purged and the new tx is archived
    await txPool.deleteTxs([tx3.getTxHash()]);
    expect(txPool.getArchivedTxByHash(tx1.getTxHash())).toBeUndefined();
    expect(txPool.getArchivedTxByHash(tx2.getTxHash())).toEqual(tx2);
    expect(txPool.getArchivedTxByHash(tx3.getTxHash())).toEqual(tx3);

    // delete multiple txs and assert that the old txs are purged and the new txs are archived
    await txPool.deleteTxs([tx4.getTxHash(), tx5.getTxHash()]);
    expect(txPool.getArchivedTxByHash(tx1.getTxHash())).toBeUndefined();
    expect(txPool.getArchivedTxByHash(tx2.getTxHash())).toBeUndefined();
    expect(txPool.getArchivedTxByHash(tx3.getTxHash())).toBeUndefined();
    expect(txPool.getArchivedTxByHash(tx4.getTxHash())).toEqual(tx4);
    expect(txPool.getArchivedTxByHash(tx5.getTxHash())).toEqual(tx5);
  });
});
