import { Fr } from '@aztec/foundation/fields';
import { mockTx } from '@aztec/stdlib/testing';
import { TxArray } from '@aztec/stdlib/tx';

import { describe, expect, it } from '@jest/globals';

import { BitVector } from './bitvector.js';
import { BlockTxsRequest, BlockTxsResponse } from './block_txs_reqresp.js';

describe('BlockTxRequest', () => {
  it('should serialize and deserialize correctly', () => {
    const blockNumber = 123;
    const blockHash = Fr.random();
    const txIndices = BitVector.init(16, [0, 5, 10, 15]);

    const original = new BlockTxsRequest(blockNumber, blockHash, txIndices);
    const buffer = original.toBuffer();
    const deserialized = BlockTxsRequest.fromBuffer(buffer);

    expect(deserialized.blockNumber).toBe(original.blockNumber);
    expect(deserialized.blockHash).toEqual(original.blockHash);
    expect(deserialized.txIndices.getLength()).toBe(original.txIndices.getLength());
    expect(deserialized.txIndices.getTrueIndices()).toEqual(original.txIndices.getTrueIndices());
  });

  it('should handle empty BitVector', () => {
    const blockNumber = 0;
    const blockHash = Fr.random();
    const txIndices = BitVector.init(8, []);

    const original = new BlockTxsRequest(blockNumber, blockHash, txIndices);
    const buffer = original.toBuffer();
    const deserialized = BlockTxsRequest.fromBuffer(buffer);

    expect(deserialized.blockNumber).toBe(0);
    expect(deserialized.blockHash).toEqual(blockHash);
    expect(deserialized.txIndices.getTrueIndices()).toEqual([]);
  });
});

describe('BlockTxResponse', () => {
  it('should serialize and deserialize correctly', async () => {
    const blockNumber = 123;
    const blockHash = Fr.random();
    const txs = new TxArray(await mockTx(), await mockTx(), await mockTx());
    const txIndices = BitVector.init(8, [0, 2, 5]);

    const original = new BlockTxsResponse(blockNumber, blockHash, txs, txIndices);
    const buffer = original.toBuffer();
    const deserialized = BlockTxsResponse.fromBuffer(buffer);

    expect(deserialized.blockNumber).toBe(original.blockNumber);
    expect(deserialized.blockHash).toEqual(original.blockHash);
    expect(deserialized.txs.length).toBe(original.txs.length);
    expect(deserialized.txIndices.getLength()).toBe(original.txIndices.getLength());
    expect(deserialized.txIndices.getTrueIndices()).toEqual(original.txIndices.getTrueIndices());

    // Make sure we calculate transaction hashes before comparison
    await Promise.all([...original.txs.map(tx => tx.getTxHash()), ...deserialized.txs.map(tx => tx.getTxHash())]);
    original.txs.forEach((tx, i) => {
      expect(deserialized.txs[i]).toEqual(tx);
    });
  });

  it('should handle empty response', () => {
    const blockNumber = 0;
    const blockHash = Fr.random();
    const txs = new TxArray(); // No transactions
    const txIndices = BitVector.init(10, []); // No indices

    const original = new BlockTxsResponse(blockNumber, blockHash, txs, txIndices);
    const buffer = original.toBuffer();
    const deserialized = BlockTxsResponse.fromBuffer(buffer);

    expect(deserialized.blockNumber).toBe(0);
    expect(deserialized.blockHash).toEqual(blockHash);
    expect(deserialized.txs.length).toBe(0);
    expect(deserialized.txIndices.getTrueIndices()).toEqual([]);
  });
});
