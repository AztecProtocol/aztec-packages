import { randomBytes } from '@aztec/foundation/crypto';
import { mockTx } from '@aztec/stdlib/testing';
import { TxArray } from '@aztec/stdlib/tx';

import { describe, expect, it } from '@jest/globals';

import { BitVector, BlockTxsRequest, BlockTxsResponse } from './block_txs.js';

describe('BitVector', () => {
  describe('BitVector operations', () => {
    it('should handle empty indices array', () => {
      const bitVector = BitVector.init(8, []);
      expect(bitVector.getLength()).toBe(8);
      for (let i = 0; i < 8; i++) {
        expect(bitVector.isSet(i)).toBe(false);
      }
    });

    it('should create BitVector from indices correctly', () => {
      // Set up a BitVector of length 8 with bits set at indices 0, 2, 4, and 6
      const bitVector = BitVector.init(8, [0, 2, 4, 6]);
      expect(bitVector.getLength()).toBe(8);

      for (let i = 0; i < 8; i++) {
        expect(bitVector.isSet(i)).toBe(i % 2 === 0); // Even indices should be set
      }
    });

    it('should handle partial bytes correctly', () => {
      const bitVector = BitVector.init(10, [1, 3, 9]);
      expect(bitVector.getLength()).toBe(10);
      expect(bitVector.isSet(1)).toBe(true);
      expect(bitVector.isSet(3)).toBe(true);
      expect(bitVector.isSet(9)).toBe(true);
      expect(bitVector.isSet(0)).toBe(false);
      expect(bitVector.isSet(8)).toBe(false);
    });

    it('should handle single bit', () => {
      const bitVector = BitVector.init(1, [0]);
      expect(bitVector.getLength()).toBe(1);
      expect(bitVector.isSet(0)).toBe(true);
    });

    it('should return all true indices in order', () => {
      const indices = [1, 3, 5, 7, 10];
      const bitVector = BitVector.init(12, indices);
      expect(bitVector.getTrueIndices()).toEqual(indices);
    });

    it('should serialize and deserialize correctly', () => {
      const trueIndices = [0, 3, 7, 12, 15];
      const original = BitVector.init(16, trueIndices);
      const buffer = original.toBuffer();
      const deserialized = BitVector.fromBuffer(buffer);

      expect(deserialized.getLength()).toBe(original.getLength());
      expect(deserialized.getTrueIndices()).toEqual(trueIndices);
    });

    it('should handle empty BitVector serialization', () => {
      const original = BitVector.init(0, []);
      const buffer = original.toBuffer();
      const deserialized = BitVector.fromBuffer(buffer);

      expect(deserialized.getLength()).toBe(0);
      expect(deserialized.getTrueIndices()).toEqual([]);
    });
  });

  describe('error cases', () => {
    it('should throw when indices length exceeds total length', () => {
      expect(() => BitVector.init(3, [0, 1, 2, 3])).toThrow('Indices length exceeds specified length');
    });

    it('should throw when index is negative', () => {
      expect(() => BitVector.init(8, [-1])).toThrow('Index -1 is out of bounds for BitVector of length 8');
    });

    it('should throw when index is out of bounds', () => {
      expect(() => BitVector.init(8, [8])).toThrow('Index 8 is out of bounds for BitVector of length 8');
    });

    it('should return false for out of bounds indices', () => {
      const bitVector = BitVector.init(8, [2, 5]);
      expect(bitVector.isSet(-1)).toBe(false);
      expect(bitVector.isSet(8)).toBe(false);
      expect(bitVector.isSet(100)).toBe(false);
    });
  });
});

describe('BlockTxRequest', () => {
  it('should serialize and deserialize correctly', () => {
    const blockNumber = 123;
    const blockHash = randomBytes(32);
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
    const blockHash = randomBytes(32);
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
    const blockHash = randomBytes(32);
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
    const blockHash = randomBytes(32);
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
