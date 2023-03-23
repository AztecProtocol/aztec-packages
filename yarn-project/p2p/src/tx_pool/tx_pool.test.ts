<<<<<<< HEAD
import { MockTx } from '../mocks.js';
=======
import { MockTx } from '../client/mocks.js';
>>>>>>> master
import { InMemoryTxPool } from './index.js';

describe('In-Memory TX pool', () => {
  it('Adds txs to the pool', () => {
    const pool = new InMemoryTxPool();
<<<<<<< HEAD
    const tx1 = new MockTx();
=======
    const tx1 = MockTx();
>>>>>>> master

    pool.addTxs([tx1]);
    const poolTx = pool.getTx(tx1.txId);
    expect(poolTx?.txId.toString('hex')).toEqual(tx1.txId.toString('hex'));
  });

  it('Removes txs from the pool', () => {
    const pool = new InMemoryTxPool();
<<<<<<< HEAD
    const tx1 = new MockTx();
=======
    const tx1 = MockTx();
>>>>>>> master

    pool.addTxs([tx1]);
    pool.deleteTxs([tx1.txId]);

    const poolTx = pool.getTx(tx1.txId);
    expect(poolTx).toBeFalsy();
  });
});
