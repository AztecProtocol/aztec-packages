import { randomBigInt, randomBoolean, randomBytes, randomInt } from './index.js';

describe('random', () => {
  it('randomBytes returns a filled byte array', () => {
    const data = randomBytes(32);
    expect(data.length).toEqual(32);
    let identical = true;
    for (let i = 1; i < data.length; ++i) {
      identical = identical && data[i] == data[i - 1];
    }
    expect(identical).toEqual(false);
  });

  describe('randomInt', () => {
    it('stays within bounds', () => {
      for (const max of [1, 2, 3, 100, 255, 256, 257, 1000, 2 ** 32]) {
        for (let i = 0; i < 200; i++) {
          const value = randomInt(max);
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(max);
        }
      }
    });

    it('covers the whole range for maxima above 2^48', () => {
      const max = Number.MAX_SAFE_INTEGER;
      const values = Array.from({ length: 500 }, () => randomInt(max));
      expect(Math.max(...values)).toBeGreaterThan(2 ** 48);
    });

    it('covers every value of a small range', () => {
      const seen = new Set(Array.from({ length: 500 }, () => randomInt(3)));
      expect([...seen].sort()).toEqual([0, 1, 2]);
    });

    it('rejects a non-positive or unsafe max', () => {
      expect(() => randomInt(0)).toThrow(RangeError);
      expect(() => randomInt(-1)).toThrow(RangeError);
      expect(() => randomInt(1.5)).toThrow(RangeError);
      expect(() => randomInt(2 ** 53)).toThrow(RangeError);
    });
  });

  describe('randomBigInt', () => {
    it('stays within bounds', () => {
      for (const max of [1n, 2n, 3n, 100n, 256n, 1n << 64n]) {
        for (let i = 0; i < 200; i++) {
          const value = randomBigInt(max);
          expect(value).toBeGreaterThanOrEqual(0n);
          expect(value).toBeLessThan(max);
        }
      }
    });

    it('covers the whole range for maxima above 2^64', () => {
      const max = 1n << 200n;
      const values = Array.from({ length: 500 }, () => randomBigInt(max));
      expect(values.reduce((a, b) => (a > b ? a : b))).toBeGreaterThan(1n << 64n);
    });

    it('rejects a non-positive max', () => {
      expect(() => randomBigInt(0n)).toThrow(RangeError);
      expect(() => randomBigInt(-1n)).toThrow(RangeError);
    });
  });

  it('randomBoolean returns both values', () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomBoolean()));
    expect([...seen].sort()).toEqual([false, true]);
  });
});
