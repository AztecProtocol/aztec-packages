// Circuit sparsity model for the skipping sumcheck benchmark.
//
// A real Mega circuit is sparse: most rows activate only a few selectors, so bb's
// prover skips the bulk of relation evaluation via two mechanisms it gets for free
// (relations/utils.hpp `Relation::skip()` and sumcheck_round.hpp
// `compute_effective_round_size`). The dense-random benchmark instance defeats both,
// overstating the WASM cost ~8x vs a real circuit. This module describes a circuit
// *profile* — a per-relation activation density + a global used-row fraction + a row
// structure — and generates a synthetic sparse instance from it. The SAME profile
// drives the GPU buffers, the CPU reference, AND (via the SumcheckBench bbapi command)
// the WASM baseline, so "real WASM vs real WebGPU" is apples-to-apples.
//
// Honest-parity note: the profile is a shared *description* (which rows are active per
// relation), not bit-identical values — the GPU and WASM draw independent randomness.
// What must match is WHERE the zeros are, because `skip()` / effective-size depend only
// on the zero pattern, not the random values.
//
// Inactive-row construction: an inactive row zeroes ALL of that relation's columns (not
// just the skip selector). Every MegaFlavor relation has no constant term, so an
// all-zero edge contributes exactly zero — which makes skipping a *provable* no-op for
// every relation, including permutation/logderiv whose `skip()` predicate
// (z_perm==z_perm_shift / q_lookup&read_counts==0) is only algebraically zero-implying
// on a real execution trace, not on synthetic random data with merely the selector
// zeroed. This is what lets suite_rounds assert skip-on ≡ skip-off bit-for-bit.

import { ALL_RELATIONS } from './descriptors.js';
import { encodeColumnsToBytes } from './gpu_pipeline.js';
import { NUM_RELATIONS } from '../../src/msm_webgpu/accumulator.js';
import { makeRng, packParams } from './harness.js';

export type RowStructure = 'block' | 'scattered' | 'band';

/**
 * A circuit's sparsity description. `density[r]` ∈ [0,1] is relation r's activation
 * fraction over the used rows; `usedFraction` ∈ [0,1] is the used circuit size over the
 * dyadic size 2^d (the rest is the zero padding tail bb's effective-size trim skips).
 * `structure` controls WHERE the active rows sit: `block` (one contiguous band per
 * relation — how the execution trace lays out, cheap for GPU workgroup early-out) or
 * `scattered` (interleaved — worst case for the GPU, defeats per-pair skip).
 */
export interface CircuitProfile {
  name: string;
  /** True when the densities are hand-set rather than measured from a real circuit. */
  synthetic: boolean;
  usedFraction: number;
  structure: RowStructure;
  density: number[]; // indexed by relationIndex (0..NUM_RELATIONS-1)
}

/** The dense worst case: every relation active on every row. Reproduces the original
 *  fully-dense-random benchmark instance exactly (regression guard / VRAM sweep
 *  baseline). With this profile skipping is a strict no-op (nothing to trim or skip). */
export const DENSE_PROFILE: CircuitProfile = {
  name: 'dense',
  synthetic: false,
  usedFraction: 1,
  structure: 'block',
  density: new Array(NUM_RELATIONS).fill(1),
};

// Hand-set densities approximating a chonk Mega circuit (the first ECDSA circuit,
// ~88k used gates / 2^17 dyadic). SYNTHETIC — refine from an instrumented chonk run
// (dump, per relation, the fraction of rows where skip() is false + their contiguity).
// permutation is kept dense (its grand product is non-trivial on essentially every
// used row); the gate relations are narrow bands; Poseidon2 / elliptic are tiny.
const REALISTIC_DENSITY: number[] = [
  0.40, // 0  arith
  1.00, // 1  perm (grand product — dense)
  0.10, // 2  logderiv (lookups)
  0.15, // 3  delta range
  0.02, // 4  elliptic
  0.10, // 5  memory
  0.02, // 6  nnf
  0.01, // 7  ecc op queue
  0.05, // 8  databus
  0.03, // 9  poseidon2 external
  0.01, // 10 poseidon2 initial
  0.03, // 11 poseidon2 quad internal
  0.01, // 12 poseidon2 quad internal terminal
  0.03, // 13 poseidon2 transition entry
];

export const REALISTIC_BLOCK_PROFILE: CircuitProfile = {
  name: 'realistic-block',
  synthetic: true,
  usedFraction: 0.67, // ~88k / 131072
  structure: 'block',
  density: REALISTIC_DENSITY,
};

export const REALISTIC_SCATTERED_PROFILE: CircuitProfile = {
  name: 'realistic-scattered',
  synthetic: true,
  usedFraction: 0.67,
  structure: 'scattered',
  density: REALISTIC_DENSITY,
};

/**
 * The REALISTIC layout (confirmed from mega_execution_trace.hpp): each selector-gated
 * relation occupies ONE contiguous block at its own OFFSET — gates of a type are appended
 * to that type's block and `compute_offsets` concatenates the blocks at increasing offsets.
 * So a relation's active rows are a band `[offset_r, offset_r + density_r·L)`, NOT a prefix
 * at row 0 (block) and NOT strided (scattered). This is what a real Mega circuit looks like,
 * and the right GPU primitive is an offset-aware range dispatch (coalesced reads — bandByRel
 * + injectBand). permutation spans the whole used region (z_perm, density 1).
 */
export const REALISTIC_BAND_PROFILE: CircuitProfile = {
  name: 'realistic-band',
  synthetic: true,
  usedFraction: 0.67,
  structure: 'band',
  density: REALISTIC_DENSITY,
};

/** Profiles selectable from the benchmark UI, keyed by `name`. */
export const PROFILES: Record<string, CircuitProfile> = {
  [DENSE_PROFILE.name]: DENSE_PROFILE,
  [REALISTIC_BLOCK_PROFILE.name]: REALISTIC_BLOCK_PROFILE,
  [REALISTIC_BAND_PROFILE.name]: REALISTIC_BAND_PROFILE,
  [REALISTIC_SCATTERED_PROFILE.name]: REALISTIC_SCATTERED_PROFILE,
};

// The MegaTraceBlockData gate-block order (relationIndex), excluding permutation which
// spans the whole trace: ecc_op, busread(databus), lookup(logderiv), arithmetic,
// delta_range, elliptic, memory, nnf, poseidon2_external(+initial), poseidon2_quad(+term,
// +transition). The synthetic band layout concatenates these in this order so each gets a
// realistic non-zero offset.
const TRACE_BLOCK_ORDER: number[] = [7, 8, 2, 0, 3, 4, 5, 6, 9, 10, 11, 12, 13];

const bandLayoutCache = new Map<string, { offset: number; size: number }[]>();

/** Per-relation row band {offset, size} for the `band` profile: gate relations concatenated
 *  in trace order at cumulative offsets; permutation (and any density>=1) spans [0, L).
 *  Memoized per (profile.name, n) — called per row in buildInstance. */
function bandLayout(profile: CircuitProfile, n: number): { offset: number; size: number }[] {
  const key = `${profile.name}:${n}`;
  const cached = bandLayoutCache.get(key);
  if (cached) return cached;
  const L = usedRows(profile, n);
  const out: { offset: number; size: number }[] = new Array(NUM_RELATIONS);
  let offset = 0;
  for (const r of TRACE_BLOCK_ORDER) {
    const d = profile.density[r];
    const size = d >= 1 ? L : Math.max(0, Math.min(L - offset, Math.round(d * L)));
    out[r] = { offset: Math.min(offset, L), size };
    offset += size;
  }
  for (let r = 0; r < NUM_RELATIONS; r++) if (!out[r]) out[r] = { offset: 0, size: L }; // permutation + any density>=1
  bandLayoutCache.set(key, out);
  return out;
}

/** Whether `profile` actually triggers skipping (i.e. is not the dense identity). */
export function profileIsSparse(profile: CircuitProfile): boolean {
  return profile.usedFraction < 1 || profile.density.some(d => d < 1);
}

/** The used circuit size L = round(usedFraction · n), clamped to [2, n] and even (so
 *  the per-round halving stays well-defined). Beyond L every column is the zero tail. */
export function usedRows(profile: CircuitProfile, n: number): number {
  const raw = Math.round(profile.usedFraction * n);
  const clamped = Math.max(2, Math.min(n, raw));
  return clamped + (clamped & 1); // round up to even (still <= n since n is a power of 2 >= 2)
}

/**
 * Per-relation active-row count (indexed by relationIndex): an UPPER bound on the rows
 * where relation r is nonzero, used to size each relation's GPU dispatch to its OWN
 * active region instead of the global used prefix `usedRows`. For `block` structure the
 * active rows are the contiguous prefix [0, round(density_r · L)), so a relation at 1%
 * density launches a 1% grid instead of the union ~67%; the total dispatched work then
 * equals the WASM prover's active-edge count (Σ_r density_r · L) rather than
 * NUM_RELATIONS · L. Returns `undefined` for dense or `scattered` profiles: a scattered
 * active set is strided, not a prefix, so it can't be trimmed to a smaller dispatch (that
 * needs compaction) — callers fall back to the global `usedRows` + per-edge skip there.
 */
export function activeRowsByRel(profile: CircuitProfile, n: number): number[] | undefined {
  if (profile.structure !== 'block' || !profileIsSparse(profile)) return undefined;
  const L = usedRows(profile, n);
  const out = new Array<number>(NUM_RELATIONS).fill(L);
  for (const desc of ALL_RELATIONS) {
    const d = profile.density[desc.relationIndex];
    const rows = d >= 1 ? L : d <= 0 ? 2 : Math.round(d * L);
    out[desc.relationIndex] = Math.max(2, Math.min(L, rows + (rows & 1))); // clamp to [2, L], even
  }
  return out;
}

export interface BandPlan {
  roundsByRel: ({ start: number; count: number }[] | undefined)[]; // per relationIndex, per round: contiguous pair band
}

/**
 * Per-relation contiguous edge-pair band {start, count} per round for the `band` (realistic
 * trace) profile — the offset-aware analogue of `activeRowsByRel` (which assumes offset 0).
 * Each gate relation occupies rows [offset_r, offset_r + size_r) (bandLayout, concatenated in
 * trace order); the band folds the obvious way: rows [s,e) -> pairs [floor(s/2), ceil(e/2)),
 * and that pair range is the next round's row band. The GPU dispatches exactly that range with
 * `injectBand` (g = start + thread) — coalesced reads, no index buffer. `undefined` for
 * non-band profiles; per-relation `undefined` for density>=1 (permutation -> full dispatch).
 */
export function bandByRel(profile: CircuitProfile, n: number): BandPlan | undefined {
  if (profile.structure !== 'band' || !profileIsSparse(profile)) return undefined;
  const d = Math.round(Math.log2(n));
  const layout = bandLayout(profile, n);
  const roundsByRel: ({ start: number; count: number }[] | undefined)[] = new Array(NUM_RELATIONS).fill(undefined);
  for (const desc of ALL_RELATIONS) {
    const r = desc.relationIndex;
    if (profile.density[r] >= 1) continue; // permutation spans everything -> full global dispatch
    let rowStart = layout[r].offset;
    let rowEnd = layout[r].offset + layout[r].size;
    const rounds: { start: number; count: number }[] = [];
    for (let q = 0; q < d; q++) {
      const pairStart = rowStart >> 1;     // floor(rowStart / 2)
      const pairEnd = (rowEnd + 1) >> 1;   // ceil(rowEnd / 2)
      rounds.push({ start: pairStart, count: Math.max(0, pairEnd - pairStart) });
      rowStart = pairStart;                // the folded band becomes the next round's row band
      rowEnd = pairEnd;
    }
    roundsByRel[r] = rounds;
  }
  return { roundsByRel };
}

/**
 * Active-edge compaction plan (Phase 2, scattered). For each round, the dense list of
 * edge-pair indices a relation is actually active on, so the GPU accumulate can dispatch
 * one thread per active pair (gathered) instead of the full grid + per-edge skip. This is
 * the fix for `scattered`, where divergence neuters the per-edge skip: spread-out active
 * rows mean ~every workgroup has an active lane, so the whole SIMD warp runs the expensive
 * path. A dense active-index list eliminates the wasted lanes entirely.
 *
 * `idxByRel[r]` is the per-relation active pair indices concatenated over all rounds;
 * `roundsByRel[r][q]` = { base, count } slices it for round q. The active set folds the
 * obvious way — a folded pair (2k, 2k+1) is active iff either source row was — so it is
 * computed by OR-folding the round-0 active-row mask, exactly mirroring how an inactive
 * (all-zero) edge folds to an all-zero edge. Only relations with density < 1 get a plan
 * (a fully-active relation gains nothing and the index indirection would only add cost);
 * `undefined` for non-scattered/dense profiles (block uses `activeRowsByRel`, the prefix).
 */
export interface CompactionPlan {
  idxByRel: (Uint32Array | undefined)[]; // per relationIndex: active pair indices over rounds (undefined => no compaction)
  roundsByRel: ({ base: number; count: number }[] | undefined)[]; // per relationIndex, per round
}

/**
 * Only relations below this density are compacted. Measured on M4 (scattered, 2^16): a
 * low-density relation (databus 5%, poseidon 1–3%) collapses ~65% under compaction because
 * its active set is tiny and divergence was crushing it; but a high-density relation
 * (arith 40%) gets SLOWER — its active set is large, so compaction's scattered (gathered)
 * reads cost more than the divergence they save. Above this threshold, run the normal
 * (sequential-read) dispatch instead.
 */
export const COMPACTION_MAX_DENSITY = 0.2;

export function compactionPlan(profile: CircuitProfile, n: number): CompactionPlan | undefined {
  if (profile.structure !== 'scattered' || !profileIsSparse(profile)) return undefined;
  const d = Math.round(Math.log2(n));
  const idxByRel: (Uint32Array | undefined)[] = new Array(NUM_RELATIONS).fill(undefined);
  const roundsByRel: ({ base: number; count: number }[] | undefined)[] = new Array(NUM_RELATIONS).fill(undefined);
  for (const desc of ALL_RELATIONS) {
    const r = desc.relationIndex;
    if (profile.density[r] >= COMPACTION_MAX_DENSITY) continue; // dense enough that gathered reads cost more than the divergence saved
    let active = new Uint8Array(n);
    for (let i = 0; i < n; i++) active[i] = rowActive(profile, r, i, n) ? 1 : 0;
    const idx: number[] = [];
    const rounds: { base: number; count: number }[] = [];
    let m = n;
    for (let q = 0; q < d; q++) {
      const pairs = m >> 1;
      const base = idx.length;
      for (let k = 0; k < pairs; k++) if (active[2 * k] || active[2 * k + 1]) idx.push(k);
      rounds.push({ base, count: idx.length - base });
      const next = new Uint8Array(pairs);
      for (let k = 0; k < pairs; k++) next[k] = active[2 * k] || active[2 * k + 1] ? 1 : 0;
      active = next;
      m = pairs;
    }
    idxByRel[r] = Uint32Array.from(idx);
    roundsByRel[r] = rounds;
  }
  return { idxByRel, roundsByRel };
}

/**
 * Is relation `r` active on row `i` of a size-n instance? Portable predicate (no RNG):
 * mirrored bit-for-bit in the C++ SumcheckBench so the WASM baseline zeroes the same
 * rows. Rows >= L (the used size) are the zero padding tail (never active). Within
 * [0,L): block places the active rows in a contiguous prefix [0, density·L); scattered
 * spreads every (1/density)-th row (interleaved — at most one row per edge-pair active,
 * which is exactly what defeats per-pair skip and motivates compaction).
 */
export function rowActive(profile: CircuitProfile, r: number, i: number, n: number): boolean {
  const L = usedRows(profile, n);
  if (i >= L) return false;
  const d = profile.density[r];
  if (d >= 1) return true;
  if (d <= 0) return false;
  if (profile.structure === 'block') return i < Math.round(d * L);
  if (profile.structure === 'band') {
    const b = bandLayout(profile, n)[r];
    return i >= b.offset && i < b.offset + b.size;
  }
  const period = Math.max(1, Math.round(1 / d));
  return i % period === 0;
}

export interface Instance {
  initColBytes: Uint8Array[]; // resident Montgomery bytes, indexed by relationIndex
  relParamBytes: (Uint8Array | undefined)[];
  initCols: bigint[][][]; // canonical bigint columns (empty arrays when keepBigint=false)
  paramsByRel: bigint[][];
}

/**
 * Build the per-relation inputs for one size under `profile`: random columns +
 * relation_parameters, with every inactive row's columns zeroed so the relation
 * contributes zero there (and its skip predicate fires). Deterministic per
 * (size, relation) — identical seeding to the original dense builder, so the dense
 * profile reproduces the previous instance exactly. `keepBigint` retains the canonical
 * columns for the CPU reference (drop them at large n to avoid bigint retention).
 */
export function buildInstance(n: number, profile: CircuitProfile, keepBigint: boolean): Instance {
  const initColBytes: Uint8Array[] = [];
  const relParamBytes: (Uint8Array | undefined)[] = [];
  const initCols: bigint[][][] = Array.from({ length: NUM_RELATIONS }, () => [] as bigint[][]);
  const paramsByRel: bigint[][] = Array.from({ length: NUM_RELATIONS }, () => [] as bigint[]);
  const sparse = profileIsSparse(profile);
  for (const desc of ALL_RELATIONS) {
    const r = desc.relationIndex;
    const rng = makeRng((desc.seed ^ 0x5151_5151_5151n) + BigInt(n));
    const params = desc.makeParams ? desc.makeParams(rng) : [];
    paramsByRel[r] = params;
    relParamBytes[r] = desc.makeParams ? packParams(params) : undefined;
    const cols = Array.from({ length: desc.numEdges }, () => Array.from({ length: n }, () => rng()));
    if (sparse) {
      for (let i = 0; i < n; i++) {
        if (!rowActive(profile, r, i, n)) {
          for (let j = 0; j < desc.numEdges; j++) cols[j][i] = 0n;
        }
      }
    }
    initColBytes[r] = encodeColumnsToBytes(cols, n);
    if (keepBigint) initCols[r] = cols;
  }
  return { initColBytes, relParamBytes, initCols, paramsByRel };
}

/** Per-relation densities as integer basis points (0..10000) — the on-wire form for the
 *  SumcheckBench bbapi command (msgpack has no float vector, and bp avoids drift). */
export function densitiesBp(profile: CircuitProfile): number[] {
  return profile.density.map(d => Math.round(Math.max(0, Math.min(1, d)) * 10000));
}
