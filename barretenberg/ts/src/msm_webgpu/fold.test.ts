// Validates the sumcheck fold (partially_evaluate) CPU reference: the single-step
// formula, and that folding all rounds collapses a column to its multilinear
// evaluation (independent direct-sum reference).

import { describe, expect, it } from '@jest/globals';

import { fold, foldColumns, evalMultilinear } from './fold.js';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;

let seed = 0xf01d_5eed_01n;
const rnd = (): bigint => {
  seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n);
  return mod(seed >> 2n);
};
const randCol = (len: number): bigint[] => Array.from({ length: len }, rnd);

describe('fold (partially_evaluate)', () => {
  it('halves a column with dest[k] = a + u*(b-a)', () => {
    const poly = randCol(16);
    const u = rnd();
    const out = fold(poly, u);
    expect(out).toHaveLength(8);
    for (let k = 0; k < 8; k++) {
      expect(out[k]).toBe(mod(poly[2 * k] + u * (poly[2 * k + 1] - poly[2 * k])));
    }
  });

  it('u=0 keeps the even-indexed entries; u=1 keeps the odd-indexed', () => {
    const poly = randCol(8);
    expect(fold(poly, 0n)).toEqual([poly[0], poly[2], poly[4], poly[6]].map(mod));
    expect(fold(poly, 1n)).toEqual([poly[1], poly[3], poly[5], poly[7]].map(mod));
  });

  it('pairs the final element against a virtual zero for odd length', () => {
    const poly = randCol(5);
    const u = rnd();
    const out = fold(poly, u);
    expect(out).toHaveLength(3);
    expect(out[2]).toBe(mod(poly[4] + u * (0n - poly[4]))); // poly[5] = 0
  });

  it('folding all rounds equals the multilinear evaluation at the challenges', () => {
    for (const d of [1, 2, 4, 6, 8]) {
      for (let t = 0; t < 5; t++) {
        const poly = randCol(1 << d);
        const challenges = Array.from({ length: d }, rnd);
        let cur = poly;
        for (const u of challenges) cur = fold(cur, u);
        expect(cur).toHaveLength(1);
        expect(cur[0]).toBe(evalMultilinear(poly, challenges));
      }
    }
  });

  it('foldColumns folds every column independently', () => {
    const cols = [randCol(8), randCol(8), randCol(8)];
    const u = rnd();
    const got = foldColumns(cols, u);
    cols.forEach((c, j) => expect(got[j]).toEqual(fold(c, u)));
  });
});
