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
    const poolTx = pool.getTxByHash(await await tx1.getTxHash());
    expect(poolTx!.getTxHash()).toEqual(await tx1.getTxHash());
    expect(pool.getTxStatus(await await tx1.getTxHash())).toEqual('pending');
    expect(pool.getPendingTxHashes()).toEqual([await tx1.getTxHash()]);
  });

  it('Removes txs from the pool', async () => {
    const tx1 = await mockTx();

    await pool.addTxs([tx1]);
    await pool.deleteTxs([await await tx1.getTxHash()]);

    expect(pool.getTxByHash(await await tx1.getTxHash())).toBeFalsy();
    expect(pool.getTxStatus(await await tx1.getTxHash())).toBeUndefined();
  });

  it('Marks txs as mined', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);

    await pool.addTxs([tx1, tx2]);
    await pool.markAsMined([await tx1.getTxHash()], 1);

    expect(pool.getTxByHash(await tx1.getTxHash())).toEqual(tx1);
    expect(pool.getTxStatus(await tx1.getTxHash())).toEqual('mined');
    expect(pool.getMinedTxHashes()).toEqual([[await tx1.getTxHash(), 1]]);
    expect(pool.getPendingTxHashes()).toEqual([await tx2.getTxHash()]);
  });

  it('Marks txs as pending after being mined', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);

    await pool.addTxs([tx1, tx2]);
    await pool.markAsMined([await tx1.getTxHash()], 1);

    await pool.markMinedAsPending([await tx1.getTxHash()]);
    expect(pool.getMinedTxHashes()).toEqual([]);
    const pending = pool.getPendingTxHashes();
    expect(pending).toHaveLength(2);
    expect(pending).toEqual(expect.arrayContaining([await tx1.getTxHash(), await tx2.getTxHash()]));
  });

  it('Only marks txs as pending if they are known', async () => {
    const tx1 = await mockTx(1);
    // simulate a situation where not all peers have all the txs
    const someTxHashThatThisPeerDidNotSee = await (await mockTx(2)).getTxHash();
    await pool.addTxs([tx1]);
    // this peer knows that tx2 was mined, but it does not have the tx object
    await pool.markAsMined([await tx1.getTxHash(), someTxHashThatThisPeerDidNotSee], 1);
    expect(new Set(pool.getMinedTxHashes())).toEqual(
      new Set([
        [await tx1.getTxHash(), 1],
        [someTxHashThatThisPeerDidNotSee, 1],
      ]),
    );

    // reorg: both txs should now become available again
    await pool.markMinedAsPending([await tx1.getTxHash(), someTxHashThatThisPeerDidNotSee]);
    expect(pool.getMinedTxHashes()).toEqual([]);
    expect(pool.getPendingTxHashes()).toEqual([await tx1.getTxHash()]); // tx2 is not in the pool
  });

  it('Returns all transactions in the pool', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    await pool.addTxs([tx1, tx2, tx3]);

    const poolTxs = pool.getAllTxs();
    expect(poolTxs).toHaveLength(3);
    expect(poolTxs).toEqual(expect.arrayContaining([tx1, tx2, tx3]));
  });

  it('Returns all txHashes in the pool', async () => {
    const tx1 = await mockTx(1);
    const tx2 = await mockTx(2);
    const tx3 = await mockTx(3);

    await pool.addTxs([tx1, tx2, tx3]);

    const poolTxHashes = pool.getAllTxHashes();
    expect(poolTxHashes).toHaveLength(3);
    expect(poolTxHashes).toEqual(
      expect.arrayContaining([await tx1.getTxHash(), await tx2.getTxHash(), tx3.getTxHash()]),
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

    const poolTxHashes = pool.getPendingTxHashes();
    expect(poolTxHashes).toHaveLength(4);
    expect(poolTxHashes).toEqual([tx4, tx1, tx3, tx2].map(tx => tx.getTxHash()));
  });
}
