import { expect, jest } from '@jest/globals';

import { InMemoryP2PCLient } from './memory_p2p_client.js';
import { TxPool } from './tx_pool.js';
import { RollupSource } from './types.js';
import { MockRollupSource } from './mocks.js';
import { MockTx } from './tx.js';

type Mockify<T> = {
  [P in keyof T]: ReturnType<typeof jest.fn>;
};

describe('In-Memory P2P Client', () => {
  let txPool: Mockify<TxPool>;
  let rollupSource: RollupSource;

  beforeEach(() => {
    txPool = {
      addTxs: jest.fn(),
      getTx: jest.fn().mockReturnValue(undefined),
      deleteTxs: jest.fn(),
      getAllTxs: jest.fn().mockReturnValue([]),
    };

    rollupSource = new MockRollupSource();
  });

  it('adds txs to pool', () => {
    const client = new InMemoryP2PCLient(rollupSource, txPool);
    const tx1 = new MockTx();
    const tx2 = new MockTx();
    client.sendTx(tx1);
    client.sendTx(tx2);

    expect(txPool.addTxs).toHaveBeenCalledTimes(2);
  });
});
