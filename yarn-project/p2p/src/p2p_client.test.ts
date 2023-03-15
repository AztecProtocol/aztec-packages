import { expect, jest } from '@jest/globals';

import { InMemoryP2PCLient } from './memory_p2p_client.js';
import { TxPool } from './tx_pool/index.js';
import { RollupSource } from './temp_types.js';
import { MockRollupSource } from './mocks.js';
import { MockTx } from './mocks.js';

/**
 * Mockify helper for testing purposes.
 */
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

  it('can start & stop', async () => {
    const client = new InMemoryP2PCLient(rollupSource, txPool);
    expect(client.isReady()).toEqual(false);
    expect(client.isRunning()).toEqual(false);

    await client.start();
    expect(client.isReady()).toEqual(true);
    expect(client.isRunning()).toEqual(true);

    await client.stop();
    expect(client.isReady()).toEqual(false);
    expect(client.isRunning()).toEqual(false);
  });

  it('adds txs to pool', async () => {
    const client = new InMemoryP2PCLient(rollupSource, txPool);
    await client.start();
    const tx1 = new MockTx();
    const tx2 = new MockTx();
    client.sendTx(tx1);
    client.sendTx(tx2);

    expect(txPool.addTxs).toHaveBeenCalledTimes(2);
  });

  it('rejects txs after being stopped', async () => {
    const client = new InMemoryP2PCLient(rollupSource, txPool);
    await client.start();
    const tx1 = new MockTx();
    const tx2 = new MockTx();
    client.sendTx(tx1);
    client.sendTx(tx2);

    expect(txPool.addTxs).toHaveBeenCalledTimes(2);
    await client.stop();
    const tx3 = new MockTx();
    client.sendTx(tx3);
    expect(txPool.addTxs).toHaveBeenCalledTimes(2);
  });
});
