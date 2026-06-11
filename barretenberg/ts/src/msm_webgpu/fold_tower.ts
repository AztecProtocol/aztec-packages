// Fold-tower bucket reduction — schedule generator + host reference.
//
// Replaces the 35-pass single-chunk-per-window reduction schedule with a
// short tower of strided "fold" levels (the WebGPU port of the CPU's Stage 6b
// bucket-space partition + chunk_contribution lift; see GROUPED_REDUCE_PLAN.md).
//
// Math. For one window with B buckets, slot j (0-based) holding the bucket of
// magnitude j+1, the window sum is S = Σ_j (j+1)·V_j = WS(V) + PS(V) with
// WS = Σ j·V_j, PS = Σ V_j. One fold level with G strided chunks (chunk q owns
// slots {iG+q}, rows i = 0..M_q-1) computes per chunk
//     R_q = Σ_i V[iG+q]          (plain sum)
//     Λ_q = Σ_i i·V[iG+q]        (row-weighted sum)
// and the identity  WS(V) = G·PS(Λ) + WS(R),  PS(V) = PS(R)  telescopes:
//     S = WS(R^r) + PS(R^r) + Σ_{ℓ=0}^{r-1} G_ℓ · PS(Λ^{ℓ+1})
// where R^{ℓ+1}, Λ^{ℓ+1} are level ℓ's outputs (length G_ℓ) and R^0 = V.
// Λ-arrays only ever need plain sums, so each level also folds every older
// Λ-descendant ("stream") at one add per slot; all G_ℓ scale factors are
// powers of two and are applied once per window in the tail.
//
// This module is host-side only: the schedule generator feeds both the WGSL
// kernels (per-level uniforms) and the reference implementation that the
// kernels are validated against (fold_tower.test.ts).

import {
  addBn254Jacobian,
  doubleBn254Jacobian,
  BN254_JACOBIAN_ZERO,
  type Bn254Jacobian,
} from './cuzk/bn254.js';

/** One fold level. Consumes an array of length `B`, produces arrays of length `G`. */
export interface FoldLevelSpec {
  /** Input length (B_ℓ). Level 0: the window stride. */
  B: number;
  /** Chunks per window at this level = output length (G_ℓ). */
  G: number;
  /** Rows per chunk = B/G (dense; the last chunks are shorter when ragged). */
  M: number;
  /** Λ-descendant stream arrays folded alongside (= level index ℓ). */
  streamsIn: number;
}

export interface FoldTower {
  levels: FoldLevelSpec[];
  /** Length of every array reaching the tail (= G of the last level, or the
   *  window stride when the tower has no levels). */
  tailLen: number;
  /** Scale factor per tail stream, oldest first: stream produced by level ℓ
   *  carries scale G_ℓ. Length = levels.length (the last level's Λ is also a
   *  tail stream, scale G_{r-1}). */
  scales: number[];
}

/** Tuning knobs for the default tower policy (per-device tables live in the
 *  caller; see GROUPED_REDUCE_PLAN.md §4). */
export interface FoldTowerOptions {
  /** Rows per chunk per level. Entries are clamped to the in-place floor
   *  (M_ℓ ≥ 2+ℓ) and the remaining B. Default [8, 8, 4]: the measured M4
   *  optimum — a shorter final-level chain halves that level's
   *  dependent-latency cost and the weighted sum stays at L=16. */
  mTower?: number[];
  /** Stop the tower once B ≤ tailMax (the tail walks this many values per
   *  array sequentially). Default 16. */
  tailMax?: number;
  /** Hard cap on fold levels (the WGSL kernel is specialised for streamsIn ≤
   *  maxLevels−1; default 3 = the nstreams ∈ {0,1,2} pipelines). The tail
   *  absorbs whatever remains. */
  maxLevels?: number;
  /** Width-adaptive default (used when mTower is absent and BOTH of these are
   *  set): each level takes the largest M ∈ {2,4,8} that keeps
   *  numWindows·(B_ℓ/M) ≥ satWidth dispatched threads — depth (fewer adds) is
   *  bought only while the device stays saturated, and a level that cannot
   *  saturate even at M=2 takes M=2 (maximum width, one real add per column —
   *  the Jacobian-pair shape). A feasibility floor still forces enough
   *  reduction that the tail reaches tailMax within maxLevels. Small N gives
   *  small strides and degenerates toward [2,…]; N = 2^17 stays [8,…]. */
  numWindows?: number;
  satWidth?: number;
}

const isPow2 = (x: number): boolean => x > 0 && (x & (x - 1)) === 0;

const DEFAULT_M_TOWER = [8, 8, 4];

/** Largest power-of-two M ≤ 8 keeping NW·(B/M) ≥ sat; 2 when even that
 *  starves. Raised to the feasibility floor: the levels after this one (at
 *  most M=16 each) plus the tail (≤ tailMax) must absorb B/M. */
const adaptiveM = (
  B: number,
  level: number,
  numWindows: number,
  satWidth: number,
  tailMax: number,
  maxLevels: number,
): number => {
  // Hysteresis: keep the deep M while the level retains at least HALF the
  // saturation width — measured (M4, c=13): L1 at NC=1280 prefers M=8 (the
  // tail cost of widening exceeds the occupancy gain). Only genuinely
  // starved levels go wide, down to M=2 (one real add per column).
  let m = 2;
  for (const cand of [8, 4]) {
    if ((numWindows * B) / cand >= satWidth / 2) {
      m = cand;
      break;
    }
  }
  const remaining = maxLevels - level - 1;
  const feasibility = B / (tailMax * 16 ** remaining);
  while (m < feasibility) m *= 2;
  return m;
};

/**
 * Build the fold tower for one window stride. Pure; deterministic.
 *
 * In-place output constraint: level ℓ writes (2 + streamsIn) arrays of length
 * G into the B slots it consumed, so M ≥ 2 + streamsIn is enforced (see plan
 * §5); with the default mTower this means M ≥ 2, 3, 4, … per level.
 */
export function buildFoldTower(stride: number, opts: FoldTowerOptions = {}): FoldTower {
  if (!Number.isInteger(stride) || stride < 1) throw new Error(`buildFoldTower: bad stride ${stride}`);
  const tailMax = opts.tailMax ?? 16;
  const maxLevels = opts.maxLevels ?? 3;
  const mTower = opts.mTower ?? [];
  const levels: FoldLevelSpec[] = [];
  const scales: number[] = [];
  let B = stride;
  const adaptive = opts.mTower === undefined && opts.numWindows !== undefined && opts.satWidth !== undefined;
  for (let l = 0; B > tailMax && l < maxLevels; l++) {
    const want = adaptive
      ? adaptiveM(B, l, opts.numWindows!, opts.satWidth!, tailMax, maxLevels)
      : (mTower[l] ?? mTower[mTower.length - 1] ?? DEFAULT_M_TOWER[Math.min(l, DEFAULT_M_TOWER.length - 1)]);
    const inPlaceFloor = 2 + l;
    let M = Math.max(want, inPlaceFloor);
    if (M >= B) M = B; // final level collapses the remainder
    if (isPow2(B)) {
      // keep G a power of two (exact division, power-of-two tail scales)
      while (!isPow2(M) || B % M !== 0) M++;
    }
    const G = Math.ceil(B / M);
    if (G >= B) throw new Error(`buildFoldTower: no progress at B=${B} (M=${M})`);
    levels.push({ B, G, M, streamsIn: l });
    scales.push(G);
    B = G;
  }
  return { levels, tailLen: B, scales };
}

/** Adds per level (cost model + scratch sizing): each input slot costs 2 adds
 *  (Λ-advance + R-absorb) plus 1 add per live stream. */
export function towerAddCounts(tower: FoldTower): { perLevel: number[]; total: number } {
  const perLevel = tower.levels.map(lv => (2 + lv.streamsIn) * lv.B);
  // Tail: ≤ 2·tailLen for WS+PS of R, + tailLen per stream, + log2 scale doublings.
  const tail =
    2 * tower.tailLen +
    tower.scales.length * tower.tailLen +
    tower.scales.reduce((a, s) => a + Math.ceil(Math.log2(Math.max(2, s))), 0);
  return { perLevel, total: perLevel.reduce((a, b) => a + b, 0) + tail };
}

// ---------------------------------------------------------------------------
// Host reference (exact bigint Jacobian arithmetic; null = empty bucket).
// ---------------------------------------------------------------------------

export type RefPoint = Bn254Jacobian | null;

const J0 = BN254_JACOBIAN_ZERO;
const jadd = addBn254Jacobian;

const asJac = (p: RefPoint): Bn254Jacobian => p ?? J0;

/** 2^e · p by repeated doubling (tail scales are powers of two). */
const mulPow2 = (p: Bn254Jacobian, scale: number): Bn254Jacobian => {
  if (!isPow2(scale)) throw new Error(`mulPow2: scale ${scale} not a power of two`);
  let acc = p;
  for (let s = scale; s > 1; s >>= 1) acc = doubleBn254Jacobian(acc);
  return acc;
};

/**
 * One fold level over one window: strided chunks, running-sum walk.
 * Mirrors the WGSL kernel slot-step order exactly (descending rows; Λ-advance
 * BEFORE R-absorb) so per-level outputs are comparable for kernel debugging.
 */
export function referenceFoldLevel(
  input: RefPoint[],
  streamsIn: RefPoint[][],
  G: number,
): { R: RefPoint[]; Lam: RefPoint[]; streamsOut: RefPoint[][] } {
  const B = input.length;
  const R: RefPoint[] = new Array(G).fill(null);
  const Lam: RefPoint[] = new Array(G).fill(null);
  const streamsOut: RefPoint[][] = streamsIn.map(() => new Array(G).fill(null) as RefPoint[]);
  for (let q = 0; q < G; q++) {
    const Mq = Math.max(0, Math.ceil((B - q) / G));
    let running: Bn254Jacobian = J0;
    let alg: Bn254Jacobian = J0;
    for (let i = Mq - 1; i >= 0; i--) {
      alg = jadd(alg, running); // weight advance: row i contributes i times
      const v = input[i * G + q];
      if (v !== null) running = jadd(running, v);
    }
    R[q] = running.z === 0n ? null : running;
    Lam[q] = alg.z === 0n ? null : alg;
    for (let s = 0; s < streamsIn.length; s++) {
      let acc: Bn254Jacobian = J0;
      for (let i = 0; i < Mq; i++) {
        const v = streamsIn[s][i * G + q];
        if (v !== null) acc = jadd(acc, v);
      }
      streamsOut[s][q] = acc.z === 0n ? null : acc;
    }
  }
  return { R, Lam, streamsOut };
}

/** Tail: S = WS(R) + PS(R) + Σ_s scale_s · PS(stream_s). */
export function referenceFoldTail(R: RefPoint[], streams: RefPoint[][], scales: number[]): Bn254Jacobian {
  // WS+PS over R via the same running trick with weights j+1:
  //   walk j descending: acc += running; running += R[j]  ⇒ Σ j·R + Σ R needs
  //   one extra running add at the end (weights j+1 = j plus one full PS).
  let running: Bn254Jacobian = J0;
  let acc: Bn254Jacobian = J0;
  for (let j = R.length - 1; j >= 0; j--) {
    acc = jadd(acc, running);
    if (R[j] !== null) running = jadd(running, asJac(R[j]));
  }
  acc = jadd(acc, running); // upgrade weights from j to j+1 (adds PS(R))
  for (let s = 0; s < streams.length; s++) {
    let ps: Bn254Jacobian = J0;
    for (const v of streams[s]) if (v !== null) ps = jadd(ps, asJac(v));
    if (ps.z !== 0n) acc = jadd(acc, mulPow2(ps, scales[s]));
  }
  return acc;
}

/** Full reference reduction of one window's bucket array via the tower. */
export function referenceFoldReduce(buckets: RefPoint[], tower: FoldTower): Bn254Jacobian {
  let R: RefPoint[] = buckets;
  let streams: RefPoint[][] = [];
  for (const lv of tower.levels) {
    if (R.length !== lv.B) throw new Error(`referenceFoldReduce: level expects B=${lv.B}, got ${R.length}`);
    if (streams.length !== lv.streamsIn) throw new Error(`referenceFoldReduce: streams ${streams.length} != ${lv.streamsIn}`);
    const out = referenceFoldLevel(R, streams, lv.G);
    streams = [...out.streamsOut, out.Lam];
    R = out.R;
  }
  return referenceFoldTail(R, streams, tower.scales);
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
