import { expect, jest } from '@jest/globals';
import { L2BlockSource } from '@aztec/archiver';

import { P2PCLient } from './p2p_client.js';
import { TxPool } from '../tx_pool/index.js';
import { MockBlockSource } from './mocks.js';
import { MockTx } from './mocks.js';

/**
 * Mockify helper for testing purposes.
 */
type Mockify<T> = {
  [P in keyof T]: ReturnType<typeof jest.fn>;
};

describe('In-Memory P2P Client', () => {
  let txPool: Mockify<TxPool>;
  let blockSource: L2BlockSource;

  beforeEach(() => {
    txPool = {
      addTxs: jest.fn(),
      getTx: jest.fn().mockReturnValue(undefined),
      deleteTxs: jest.fn(),
      getAllTxs: jest.fn().mockReturnValue([]),
    };

    blockSource = new MockBlockSource();
  });

  it('can start & stop', async () => {
    const client = new P2PCLient(blockSource, txPool);
    expect(client.isReady()).toEqual(false);

    await client.start();
    expect(client.isReady()).toEqual(true);

    await client.stop();
    expect(client.isReady()).toEqual(false);
  });

  it('adds txs to pool', async () => {
    const client = new P2PCLient(blockSource, txPool);
    await client.start();
    const tx1 = new MockTx();
    const tx2 = new MockTx();
    await client.sendTx(tx1);
    await client.sendTx(tx2);

    expect(txPool.addTxs).toHaveBeenCalledTimes(2);
  });

  it('rejects txs after being stopped', async () => {
    const client = new P2PCLient(blockSource, txPool);
    await client.start();
    const tx1 = new MockTx();
    const tx2 = new MockTx();
    await client.sendTx(tx1);
    await client.sendTx(tx2);

    expect(txPool.addTxs).toHaveBeenCalledTimes(2);
    await client.stop();
    const tx3 = new MockTx();
    await client.sendTx(tx3);
    expect(txPool.addTxs).toHaveBeenCalledTimes(2);
  });
});
