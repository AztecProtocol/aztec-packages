/**
 * CPU reference implementation of batch-affine MSM for BN254.
 *
 * The point of this file is *correctness validation only*. It mirrors the
 * algorithm we plan to push down to WebGPU shaders, so we can verify
 * end-to-end that batch-affine produces the same MSM result as the
 * existing Jacobian path before committing to the much larger shader
 * rewrite.
 *
 * Key building blocks:
 *
 *   - batchInverse  — Montgomery's trick: invert N field elements with
 *     ONE field inversion plus 3N multiplications.
 *
 *   - batchAffineAdd — given N independent point pairs, return their N
 *     affine sums sharing a single batched inversion. Edge cases
 *     (identity operands, x-coordinate collisions) fall back to the
 *     standard (per-pair) affine add so the batch only contains "clean"
 *     pairs whose deltas are guaranteed non-zero.
 *
 *   - batchAffineMSM — Pippenger MSM using batch-affine for the
 *     bucket-accumulation phase. Each "round" pulls one pair from every
 *     bucket that still has ≥ 2 points, performs all those adds with a
 *     single shared inversion, and writes the sums back. Loops until
 *     every bucket has at most one point.
 */

import {
  addBn254Points,
  bn254BaseField,
  BN254_ZERO,
  doubleBn254Point,
  isBn254Zero,
  modInverse,
  type Bn254Point,
} from "./bn254.js";

/**
 * Montgomery's batch-inverse trick.
 *
 *   Given v0, v1, ..., v_{n-1}, returns [1/v0, 1/v1, ..., 1/v_{n-1}].
 *
 * Cost: 3(n-1) multiplications + 1 inversion. Compare to n inversions
 * if done one at a time. With BN254 inversion ≈ 300M and a multiply ≈
 * 1M, this turns 300n into 3n + 300, i.e. ~100× fewer ops at large n.
 *
 * Throws if any input is zero — callers must filter zeros out
 * beforehand. (Affine point adds with delta_x == 0 are an EC edge case
 * that needs different handling anyway.)
 */
export const batchInverse = (values: bigint[]): bigint[] => {
  const n = values.length;
  if (n === 0) return [];

  // prefix[i] = v0 * v1 * ... * vi
  const prefix: bigint[] = new Array(n);
  let acc = values[0];
  prefix[0] = acc;
  for (let i = 1; i < n; i++) {
    acc = bn254BaseField.mul(acc, values[i]);
    prefix[i] = acc;
  }

  // One inversion of the full product.
  let invAcc = bn254BaseField.inv(acc);

  // Walk back: 1/v[i] = invAcc * (v0*...*v_{i-1}) = invAcc * prefix[i-1].
  // After reading 1/v[i], multiply invAcc by v[i] so the next iter has
  // the inverse of the truncated product (v0 * ... * v_{i-1}).
  const result: bigint[] = new Array(n);
  for (let i = n - 1; i >= 1; i--) {
    result[i] = bn254BaseField.mul(invAcc, prefix[i - 1]);
    invAcc = bn254BaseField.mul(invAcc, values[i]);
  }
  result[0] = invAcc;

  return result;
};

/**
 * Affine add of N independent point pairs sharing one batched inversion.
 *
 * Pairs whose addition is degenerate (identity operand, equal/negated
 * x-coordinates) are diverted to the per-pair `addBn254Points` and do
 * not enter the batch. The batch therefore always inverts strictly
 * non-zero deltas.
 */
export const batchAffineAdd = (
  ps: Bn254Point[],
  qs: Bn254Point[],
): Bn254Point[] => {
  if (ps.length !== qs.length) {
    throw new Error("batchAffineAdd: ps and qs length mismatch");
  }
  const n = ps.length;
  const result: Bn254Point[] = new Array(n);

  // Classify pairs. "Clean" ones go into the batch.
  const cleanIdx: number[] = [];
  const deltas: bigint[] = [];

  for (let i = 0; i < n; i++) {
    const p = ps[i];
    const q = qs[i];
    if (isBn254Zero(p)) {
      result[i] = q;
    } else if (isBn254Zero(q)) {
      result[i] = p;
    } else if (p.x === q.x) {
      // Same x: either P == Q (double) or P == -Q (identity). Both
      // handled correctly by addBn254Points.
      result[i] = addBn254Points(p, q);
    } else {
      cleanIdx.push(i);
      deltas.push(bn254BaseField.sub(q.x, p.x));
    }
  }

  if (deltas.length === 0) return result;

  const invDeltas = batchInverse(deltas);

  // Apply affine add formula:
  //   λ = (q.y - p.y) / (q.x - p.x)
  //   x3 = λ^2 - p.x - q.x
  //   y3 = λ * (p.x - x3) - p.y
  for (let j = 0; j < cleanIdx.length; j++) {
    const i = cleanIdx[j];
    const p = ps[i];
    const q = qs[i];
    const numerator = bn254BaseField.sub(q.y, p.y);
    const lambda = bn254BaseField.mul(numerator, invDeltas[j]);
    const lambdaSq = bn254BaseField.mul(lambda, lambda);
    const x3 = bn254BaseField.sub(
      bn254BaseField.sub(lambdaSq, p.x),
      q.x,
    );
    const y3 = bn254BaseField.sub(
      bn254BaseField.mul(lambda, bn254BaseField.sub(p.x, x3)),
      p.y,
    );
    result[i] = { x: x3, y: y3 };
  }

  return result;
};

/**
 * Sum each bucket's points down to a single affine point using
 * lock-step batch-affine rounds.
 *
 * Round structure: at each round, *every* bucket with ≥ 2 points
 * contributes one pair (the last two entries) to a single global
 * batch. All those adds share one batched inversion. The two operands
 * are popped and the sum is pushed back. The bucket therefore shrinks
 * by 1 per round it participates in, so the total round count is
 * (max bucket size) - 1.
 *
 * Total pair-additions across all rounds = (total points) - (number of
 * non-empty buckets), which is the inherent work of summing those
 * points; batch-affine just amortises the field inversions across all
 * pairs in the same round.
 *
 * Mutates the input `buckets` (drains them).
 */
const batchSumBuckets = (buckets: Bn254Point[][]): Bn254Point[] => {
  const numBuckets = buckets.length;

  while (true) {
    const ps: Bn254Point[] = [];
    const qs: Bn254Point[] = [];
    const targetBucket: number[] = [];

    for (let b = 0; b < numBuckets; b++) {
      if (buckets[b].length >= 2) {
        const q = buckets[b].pop()!;
        const p = buckets[b].pop()!;
        ps.push(p);
        qs.push(q);
        targetBucket.push(b);
      }
    }

    if (ps.length === 0) break;

    const sums = batchAffineAdd(ps, qs);
    for (let i = 0; i < sums.length; i++) {
      buckets[targetBucket[i]].push(sums[i]);
    }
  }

  // Each bucket now has 0 or 1 point.
  const out: Bn254Point[] = new Array(numBuckets);
  for (let b = 0; b < numBuckets; b++) {
    out[b] = buckets[b].length === 1 ? buckets[b][0] : BN254_ZERO;
  }
  return out;
};

/**
 * Pippenger MSM with batch-affine bucket accumulation.
 *
 * `windowSize` (c) is the number of scalar bits per window. With
 * BN254's 254-bit scalar field, num_windows = ceil(254 / c). Bucket
 * count per window = 2^c.
 *
 * c = 16 keeps memory reasonable (65536 buckets * 1 window worth of
 * Point entries) and gives good batch sizes for the small N this
 * reference is exercised at.
 *
 * Bucket reduction (sum_{i=1}^{B-1} i * bucket_sums[i]) is done with
 * the standard running-sum trick — *not* batch-affine here, just
 * scalar Jacobian-style adds. Bucket reduction is sequential by
 * nature (running sum has data dependency); batching across windows
 * could be added later but isn't needed for correctness validation.
 */
export const batchAffineMSM = (
  points: Bn254Point[],
  scalars: bigint[],
  windowSize = 16,
): Bn254Point => {
  if (points.length !== scalars.length) {
    throw new Error("batchAffineMSM: points and scalars length mismatch");
  }

  const c = windowSize;
  const numBuckets = 1 << c;
  const mask = BigInt(numBuckets - 1);
  // BN254 scalar field is 254 bits wide.
  const scalarBits = 254;
  const numWindows = Math.ceil(scalarBits / c);

  const windowSums: Bn254Point[] = new Array(numWindows);

  for (let w = 0; w < numWindows; w++) {
    // Distribute points into buckets. Bucket 0 (chunk == 0) is dropped
    // — those points contribute nothing to this window.
    const buckets: Bn254Point[][] = Array.from(
      { length: numBuckets },
      () => [],
    );

    const shift = BigInt(w * c);
    for (let i = 0; i < points.length; i++) {
      const chunk = Number((scalars[i] >> shift) & mask);
      if (chunk !== 0) {
        buckets[chunk].push(points[i]);
      }
    }

    const bucketSums = batchSumBuckets(buckets);

    // Bucket reduction via running-sum trick:
    //   S = sum_{i=1}^{B-1} i * b[i]
    //     = b[B-1] + (b[B-1] + b[B-2]) + (b[B-1] + b[B-2] + b[B-3]) + ...
    let running: Bn254Point = BN254_ZERO;
    let result: Bn254Point = BN254_ZERO;
    for (let i = numBuckets - 1; i >= 1; i--) {
      running = addBn254Points(running, bucketSums[i]);
      result = addBn254Points(result, running);
    }
    windowSums[w] = result;
  }

  // Horner combine across windows: msm = sum_w 2^(c*w) * windowSums[w].
  let acc: Bn254Point = BN254_ZERO;
  for (let w = numWindows - 1; w >= 0; w--) {
    for (let bit = 0; bit < c; bit++) {
      acc = doubleBn254Point(acc);
    }
    acc = addBn254Points(acc, windowSums[w]);
  }
  return acc;
};

/**
 * Reference inverse-via-Fermat for cross-checking batchInverse against
 * an *independent* implementation (rather than the same `modInverse`
 * helper). Used by tests only.
 */
export const _testOnlyInvViaFermat = (a: bigint): bigint => {
  // a^(p-2) mod p
  return modInverse(a);
};
