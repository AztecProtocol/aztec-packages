// Host-side slice partitioning for the tree-reduce SMVP rewrite.
//
// Identity from msm-tree-reduce.md (Stage B plan):
//
//   running_adds(entry_index i) = i - bucket_idx(i)
//
// where `bucket_idx(i)` is the index of the bucket containing schedule
// entry `i`. Derivation: each preceding bucket of population p
// contributes p-1 adds; within bucket B at offset off contributes off
// more. Total = i - B.
//
// Precondition (design decision; see test for the regression that
// surfaced it): the identity assumes the `bucketStart` array is
// *compacted* — `bucketStart[k+1] > bucketStart[k]` for every k in
// `[0, numCompactBuckets)`. Empty buckets in the original CSR layout
// must be dropped before partitioning, with a side `activeBucketIds[k]`
// array carrying the original bucket index for each compact slot. With
// empties present the analytical derivation under-counts: an empty
// bucket between two non-empty ones contributes 0 adds and 0 entries,
// so `bucket_idx` jumps by 2 across the empty while `i` only advances
// by the entry count of the next bucket — putting `running_adds` off
// by one per skipped empty.
//
// Compacting is one O(num_buckets) host pass; we keep the partition
// math clean rather than thread a special-case through every binary
// search and the WGSL kernels downstream.
//
// Given target adds T = wg_id * total_adds / num_WGs, find the entry
// `i*` where `running_adds(i*) = T` via single binary search on
// `bucketStart[]` (monotone in B). O(log numCompactBuckets) per
// boundary, host-side.
//
// This module is GPU-free and unit-tested standalone — see
// `smvp_tree_partition.test.ts`.

export type BucketStart = Uint32Array | readonly number[];

/**
 * Compact a CSR-style bucketStart array that may contain empty buckets
 * (consecutive equal entries) into a strict-monotone array suitable for
 * the tree-reduce partition functions.
 *
 * Input `bucketStart` has length `numBuckets + 1`. Output `compactStart`
 * has length `numActive + 1`, where `numActive` is the count of buckets
 * with population > 0. `activeBucketIds[k]` gives the original bucket
 * index for the k-th active bucket — kernels writing partials need this
 * to tag each output with its real bucket id.
 */
export function compactBucketStart(
  bucketStart: BucketStart,
): { compactStart: Uint32Array; activeBucketIds: Uint32Array } {
  const numBuckets = bucketStart.length - 1;
  let numActive = 0;
  for (let b = 0; b < numBuckets; b++) {
    if (bucketStart[b + 1] - bucketStart[b] > 0) numActive++;
  }
  const compactStart = new Uint32Array(numActive + 1);
  const activeBucketIds = new Uint32Array(numActive);
  let k = 0;
  for (let b = 0; b < numBuckets; b++) {
    if (bucketStart[b + 1] - bucketStart[b] > 0) {
      compactStart[k] = bucketStart[b];
      activeBucketIds[k] = b;
      k++;
    }
  }
  compactStart[numActive] = bucketStart[numBuckets];
  return { compactStart, activeBucketIds };
}

/**
 * Assert the precondition for the analytical identity: every consecutive
 * pair must differ. Cheap O(num_buckets) check; call once at the top of
 * the host orchestrator before partitioning.
 */
export function assertCompact(bucketStart: BucketStart): void {
  for (let k = 0; k < bucketStart.length - 1; k++) {
    if (bucketStart[k + 1] <= bucketStart[k]) {
      throw new Error(
        `bucketStart not compacted: bucketStart[${k}]=${bucketStart[k]} >= bucketStart[${k + 1}]=${bucketStart[k + 1]}. Call compactBucketStart() first.`,
      );
    }
  }
}

/**
 * Total adds across the entire schedule:
 *   `bucketStart[numActive] - numActive`
 *   (each non-empty bucket of size p contributes p-1 adds).
 *
 * Accepts both compacted and uncompacted CSR `bucketStart`; on
 * uncompacted input the count of non-empty buckets is derived in one
 * O(num_buckets) pass.
 */
export function computeTotalAdds(bucketStart: BucketStart): number {
  const numBuckets = bucketStart.length - 1;
  let activeBuckets = 0;
  for (let b = 0; b < numBuckets; b++) {
    if (bucketStart[b + 1] - bucketStart[b] > 0) activeBuckets++;
  }
  const totalEntries = bucketStart[numBuckets];
  return totalEntries - activeBuckets;
}

/**
 * `runningAdds(i)` for the schedule that `bucketStart` describes.
 * Equals `i - bucketIdx(i)` where `bucketIdx(i)` is the largest B with
 * `bucketStart[B] <= i`. For i past the last entry, behaviour is
 * undefined (caller's responsibility to keep i in `[0, totalEntries)`).
 *
 * O(log num_buckets).
 */
export function runningAdds(bucketStart: BucketStart, i: number): number {
  return i - bucketIdx(bucketStart, i);
}

/**
 * `bucketIdx(i)` — the bucket containing entry `i`. Largest B such that
 * `bucketStart[B] <= i`. Returns 0 when `i < bucketStart[1]`.
 *
 * O(log num_buckets).
 */
export function bucketIdx(bucketStart: BucketStart, i: number): number {
  // Binary search on [0, numBuckets) for largest B with
  // bucketStart[B] <= i. Standard upper-bound minus one.
  let lo = 0;
  let hi = bucketStart.length - 1; // numBuckets
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (bucketStart[mid] <= i) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/**
 * Find entry index `i*` where `runningAdds(i*) === targetAdds`, OR the
 * smallest `i*` where `runningAdds(i*) >= targetAdds` when the target
 * falls strictly inside an add-edge (i.e. the boundary lands at the
 * second entry of a bucket — that is the first entry contributing to
 * `targetAdds`).
 *
 * Solves `i* = targetAdds + bucketIdx(i*)` by binary search on
 * `bucketStart[B] - B` (monotone non-decreasing in B, since
 * `bucketStart[B+1] - bucketStart[B] >= 0` ⇒ delta non-decreasing).
 *
 * Pre: `0 <= targetAdds <= computeTotalAdds(bucketStart)`.
 *
 * O(log num_buckets).
 */
export function findAddsBoundary(bucketStart: BucketStart, targetAdds: number): number {
  const totalAdds = computeTotalAdds(bucketStart);
  if (targetAdds <= 0) return 0;
  if (targetAdds >= totalAdds) return bucketStart[bucketStart.length - 1];

  // Largest B such that bucketStart[B] - B <= targetAdds. That bucket
  // owns the target offset; the entry index is then targetAdds + B
  // (since within bucket B at offset off the running_adds is off).
  let lo = 0;
  let hi = bucketStart.length - 1; // numBuckets — bucketStart[numBuckets] is total entries
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (bucketStart[mid] - mid <= targetAdds) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return targetAdds + lo;
}

export interface SliceLayout {
  readonly numWgs: number;
  // Length numWgs + 1. `sliceStart[k]` is the entry index of the first
  // entry processed by WG `k`. `sliceStart[numWgs]` is the entry count.
  readonly sliceStart: Uint32Array;
  // Length numWgs. Count of output slots WG `k` writes — equal to the
  // number of distinct buckets touched by its slice (one partial sum
  // per bucket, since pairs within the slice collapse).
  readonly outputCount: Uint32Array;
  // Length numWgs + 1. Prefix sum of `outputCount`; WG `k` writes its
  // output starting at `outputOffset[k]`.
  readonly outputOffset: Uint32Array;
  readonly totalAdds: number;
}

/**
 * Build the per-WG slice layout for a given numWgs.
 *
 * Slice boundaries are placed at evenly-spaced `targetAdds` values
 * `floor(k * totalAdds / numWgs)` for k = 0..numWgs. The first and
 * last boundaries are forced to 0 and totalEntries so the slices cover
 * the schedule exactly.
 *
 * Per-WG output count is derived from the bucket span the slice
 * touches: `bucketIdx(sliceStart[k+1] - 1) - bucketIdx(sliceStart[k]) + 1`.
 * (Empty slices — only possible when numWgs > totalAdds — get 0.)
 *
 * Cost: O(numWgs * log(num_buckets)).
 */
export function buildSliceLayout(
  bucketStart: BucketStart,
  numWgs: number,
): SliceLayout {
  if (numWgs <= 0 || !Number.isInteger(numWgs)) {
    throw new Error(`numWgs must be a positive integer; got ${numWgs}`);
  }
  const totalAdds = computeTotalAdds(bucketStart);
  const numBuckets = bucketStart.length - 1;
  const totalEntries = bucketStart[numBuckets];

  const sliceStart = new Uint32Array(numWgs + 1);
  sliceStart[0] = 0;
  sliceStart[numWgs] = totalEntries;
  for (let k = 1; k < numWgs; k++) {
    const targetAdds = Math.floor((k * totalAdds) / numWgs);
    let boundary = findAddsBoundary(bucketStart, targetAdds);
    // Slices must be strictly non-overlapping. If the analytical
    // boundary lands at or before the prior slice's start, nudge it
    // forward by one entry — that gives this WG a single-entry slice
    // rather than a degenerate empty slice that the kernel would
    // still need to handle. Only matters in extreme tail cases where
    // totalAdds < numWgs (pathologically small schedules).
    if (boundary <= sliceStart[k - 1]) boundary = sliceStart[k - 1] + 1;
    if (boundary > totalEntries) boundary = totalEntries;
    sliceStart[k] = boundary;
  }
  // Re-clamp in monotone-increasing order for the degenerate case.
  for (let k = 1; k <= numWgs; k++) {
    if (sliceStart[k] < sliceStart[k - 1]) sliceStart[k] = sliceStart[k - 1];
  }

  const outputCount = new Uint32Array(numWgs);
  for (let k = 0; k < numWgs; k++) {
    const lo = sliceStart[k];
    const hi = sliceStart[k + 1];
    if (hi <= lo) {
      outputCount[k] = 0;
      continue;
    }
    const bLo = bucketIdx(bucketStart, lo);
    const bHi = bucketIdx(bucketStart, hi - 1);
    outputCount[k] = bHi - bLo + 1;
  }

  const outputOffset = new Uint32Array(numWgs + 1);
  outputOffset[0] = 0;
  for (let k = 0; k < numWgs; k++) {
    outputOffset[k + 1] = outputOffset[k] + outputCount[k];
  }

  return { numWgs, sliceStart, outputCount, outputOffset, totalAdds };
}
