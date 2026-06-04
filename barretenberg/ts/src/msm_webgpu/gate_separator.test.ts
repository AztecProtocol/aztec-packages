// Validates the GateSeparatorPolynomial mirror and the end-to-end round
// univariate composition (gate separator + per-edge scaling + edge-sum + tail)
// against independent references.

import { describe, expect, it } from '@jest/globals';

import {
  NUM_SUBRELATIONS,
  SUBREL_LEN,
  SUBREL_LIN_INDEP,
  BATCHED_LEN,
} from './batch_tail.js';
import { GateSeparatorPolynomial, computeBetaProducts } from './gate_separator.js';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;

let seed = 0x9a7e_5e9a_70a1n;
const rnd = (): bigint => {
  seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n);
  return mod(seed >> 2n);
};
const randBetas = (d: number): bigint[] => Array.from({ length: d }, rnd);

// popcount-product reference for beta_products[i].
const betaProductRef = (betas: bigint[], i: number): bigint => {
  let r = 1n;
  for (let j = 0; j < betas.length; j++) if ((i >> j) & 1) r = mod(r * betas[j]);
  return r;
};

// ---- independent coefficient-basis polynomial helpers ----
type Poly = bigint[];
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

describe('computeBetaProducts', () => {
  it('matches the popcount-product definition', () => {
    for (const d of [1, 3, 5]) {
      const betas = randBetas(d);
      const bp = computeBetaProducts(betas, d);
      expect(bp).toHaveLength(1 << d);
      expect(bp[0]).toBe(1n);
      for (let i = 0; i < 1 << d; i++) expect(bp[i]).toBe(betaProductRef(betas, i));
    }
  });

  it('uses only the low betas when logNumMonomials < betas.length (constant-size proof)', () => {
    const betas = randBetas(6); // more betas than needed; only the low 3 are referenced for i < 8
    const bp = computeBetaProducts(betas, 3);
    expect(bp).toHaveLength(8);
    for (let i = 0; i < 8; i++) expect(bp[i]).toBe(betaProductRef(betas, i));
  });

  it('returns [0] for empty betas', () => {
    expect(computeBetaProducts([], 0)).toEqual([0n]);
  });
});

describe('GateSeparatorPolynomial state machine', () => {
  it('tracks c_i, current_element_idx, and periodicity across rounds', () => {
    const d = 5;
    const betas = randBetas(d);
    const gs = new GateSeparatorPolynomial(betas, d);
    expect(gs.partialEvaluationResult).toBe(1n); // c_0
    expect(gs.currentElement()).toBe(betas[0]);
    expect(gs.periodicity).toBe(2);

    let ci = 1n;
    for (let i = 0; i < d; i++) {
      expect(gs.currentElementIdx).toBe(i);
      expect(gs.periodicity).toBe(1 << (i + 1));
      expect(gs.currentElement()).toBe(betas[i]);
      expect(gs.partialEvaluationResult).toBe(ci);
      const u = rnd();
      ci = mod(ci * mod(1n + u * mod(betas[i] - 1n))); // c_{i+1} = c_i * ((1-u)+u*beta_i)
      gs.partiallyEvaluate(u);
    }
    expect(gs.partialEvaluationResult).toBe(ci);
  });

  it('edgeScaling(j) == at(2j) == beta_products[j*periodicity] for each round', () => {
    const d = 5;
    const gs = new GateSeparatorPolynomial(randBetas(d), d);
    for (let round = 0; round < d; round++) {
      const pairs = 1 << (d - 1 - round);
      for (let j = 0; j < pairs; j++) {
        expect(gs.edgeScaling(j)).toBe(gs.betaProducts[j * gs.periodicity]);
        expect(gs.at(2 * j)).toBe(gs.edgeScaling(j));
      }
      gs.partiallyEvaluate(rnd());
    }
  });

  it('empty betas: current_element 1, partiallyEvaluate is a no-op', () => {
    const gs = new GateSeparatorPolynomial([]);
    expect(gs.currentElement()).toBe(1n);
    gs.partiallyEvaluate(rnd());
    expect(gs.partialEvaluationResult).toBe(1n);
    expect(gs.currentElementIdx).toBe(0);
  });
});

describe('end-to-end round univariate', () => {
  // Build a synthetic per-(subrelation, edge-pair) set of value-basis univariates
  // from known coefficient polys, fold each edge by edgeScaling and sum (mirroring
  // the GPU per-edge accumulate + reduction), then reduce with the tail. Compare to
  // an independent coefficient-basis computation that derives c_i and beta_i from
  // first principles.
  it('matches an independent coefficient-basis reference at a mid-protocol round', () => {
    const d = 4;
    const round = 2; // c_i nontrivial, periodicity = 8
    const betas = randBetas(d);
    const challenges = Array.from({ length: round }, rnd); // u_0..u_{round-1}
    const alpha = rnd();
    const numPairs = 1 << (d - 1 - round);

    // per-subrelation, per-edge-pair coefficient polys P[g][j], degree SUBREL_LEN[g]-1.
    const polys: Poly[][] = Array.from({ length: NUM_SUBRELATIONS }, (_, g) =>
      Array.from({ length: numPairs }, () => Array.from({ length: SUBREL_LEN[g] }, rnd)),
    );

    // Advance the gate separator through the previous rounds, then build the
    // accumulator using its edgeScaling and reduce with its round scalars.
    const gs = new GateSeparatorPolynomial(betas, d);
    for (const u of challenges) gs.partiallyEvaluate(u);

    const acc: bigint[] = [];
    for (let g = 0; g < NUM_SUBRELATIONS; g++) {
      for (let e = 0; e < SUBREL_LEN[g]; e++) {
        let s = 0n;
        for (let j = 0; j < numPairs; j++) s = mod(s + gs.edgeScaling(j) * pEval(polys[g][j], BigInt(e)));
        acc.push(s);
      }
    }
    const got = gs.roundUnivariate(acc, alpha);

    // Independent reference: c_i and beta_i from first principles, coeff-basis batch.
    let ci = 1n;
    for (let k = 0; k < round; k++) ci = mod(ci * mod(1n + challenges[k] * mod(betas[k] - 1n)));
    const betaI = betas[round];
    const powPoly: Poly = [1n, mod(betaI - 1n)];
    const edgeScale = (j: number): bigint => betaProductRef(betas, j << (round + 1)); // beta_products[j*2^(round+1)]

    let r: Poly = [0n];
    let alphaPow = 1n;
    for (let g = 0; g < NUM_SUBRELATIONS; g++) {
      if (g > 0) alphaPow = mod(alphaPow * alpha);
      // Q_g = sum_j edgeScale(j) * P[g][j]
      let q: Poly = [0n];
      for (let j = 0; j < numPairs; j++) q = pAdd(q, pScale(polys[g][j], edgeScale(j)));
      const scaled = pScale(q, alphaPow);
      r = pAdd(r, SUBREL_LIN_INDEP[g] ? pScale(pMul(scaled, powPoly), ci) : scaled);
    }
    const want = Array.from({ length: BATCHED_LEN }, (_, k) => pEval(r, BigInt(k)));

    expect(got).toEqual(want);
  });

  it('round 0 (c_i = 1, periodicity = 2) matches the reference', () => {
    const d = 3;
    const betas = randBetas(d);
    const alpha = rnd();
    const numPairs = 1 << (d - 1); // round 0
    const polys: Poly[][] = Array.from({ length: NUM_SUBRELATIONS }, (_, g) =>
      Array.from({ length: numPairs }, () => Array.from({ length: SUBREL_LEN[g] }, rnd)),
    );
    const gs = new GateSeparatorPolynomial(betas, d);

    const acc: bigint[] = [];
    for (let g = 0; g < NUM_SUBRELATIONS; g++) {
      for (let e = 0; e < SUBREL_LEN[g]; e++) {
        let s = 0n;
        for (let j = 0; j < numPairs; j++) s = mod(s + gs.edgeScaling(j) * pEval(polys[g][j], BigInt(e)));
        acc.push(s);
      }
    }
    const got = gs.roundUnivariate(acc, alpha);

    const powPoly: Poly = [1n, mod(betas[0] - 1n)];
    const edgeScale = (j: number): bigint => betaProductRef(betas, j << 1);
    let r: Poly = [0n];
    let alphaPow = 1n;
    for (let g = 0; g < NUM_SUBRELATIONS; g++) {
      if (g > 0) alphaPow = mod(alphaPow * alpha);
      let q: Poly = [0n];
      for (let j = 0; j < numPairs; j++) q = pAdd(q, pScale(polys[g][j], edgeScale(j)));
      const scaled = pScale(q, alphaPow);
      r = pAdd(r, SUBREL_LIN_INDEP[g] ? pScale(pMul(scaled, powPoly), 1n) : scaled);
    }
    const want = Array.from({ length: BATCHED_LEN }, (_, k) => pEval(r, BigInt(k)));
    expect(got).toEqual(want);
  });
});
