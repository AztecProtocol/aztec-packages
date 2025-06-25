import { unfreeze } from '@aztec/foundation/types';
import { GasFees } from '@aztec/stdlib/gas';
import { mockTx } from '@aztec/stdlib/testing';
import { BlockHeader, GlobalVariables, type Tx } from '@aztec/stdlib/tx';

import type { TxPool } from './tx_pool.js';

/**
 * Tests a TxPool implementation.
 * @param getTxPool - Gets a fresh TxPool
 */
export function describeTxPool(getTxPool: () => TxPool) {
  let pool: TxPool;

  const minedBlockHeader = BlockHeader.empty({
    globalVariables: GlobalVariables.empty({ blockNumber: 1, timestamp: 0n }),
  });

  beforeEach(() => {
    pool = getTxPool();
  });

  it('Adds txs to the pool as pending', async () => {
    const tx1 = await mockTx();

    await pool.addTxs([tx1]);
    const poolTx = await pool.getTxByHash(await tx1.getTxHash());
    expect(await poolTx!.getTxHash()).toEqual(await tx1.getTxHash());
    await expect(pool.getTxStatus(await tx1.getTxHash())).resolves.toEqual('pending');
    await expect(pool.getPendingTxHashes()).resolves.toEqual([await tx1.getTxHash()]);
    await expect(pool.getPendingTxCount()).resolves.toEqual(1);
  });

  it('Removes txs from the pool', async () => {
    const tx1 = await mockTx();

    await pool.addTxs([tx1]);
    await pool.deleteTxs([await tx1.getTxHash()]);

    await expect(pool.getTxByHash(await tx1.getTxHash())).resolves.toBeFalsy();
    await expect(pool.getTxStatus(await tx1.getTxHash())).resolves.toBeUndefined();
    await expect(pool.getPendingTxCount()).resolves.toEqual(0);
  });

  it('Marks txs as mined', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);

    await pool.addTxs([tx1, tx2]);
    await pool.markAsMined([await tx1.getTxHash()], minedBlockHeader);

    await expect(pool.getTxByHash(await tx1.getTxHash())).resolves.toEqual(tx1);
    await expect(pool.getTxStatus(await tx1.getTxHash())).resolves.toEqual('mined');
    await expect(pool.getMinedTxHashes()).resolves.toEqual([[await tx1.getTxHash(), 1]]);
    await expect(pool.getPendingTxHashes()).resolves.toEqual([await tx2.getTxHash()]);
    await expect(pool.getPendingTxCount()).resolves.toEqual(1);
  });

  it('Marks txs as pending after being mined', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);

    await pool.addTxs([tx1, tx2]);
    await pool.markAsMined([await tx1.getTxHash()], minedBlockHeader);

    await pool.markMinedAsPending([await tx1.getTxHash()]);
    await expect(pool.getMinedTxHashes()).resolves.toEqual([]);
    const pending = await pool.getPendingTxHashes();
    expect(pending).toHaveLength(2);
    expect(pending).toEqual(expect.arrayContaining([await tx1.getTxHash(), await tx2.getTxHash()]));
    await expect(pool.getPendingTxCount()).resolves.toEqual(2);
  });

  it('Only marks txs as pending if they are known', async () => {
    const tx1 = await mockTx(1);
    // simulate a situation where not all peers have all the txs
    const tx2 = await mockTx(2);
    const someTxHashThatThisPeerDidNotSee = await tx2.getTxHash();
    await pool.addTxs([tx1]);
    // this peer knows that tx2 was mined, but it does not have the tx object
    await pool.markAsMined([await tx1.getTxHash(), someTxHashThatThisPeerDidNotSee], minedBlockHeader);
    expect(await pool.getMinedTxHashes()).toEqual(
      expect.arrayContaining([
        [await tx1.getTxHash(), 1],
        [someTxHashThatThisPeerDidNotSee, 1],
      ]),
    );

    // reorg: both txs should now become available again
    await pool.markMinedAsPending([await tx1.getTxHash(), someTxHashThatThisPeerDidNotSee]);
    await expect(pool.getMinedTxHashes()).resolves.toEqual([]);
    await expect(pool.getPendingTxHashes()).resolves.toEqual([await tx1.getTxHash()]); // tx2 is not in the pool
    await expect(pool.getPendingTxCount()).resolves.toEqual(1);
  });

  it('Returns all transactions in the pool', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    await pool.addTxs([tx1, tx2, tx3]);

    const poolTxs = await pool.getAllTxs();
    expect(poolTxs).toHaveLength(3);
    expect(poolTxs).toEqual(expect.arrayContaining([tx1, tx2, tx3]));
    await expect(pool.getPendingTxCount()).resolves.toEqual(3);
  });

  it('Returns all txHashes in the pool', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    await pool.addTxs([tx1, tx2, tx3]);

    const poolTxHashes = await pool.getAllTxHashes();
    const expectedHashes = await Promise.all([tx1, tx2, tx3].map(tx => tx.getTxHash()));
    expect(poolTxHashes).toHaveLength(3);
    expect(poolTxHashes).toEqual(expect.arrayContaining(expectedHashes));
    await expect(pool.getPendingTxCount()).resolves.toEqual(3);
  });

  it('Returns txs by their hash', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    await pool.addTxs([tx1, tx2, tx3]);

    const requestedTxs = await pool.getTxsByHash([await tx1.getTxHash(), await tx3.getTxHash()]);
    expect(requestedTxs).toHaveLength(2);
    expect(requestedTxs).toEqual(expect.arrayContaining([tx1, tx3]));
  });

  it('Returns a large number of transactions by their hash', async () => {
    const numTxs = 1000;
    const txs = await Promise.all(Array.from({ length: numTxs }, (_, i) => mockTx(i)));
    const hashes = await Promise.all(txs.map(tx => tx.getTxHash()));
    await pool.addTxs(txs);
    const requestedTxs = await pool.getTxsByHash(hashes);
    expect(requestedTxs).toHaveLength(numTxs);
    expect(requestedTxs).toEqual(expect.arrayContaining(txs));
  });

  it('Returns whether or not txs exist', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    await pool.addTxs([tx1, tx2, tx3]);

    const tx4 = await mockTx(4);
    const tx5 = await mockTx(5);

    const availability = await pool.hasTxs([
      await tx1.getTxHash(),
      await tx2.getTxHash(),
      await tx3.getTxHash(),
      await tx4.getTxHash(),
      await tx5.getTxHash(),
    ]);
    expect(availability).toHaveLength(5);
    expect(availability).toEqual(expect.arrayContaining([true, true, true, false, false]));
  });

  it('Returns pending tx hashes sorted by priority', async () => {
    const withPriorityFee = (tx: Tx, fee: number) => {
      unfreeze(tx.data.constants.txContext.gasSettings).maxPriorityFeesPerGas = new GasFees(fee, fee);
      return tx;
    };

    const tx1 = withPriorityFee(await mockTx(0), 1000);
    const tx2 = withPriorityFee(await mockTx(1), 100);
    const tx3 = withPriorityFee(await mockTx(2), 200);
    const tx4 = withPriorityFee(await mockTx(3), 3000);

    await pool.addTxs([tx1, tx2, tx3, tx4]);

    const poolTxHashes = await pool.getPendingTxHashes();
    expect(poolTxHashes).toHaveLength(4);
    expect(poolTxHashes).toEqual(await Promise.all([tx4, tx1, tx3, tx2].map(tx => tx.getTxHash())));
  });
}
