// Halving bucket reduction (Mitschabaude, ZPrize 2022) — schedule generator,
// host reference, and the in-place arena layout shared with the WGSL kernels.
//
// The weighted bucket sum S(V over B slots) = Σ_d (d+1)·V_d splits as
//
//     S(V) = S(bottom + top, pointwise, over B/2) + (B/2) · PS(top)
//
// — one half-size weighted sum of the same form plus a PLAIN sum scaled by a
// known constant. Both recurse: the weighted array keeps halving, spawning
// one carry (its top half, in place, zero cost) per depth; every carry also
// halves pointwise each depth. At depth d the live state is (1+d) arrays of
// equal length B/2^d, and the depth's entire work is (1+d)·B/2^(d+1)
// INDEPENDENT pair additions — batch-affine over any grouping (8 per thread
// while wide), Jacobian pairs once thin, with the carry constants (all
// powers of two) applied by doublings at the end:
//
//     S = W_final + Σ_{j≥1} (B / 2^j) · PS(carry_j)        (carry_j born at depth j−1)
//
// In-place arena (per window, B slots, never moves data):
//   W's live prefix:      [0, B/2^d)
//   carry_j's live prefix: [B>>j, (B>>j) + B/2^d)   for j = 1..d
// A halving step is dst[i] += src[i] with src = dst + live/2 within each
// array — the src half is left intact, and for W that surviving top half IS
// the newly-born carry, already at its home address.

import {
  addBn254Jacobian,
  doubleBn254Jacobian,
  BN254_JACOBIAN_ZERO,
  type Bn254Jacobian,
} from './cuzk/bn254.js';

export type RefPoint = Bn254Jacobian | null;

const J0 = BN254_JACOBIAN_ZERO;
const jadd = addBn254Jacobian;

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export type HalveMode = 'ba8' | 'ba4' | 'jac';

export interface HalvingDepth {
  /** Depth index d (0-based). */
  d: number;
  /** Live length of every array at entry: L = B/2^d. */
  L: number;
  /** Live arrays at entry: 1 + d (W plus d carries). */
  arrays: number;
  /** Independent pairs per window this depth: arrays · L/2. */
  pairsPerWindow: number;
  /** Kernel mode for this depth. */
  mode: HalveMode;
}

export interface HalvingSchedule {
  depths: HalvingDepth[];
  /** Depth at which the per-window cooperative finisher takes over. */
  finisherDepth: number;
  /** Live values per window at finisher entry: (1+finisherDepth)·L_f. */
  finisherValues: number;
  /** Whether wide-depth outputs reaching the finisher are Jacobian (a jac
   *  depth ran) or still affine. */
  finisherInputsJac: boolean;
}

const isPow2 = (x: number): boolean => x > 0 && (x & (x - 1)) === 0;

/**
 * Build the per-depth dispatch schedule for one window stride.
 *
 * Mode rule (per directive): batch-affine with C = 8 while total pairs/8 ≥
 * satWidth threads; C = 4 while pairs/4 ≥ satWidth; Jacobian pairs (C = 1)
 * below that. Modes are monotone (pairs shrink every depth), so the state
 * representation switches affine → Jacobian at most once. The finisher
 * absorbs every depth once the per-window live count fits its shared-memory
 * budget (finisherCap values).
 */
export function buildHalvingSchedule(
  stride: number,
  numWindows: number,
  opts: { satWidth?: number; finisherCap?: number; ba4Floor?: number } = {},
): HalvingSchedule {
  if (!isPow2(stride)) throw new Error(`buildHalvingSchedule: stride ${stride} must be a power of two`);
  const sat = opts.satWidth ?? 2560;
  const cap = opts.finisherCap ?? 256;
  // Batch-4 keeps running down to this width before the wide phase falls
  // back to Jacobian pairs (default: the saturation width itself).
  const ba4Floor = opts.ba4Floor ?? sat;
  const depths: HalvingDepth[] = [];
  let jacSeen = false;
  let d = 0;
  let L = stride;
  while (L >= 2 && (1 + d) * L > cap) {
    const pairsPerWindow = ((1 + d) * L) / 2;
    const total = pairsPerWindow * numWindows;
    let mode: HalveMode;
    if (!jacSeen && total / 8 >= sat) mode = 'ba8';
    else if (!jacSeen && total / 4 >= ba4Floor) mode = 'ba4';
    else mode = 'jac';
    jacSeen = jacSeen || mode === 'jac';
    depths.push({ d, L, arrays: 1 + d, pairsPerWindow, mode });
    d += 1;
    L >>= 1;
  }
  return {
    depths,
    finisherDepth: d,
    finisherValues: (1 + d) * L,
    finisherInputsJac: jacSeen,
  };
}

/** Arena offset of array a (0 = W, j ≥ 1 = carry_j) for a window of stride B. */
export const arenaOffset = (B: number, a: number): number => (a === 0 ? 0 : B >> a);

/** Carry constant: carry_j carries scale B / 2^j. */
export const carryScale = (B: number, j: number): number => B >> j;

// ---------------------------------------------------------------------------
// Host reference (exact bigint Jacobian arithmetic; null = empty bucket).
//
// referenceHalvingReduce: clean recursive statement (lists of arrays).
// simulateHalvingArena:  walks the EXACT in-place arena offsets and depth
//                        schedule the kernels use — pins the index math.
// ---------------------------------------------------------------------------

const asJac = (p: RefPoint): Bn254Jacobian => p ?? J0;

const mulPow2 = (p: Bn254Jacobian, scale: number): Bn254Jacobian => {
  if (!isPow2(scale)) throw new Error(`mulPow2: scale ${scale} not a power of two`);
  let acc = p;
  for (let s = scale; s > 1; s >>= 1) acc = doubleBn254Jacobian(acc);
  return acc;
};

const pairAdd = (a: RefPoint, b: RefPoint): RefPoint => {
  if (a === null) return b;
  if (b === null) return a;
  const s = jadd(a, b);
  return s.z === 0n ? null : s;
};

/** Plain sum of an array of optional points. */
const plainSum = (xs: RefPoint[]): Bn254Jacobian => {
  let acc: Bn254Jacobian = J0;
  for (const x of xs) if (x !== null) acc = jadd(acc, x);
  return acc;
};

/** Clean recursive reference: S = Σ (d+1)·V_d via halving + scaled carries. */
export function referenceHalvingReduce(buckets: RefPoint[]): Bn254Jacobian {
  const B = buckets.length;
  if (B === 0) return J0;
  if (!isPow2(B)) throw new Error(`referenceHalvingReduce: B ${B} must be a power of two`);
  let W = buckets.slice();
  const carries: { values: RefPoint[]; scale: number }[] = [];
  while (W.length > 1) {
    const half = W.length / 2;
    const top = W.slice(half);
    const merged: RefPoint[] = new Array(half);
    for (let i = 0; i < half; i++) merged[i] = pairAdd(W[i], W[half + i]);
    for (const c of carries) {
      const ch = c.values.length / 2;
      const next: RefPoint[] = new Array(ch);
      for (let i = 0; i < ch; i++) next[i] = pairAdd(c.values[i], c.values[ch + i]);
      c.values = next;
    }
    carries.push({ values: top, scale: half }); // born AFTER this depth's carry halvings
    W = merged;
  }
  let S: Bn254Jacobian = asJac(W[0]);
  for (const c of carries) {
    const ps = plainSum(c.values);
    if (ps.z !== 0n) S = jadd(S, mulPow2(ps, c.scale));
  }
  return S;
}

/**
 * Arena simulation: identical math, but driven by the schedule and the
 * in-place offsets the kernels use. `slots` is one window's arena (length B);
 * halving steps mutate dst slots only; carries are never copied. Returns the
 * window sum, and (for kernel debugging) the final arena state.
 */
export function simulateHalvingArena(
  buckets: RefPoint[],
  schedule: HalvingSchedule,
): { sum: Bn254Jacobian; slots: RefPoint[] } {
  const B = buckets.length;
  const slots = buckets.slice();
  const halveArray = (offset: number, live: number): void => {
    const half = live / 2;
    for (let i = 0; i < half; i++) {
      slots[offset + i] = pairAdd(slots[offset + i], slots[offset + half + i]);
    }
  };
  for (const dep of schedule.depths) {
    // All live arrays halve; W's surviving top half [L/2, L) IS carry_{d+1},
    // already resident at arenaOffset(B, d+1) = B >> (d+1) = dep.L / 2.
    for (let a = 0; a < dep.arrays; a++) {
      halveArray(arenaOffset(B, a), dep.L);
    }
  }
  // Finisher: continue the identical recursion to single points, then Horner.
  let d = schedule.finisherDepth;
  let L = B >> d;
  while (L > 1) {
    for (let a = 0; a < 1 + d; a++) halveArray(arenaOffset(B, a), L);
    d += 1;
    L >>= 1;
  }
  // Every array is length 1: W_final at slot 0, carry_j's total at B >> j
  // with scale B >> j = 2^(r−j), r = log2(B). Horner from the OLDEST carry
  // (largest scale): acc = 2·acc + C_j for j = 1..r gives Σ 2^(r−j)·C_j.
  let S: Bn254Jacobian = asJac(slots[0]);
  let acc: Bn254Jacobian = J0;
  for (let j = 1; j <= d; j++) {
    acc = doubleBn254Jacobian(acc);
    const c = slots[arenaOffset(B, j)];
    if (c !== null) acc = jadd(acc, c);
  }
  if (acc.z !== 0n) S = jadd(S, acc);
  return { sum: S, slots };
}

/** Oracle: S = Σ_j (j+1)·V_j computed directly (double-and-add per slot). */
export function directWeightedSum(buckets: RefPoint[]): Bn254Jacobian {
  let acc: Bn254Jacobian = J0;
  for (let j = 0; j < buckets.length; j++) {
    const v = buckets[j];
    if (v === null) continue;
    let term: Bn254Jacobian = J0;
    let addend = v;
    let k = j + 1;
    while (k > 0) {
      if (k & 1) term = jadd(term, addend);
      addend = doubleBn254Jacobian(addend);
      k >>= 1;
    }
    acc = jadd(acc, term);
  }
  return acc;
}
