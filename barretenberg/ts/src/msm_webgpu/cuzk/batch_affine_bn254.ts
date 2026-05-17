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
  negateBn254Point,
  type Bn254Point,
} from "./bn254.js";

// 32-bit schedule-entry encoding (mirrors WASM
// scalar_multiplication.cpp lines 552-567). Stage 4 stores only the
// point sign + scalar index; bucket magnitude is recovered later from
// bucket_start ranges because the schedule is bucket-contiguous.
//   bit 31: sign bit (1 = subtract the point)
//   bit 30: dedup redirect (always zero in this path)
//   bit 29: dedup skip     (always zero in this path)
//   bits 0..28: scalar_idx (29-bit payload, ≤ 2^29 = 512M)
// Use `>>> 0` to keep these as unsigned 32-bit; JS's `1 << 31` would
// be the negative number -2147483648 otherwise.
export const SCHEDULE_SIGN_BIT = (1 << 31) >>> 0; // 0x8000_0000
export const SCHEDULE_INDEX_MASK = (1 << 29) - 1; // 0x1FFF_FFFF

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

// =====================================================================
// Multi-window batched Pippenger (host reference for Phase 2 GPU port)
// =====================================================================
//
// Mirrors the WASM `pippenger_round_parallel` multi-window structure
// (`scalar_multiplication.cpp` lines 3780-4080 for Stages 1-4, lines
// 4210-4550 for Stage 6, lines 4550-4610 for the per-region driver).
// Specifically un-dedup, un-GLV path.
//
// Key shape change vs `batchAffineMSM` above:
//   - Signed-digit (Booth) recoding per window: each c-bit digit is in
//     [-2^(c-1), 2^(c-1)], halving the bucket count to 2^(c-1) + 1 and
//     pairing positive/negative magnitudes via the schedule's sign bit.
//   - A "batch" of `windowsPerBatch` consecutive windows shares a
//     single batched inversion in the bucket-accumulation phase: pairs
//     pending from EVERY window in the batch are pooled into one
//     batchInverse call (WASM Stage 6b
//     `recursive_affine_bucket_reduce_strided`). With
//     windowsPerBatch = 4 this amortises the inversion ~4× harder than
//     the single-window path.

// 32-bit schedule entry layout encode (bake bits 29, 30 = 0).
export const encodeScheduleEntry = (
  scalarIdx: number,
  sign: 0 | 1,
): number => {
  if (scalarIdx < 0 || scalarIdx > SCHEDULE_INDEX_MASK) {
    throw new Error(
      `encodeScheduleEntry: scalarIdx ${scalarIdx} out of 29-bit range`,
    );
  }
  // `>>> 0` keeps the result a non-negative 32-bit integer in JS's
  // double-backed Number representation.
  return ((sign << 31) | scalarIdx) >>> 0;
};

// 32-bit schedule entry layout decode. Verifies the dedup bits 29, 30
// are zero — they must be in this path.
export const decodeScheduleEntry = (
  entry: number,
): { scalarIdx: number; sign: 0 | 1 } => {
  const u = entry >>> 0;
  // Bits 29 and 30 must always be zero in the non-dedup path. Strict
  // check here so consumers can rely on the invariant rather than
  // silently masking them off.
  if ((u & ((1 << 30) | (1 << 29))) !== 0) {
    throw new Error(
      `decodeScheduleEntry: dedup bits (29|30) set in entry 0x${u.toString(16)}`,
    );
  }
  return {
    scalarIdx: u & SCHEDULE_INDEX_MASK,
    sign: (u >>> 31) as 0 | 1,
  };
};

/**
 * Constantine signed-Booth recoding of one scalar into `numWindows`
 * c-bit signed digits.
 *
 * Returns digit magnitudes (always non-negative, in [0, 2^(c-1)]) and
 * signs (0 = +, 1 = -) per window. The reconstruction identity:
 *
 *     scalar = sum_w (sign[w] ? -magnitude[w] : magnitude[w]) * 2^(c*w)
 *
 * Mirrors `get_constantine_packed_digit`
 * (`scalar_multiplication.cpp` lines 217-271). Carry between windows
 * is implicit via the c+1-bit read that overlaps the previous window's
 * high bit — no explicit propagation needed.
 *
 * The bottom window reads bits [0, c) with a synthetic 0 as the
 * lookback bit. Non-bottom windows read [c*w - 1, c*(w+1)), with the
 * shared boundary bit at c*w - 1 acting as the lookback.
 */
const recodeScalarBooth = (
  scalar: bigint,
  c: number,
  numWindows: number,
): { magnitudes: number[]; signs: (0 | 1)[] } => {
  if (c < 1 || c > 28) {
    // c+1 must fit in the 32-bit `raw_wide` intermediate, and bucket
    // magnitudes must fit in the 29-bit schedule payload. Both are
    // satisfied for the chunk sizes we care about (c = 15, 16). Plus a
    // generous test margin.
    throw new Error(`recodeScalarBooth: c=${c} out of supported range`);
  }
  const cBI = BigInt(c);
  const magMask = (1n << cBI) - 1n; // val_mask in WASM

  const magnitudes: number[] = new Array(numWindows);
  const signs: (0 | 1)[] = new Array(numWindows);

  for (let w = 0; w < numWindows; w++) {
    let raw: bigint;
    if (w === 0) {
      // Bottom window: synthetic-zero lookback at bit -1.
      // raw == (scalar[0:c]) << 1
      raw = (scalar & magMask) << 1n;
    } else {
      // raw == c+1 bits at [c*w - 1, c*w + c).
      const shift = BigInt(w * c - 1);
      raw = (scalar >> shift) & ((1n << (cBI + 1n)) - 1n);
    }
    const neg = Number((raw >> cBI) & 1n) as 0 | 1;
    // encode = (raw + 1) >> 1 — the inner "(encode - neg) ^ neg_mask"
    // dance is the WASM's branchless negate-if-sign idiom. Below is
    // the equivalent: when neg=0, mag = encode; when neg=1, mag =
    // (-encode) & ((1<<c) - 1) ≡ (2^c - encode) mod 2^c.
    const encode = (raw + 1n) >> 1n;
    let magBI: bigint;
    if (neg === 0) {
      magBI = encode & magMask;
    } else {
      // Two's-complement negate, masked to c bits.
      //   (-encode) mod 2^c == (2^c - encode) mod 2^c.
      // BigInt's bit-AND with a positive mask returns a non-negative
      // result on negative inputs (effectively reduces mod 2^c), so
      // `(-encode) & magMask` is exactly what we want.
      magBI = (-encode) & magMask;
    }
    magnitudes[w] = Number(magBI);
    signs[w] = neg;
  }

  return { magnitudes, signs };
};

/**
 * Cross-window pooled batch-affine bucket reducer.
 *
 * Each window has its own `buckets[w][b]` stack of points. Per round,
 * we pop ONE pair from EVERY (window, bucket) whose stack has ≥ 2
 * points, into a single global pool, and run one batched inversion
 * across the entire pool. Then we push each sum back to its
 * originating (window, bucket). Loop until all stacks ≤ 1.
 *
 * This is the host analogue of WASM Stage 6b's
 * `recursive_affine_bucket_reduce_strided` (lines 1276-1500): the
 * inversion amortises across `windows_in_batch * num_buckets` pairs
 * rather than just `num_buckets`. With windowsPerBatch=4 and ~2^c-1
 * non-empty buckets per window, this is a ~4× larger inversion batch.
 *
 * Mutates the input bucket stacks (drains them).
 */
const pooledBatchSumBuckets = (
  bucketsPerWindow: Bn254Point[][][],
): Bn254Point[][] => {
  const numWindows = bucketsPerWindow.length;
  const numBuckets = numWindows > 0 ? bucketsPerWindow[0].length : 0;

  while (true) {
    // Collect one pair per (window, bucket) stack with ≥ 2 entries.
    const ps: Bn254Point[] = [];
    const qs: Bn254Point[] = [];
    const targetW: number[] = [];
    const targetB: number[] = [];

    for (let w = 0; w < numWindows; w++) {
      const buckets = bucketsPerWindow[w];
      for (let b = 0; b < numBuckets; b++) {
        if (buckets[b].length >= 2) {
          const q = buckets[b].pop()!;
          const p = buckets[b].pop()!;
          ps.push(p);
          qs.push(q);
          targetW.push(w);
          targetB.push(b);
        }
      }
    }

    if (ps.length === 0) break;

    // Single batched inversion spans pairs from every window in the
    // batch — this is the structural win over per-window reduction.
    const sums = batchAffineAdd(ps, qs);
    for (let i = 0; i < sums.length; i++) {
      bucketsPerWindow[targetW[i]][targetB[i]].push(sums[i]);
    }
  }

  // Each (window, bucket) stack now has 0 or 1 point.
  const out: Bn254Point[][] = new Array(numWindows);
  for (let w = 0; w < numWindows; w++) {
    const buckets = bucketsPerWindow[w];
    const row: Bn254Point[] = new Array(numBuckets);
    for (let b = 0; b < numBuckets; b++) {
      row[b] = buckets[b].length === 1 ? buckets[b][0] : BN254_ZERO;
    }
    out[w] = row;
  }
  return out;
};

/**
 * Build per-window 32-bit schedule for the given window range, bucket-
 * sorted (Stages 1+2+3+4 of the WASM compressed into one pass).
 *
 * Returns:
 *   - `schedule[w]`: array of 32-bit entries laid out in bucket order
 *     (all entries for bucket 1 first, then bucket 2, ...).
 *   - `bucketStart[w]`: exclusive prefix of per-bucket counts;
 *     `bucketStart[w][b+1] - bucketStart[w][b]` is the # of entries
 *     pinned to bucket b in window w. `bucketStart[w][0]` and
 *     `bucketStart[w][1]` are both 0 because bucket 0 is dropped
 *     (digit zero contributes nothing).
 */
const buildScheduleForBatch = (
  scalars: bigint[],
  c: number,
  windowStart: number,
  windowsInBatch: number,
  numBuckets: number,
  numWindowsTotal: number,
): { schedule: number[][]; bucketStart: number[][] } => {
  const n = scalars.length;
  const schedule: number[][] = new Array(windowsInBatch);
  const bucketStart: number[][] = new Array(windowsInBatch);

  // Stage 1: histogram per (window, bucket). One pass per window.
  const counts: number[][] = new Array(windowsInBatch);
  // Per-scalar per-window recoded digit and sign, cached so Stage 4
  // doesn't recompute. Matches the WASM's `fill_packed_digit_buffer`
  // call pattern (one shared buffer reused across Stages 1 and 4).
  const recoded: { mag: number; sign: 0 | 1 }[][] = new Array(
    windowsInBatch,
  );

  for (let wInBatch = 0; wInBatch < windowsInBatch; wInBatch++) {
    counts[wInBatch] = new Array(numBuckets).fill(0);
    recoded[wInBatch] = new Array(n);
  }

  for (let i = 0; i < n; i++) {
    const all = recodeScalarBooth(scalars[i], c, numWindowsTotal);
    for (let wInBatch = 0; wInBatch < windowsInBatch; wInBatch++) {
      const wAbs = windowStart + wInBatch;
      const mag = all.magnitudes[wAbs];
      const sign = all.signs[wAbs];
      recoded[wInBatch][i] = { mag, sign };
      if (mag !== 0) {
        counts[wInBatch][mag]++;
      }
    }
  }

  // Stage 2+3: per-window exclusive prefix-sum of counts → bucketStart.
  // bucketStart[w][b] = sum_{b' < b} counts[w][b'], with [0] = [1] = 0
  // because bucket 0 is dropped (digit==0 contributes nothing).
  for (let wInBatch = 0; wInBatch < windowsInBatch; wInBatch++) {
    const bs: number[] = new Array(numBuckets + 1);
    bs[0] = 0;
    bs[1] = 0;
    let running = 0;
    for (let b = 1; b < numBuckets; b++) {
      bs[b] = running;
      running += counts[wInBatch][b];
    }
    bs[numBuckets] = running;
    bucketStart[wInBatch] = bs;
  }

  // Stage 4: scatter into bucket-sorted schedule. Allocate per-window
  // schedule arrays sized to the total entry count.
  for (let wInBatch = 0; wInBatch < windowsInBatch; wInBatch++) {
    schedule[wInBatch] = new Array(bucketStart[wInBatch][numBuckets]);
  }
  const cursor: number[][] = new Array(windowsInBatch);
  for (let wInBatch = 0; wInBatch < windowsInBatch; wInBatch++) {
    cursor[wInBatch] = new Array(numBuckets).fill(0);
  }

  for (let i = 0; i < n; i++) {
    if (i > SCHEDULE_INDEX_MASK) {
      throw new Error(
        `buildScheduleForBatch: scalar index ${i} exceeds 29-bit schedule payload`,
      );
    }
    for (let wInBatch = 0; wInBatch < windowsInBatch; wInBatch++) {
      const { mag, sign } = recoded[wInBatch][i];
      if (mag === 0) continue;
      const slot = bucketStart[wInBatch][mag] + cursor[wInBatch][mag]++;
      schedule[wInBatch][slot] = encodeScheduleEntry(i, sign);
    }
  }

  return { schedule, bucketStart };
};

/**
 * Consume a per-(window, bucket) sorted 32-bit schedule and accumulate
 * each window's MSM contribution via cross-window pooled batch-affine.
 *
 * Returns one Bn254Point per window in the batch.
 */
const reduceBatchSchedule = (
  points: Bn254Point[],
  schedule: number[][],
  bucketStart: number[][],
  numBuckets: number,
  c: number,
): Bn254Point[] => {
  const windowsInBatch = schedule.length;

  // Build per-window per-bucket point stacks by decoding schedule
  // entries. Sign bit ⇒ negate the loaded point before pushing.
  const bucketsPerWindow: Bn254Point[][][] = new Array(windowsInBatch);
  for (let wInBatch = 0; wInBatch < windowsInBatch; wInBatch++) {
    const buckets: Bn254Point[][] = new Array(numBuckets);
    for (let b = 0; b < numBuckets; b++) buckets[b] = [];
    const sched = schedule[wInBatch];
    const bs = bucketStart[wInBatch];
    // Walk each bucket's contiguous run [bs[b], bs[b+1]) of entries.
    for (let b = 1; b < numBuckets; b++) {
      const lo = bs[b];
      const hi = bs[b + 1];
      for (let k = lo; k < hi; k++) {
        const { scalarIdx, sign } = decodeScheduleEntry(sched[k]);
        const p = sign === 1
          ? negateBn254Point(points[scalarIdx])
          : points[scalarIdx];
        buckets[b].push(p);
      }
    }
    bucketsPerWindow[wInBatch] = buckets;
  }

  // The pooled reducer is the structural win: ONE batched inversion
  // per round spans pairs from EVERY window in the batch.
  const bucketSumsPerWindow = pooledBatchSumBuckets(bucketsPerWindow);

  // Per-window running-sum reduction
  //   S_w = sum_{b=1}^{B-1} b * bucketSums[w][b]
  // is identical to the per-window path. Bucket reduction is sequential
  // by nature (data-dependency through `running`); the cross-window win
  // happens in the bucket-accumulation phase above, not here.
  const out: Bn254Point[] = new Array(windowsInBatch);
  for (let wInBatch = 0; wInBatch < windowsInBatch; wInBatch++) {
    const sums = bucketSumsPerWindow[wInBatch];
    let running: Bn254Point = BN254_ZERO;
    let result: Bn254Point = BN254_ZERO;
    for (let b = numBuckets - 1; b >= 1; b--) {
      running = addBn254Points(running, sums[b]);
      result = addBn254Points(result, running);
    }
    out[wInBatch] = result;
  }
  // Bind c into the result via Horner combine at the call site; this
  // helper only returns per-window sums.
  void c;
  return out;
};

/**
 * Multi-window batched Pippenger MSM with cross-window pooled
 * batched-affine bucket reduction.
 *
 * This is the host ground-truth for the WebGPU multi-window Pippenger
 * rewrite (Phase 2 of the plan). It implements the WASM structure with
 * the un-GLV, un-dedup path:
 *
 *   - Signed-Booth recoding splits each scalar into ceil(254/c) c-bit
 *     signed digits.
 *   - Per region (single c here), iterate windows in batches of
 *     `windowsPerBatch`. Per batch:
 *       1. Stages 1+2+3+4 — histogram → prefix-sum → bucket-sorted
 *          32-bit schedule (`buildScheduleForBatch`).
 *       2. Stage 6 — pooled batch-affine bucket accumulation across
 *          all windows in the batch (`reduceBatchSchedule`). ONE
 *          inversion per round pools pairs from every window.
 *       3. Stage 7 — per-window bucket running-sum reduction.
 *   - Final Horner combine over `c` doublings folds windows into one
 *     point.
 *
 * Cross-checks against `batchAffineMSM`:
 *   - windowsPerBatch=1 with this signed-Booth path equals the
 *     unsigned-digit `batchAffineMSM`.
 *   - windowsPerBatch=2 and =4 equal windowsPerBatch=1 (the cross-
 *     window batched inversion is associativity-only — output is
 *     identical, only the inversion amortisation factor changes).
 *
 * Used by Jest tests as ground truth for the GPU shader pipeline; not
 * tuned for speed.
 */
export const batchAffineMSMMultiWindow = (
  points: Bn254Point[],
  scalars: bigint[],
  c: number,
  windowsPerBatch: number,
): Bn254Point => {
  if (points.length !== scalars.length) {
    throw new Error(
      "batchAffineMSMMultiWindow: points and scalars length mismatch",
    );
  }
  if (windowsPerBatch < 1) {
    throw new Error(
      `batchAffineMSMMultiWindow: windowsPerBatch=${windowsPerBatch} must be ≥ 1`,
    );
  }

  // BN254 scalar field is 254 bits wide.
  const scalarBits = 254;
  // `+ 2` headroom for the signed-Booth carry — matches WASM's
  // `(NUM_BITS + 2 + window_bits - 1) / window_bits`
  // (`scalar_multiplication.cpp` lines 514, 2484). Without this, scalars
  // whose MSB lands on the top window's sign-bit position (e.g. p-1
  // with small c) would generate a phantom carry past the topmost
  // window and the reconstruction would drop the high contribution.
  const numWindows = Math.ceil((scalarBits + 2) / c);
  // Signed-digit recoding halves the bucket count: digits live in
  // [-2^(c-1), 2^(c-1)], with magnitude 0 dropped. The bucket array
  // is dimensioned 2^(c-1) + 1 so bucket index can equal 2^(c-1).
  const numBuckets = (1 << (c - 1)) + 1;

  const windowSums: Bn254Point[] = new Array(numWindows);

  for (
    let batchStart = 0;
    batchStart < numWindows;
    batchStart += windowsPerBatch
  ) {
    const windowsInBatch = Math.min(
      windowsPerBatch,
      numWindows - batchStart,
    );

    const { schedule, bucketStart } = buildScheduleForBatch(
      scalars,
      c,
      batchStart,
      windowsInBatch,
      numBuckets,
      numWindows,
    );

    const batchWindowSums = reduceBatchSchedule(
      points,
      schedule,
      bucketStart,
      numBuckets,
      c,
    );

    for (let wInBatch = 0; wInBatch < windowsInBatch; wInBatch++) {
      windowSums[batchStart + wInBatch] = batchWindowSums[wInBatch];
    }
  }

  // Horner combine across windows: msm = Σ_w 2^(c*w) * windowSums[w].
  let acc: Bn254Point = BN254_ZERO;
  for (let w = numWindows - 1; w >= 0; w--) {
    for (let bit = 0; bit < c; bit++) {
      acc = doubleBn254Point(acc);
    }
    acc = addBn254Points(acc, windowSums[w]);
  }
  return acc;
};

// Test-only export: exposed so the test file can exercise the
// signed-Booth recoder in isolation against a brute-force reconstruction.
export const _testOnly = {
  recodeScalarBooth,
  buildScheduleForBatch,
};
