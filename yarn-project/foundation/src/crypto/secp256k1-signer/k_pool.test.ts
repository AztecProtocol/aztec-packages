import { describe, expect, it } from '@jest/globals';
import { secp256k1 } from '@noble/curves/secp256k1';

import { KValuePool } from './k_pool.js';

describe('KValuePool', () => {
  it('should generate specified number of k values', () => {
    const pool = new KValuePool(100);
    expect(pool.getPoolSize()).toBe(100);
  });

  it('should return valid k values in range (0, n)', () => {
    const pool = new KValuePool(10);
    const n = secp256k1.CURVE.n;

    for (let i = 0; i < 10; i++) {
      const k = pool.getK(i);
      expect(k > 0n).toBe(true);
      expect(k < n).toBe(true);
    }
  });

  it('should return k values by index', () => {
    const pool = new KValuePool(5);
    const k0 = pool.getK(0);
    const k1 = pool.getK(1);
    const k2 = pool.getK(2);

    // Should return same value for same index
    expect(pool.getK(0)).toBe(k0);
    expect(pool.getK(1)).toBe(k1);
    expect(pool.getK(2)).toBe(k2);

    // Values should be different
    expect(k0).not.toBe(k1);
    expect(k1).not.toBe(k2);
    expect(k0).not.toBe(k2);
  });

  it('should throw on out of bounds index', () => {
    const pool = new KValuePool(10);

    // Negative index
    expect(() => pool.getK(-1)).toThrow();

    // Index >= pool size
    expect(() => pool.getK(10)).toThrow();
    expect(() => pool.getK(100)).toThrow();
  });
});
