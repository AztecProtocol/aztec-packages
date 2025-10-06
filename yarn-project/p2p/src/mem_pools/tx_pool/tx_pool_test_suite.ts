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

  afterEach(() => {
    pool.removeAllListeners('txs-added');
  });

  it('adds txs to the pool as pending', async () => {
    const tx1 = await mockTx();

    await pool.addTxs([tx1]);
    const poolTx = await pool.getTxByHash(tx1.getTxHash());
    expect(poolTx!.getTxHash()).toEqual(tx1.getTxHash());
    await expect(pool.getTxStatus(tx1.getTxHash())).resolves.toEqual('pending');
    await expect(pool.getPendingTxHashes()).resolves.toEqual([tx1.getTxHash()]);
    await expect(pool.getPendingTxCount()).resolves.toEqual(1);
  });

  it('emits txs-added event with new txs', async () => {
    const tx1 = await mockTx(); // existing and pending
    const tx2 = await mockTx(); // mined but not known
    const tx3 = await mockTx(); // brand new

    await pool.addTxs([tx1]);
    await pool.markAsMined([tx2.getTxHash()], minedBlockHeader);

    let txsFromEvent: Tx[] | undefined = undefined;
    pool.once('txs-added', ({ txs }) => {
      txsFromEvent = txs;
    });

    await pool.addTxs([tx1, tx2, tx3]);
    expect(txsFromEvent).toBeDefined();
    expect(txsFromEvent).toHaveLength(2);
    expect(txsFromEvent).toEqual(expect.arrayContaining([tx2, tx3]));
  });

  it('permanently deletes pending txs and soft-deletes mined txs', async () => {
    const pendingTx = await mockTx(1);
    const minedTx = await mockTx(2);

    await pool.addTxs([pendingTx, minedTx]);
    await pool.markAsMined([minedTx.getTxHash()], minedBlockHeader);

    // Delete a pending tx - should be permanently deleted
    await pool.deleteTxs([pendingTx.getTxHash()]);
    await expect(pool.getTxByHash(pendingTx.getTxHash())).resolves.toBeUndefined();
    await expect(pool.getTxStatus(pendingTx.getTxHash())).resolves.toBeUndefined();

    // Delete a mined tx - should be soft-deleted (still in storage)
    await pool.deleteTxs([minedTx.getTxHash()]);
    await expect(pool.getTxByHash(minedTx.getTxHash())).resolves.toBeDefined();
    await expect(pool.getTxStatus(minedTx.getTxHash())).resolves.toEqual('deleted');
    await expect(pool.getMinedTxHashes()).resolves.toEqual([]);

    await expect(pool.getPendingTxCount()).resolves.toEqual(0);
  });

  it('marks txs as mined', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);

    await pool.addTxs([tx1, tx2]);
    await pool.markAsMined([tx1.getTxHash()], minedBlockHeader);

    await expect(pool.getTxByHash(tx1.getTxHash())).resolves.toEqual(tx1);
    await expect(pool.getTxStatus(tx1.getTxHash())).resolves.toEqual('mined');
    await expect(pool.getMinedTxHashes()).resolves.toEqual([[tx1.getTxHash(), 1]]);
    await expect(pool.getPendingTxHashes()).resolves.toEqual([tx2.getTxHash()]);
    await expect(pool.getPendingTxCount()).resolves.toEqual(1);
  });

  it('marks txs as pending after being mined', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);

    await pool.addTxs([tx1, tx2]);
    await pool.markAsMined([tx1.getTxHash()], minedBlockHeader);

    await pool.markMinedAsPending([tx1.getTxHash()]);
    await expect(pool.getMinedTxHashes()).resolves.toEqual([]);
    const pending = await pool.getPendingTxHashes();
    expect(pending).toHaveLength(2);
    expect(pending).toEqual(expect.arrayContaining([tx1.getTxHash(), tx2.getTxHash()]));
    await expect(pool.getPendingTxCount()).resolves.toEqual(2);
  });

  it('only marks txs as pending if they are known', async () => {
    const tx1 = await mockTx(1);
    // simulate a situation where not all peers have all the txs
    const tx2 = await mockTx(2);
    const someTxHashThatThisPeerDidNotSee = tx2.getTxHash();
    await pool.addTxs([tx1]);
    // this peer knows that tx2 was mined, but it does not have the tx object
    await pool.markAsMined([tx1.getTxHash(), someTxHashThatThisPeerDidNotSee], minedBlockHeader);
    expect(await pool.getMinedTxHashes()).toEqual(
      expect.arrayContaining([
        [tx1.getTxHash(), 1],
        [someTxHashThatThisPeerDidNotSee, 1],
      ]),
    );

    // reorg: both txs should now become available again
    await pool.markMinedAsPending([tx1.getTxHash(), someTxHashThatThisPeerDidNotSee]);
    await expect(pool.getMinedTxHashes()).resolves.toEqual([]);
    await expect(pool.getPendingTxHashes()).resolves.toEqual([tx1.getTxHash()]); // tx2 is not in the pool
    await expect(pool.getPendingTxCount()).resolves.toEqual(1);
  });

  it('returns all transactions in the pool', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    await pool.addTxs([tx1, tx2, tx3]);

    const poolTxs = await pool.getAllTxs();
    expect(poolTxs).toHaveLength(3);
    expect(poolTxs).toEqual(expect.arrayContaining([tx1, tx2, tx3]));
    await expect(pool.getPendingTxCount()).resolves.toEqual(3);
  });

  it('returns all txHashes in the pool', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    await pool.addTxs([tx1, tx2, tx3]);

    const poolTxHashes = await pool.getAllTxHashes();
    const expectedHashes = [tx1, tx2, tx3].map(tx => tx.getTxHash());
    expect(poolTxHashes).toHaveLength(3);
    expect(poolTxHashes).toEqual(expect.arrayContaining(expectedHashes));
    await expect(pool.getPendingTxCount()).resolves.toEqual(3);
  });

  it('returns txs by their hash', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    await pool.addTxs([tx1, tx2, tx3]);

    const requestedTxs = await pool.getTxsByHash([tx1.getTxHash(), tx3.getTxHash()]);
    expect(requestedTxs).toHaveLength(2);
    expect(requestedTxs).toEqual(expect.arrayContaining([tx1, tx3]));
  });

  it('returns a large number of transactions by their hash', async () => {
    const numTxs = 1000;
    const txs = await Promise.all(Array.from({ length: numTxs }, (_, i) => mockTx(i)));
    const hashes = txs.map(tx => tx.getTxHash());
    await pool.addTxs(txs);
    const requestedTxs = await pool.getTxsByHash(hashes);
    expect(requestedTxs).toHaveLength(numTxs);
    expect(requestedTxs).toEqual(expect.arrayContaining(txs));
  });

  it('returns whether or not txs exist', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    await pool.addTxs([tx1, tx2, tx3]);

    const tx4 = await mockTx(4);
    const tx5 = await mockTx(5);

    const availability = await pool.hasTxs([
      tx1.getTxHash(),
      tx2.getTxHash(),
      tx3.getTxHash(),
      tx4.getTxHash(),
      tx5.getTxHash(),
    ]);
    expect(availability).toHaveLength(5);
    expect(availability).toEqual(expect.arrayContaining([true, true, true, false, false]));
  });

  it('returns pending tx hashes sorted by priority', async () => {
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
    expect(poolTxHashes).toEqual([tx4, tx1, tx3, tx2].map(tx => tx.getTxHash()));
  });

  describe('soft-delete', () => {
    it('soft-deletes mined txs and keeps them in storage', async () => {
      const txs = await Promise.all([mockTx(1), mockTx(2), mockTx(3)]);
      await pool.addTxs(txs);

      // Mark first tx as mined
      await pool.markAsMined([txs[0].getTxHash()], minedBlockHeader);

      // Verify initial state
      await expect(pool.getPendingTxCount()).resolves.toBe(2);
      await expect(pool.getTxByHash(txs[0].getTxHash())).resolves.toBeDefined();
      await expect(pool.getTxByHash(txs[1].getTxHash())).resolves.toBeDefined();

      // Delete mined tx - should be soft-deleted
      await pool.deleteTxs([txs[0].getTxHash()]);

      // Delete pending tx - should be permanently deleted
      await pool.deleteTxs([txs[1].getTxHash()]);

      // Verify mined tx still exists in storage but has 'deleted' status
      await expect(pool.getTxByHash(txs[0].getTxHash())).resolves.toBeDefined();
      await expect(pool.getTxStatus(txs[0].getTxHash())).resolves.toEqual('deleted');

      // Verify pending tx is permanently deleted
      await expect(pool.getTxByHash(txs[1].getTxHash())).resolves.toBeUndefined();
      await expect(pool.getTxStatus(txs[1].getTxHash())).resolves.toBeUndefined();

      // Verify remaining pending count
      await expect(pool.getPendingTxCount()).resolves.toBe(1);

      // Verify pending hashes don't include deleted txs
      const pendingHashes = await pool.getPendingTxHashes();
      expect(pendingHashes).toHaveLength(1);
      expect(pendingHashes.map(h => h.toString())).toContain(txs[2].getTxHash().toString());
    });

    it('cleans up old deleted mined transactions', async () => {
      const txs = await Promise.all([mockTx(1), mockTx(2), mockTx(3)]);
      await pool.addTxs(txs);

      // Mark first two as mined in block 1
      await pool.markAsMined([txs[0].getTxHash(), txs[1].getTxHash()], minedBlockHeader);

      // Soft-delete mined transactions
      await pool.deleteTxs([txs[0].getTxHash(), txs[1].getTxHash()]);

      // Clean up deleted mined txs from block 1 and earlier
      const deletedCount = await pool.cleanupDeletedMinedTxs(1);

      // Verify old transactions are permanently deleted
      expect(deletedCount).toBe(2);
      await expect(pool.getTxByHash(txs[0].getTxHash())).resolves.toBeUndefined();
      await expect(pool.getTxByHash(txs[1].getTxHash())).resolves.toBeUndefined();
      await expect(pool.getTxByHash(txs[2].getTxHash())).resolves.toBeDefined();
    });

    it('does not clean up recent deleted mined transactions', async () => {
      const txs = await Promise.all([mockTx(1), mockTx(2)]);
      await pool.addTxs(txs);

      // Mark as mined in block 2
      const laterBlockHeader = BlockHeader.empty({
        globalVariables: GlobalVariables.empty({ blockNumber: 2, timestamp: 0n }),
      });
      await pool.markAsMined([txs[0].getTxHash()], laterBlockHeader);

      // Soft-delete a mined transaction
      await pool.deleteTxs([txs[0].getTxHash()]);

      // Try to clean up with block 1 (before the mined block)
      const deletedCount = await pool.cleanupDeletedMinedTxs(1);

      // Verify no transactions were cleaned up
      expect(deletedCount).toBe(0);
      await expect(pool.getTxByHash(txs[0].getTxHash())).resolves.toBeDefined();
    });

    it('restores deleted mined tx when it is mined again', async () => {
      const tx = await mockTx(1);
      await pool.addTxs([tx]);

      // Mark as mined
      await pool.markAsMined([tx.getTxHash()], minedBlockHeader);

      // Soft-delete it
      await pool.deleteTxs([tx.getTxHash()]);
      await expect(pool.getTxStatus(tx.getTxHash())).resolves.toEqual('deleted');

      // Mark as mined again (e.g., after a reorg)
      await pool.markAsMined([tx.getTxHash()], minedBlockHeader);

      // Should be back to mined status
      await expect(pool.getTxStatus(tx.getTxHash())).resolves.toEqual('mined');
      await expect(pool.getTxByHash(tx.getTxHash())).resolves.toBeDefined();
    });
  });
}
