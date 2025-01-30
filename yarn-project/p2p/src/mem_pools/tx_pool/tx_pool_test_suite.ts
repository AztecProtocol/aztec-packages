import { type Tx, mockTx } from '@aztec/circuit-types';
import { GasFees } from '@aztec/circuits.js';
import { unfreeze } from '@aztec/foundation/types';

import { type TxPool } from './tx_pool.js';

/**
 * Tests a TxPool implementation.
 * @param getTxPool - Gets a fresh TxPool
 */
export function describeTxPool(getTxPool: () => TxPool) {
  let pool: TxPool;

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
  });

  it('Removes txs from the pool', async () => {
    const tx1 = await mockTx();

    await pool.addTxs([tx1]);
    await pool.deleteTxs([await tx1.getTxHash()]);

    await expect(pool.getTxByHash(await tx1.getTxHash())).resolves.toBeFalsy();
    await expect(pool.getTxStatus(await tx1.getTxHash())).resolves.toBeUndefined();
  });

  it('Marks txs as mined', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);

    await pool.addTxs([tx1, tx2]);
    await pool.markAsMined([await tx1.getTxHash()], 1);

    await expect(pool.getTxByHash(await tx1.getTxHash())).resolves.toEqual(tx1);
    await expect(pool.getTxStatus(await tx1.getTxHash())).resolves.toEqual('mined');
    await expect(pool.getMinedTxHashes()).resolves.toEqual([[await tx1.getTxHash(), 1]]);
    await expect(pool.getPendingTxHashes()).resolves.toEqual([await tx2.getTxHash()]);
  });

  it('Marks txs as pending after being mined', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);

    await pool.addTxs([tx1, tx2]);
    await pool.markAsMined([await tx1.getTxHash()], 1);

    await pool.markMinedAsPending([await tx1.getTxHash()]);
    await expect(pool.getMinedTxHashes()).resolves.toEqual([]);
    const pending = await pool.getPendingTxHashes();
    expect(pending).toHaveLength(2);
    expect(pending).toEqual(expect.arrayContaining([await tx1.getTxHash(), await tx2.getTxHash()]));
  });

  it('Only marks txs as pending if they are known', async () => {
    const tx1 = await mockTx(1);
    // simulate a situation where not all peers have all the txs
    const tx2 = await mockTx(2);
    const someTxHashThatThisPeerDidNotSee = await tx2.getTxHash();
    await pool.addTxs([tx1]);
    // this peer knows that tx2 was mined, but it does not have the tx object
    await pool.markAsMined([await tx1.getTxHash(), someTxHashThatThisPeerDidNotSee], 1);
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
  });

  it('Returns all transactions in the pool', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    await pool.addTxs([tx1, tx2, tx3]);

    const poolTxs = await pool.getAllTxs();
    expect(poolTxs).toHaveLength(3);
    expect(poolTxs).toEqual(expect.arrayContaining([tx1, tx2, tx3]));
  });

  it('Returns all txHashes in the pool', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    await pool.addTxs([tx1, tx2, tx3]);

    const poolTxHashes = await pool.getAllTxHashes();
    expect(poolTxHashes).toHaveLength(3);
    expect(poolTxHashes).toEqual(
      expect.arrayContaining([await tx1.getTxHash(), await tx2.getTxHash(), await tx3.getTxHash()]),
    );
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
