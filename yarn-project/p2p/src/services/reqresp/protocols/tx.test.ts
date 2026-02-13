import { MAX_TX_SIZE_KB } from '@aztec/stdlib/p2p';
import { TxHash, TxHashArray } from '@aztec/stdlib/tx';

import { describe, expect, it } from '@jest/globals';

import { calculateTxResponseSize } from './tx.js';

describe('calculateTxResponseSize', () => {
  it('should return correct size for a single tx hash', () => {
    const hashes = new TxHashArray(TxHash.random());
    const buffer = hashes.toBuffer();

    expect(calculateTxResponseSize(buffer)).toBe(MAX_TX_SIZE_KB + 1);
  });

  it('should return correct size for multiple tx hashes', () => {
    const hashes = new TxHashArray(TxHash.random(), TxHash.random(), TxHash.random());
    const buffer = hashes.toBuffer();

    expect(calculateTxResponseSize(buffer)).toBe(3 * MAX_TX_SIZE_KB + 1);
  });

  it('should return correct size for 8 tx hashes (default batch size)', () => {
    const hashes = new TxHashArray(...Array.from({ length: 8 }, () => TxHash.random()));
    const buffer = hashes.toBuffer();

    expect(calculateTxResponseSize(buffer)).toBe(8 * MAX_TX_SIZE_KB + 1);
  });

  it('should fall back to single tx size for a raw TxHash buffer (not TxHashArray)', () => {
    // A raw TxHash (32 bytes) is not a valid TxHashArray serialization.
    // TxHashArray.fromBuffer silently returns empty array on parse failure.
    const rawHash = TxHash.random().toBuffer();

    expect(calculateTxResponseSize(rawHash)).toBe(MAX_TX_SIZE_KB + 1);
  });

  it('should fall back to single tx size for garbage buffer', () => {
    const garbage = Buffer.from('not a valid buffer');

    expect(calculateTxResponseSize(garbage)).toBe(MAX_TX_SIZE_KB + 1);
  });

  it('should return at least single tx size for empty TxHashArray', () => {
    const hashes = new TxHashArray();
    const buffer = hashes.toBuffer();

    // Empty TxHashArray serializes to a valid buffer with length prefix 0
    // We expect at least 1 * MAX_TX_SIZE_KB + 1
    expect(calculateTxResponseSize(buffer)).toBe(MAX_TX_SIZE_KB + 1);
  });
});
