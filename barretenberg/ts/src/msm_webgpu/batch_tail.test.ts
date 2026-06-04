// Validates the CPU batch_over_relations tail (batch_tail.ts) against an
// INDEPENDENT coefficient-basis polynomial reference. The implementation works
// in value basis (barycentric extend + pointwise multiply); the reference here
// builds each subrelation as a true coefficient polynomial, multiplies by the
// pow line in coefficient basis, sums, and evaluates — so a bug in the extend /
// alpha-indexing / dependent-vs-independent split shows up as a mismatch.

import { describe, expect, it } from '@jest/globals';

import {
  ACC_LEN,
  BATCHED_LEN,
  NUM_SUBRELATIONS,
  SUBREL_LEN,
  SUBREL_LIN_INDEP,
  SUBREL_START,
  addNestedTuples,
  batchOverRelations,
  extendTo,
  scaleUnivariates,
} from './batch_tail.js';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;

let seed = 0xba7c47a11_1dn;
const rnd = (): bigint => {
  seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n);
  return mod(seed >> 2n);
};

// ---- independent coefficient-basis polynomial reference ----
type Poly = bigint[]; // c[0] + c[1] x + ... + c[n] x^n
const pEval = (c: Poly, x: bigint): bigint => {
  let acc = 0n;
  let xp = 1n;
  for (const ci of c) {
    acc = mod(acc + ci * xp);
    xp = mod(xp * x);
  }
  return acc;
};
const pMul = (a: Poly, b: Poly): Poly => {
  const r: Poly = Array(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = mod(r[i + j] + a[i] * b[j]);
  return r;
};
const pAdd = (a: Poly, b: Poly): Poly =>
  Array.from({ length: Math.max(a.length, b.length) }, (_, i) => mod((a[i] ?? 0n) + (b[i] ?? 0n)));
const pScale = (a: Poly, s: bigint): Poly => a.map(x => mod(x * s));
const randPoly = (n: number): Poly => Array.from({ length: n }, rnd);

// Build the flat 345-Fr value-basis accumulator from per-subrelation coefficient
// polys: acc slice g = [P_g(0), ..., P_g(len_g - 1)].
const accFromPolys = (polys: Poly[]): bigint[] => {
  const acc = new Array<bigint>(ACC_LEN).fill(0n);
  for (let g = 0; g < NUM_SUBRELATIONS; g++) {
    for (let e = 0; e < SUBREL_LEN[g]; e++) acc[SUBREL_START[g] + e] = pEval(polys[g], BigInt(e));
  }
  return acc;
};

// Reference round univariate: sum over subrelations of the batched coefficient
// poly, evaluated at X = 0..7. Independent subrels get the alpha^g * pow * c_i
// factors; dependent ones get only alpha^g.
const refRoundUnivariate = (polys: Poly[], alpha: bigint, beta: bigint, ci: bigint): bigint[] => {
  const powPoly: Poly = [1n, mod(beta - 1n)]; // (1-X) + beta*X = 1 + (beta-1)X
  let r: Poly = [0n];
  let alphaPow = 1n; // alpha^g, alpha^0 = 1 for g = 0
  for (let g = 0; g < NUM_SUBRELATIONS; g++) {
    if (g > 0) alphaPow = mod(alphaPow * alpha);
    const scaled = pScale(polys[g], alphaPow);
    r = pAdd(r, SUBREL_LIN_INDEP[g] ? pScale(pMul(scaled, powPoly), ci) : scaled);
  }
  return Array.from({ length: BATCHED_LEN }, (_, k) => pEval(r, BigInt(k)));
};

describe('batch_tail layout', () => {
  it('is the 63-subrelation / 345-Fr MegaFlavor accumulator', () => {
    expect(NUM_SUBRELATIONS).toBe(63);
    expect(ACC_LEN).toBe(345);
    expect(SUBREL_LEN.reduce((a, b) => a + b, 0)).toBe(345);
  });

  it('has contiguous, monotonic offsets', () => {
    for (let g = 0; g < NUM_SUBRELATIONS; g++) {
      const prevEnd = g === 0 ? 0 : SUBREL_START[g - 1] + SUBREL_LEN[g - 1];
      expect(SUBREL_START[g]).toBe(prevEnd);
    }
  });

  it('marks exactly the 6 linearly-dependent subrelations', () => {
    const dependent = SUBREL_LIN_INDEP.flatMap((li, g) => (li ? [] : [g]));
    expect(dependent).toEqual([6, 31, 34, 37, 40, 43]);
  });

  it('only uses subrelation lengths {3,5,6,7}', () => {
    expect([...new Set(SUBREL_LEN)].sort((a, b) => a - b)).toEqual([3, 5, 6, 7]);
  });
});

describe('extendTo (value-basis barycentric)', () => {
  it('extends evaluations of a degree-(L-1) poly to length 8 exactly', () => {
    for (const L of [2, 3, 5, 6, 7]) {
      for (let t = 0; t < 20; t++) {
        const c = randPoly(L);
        const evals = Array.from({ length: L }, (_, x) => pEval(c, BigInt(x)));
        const got = extendTo(evals, BATCHED_LEN);
        const want = Array.from({ length: BATCHED_LEN }, (_, x) => pEval(c, BigInt(x)));
        expect(got).toEqual(want);
      }
    }
  });

  it('is identity when target equals source length', () => {
    const evals = randPoly(6);
    expect(extendTo(evals, 6)).toEqual(evals.map(mod));
  });
});

describe('addNestedTuples', () => {
  it('adds two accumulators elementwise', () => {
    const a = Array.from({ length: ACC_LEN }, rnd);
    const b = Array.from({ length: ACC_LEN }, rnd);
    const sum = addNestedTuples(a, b);
    for (let i = 0; i < ACC_LEN; i++) expect(sum[i]).toBe(mod(a[i] + b[i]));
  });
});

describe('batchOverRelations', () => {
  it('matches the independent coefficient-basis reference (round 0, c_i = 1)', () => {
    for (let t = 0; t < 8; t++) {
      const polys = Array.from({ length: NUM_SUBRELATIONS }, (_, g) => randPoly(SUBREL_LEN[g]));
      const acc = accFromPolys(polys);
      const alpha = rnd();
      const beta = rnd();
      const got = batchOverRelations(acc, alpha, beta, 1n);
      expect(got).toEqual(refRoundUnivariate(polys, alpha, beta, 1n));
    }
  });

  it('matches the reference for a non-trivial c_i (later round)', () => {
    for (let t = 0; t < 8; t++) {
      const polys = Array.from({ length: NUM_SUBRELATIONS }, (_, g) => randPoly(SUBREL_LEN[g]));
      const acc = accFromPolys(polys);
      const alpha = rnd();
      const beta = rnd();
      const ci = rnd();
      expect(batchOverRelations(acc, alpha, beta, ci)).toEqual(refRoundUnivariate(polys, alpha, beta, ci));
    }
  });

  it('returns a length-8 univariate', () => {
    const acc = new Array<bigint>(ACC_LEN).fill(7n);
    expect(batchOverRelations(acc, 3n, 5n, 1n)).toHaveLength(BATCHED_LEN);
  });

  it('does not mutate its input accumulator', () => {
    const acc = Array.from({ length: ACC_LEN }, rnd);
    const snapshot = acc.slice();
    batchOverRelations(acc, rnd(), rnd(), rnd());
    expect(acc).toEqual(snapshot);
  });

  it('dependent subrelations ignore beta and c_i (added raw)', () => {
    // Only the linearly-dependent subrelations are nonzero.
    const polys = Array.from({ length: NUM_SUBRELATIONS }, (_, g) =>
      SUBREL_LIN_INDEP[g] ? Array<bigint>(SUBREL_LEN[g]).fill(0n) : randPoly(SUBREL_LEN[g]),
    );
    const acc = accFromPolys(polys);
    const alpha = rnd();
    const a = batchOverRelations(acc, alpha, rnd(), rnd());
    const b = batchOverRelations(acc, alpha, rnd(), rnd());
    expect(a).toEqual(b); // invariant to beta / c_i
  });

  it('independent contribution is linear in c_i', () => {
    // Only one linearly-independent subrelation is nonzero.
    const g0 = SUBREL_LIN_INDEP.findIndex(li => li);
    const polys = Array.from({ length: NUM_SUBRELATIONS }, (_, g) =>
      g === g0 ? randPoly(SUBREL_LEN[g]) : Array<bigint>(SUBREL_LEN[g]).fill(0n),
    );
    const acc = accFromPolys(polys);
    const alpha = rnd();
    const beta = rnd();
    const k = rnd();
    const base = batchOverRelations(acc, alpha, beta, 1n);
    const scaled = batchOverRelations(acc, alpha, beta, k);
    for (let e = 0; e < BATCHED_LEN; e++) expect(scaled[e]).toBe(mod(base[e] * k));
  });
});

describe('scaleUnivariates', () => {
  it('leaves subrelation 0 unscaled and scales subrelation g by alpha^g', () => {
    const acc = Array.from({ length: ACC_LEN }, () => 1n); // every eval = 1
    const alpha = rnd();
    const scaled = scaleUnivariates(acc, alpha);
    let alphaPow = 1n;
    for (let g = 0; g < NUM_SUBRELATIONS; g++) {
      if (g > 0) alphaPow = mod(alphaPow * alpha);
      const want = g === 0 ? 1n : alphaPow;
      for (let e = 0; e < SUBREL_LEN[g]; e++) expect(scaled[SUBREL_START[g] + e]).toBe(want);
    }
  });
});
