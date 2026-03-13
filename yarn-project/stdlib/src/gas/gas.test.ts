import { describe, expect, it } from '@jest/globals';

import { Gas } from './gas.js';

describe('Gas', () => {
  describe('sub', () => {
    it('clamps to zero when both dimensions underflow', () => {
      const result = new Gas(5, 10).sub(new Gas(10, 20));
      expect(result).toEqual(new Gas(0, 0));
    });

    it('clamps to zero only on the dimension that underflows', () => {
      const result = new Gas(5, 20).sub(new Gas(10, 10));
      expect(result).toEqual(new Gas(0, 10));
    });

    it('returns correct result when no underflow occurs', () => {
      const result = new Gas(20, 30).sub(new Gas(10, 10));
      expect(result).toEqual(new Gas(10, 20));
    });

    it('returns zero when subtracting exact values', () => {
      const result = new Gas(10, 10).sub(new Gas(10, 10));
      expect(result).toEqual(new Gas(0, 0));
    });
  });
});
