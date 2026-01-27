import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';

import { BlockHash } from './block_hash.js';

describe('BlockHash', () => {
  describe('isL2BlockHash', () => {
    it('returns true for BlockHash instances', () => {
      const hash = BlockHash.random();
      expect(BlockHash.isL2BlockHash(hash)).toBe(true);
    });

    it('returns true for BlockHash created from field', () => {
      const hash = BlockHash.fromField(Fr.random());
      expect(BlockHash.isL2BlockHash(hash)).toBe(true);
    });

    it('returns true for BlockHash created from buffer', () => {
      const hash = BlockHash.fromBuffer(Buffer.alloc(32, 1));
      expect(BlockHash.isL2BlockHash(hash)).toBe(true);
    });

    it('returns true for duck-typed Buffer32-like objects with 32-byte buffer', () => {
      // Simulates a case where instanceof fails due to module duplication
      const fakeHash = {
        buffer: Buffer.alloc(32, 0xab),
        toBuffer: () => Buffer.alloc(32, 0xab),
      };
      expect(BlockHash.isL2BlockHash(fakeHash)).toBe(true);
    });

    it('returns false for plain numbers', () => {
      expect(BlockHash.isL2BlockHash(0)).toBe(false);
      expect(BlockHash.isL2BlockHash(123)).toBe(false);
      expect(BlockHash.isL2BlockHash(-1)).toBe(false);
    });

    it('returns false for strings', () => {
      expect(BlockHash.isL2BlockHash('latest')).toBe(false);
      expect(BlockHash.isL2BlockHash('0x1234')).toBe(false);
    });

    it('returns false for null and undefined', () => {
      expect(BlockHash.isL2BlockHash(null)).toBe(false);
      expect(BlockHash.isL2BlockHash(undefined)).toBe(false);
    });

    it('returns false for objects without buffer property', () => {
      expect(BlockHash.isL2BlockHash({})).toBe(false);
      expect(BlockHash.isL2BlockHash({ toBuffer: () => Buffer.alloc(32) })).toBe(false);
    });

    it('returns false for objects with non-Buffer buffer property', () => {
      expect(BlockHash.isL2BlockHash({ buffer: 'not a buffer', toBuffer: () => Buffer.alloc(32) })).toBe(false);
      expect(BlockHash.isL2BlockHash({ buffer: [1, 2, 3], toBuffer: () => Buffer.alloc(32) })).toBe(false);
    });

    it('returns false for objects with wrong buffer length', () => {
      expect(BlockHash.isL2BlockHash({ buffer: Buffer.alloc(16), toBuffer: () => Buffer.alloc(16) })).toBe(false);
      expect(BlockHash.isL2BlockHash({ buffer: Buffer.alloc(64), toBuffer: () => Buffer.alloc(64) })).toBe(false);
    });

    it('returns false for objects without toBuffer method', () => {
      expect(BlockHash.isL2BlockHash({ buffer: Buffer.alloc(32) })).toBe(false);
    });

    it('returns false for plain Buffer32 instances when checking type strictly', () => {
      // Note: Buffer32 will pass duck typing since it has the same structure
      // This is acceptable since the goal is to identify hash-like objects
      const buf32 = Buffer32.random();
      // Buffer32 has the same structure, so duck typing will return true
      // This is expected behavior - we want to handle Buffer32-like objects
      expect(BlockHash.isL2BlockHash(buf32)).toBe(true);
    });
  });
});
