// CPU reference for the sumcheck fold (partially_evaluate) — Phase 1.
//
// Mirrors SumcheckProver::partially_evaluate (sumcheck/sumcheck.hpp:670): after
// the round challenge u_i is drawn, every polynomial column is halved by
//   dest[k] = src[2k] + u * (src[2k+1] - src[2k])   for k in [0, ceil(len/2))
// folding hypercube variable 0 (the least-significant index bit). An odd length
// pairs the final element against a virtual zero (src[len] = 0), matching the C++
// shrink_end_index((len/2)+(len%2)); MegaFlavor sizes are powers of two, so the
// odd case does not arise in practice but is handled for faithfulness.
//
// Canonical BN254 scalar-field bigint; the caller converts GPU Montgomery output
// to canonical on download.

import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

export const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;

/** Halve one polynomial column by partial evaluation at u. */
export function fold(poly: bigint[], u: bigint): bigint[] {
  const len = poly.length;
  const newLen = (len >> 1) + (len & 1);
  const uu = mod(u);
  const out = new Array<bigint>(newLen);
  for (let k = 0; k < newLen; k++) {
    const a = mod(poly[2 * k]);
    const b = 2 * k + 1 < len ? mod(poly[2 * k + 1]) : 0n;
    out[k] = mod(a + uu * mod(b - a));
  }
  return out;
}

/** Fold every column (one round of partial evaluation). */
export function foldColumns(cols: bigint[][], u: bigint): bigint[][] {
  return cols.map(c => fold(c, u));
}

/**
 * Evaluate the multilinear extension of `poly` (values on {0,1}^d, index i with
 * variable b = bit b of i) at `challenges` = (u_0..u_{d-1}). Independent of the
 * fold recurrence (direct sum over the hypercube) — the cross-check that folding
 * all rounds collapses a column to its multilinear evaluation.
 */
export function evalMultilinear(poly: bigint[], challenges: bigint[]): bigint {
  let acc = 0n;
  for (let i = 0; i < poly.length; i++) {
    let w = 1n;
    for (let b = 0; b < challenges.length; b++) {
      w = mod(w * (((i >> b) & 1) ? mod(challenges[b]) : mod(1n - challenges[b])));
    }
    acc = mod(acc + mod(poly[i]) * w);
  }
  return acc;
}
