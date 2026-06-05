// Validates the multi-round sumcheck driver (multiround.ts) on a self-contained
// synthetic flavor: two subrelations over three columns — one linearly
// independent (degree 2, c0*c1) and one linearly dependent (degree 1, c0-c2),
// mirroring the real flavor's indep/dep split and the alpha^g scaling. The driver
// is exercised through the real GateSeparatorPolynomial and the real extendTo
// tail, so this checks the round-to-round composition (gate-separator advancement
// + fold chaining), not just the individual modules.
//
// Three independent anchors, none of which inspect the driver internals:
//   - round-0 base:   S^0(0)+S^0(1) == claimed sum (direct hypercube sum)
//   - telescoping:    S^i(0)+S^i(1) == S^{i-1}(u_{i-1})  for all i>=1
//   - final purported: S^{d-1}(u_{d-1}) == c_d*c0*c1 + alpha*(c0-c2) at the point u

import { describe, expect, it } from '@jest/globals';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';
import { extendTo, BATCHED_LEN } from './batch_tail.js';
import { GateSeparatorPolynomial } from './gate_separator.js';
import { runSumcheckRounds, evaluateUnivariate, checkTelescoping } from './multiround.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;
const add = (a: bigint, b: bigint): bigint => mod(a + b);
const sub = (a: bigint, b: bigint): bigint => mod(a - b);
const mul = (a: bigint, b: bigint): bigint => mod(a * b);

function makeRng(seed: bigint): () => bigint {
  let s = seed & ((1n << 256n) - 1n);
  return () => {
    s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n);
    return mod(s >> 2n);
  };
}

const subrelIndep = (c0: bigint, c1: bigint): bigint => mul(c0, c1);
const subrelDep = (c0: bigint, c2: bigint): bigint => sub(c0, c2);

function fold(col: bigint[], u: bigint): bigint[] {
  const m = col.length >> 1;
  const out = new Array<bigint>(m);
  for (let k = 0; k < m; k++) out[k] = add(col[2 * k], mul(u, sub(col[2 * k + 1], col[2 * k])));
  return out;
}

// pow_beta(x) = prod over set bits j of x of betas[j]
function powBeta(betas: bigint[], x: number): bigint {
  let r = 1n;
  for (let j = 0; j < betas.length; j++) if ((x >> j) & 1) r = mul(r, betas[j]);
  return r;
}

describe('multi-round sumcheck driver', () => {
  const run = async (d: number, seed: bigint) => {
    const n = 1 << d;
    const rng = makeRng(seed);
    const c0 = Array.from({ length: n }, () => rng());
    const c1 = Array.from({ length: n }, () => rng());
    const c2 = Array.from({ length: n }, () => rng());
    const alpha = rng();
    const betas = Array.from({ length: d }, () => rng());
    const challenges = Array.from({ length: d }, () => rng());

    // The driver folds these columns in place via the fold hook.
    let cols = [c0.slice(), c1.slice(), c2.slice()];

    const result = await runSumcheckRounds(betas, d, {
      numRounds: d,
      challenges,
      accumulate: (_round, gs) => {
        const m = cols[0].length;
        const accI = [0n, 0n, 0n]; // indep degree 2 -> length 3
        const accD = [0n, 0n]; // dep degree 1 -> length 2
        for (let p = 0; p < m / 2; p++) {
          const s = gs.edgeScaling(p);
          const a = cols.map(col => col[2 * p]);
          const b = cols.map(col => col[2 * p + 1]);
          for (let x = 0; x < 3; x++) {
            const v = a.map((av, j) => add(av, mul(BigInt(x), sub(b[j], av))));
            accI[x] = add(accI[x], mul(s, subrelIndep(v[0], v[1])));
          }
          for (let x = 0; x < 2; x++) {
            const v = a.map((av, j) => add(av, mul(BigInt(x), sub(b[j], av))));
            accD[x] = add(accD[x], subrelDep(v[0], v[2])); // dependent: NO beta scaling
          }
        }
        return [...accI, ...accD];
      },
      roundUnivariate: (acc, gs) => {
        const extRandom = extendTo([1n, gs.currentElement()], BATCHED_LEN);
        const ci = gs.partialEvaluationResult;
        const extI = extendTo(acc.slice(0, 3), BATCHED_LEN);
        const extD = extendTo(acc.slice(3, 5), BATCHED_LEN);
        return Array.from({ length: BATCHED_LEN }, (_, k) =>
          add(mul(mul(extI[k], extRandom[k]), ci), mul(alpha, extD[k])),
        );
      },
      fold: (_round, u) => {
        cols = cols.map(col => fold(col, u));
      },
    });

    return { result, alpha, betas, challenges, c0, c1, c2, finalCols: cols, n };
  };

  it('round-0 univariate sums to the claimed total over the hypercube', async () => {
    const { result, alpha, betas, c0, c1, c2, n } = await run(4, 0xa11ce5eed01n);
    let claimed = 0n;
    for (let x = 0; x < n; x++) {
      claimed = add(claimed, add(mul(powBeta(betas, x), subrelIndep(c0[x], c1[x])), mul(alpha, subrelDep(c0[x], c2[x]))));
    }
    const s0 = result.univariates[0];
    expect(add(s0[0], s0[1])).toBe(claimed);
  });

  it('round univariates telescope: S^i(0)+S^i(1) == S^{i-1}(u_{i-1})', async () => {
    const { result, challenges } = await run(5, 0xbeef00d5n);
    const tel = checkTelescoping(result.univariates, challenges);
    expect(tel.failures).toEqual([]);
    expect(tel.ok).toBe(true);
  });

  it('final round univariate at u equals the purported value at the folded point', async () => {
    const { result, alpha, betas, challenges, finalCols } = await run(4, 0xf1a1e7d00n);
    // c_d = prod_k ((1-u_k) + u_k*beta_k) = pow_beta at the challenge point.
    let cd = 1n;
    for (let k = 0; k < betas.length; k++) cd = mul(cd, add(sub(1n, challenges[k]), mul(challenges[k], betas[k])));
    const [m0, m1, m2] = [finalCols[0][0], finalCols[1][0], finalCols[2][0]]; // MLE evals at u
    const purported = add(mul(cd, subrelIndep(m0, m1)), mul(alpha, subrelDep(m0, m2)));
    const last = result.univariates.length - 1;
    expect(evaluateUnivariate(result.univariates[last], challenges[last])).toBe(purported);
  });

  it('folding all rounds collapses each column to its multilinear evaluation', async () => {
    const { betas, challenges, c0, finalCols } = await run(4, 0x123456n);
    // direct multilinear evaluation of c0 at the challenge point (LSB-first vars)
    let mle = 0n;
    for (let x = 0; x < c0.length; x++) {
      let w = 1n;
      for (let b = 0; b < challenges.length; b++) {
        w = mul(w, (x >> b) & 1 ? challenges[b] : sub(1n, challenges[b]));
      }
      mle = add(mle, mul(c0[x], w));
    }
    expect(finalCols[0][0]).toBe(mle);
    expect(betas.length).toBe(4); // sanity: ran the expected number of rounds
  });
});
