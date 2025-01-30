import { mockTx } from '@aztec/circuit-types';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { AztecKVTxPool } from './aztec_kv_tx_pool.js';
import { describeTxPool } from './tx_pool_test_suite.js';

describe('KV TX pool', () => {
  let txPool: AztecKVTxPool;
  beforeEach(async () => {
    txPool = new AztecKVTxPool(await openTmpStore('p2p'), await openTmpStore('archive'));
  });

  describeTxPool(() => txPool);

  it('Returns archived txs and purges archived txs once the archived tx limit is reached', async () => {
    // set the archived tx limit to 2
    txPool = new AztecKVTxPool(await openTmpStore('p2p'), await openTmpStore('archive'), undefined, 2);

    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);
    const tx4 = await mockTx(4);
    const tx5 = await mockTx(5);
    await txPool.addTxs([tx1, tx2, tx3, tx4, tx5]);

    // delete two txs and assert that they are properly archived
<<<<<<< HEAD
    await txPool.deleteTxs([tx1.getTxHash(), tx2.getTxHash()]);
    expect(txPool.getArchivedTxByHash(tx1.getTxHash())).resolves.toEqual(tx1);
    expect(txPool.getArchivedTxByHash(tx2.getTxHash())).resolves.toEqual(tx2);

    // delete a single tx and assert that the first tx is purged and the new tx is archived
    await txPool.deleteTxs([tx3.getTxHash()]);
    expect(txPool.getArchivedTxByHash(tx1.getTxHash())).resolves.toBeUndefined();
    expect(txPool.getArchivedTxByHash(tx2.getTxHash())).resolves.toEqual(tx2);
    expect(txPool.getArchivedTxByHash(tx3.getTxHash())).resolves.toEqual(tx3);

    // delete multiple txs and assert that the old txs are purged and the new txs are archived
    await txPool.deleteTxs([tx4.getTxHash(), tx5.getTxHash()]);
    expect(txPool.getArchivedTxByHash(tx1.getTxHash())).resolves.toBeUndefined();
    expect(txPool.getArchivedTxByHash(tx2.getTxHash())).resolves.toBeUndefined();
    expect(txPool.getArchivedTxByHash(tx3.getTxHash())).resolves.toBeUndefined();
    expect(txPool.getArchivedTxByHash(tx4.getTxHash())).resolves.toEqual(tx4);
    expect(txPool.getArchivedTxByHash(tx5.getTxHash())).resolves.toEqual(tx5);
=======
    await txPool.deleteTxs([await tx1.getTxHash(), await tx2.getTxHash()]);
    expect(txPool.getArchivedTxByHash(await tx1.getTxHash())).toEqual(tx1);
    expect(txPool.getArchivedTxByHash(await tx2.getTxHash())).toEqual(tx2);

    // delete a single tx and assert that the first tx is purged and the new tx is archived
    await txPool.deleteTxs([await tx3.getTxHash()]);
    expect(txPool.getArchivedTxByHash(await tx1.getTxHash())).toBeUndefined();
    expect(txPool.getArchivedTxByHash(await tx2.getTxHash())).toEqual(tx2);
    expect(txPool.getArchivedTxByHash(await tx3.getTxHash())).toEqual(tx3);

    // delete multiple txs and assert that the old txs are purged and the new txs are archived
    await txPool.deleteTxs([await tx4.getTxHash(), await tx5.getTxHash()]);
    expect(txPool.getArchivedTxByHash(await tx1.getTxHash())).toBeUndefined();
    expect(txPool.getArchivedTxByHash(await tx2.getTxHash())).toBeUndefined();
    expect(txPool.getArchivedTxByHash(await tx3.getTxHash())).toBeUndefined();
    expect(txPool.getArchivedTxByHash(await tx4.getTxHash())).toEqual(tx4);
    expect(txPool.getArchivedTxByHash(await tx5.getTxHash())).toEqual(tx5);
>>>>>>> origin/master
  });
});
