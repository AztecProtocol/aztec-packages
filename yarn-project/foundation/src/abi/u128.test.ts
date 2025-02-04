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

  describe('fromU64sLE', () => {
    it('correctly combines valid limbs', () => {
      const lo = 0xdeadbeefn;
      const hi = 0xcafebaben;
      const combined = U128.fromU64sLE(lo, hi);

      expect(combined.lo).toBe(lo);
      expect(combined.hi).toBe(hi);
      expect(combined.toInteger()).toBe((hi << 64n) | lo);
    });

    it('accepts maximum valid limb values', () => {
      const maxLimb = 2n ** 64n - 1n;
      const value = U128.fromU64sLE(maxLimb, maxLimb);

      expect(value.lo).toBe(maxLimb);
      expect(value.hi).toBe(maxLimb);
      expect(value.toInteger()).toBe(2n ** 128n - 1n);
    });

    it('throws for invalid lower limb', () => {
      const invalid = 2n ** 64n;
      expect(() => U128.fromU64sLE(invalid, 0n)).toThrow(`Lower limb ${invalid} is not within valid range`);

      expect(() => U128.fromU64sLE(-1n, 0n)).toThrow('Lower limb -1 is not within valid range');
    });

    it('throws for invalid higher limb', () => {
      const invalid = 2n ** 64n;
      expect(() => U128.fromU64sLE(0n, invalid)).toThrow(`Higher limb ${invalid} is not within valid range`);

      expect(() => U128.fromU64sLE(0n, -1n)).toThrow('Higher limb -1 is not within valid range');
    });
  });

  describe('getters', () => {
    it('correctly extracts lo and hi components', () => {
      const testCases = [
        { lo: 0xdeadbeefn, hi: 0xcafebaben },
        { lo: 0n, hi: 1n },
        { lo: 1n, hi: 0n },
        { lo: 2n ** 64n - 1n, hi: 2n ** 64n - 1n },
      ];

      for (const { lo, hi } of testCases) {
        const value = U128.fromU64sLE(lo, hi);
        expect(value.lo).toBe(lo);
        expect(value.hi).toBe(hi);
      }
    });
  });

  it('round-trips through field conversion', () => {
    const testCases = [
      U128.fromU64sLE(0xdeadbeefn, 0xcafebaben),
      new U128(0),
      new U128(2n ** 128n - 1n),
      U128.fromU64sLE(2n ** 64n - 1n, 0n),
      U128.fromU64sLE(0n, 2n ** 64n - 1n),
    ];

    for (const original of testCases) {
      const fields = original.toFields();
      const reconstructed = U128.fromFields(fields);

      expect(reconstructed.lo).toBe(original.lo);
      expect(reconstructed.hi).toBe(original.hi);
      expect(reconstructed.toInteger()).toBe(original.toInteger());
    }
  });
});
