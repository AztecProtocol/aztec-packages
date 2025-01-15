import { U128 } from './u128.js';

describe('U128', () => {
  describe('constructor', () => {
    it('accepts valid number inputs', () => {
      const small = new U128(42);
      expect(small.toInteger()).toBe(42n);

      const large = new U128(Number.MAX_SAFE_INTEGER);
      expect(large.toInteger()).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    });

    it('accepts valid bigint inputs', () => {
      const small = new U128(42n);
      expect(small.toInteger()).toBe(42n);

      const max = new U128(2n ** 128n - 1n);
      expect(max.toInteger()).toBe(2n ** 128n - 1n);
    });

    it('throws for negative values', () => {
      expect(() => new U128(-1)).toThrow('Value -1 is not within 128 bits');
      expect(() => new U128(-1n)).toThrow('Value -1 is not within 128 bits');
    });

    it('throws for values >= 2^128', () => {
      const tooLarge = 2n ** 128n;
      expect(() => new U128(tooLarge)).toThrow(`Value ${tooLarge} is not within 128 bits`);
    });
  });

  describe('fromU64sBE', () => {
    it('correctly combines valid limbs', () => {
      const hi = 0xcafebaben;
      const lo = 0xdeadbeefn;
      const combined = U128.fromU64sBE(hi, lo);

      expect(combined.lo).toBe(lo);
      expect(combined.hi).toBe(hi);
      expect(combined.toInteger()).toBe((hi << 64n) | lo);
    });

    it('accepts maximum valid limb values', () => {
      const maxLimb = 2n ** 64n - 1n;
      const value = U128.fromU64sBE(maxLimb, maxLimb);

      expect(value.hi).toBe(maxLimb);
      expect(value.lo).toBe(maxLimb);
      expect(value.toInteger()).toBe(2n ** 128n - 1n);
    });

    it('throws for invalid lower limb', () => {
      const invalid = 2n ** 64n;
      expect(() => U128.fromU64sBE(0n, invalid)).toThrow(`Lower limb ${invalid} is not within valid range`);

      expect(() => U128.fromU64sBE(0n, -1n)).toThrow('Lower limb -1 is not within valid range');
    });

    it('throws for invalid higher limb', () => {
      const invalid = 2n ** 64n;
      expect(() => U128.fromU64sBE(invalid, 0n)).toThrow(`Higher limb ${invalid} is not within valid range`);

      expect(() => U128.fromU64sBE(-1n, 0n)).toThrow('Higher limb -1 is not within valid range');
    });
  });

  describe('getters', () => {
    it('correctly extracts hi and lo components', () => {
      const testCases = [
        { hi: 0xcafebaben, lo: 0xdeadbeefn },
        { hi: 1n, lo: 0n },
        { hi: 0n, lo: 1n },
        { hi: 2n ** 64n - 1n, lo: 2n ** 64n - 1n },
      ];

      for (const { hi, lo } of testCases) {
        const value = U128.fromU64sBE(hi, lo);
        expect(value.hi).toBe(hi);
        expect(value.lo).toBe(lo);
      }
    });
  });
});
