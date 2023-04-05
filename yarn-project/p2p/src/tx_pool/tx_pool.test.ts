import { MockTx } from '../client/mocks.js';
import { InMemoryTxPool } from './index.js';

describe('In-Memory TX pool', () => {
  it('Adds txs to the pool', async () => {
    const pool = new InMemoryTxPool();
    const tx1 = MockTx();

    pool.addTxs([tx1]);
    const poolTx = pool.getTxByHash(await tx1.getTxHash());
    expect(poolTx?.getTxHash()).toEqual(tx1.getTxHash());
  });

  it('Removes txs from the pool', async () => {
    const pool = new InMemoryTxPool();
    const tx1 = MockTx();

    pool.addTxs([tx1]);
    pool.deleteTxs([await tx1.getTxHash()]);

    const poolTx = pool.getTxByHash(await tx1.getTxHash());
    expect(poolTx).toBeFalsy();
  });
});
