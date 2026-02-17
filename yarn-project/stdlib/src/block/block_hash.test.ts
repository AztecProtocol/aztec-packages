import { Fr } from '@aztec/foundation/curves/bn254';

import { BlockHash } from './block_hash.js';

describe('BlockHash', () => {
  describe('isBlockHash', () => {
    it('returns true for BlockHash instances', () => {
      const hash = BlockHash.random();
      expect(BlockHash.isBlockHash(hash)).toBe(true);
    });

    it('returns false for plain Fr instances', () => {
      const fr = Fr.random();
      expect(BlockHash.isBlockHash(fr)).toBe(false);
    });
  });

  describe('inheritance', () => {
    it('is an instance of Fr', () => {
      const hash = BlockHash.random();
      expect(hash).toBeInstanceOf(Fr);
    });

    it('round-trips through toString/fromString', () => {
      const original = BlockHash.random();
      const restored = BlockHash.fromString(original.toString());
      expect(restored.equals(original)).toBe(true);
      expect(BlockHash.isBlockHash(restored)).toBe(true);
    });
  });
});
