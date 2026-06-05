// Multi-round sumcheck driver — chains the two GPU kernels (accumulate -> round
// univariate, and fold) across all d rounds, mirroring SumcheckProver::prove
// (sumcheck/sumcheck.hpp:394): each round computes the round univariate from the
// current (partially evaluated) polynomials, draws a challenge, and partially
// evaluates every polynomial at it before the next round.
//
// The driver itself is GPU-agnostic: it owns only the GateSeparatorPolynomial
// sequencing (the part that ties the rounds together — roundUnivariate consumes
// beta_i / c_i for the current round, then partiallyEvaluate advances them, and
// edgeScaling's periodicity doubles). The caller supplies, via hooks, how to
// accumulate the flat relation accumulator, how to reduce it to the length-8
// round univariate, and how to fold the columns — so the same driver runs the
// real GPU pipeline and a pure-CPU reference.
//
// checkTelescoping verifies the sumcheck consistency the verifier relies on
// (sumcheck_round.hpp:801 check_sum): S^i(0) + S^i(1) == S^{i-1}(u_{i-1}). For
// the Mega non-ZK relation set this is a witness-independent algebraic identity
// (linearly-dependent subrelations carry no per-edge beta weighting, so they
// telescope too), making it a black-box oracle for the whole chained pipeline.

import { GateSeparatorPolynomial } from './gate_separator.js';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;
const add = (a: bigint, b: bigint): bigint => mod(a + b);
const mul = (a: bigint, b: bigint): bigint => mod(a * b);
const inv = (a: bigint): bigint => {
  let [or, r] = [mod(a), P];
  let [os, s] = [1n, 0n];
  while (r) {
    const q = or / r;
    [or, r] = [r, or - q * r];
    [os, s] = [s, os - q * s];
  }
  return mod(os);
};

export interface MultiRoundHooks {
  /** Number of sumcheck rounds (= log2 of the initial hypercube size). */
  numRounds: number;
  /** Round challenges u_0..u_{numRounds-1} (e.g. Fiat-Shamir; here deterministic). */
  challenges: bigint[];
  /**
   * Produce this round's flat relation accumulator (already summed over edges,
   * with the per-edge gate-separator scaling folded in). The gate separator is
   * passed so the caller can read `edgeScaling(pairIndex)` while building edges.
   */
  accumulate: (roundIdx: number, gs: GateSeparatorPolynomial) => Promise<bigint[]> | bigint[];
  /** Reduce the flat accumulator to the length-8 round univariate (the tail). */
  roundUnivariate: (acc: bigint[], gs: GateSeparatorPolynomial) => bigint[];
  /** Partially evaluate (halve) every column at the round challenge u. */
  fold: (roundIdx: number, u: bigint) => Promise<void> | void;
}

export interface MultiRoundResult {
  /** One length-8 round univariate per round, in round order. */
  univariates: bigint[][];
  /** The (reduced mod p) challenges actually consumed, in round order. */
  challenges: bigint[];
}

/**
 * Run `numRounds` of sumcheck. Returns the round univariate sequence. The gate
 * separator is created here and threaded through the hooks; after each round it
 * is advanced by the round challenge exactly once, so `accumulate` /
 * `roundUnivariate` always see the current round's beta_i, c_i and periodicity.
 */
export async function runSumcheckRounds(
  betas: bigint[],
  logNumMonomials: number,
  hooks: MultiRoundHooks,
): Promise<MultiRoundResult> {
  const gs = new GateSeparatorPolynomial(betas, logNumMonomials);
  const univariates: bigint[][] = [];
  const challenges: bigint[] = [];
  for (let i = 0; i < hooks.numRounds; i++) {
    const acc = await hooks.accumulate(i, gs);
    univariates.push(hooks.roundUnivariate(acc, gs));
    const u = mod(hooks.challenges[i]);
    challenges.push(u);
    await hooks.fold(i, u);
    gs.partiallyEvaluate(u);
  }
  return { univariates, challenges };
}

/**
 * Evaluate a value-basis univariate (evaluations at X = 0..L-1) at an arbitrary
 * field point via barycentric interpolation over the contiguous domain — exact
 * for any polynomial of degree <= L-1. Matches Univariate::evaluate.
 */
export function evaluateUnivariate(evals: bigint[], x: bigint): bigint {
  const L = evals.length;
  const xm = mod(x);
  for (let k = 0; k < L; k++) {
    if (xm === BigInt(k)) return mod(evals[k]);
  }
  let bx = 1n;
  for (let i = 0; i < L; i++) bx = mul(bx, mod(xm - BigInt(i)));
  let acc = 0n;
  for (let j = 0; j < L; j++) {
    let dj = 1n;
    for (let m = 0; m < L; m++) {
      if (m !== j) dj = mul(dj, mod(BigInt(j - m)));
    }
    acc = add(acc, mul(evals[j], inv(mul(dj, mod(xm - BigInt(j))))));
  }
  return mul(acc, bx);
}

export interface TelescopeFailure {
  round: number;
  expected: bigint;
  got: bigint;
}

/**
 * Check the sumcheck telescoping identity across rounds:
 *   S^i(0) + S^i(1) == S^{i-1}(u_{i-1})   for i = 1..d-1.
 * This relates only consecutive round univariates and the challenges, so it is a
 * black-box check independent of how the univariates were produced. (The round-0
 * base S^0(0)+S^0(1) == claimed_sum must be anchored separately by the caller.)
 */
export function checkTelescoping(
  univariates: bigint[][],
  challenges: bigint[],
): { ok: boolean; failures: TelescopeFailure[] } {
  const failures: TelescopeFailure[] = [];
  for (let i = 1; i < univariates.length; i++) {
    const expected = evaluateUnivariate(univariates[i - 1], challenges[i - 1]);
    const got = add(univariates[i][0], univariates[i][1]);
    if (got !== expected) failures.push({ round: i, expected, got });
  }
  return { ok: failures.length === 0, failures };
}
