/// <reference types="@webgpu/types" />
// msm_v2.ts — the memory-bounded v2 pair-tree GPU MSM.
//
// Pipeline: carry-free Booth -> privatized transpose -> csr_to_v2 -> pair-tree
// bucket-accumulate -> branchless 4-phase reduction, with all five memory levers
// (window batching, index-mode level-0, tiled fused dispatch, plan-buffer ring,
// dropped -y plane).
//
// Two pieces, so the SRS point pool is uploaded and converted to Montgomery form
// exactly once and shared by every MSM of the proving session:
//   - MsmV2Pool.create(device, srsCanonicalBytes) — upload the canonical SRS and
//     GPU-convert it to the Montgomery-form 8xu32 point pool. Once per session.
//   - MsmV2.create(device, n, pool, config?) — data-independent: compile the
//     pipelines + bind groups for an n-point MSM, binding a prefix of `pool`.
//   - prepare(scalarsBuf) — UNTIMED: Booth-decode the scalars, plan every level,
//     (re)allocate the data-dependent buffers + bind groups. Cached by identity.
//   - run() -> {x, y} — TIMED: encode + submit the batched pipeline, decode
//     red_buf, host-combine the windows.
//
// Production contract: SRS-backed MSM only. The affine-add pair-tree assumes the
// point pool is free of the point at infinity and of colliding pairs (no P == ±Q
// within a bucket) — both hold for an SRS basis. The C++ webgpu_msm hook enforces
// this by delegating only when handle_edge_cases is false.

import { ShaderManager, type MontMulVariant } from './cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from './cuzk/curve_config.js';
import { compute_misc_params } from './cuzk/utils.js';
import { BN254_BASE_FIELD, addBn254Points, type Bn254Point, modInverse } from './cuzk/bn254.js';
import {
  MAX_STREAM_WORKGROUPS,
  STREAM_PLANNER_TPB,
  STREAM_NUM_THREADS,
  STREAM_WALKER_TPB,
  STREAM_S as STREAM_S_PLAN,
} from './cuzk/ba_stream_plan.js';
import {
  buildVarWindowSchedule,
  chooseVarWindowSplit,
  computeMsbHistogram,
  effectiveNumBits,
  VAR_WINDOW_MAX_WINDOWS,
  type SplitDecision,
} from './var_window_split.js';

const PG = 2;
const PLANNER_TPB = 256; // ba_planner_v2 workgroup size (one workgroup per window)
const FP = BN254_BASE_FIELD;
const NUMBITS = 254; // scalar field bit length

// A scratch buffer is either a standalone GPUBuffer or a {buffer,offset,size}
// slot carved from an arena (ARENA_LAYOUT.md §1). These helpers act on either,
// so clear/write/copy sites work whether or not the buffer has been migrated.
type ScratchSlot = GPUBuffer | GPUBufferBinding;
const slotBuf = (x: ScratchSlot): GPUBuffer => (x instanceof GPUBuffer ? x : x.buffer);
const slotOff = (x: ScratchSlot): number => (x instanceof GPUBuffer ? 0 : (x.offset ?? 0));
const slotSize = (x: ScratchSlot): number => (x instanceof GPUBuffer ? x.size : (x.size ?? 0));
const clearSlot = (enc: GPUCommandEncoder, x: ScratchSlot): void => enc.clearBuffer(slotBuf(x), slotOff(x), slotSize(x));
const writeSlot = (q: GPUQueue, x: ScratchSlot, off: number, data: BufferSource): void =>
  q.writeBuffer(slotBuf(x), slotOff(x) + off, data);
export const MEM_BUDGET = 160 * (1 << 20); // phone GPU-buffer budget (ARENA_LAYOUT.md §3)

/**
 * Byte size of each of the 6 colour-partitioned arenas (ARENA_LAYOUT.md §1),
 * summed from the same per-buffer formulas the `carve()` sites use. This is the
 * single source of truth shared by `ensureScratch`'s `reqArena` (the real
 * allocation) and `prepare()`'s budget gate (the fit decision), so the two can
 * never drift — adding a buffer means appending one `a(...)` term here and one
 * `carve()` at the matching site. Returns `[A0, A1, A2, A3, A4, A5]`.
 *
 * `soaSize(M) = 2·PG·M·4·4`. Sizes round up to 256-B arena alignment, min 4.
 */
export function arenaColourSizes(p: {
  sT: number;
  sS: number;
  sBTotal: number;
  sRadixTiles: number;
  batchSlots: number;
  redM: number;
  rowPtrLen: number;
  reducePrefBytes: number;
  scalarsBytes: number;
  l0Slots: number;
}): number[] {
  const ALIGN = 256;
  const a = (b: number): number => Math.ceil(Math.max(b, 4) / ALIGN) * ALIGN;
  const { sT, sS, sBTotal, sRadixTiles, batchSlots, redM, rowPtrLen, reducePrefBytes, scalarsBytes, l0Slots } = p;
  const soa = 2 * PG * redM * 4 * 4; // soaSize(redM)
  return [
    // A0: activeBuckets activeCount binOffsets partialWritePos reducePrefScratch sortedCountList scalarsRawBuf l0IdxBuf
    a(sBTotal * 4) + a(4) + a(64 * 4) + a(sBTotal * 4) + a(reducePrefBytes) + a(sBTotal * 4) + a(scalarsBytes) + a(l0Slots * 4),
    // A1: bucketAndSign denseBucketList denseCountList binWritePos cumulativeAdds ptCount ptMeta ptTasks ptTotalTasks walkerPartialDest rowPtrBuf isPresentBuf redBuf
    a(batchSlots * 4) + a(sBTotal * 4) + a(sBTotal * 4) + a(64 * 4) + a(sBTotal * 4) + a(sBTotal * 4) + a(16) +
      a(2 * sT * sS * 16) + a(4) + a(2 * sT * sS * 4) + a(rowPtrLen * 4) + a(redM * 4) + a(soa),
    // A2: partialCount partialLayout size1BucketList taskCuts valIdxBuf
    a(sBTotal * 4) + a(2 * sT * sS * 4) + a(sBTotal * 2 * 4) + a(sT * (sS + 1) * 2 * 4) + a(batchSlots * 4),
    // A3: radixHist threadCuts walkerPartials countHistogram ptOff
    a(sRadixTiles * 256 * 4) + a(sT * 2 * 4) + a(10 * sT * sS * 16) + a(64 * 4) + a(sBTotal * 4),
    // A4: ptScratch sortedBucketList wgCuts
    a(512 * sT * sS) + a(sBTotal * 4) + a(MAX_STREAM_WORKGROUPS * 2 * 4),
    // A5: partialOffset sortedActiveBuckets
    a((sBTotal + 1) * 4) + a(sBTotal * 4),
  ];
}

/**
 * Largest planner-workgroup cap (≤ `maxMpw`) whose most-staged working set fits
 * {@link MEM_BUDGET}. The walker thread count is `sT = MPW · STREAM_PLANNER_TPB`
 * and the THREAD-zone arenas scale with `sT`, so feasibility is monotone in MPW
 * — a smaller cap fits whenever a larger one does. Tested at the most-staged
 * point (one window per batch, `bw = 1`) — the minimum footprint the prepare()
 * gate can reach — so a cap is rejected only if even maximal bw-staging
 * overflows it. Returns 4 (sT = 1024, the §8 floor) if nothing fits, leaving
 * prepare() to proceed best-effort. Desktop sizes keep the full cap.
 */
function chooseBudgetMpw(g: {
  maxMpw: number;
  n: number;
  NW: number;
  BW: number;
  redM: number;
  bTotal: number;
  stride: number;
  reduceWg: number;
  srsBytes: number;
  budget: number;
}): number {
  const reducePrefBytes = g.NW * g.reduceWg * Math.ceil(Math.ceil(g.stride / 2) / g.reduceWg) * 2 * 16;
  // Test the most-staged point (one window per batch, bw = 1) — the minimum
  // footprint the prepare() gate can reach — so a cap is rejected only if even
  // maximal bw-staging overflows it.
  const standalone = 4 * g.BW * 4 + (3 * g.NW + 6) * 4; // counts/offsets at bw=1 + planMeta
  for (let mpw = g.maxMpw; mpw >= 4; mpw >>= 1) {
    const arenaBytes = arenaColourSizes({
      sT: mpw * STREAM_PLANNER_TPB,
      sS: STREAM_S_PLAN,
      sBTotal: g.bTotal,
      sRadixTiles: Math.ceil(g.bTotal / 2048),
      batchSlots: g.n,
      redM: g.redM,
      rowPtrLen: g.BW + 1,
      reducePrefBytes,
      scalarsBytes: 32 * g.n,
      l0Slots: g.n + 3,
    }).reduce((acc, b) => acc + b, 0);
    if (g.srsBytes + arenaBytes + standalone <= g.budget) return mpw;
  }
  return 4;
}

// Defaults for the size-independent knobs (see MsmConfig). `c`, `s` and
// `reduceWg` are instead chosen per problem size — by pickC / pickS /
// pickReduceWg below. All values are the bench-msm-v2 sweep optimum.
const DEFAULT_WGI = 128; // generic kernel workgroup size
const DEFAULT_L0_LOG = 1; // reduction leaf-partition log2
const DEFAULT_INV_VARIANT: 'loop' | 'pk' = 'pk';

type ReducePass = { isDouble: boolean; shaderPhase: number; p2x: number; p2y: number; ppw: number };

// The recursive affine bucket reduction's data-independent 4-phase schedule for
// a region of `stride` (= 2^(c-1)) buckets per window. Pure function of stride +
// l0Log, so split-c builds one schedule for the lower region (stride_max) and a
// separate, shorter one for the sparse upper region (stride_hi = 2^(c_hi-1)) —
// the upper region's work scales with stride_hi, not the envelope.
function buildReducePasses(stride: number, l0Log: number): ReducePass[] {
  const C0 = Math.max(1, Math.min(l0Log, Math.log2(stride) - 1));
  const L0 = 1 << C0;
  const D = stride / L0;
  const passes: ReducePass[] = [];
  const push = (isDouble: boolean, shaderPhase: number, p2x: number, p2y: number, ppw: number) =>
    passes.push({ isDouble, shaderPhase, p2x, p2y, ppw });
  for (let l = L0 - 1; l >= 1; l--) push(false, 0, L0, l, D);
  for (let L1 = L0; L1 < stride; L1 *= 2) push(false, 1, L0, L1, stride / (2 * L1));
  for (let j = 0; j < C0; j++) push(true, 2, L0, 0, D - 1);
  for (let L1 = 2 * L0; L1 < stride; L1 *= 2) push(true, 2, L1, 0, stride / L1 - 1);
  for (let mm = 1; mm < stride; mm *= 2) push(false, 2, L0, mm, stride / (2 * mm));
  if (passes.length > 64) throw new Error(`reduction schedule too long: ${passes.length} > 64`);
  return passes;
}

// Flatten a reduce schedule into the per-level lparams rows the reduce kernel
// reads: (pa, pb, ppw, kind). kind: 0 = suffix-add, 1 = tree-add, 2 = double.
function flattenReduceSchedule(passes: ReducePass[]): Uint32Array {
  const schedule = new Uint32Array(64 * 4);
  passes.forEach((p, i) => {
    const kind = p.isDouble ? 2 : p.shaderPhase === 0 ? 0 : 1;
    const a = !p.isDouble && p.shaderPhase !== 0 ? p.p2y : p.p2x;
    const b = !p.isDouble && p.shaderPhase === 0 ? p.p2y : 0;
    schedule[i * 4 + 0] = kind;
    schedule[i * 4 + 1] = a;
    schedule[i * 4 + 2] = b;
    schedule[i * 4 + 3] = p.ppw;
  });
  return schedule;
}

/**
 * Tuning knobs for {@link MsmV2}. Every field is optional and defaults to the
 * value that reproduces current behaviour, so `{}` (or omitting it) is a no-op
 * — which keeps A/B comparisons honest.
 */
export interface MsmConfig {
  /** Pippenger window bits. Default: `pickC(n)`. */
  c?: number;
  /** Fused-kernel chunk size (pairs batched per thread). Default: `pickS(n)`. */
  s?: number;
  /** Generic kernel workgroup size. Default 128. */
  wgi?: number;
  /** Bucket-reduction workgroup size. Default: `pickReduceWg(c)`. */
  reduceWg?: number;
  /** Reduction leaf-partition log2. Default 1. */
  l0Log?: number;
  /** GPU field-inversion variant. Default 'pk' (2×13-packed safegcd). */
  invVariant?: 'loop' | 'pk';
  /** Base-field Montgomery-multiply body. Default 'karat'; 'cios_unrolled' is the
   *  device-validated register-resident CIOS variant (−26% on Mali-G715, BN254 only). */
  montmul?: MontMulVariant;
  /** ba_fused_super 8×u32 fr_add/fr_sub: 'native' or 'unpack'-repack. Default 'native'. */
  addsub?: 'native' | 'unpack';
  /** Record per-pass GPU timestamps in `run()` (needs the `timestamp-query` feature). */
  profile?: boolean;
  /** Phase-2 hook — Jacobian-crossover threshold. Accepted but inert in Phase 1. */
  jacobianCrossover?: number;
  /**
   * Discarded warm-up `run()`s in `create()` — they ramp the GPU clock and pay
   * the shader-JIT / command-buffer cold start before the first timed run.
   * Default 5 (benchmark harness); the production bridge passes 0 so the first
   * real MSM is the work, not a throwaway.
   */
  warmupRuns?: number;
  /**
   * Run the Horner window-combine + final modular inverse on the host. Default
   * `true` — the benchmark harness wants the affine `{x, y}`. The production
   * bridge passes `false`: it ships the per-window sums across the bridge and
   * the C++ hook does the combine in native `bb::g1`.
   */
  combineOnHost?: boolean;
  /**
   * Planner-workgroup cap → walker thread count `sT = maxPlannerWorkgroups · 256`.
   * Default: budget-aware (largest cap ≤ 32 whose working set fits the 160 MB
   * GPU-buffer budget; see {@link chooseBudgetMpw}). Lower it (16/8/4) to trade
   * walker parallelism for THREAD-zone memory on constrained devices — `ptScratch`
   * alone is `512 · sT · 8` B, so 32→8 reclaims ~24 MiB. ARENA_LAYOUT.md §8.
   */
  maxPlannerWorkgroups?: number;
  /**
   * Force ≥ this many window-batches, overriding the budget-driven count (never
   * below the 65k-workgroup minimum). Default 0 (budget-driven). The MSM result
   * is invariant to the batch count, so this is a test/packing lever to exercise
   * the multi-batch reduce path that single MSMs at logN ≤ 17 never reach.
   */
  numBatchesOverride?: number;
  /**
   * GPU-buffer budget in MiB. Default 160 (the portable phone floor). Drives
   * both the `sT` cap ({@link chooseBudgetMpw}) and the window-batch staging
   * gate. Lower it on memory-constrained devices; the result stays correct (the
   * MSM is invariant to staging) but uses more, smaller passes.
   */
  budgetMiB?: number;
  /**
   * Test fixture for split-c variable-window correctness. When set, the uniform
   * window schedule is replaced by a two-region schedule (wide lower windows,
   * narrow upper) covering the same scalar bits. Buffers size to the envelope
   * (max num_columns / stride); WindowDesc carries the per-window widths. Every
   * window still iterates all n points, so it's correct without region-split.
   * The MSM result is windowing-invariant, so output must still match the oracle.
   */
  varSched?: boolean;
  /**
   * Enable the split-c variable-window decision (Phase 1): build the GPU MSB
   * histogram so the schedule can be chosen from the scalar distribution. Off by
   * default — the uniform path is untouched and byte-identical. The decision only
   * splits when the cost model finds it worthwhile (or {@link forceSplit} forces it).
   */
  splitC?: boolean;
  /**
   * Use the sparse bucket reduction (skips empty buckets via a gap-aware suffix
   * sum) instead of the dense table-driven tree. Byte-identical result; wins on
   * structured/sparse scalar distributions (the production wire commits). v0 is
   * one-thread-per-window (validation); v1 batches the inversions for speed.
   */
  sparseReduce?: boolean;
  /**
   * Test hook (mirrors the C++ VAR_WINDOW_FORCE_SPLIT env var): force a split at
   * `[b_star, c_lo, c_hi]`, bypassing the cost model. Requires {@link splitC}.
   */
  forceSplit?: [number, number, number];
  /**
   * Reduce-cost weight (the cost model's `alphaBucket`) for the split decision.
   * Default 4 models the dense reduce: wide windows are heavily penalised, so the
   * lower region keeps the unsplit width. Lower it as the reduce is optimised to
   * let the decision widen `c_lo` (fewer lower windows → fewer walker passes over
   * all n scalars). At realistic "fast-but-not-free" weights the steep
   * `2^(c-1)` bucket term still dominates — engaging large `c_lo` needs this
   * calibrated against the optimised reduce's true cost.
   */
  reduceCostWeight?: number;
  /**
   * Max lower-region window width the split decision may choose (the walker-cut
   * lever). Default 0 = `pickC(n)` (no widening, byte-identical). Capped at 15 by
   * the packed-window bid (K=15). A wider `c_lo` only takes effect if the
   * create-time red_buf / CSR envelope can hold its larger per-window stride;
   * otherwise the schedule safely falls back to the unsplit width.
   */
  maxCLo?: number;
}

/** Per-pass GPU time (ms) for one `run()`, returned when `profile` is set. */
export interface ProfileBreakdown {
  decompose: number;
  transpose: number;
  convert: number;
  planner: number;
  fused: number;
  carry: number;
  finalize: number;
  redInit: number;
  redLevel: number;
  wall: number;
}

// --- pure helpers ---

interface Pt {
  x: bigint;
  y: bigint;
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function randomBelow(p: bigint, rng: () => number): bigint {
  const bitlen = p.toString(2).length;
  const byteLen = Math.ceil(bitlen / 8);
  for (;;) {
    let v = 0n;
    for (let i = 0; i < byteLen; i++) v = (v << 8n) | BigInt((rng() >>> 24) & 0xff);
    v &= (1n << BigInt(bitlen)) - 1n;
    if (v > 0n && v < p) return v;
  }
}

function bigintToPackedU32x8(v: bigint): Uint32Array {
  const w = new Uint32Array(8);
  let x = v;
  for (let i = 0; i < 8; i++) {
    w[i] = Number(x & 0xffffffffn);
    x >>= 32n;
  }
  return w;
}

function packedU32x8ToBigint(w: Uint32Array, off: number): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 32n) | BigInt(w[off + i] >>> 0);
  return v;
}

// Decode a 32-byte little-endian field element from `buf` at element index i.
function leBytesToBigint(buf: Uint8Array, byteOff: number): bigint {
  let v = 0n;
  for (let k = 31; k >= 0; k--) v = (v << 8n) | BigInt(buf[byteOff + k]);
  return v;
}

const fsub = (a: bigint, b: bigint): bigint => (a - b + FP) % FP;
const fmul = (a: bigint, b: bigint): bigint => (a * b) % FP;

// Per-bucket pair / carry / new-count — matches ba_planner_v2's
// finalize-and-drop (a count-1 bucket finalizes: no carry, nc = 0).
function bucketSplit(n: number): { pc: number; cf: number; nc: number } {
  const pc = n >>> 1;
  const cf = n === 1 ? 0 : n & 1;
  return { pc, cf, nc: pc + cf };
}

// Carry-free signed-Booth recode of window w (c bits) of `scalar` — the host
// mirror of decompose_scalars_booth.template.wgsl.
function boothDigit(scalar: bigint, w: number, c: number): { bucket: number; sign: number } {
  const lo = w * c;
  const winBits = Number((scalar >> BigInt(lo)) & ((1n << BigInt(c)) - 1n));
  const lookback = w === 0 ? 0 : Number((scalar >> BigInt(lo - 1)) & 1n);
  const raw = (winBits << 1) | lookback;
  const neg = (raw >>> c) & 1;
  const negMask = neg ? 0xffffffff : 0;
  const valMask = (1 << c) - 1;
  const encode = (raw + 1) >>> 1;
  const bucket = (((encode - neg) >>> 0) ^ negMask) & valMask;
  return { bucket, sign: neg };
}


interface LevelPlan {
  // pair_blocks_per_window: the per-window count of "pair_blocks" the fused
  // affine-add kernel runs. One pair_block = S pairs sharing one batched
  // inversion. Taken as the max across all windows so every window's
  // dispatch slot is sized for the heaviest one (the unused tail pads to
  // the self-pad trio so empty slots are no-ops).
  pairBlocksPerWindow: number;
  // carries_per_window: the per-window count of carry slots (odd-count
  // buckets that produce a single leftover point, copied to the next level).
  carriesPerWindow: number;
  // totalPairBlocks = batchWindows × pairBlocksPerWindow — the actual
  // dispatch X-dimension for the fused kernel + tileParams[0] write target.
  totalPairBlocks: number;
  // totalCarries = batchWindows × carriesPerWindow — drives the carry-copy
  // dispatch + carryParams[0] write target.
  totalCarries: number;
}

// Plan one level: per-window pair/carry counts -> next-level counts + the
// per-window pair-block / carry strides (max over all windows).
function planLevel(counts: Uint32Array, s: number, numWindows: number, BW: number) {
  const newCounts = new Uint32Array(numWindows * BW);
  let pairBlocksPerWindow = 1;
  let carriesPerWindow = 1;
  for (let w = 0; w < numWindows; w++) {
    let pairs = 0;
    let carries = 0;
    for (let bl = 0; bl < BW; bl++) {
      const g = w * BW + bl;
      const { pc, cf, nc } = bucketSplit(counts[g]);
      pairs += pc;
      carries += cf;
      newCounts[g] = nc;
    }
    pairBlocksPerWindow = Math.max(pairBlocksPerWindow, Math.ceil(pairs / s));
    carriesPerWindow = Math.max(carriesPerWindow, carries);
  }
  const plan: LevelPlan = { pairBlocksPerWindow, carriesPerWindow, totalPairBlocks: 0, totalCarries: 0 };
  return { plan, newCounts };
}

// Build the pad-trio SoA buffer for an active_sums buffer of element stride Mb:
// the 3 pad slots sit at Mb-3..Mb-1 in Montgomery form.
function buildPadBuf(Mb: number, padPts: Pt[], R: bigint): Uint32Array {
  const padBuf = new Uint32Array(2 * PG * Mb * 4);
  for (let j = 0; j < 3; j++) {
    const slot = Mb - 3 + j;
    const xw = bigintToPackedU32x8((padPts[j].x * R) % FP);
    const yw = bigintToPackedU32x8((padPts[j].y * R) % FP);
    for (let q = 0; q < PG; q++) {
      const xb = (PG * slot + q) * 4;
      const yb = (PG * Mb + PG * slot + q) * 4;
      for (let k = 0; k < 4; k++) {
        padBuf[xb + k] = xw[4 * q + k];
        padBuf[yb + k] = yw[4 * q + k];
      }
    }
  }
  return padBuf;
}

// Two-region variable-window test schedule: `wLo` wide windows (c=14) then
// `wHi` narrow windows (c=12), contiguously tiling >= numBits+2 scalar bits.
// Two distinct widths exercise the per-window WindowDesc path; the MSM result
// is windowing-invariant so it must still match the oracle. Widths stay <= 15
// (the packed-bid magnitude field is 15 bits).
function buildVarSchedule(numBits: number): number[] {
  const cLo = 14;
  const cHi = 12;
  const total = numBits + 2;
  const wLo = Math.ceil(Math.floor(total / 2) / cLo);
  const lowerBits = wLo * cLo;
  const wHi = Math.ceil(Math.max(0, total - lowerBits) / cHi);
  return [...new Array(wLo).fill(cLo), ...new Array(wHi).fill(cHi)];
}

// Window combine: Horner fold of the per-window weighted sums into the final
// MSM point — acc = Σ_w L_w · 2^(w·c). The fold runs in Jacobian coordinates
// (a = 0) so every step is inversion-free; one inverse converts back to affine.
//
// EMPTY-WINDOW HANDLING. A window with no contributing buckets emits L[w] =
// (0, 0) which is our sentinel for "infinity / empty" — (0, 0) is NOT on the
// BN254 curve. Two failure modes the fix addresses:
//   (a) seed window empty: feeding (0, 0) into Jacobian (Z=1) treats it as a
//       valid affine point and the first doubling collapses Z to 0 (infinity);
//       subsequent mixed-adds amplify zeros and the whole MSM returns (0, 0).
//       Profile E (all scalars in [0,16)) is the canonical trigger — only the
//       lowest window has buckets.
//   (b) mid windows empty: the mixed-add formula assumes both operands are
//       valid; skipping it when L[w] is empty leaves acc as the doubled prior
//       window, which is correct.
function hostWindowCombine(L: Pt[], windowCs: number[]): Pt {
  const fadd = (a: bigint, b: bigint): bigint => (a + b) % FP;
  // Find the highest non-empty window to seed Jacobian acc; any windows
  // above it are pure infinity (skip their doublings — doubling ∞ = ∞).
  let top = L.length - 1;
  while (top >= 0 && L[top].x === 0n && L[top].y === 0n) top--;
  if (top < 0) return { x: 0n, y: 0n };
  let X = L[top].x;
  let Y = L[top].y;
  let Z = 1n;
  for (let w = top - 1; w >= 0; w--) {
    // Doublings between window w+1 and window w = window w's width (bit_base
    // step). Uniform schedule ⇒ windowCs[w] == c for every w.
    for (let d = 0; d < windowCs[w]; d++) {
      // Jacobian doubling, a = 0 (EFD dbl-2009-l).
      const A = fmul(X, X);
      const B = fmul(Y, Y);
      const Bsq = fmul(B, B);
      const xB = fadd(X, B);
      const s = fsub(fmul(xB, xB), fadd(A, Bsq));
      const D = fadd(s, s);
      const E = fadd(fadd(A, A), A);
      const X3 = fsub(fmul(E, E), fadd(D, D));
      const Bsq4 = fadd(fadd(Bsq, Bsq), fadd(Bsq, Bsq));
      const yz = fmul(Y, Z);
      Y = fsub(fmul(E, fsub(D, X3)), fadd(Bsq4, Bsq4));
      Z = fadd(yz, yz);
      X = X3;
    }
    // Empty window — skip the mixed add. acc stays at the doubled prior state.
    if (L[w].x === 0n && L[w].y === 0n) continue;
    // Jacobian + affine mixed addition (EFD madd-2007-bl).
    const Z1Z1 = fmul(Z, Z);
    const U2 = fmul(L[w].x, Z1Z1);
    const S2 = fmul(fmul(L[w].y, Z), Z1Z1);
    const H = fsub(U2, X);
    const HH = fmul(H, H);
    const I = fadd(fadd(HH, HH), fadd(HH, HH));
    const J = fmul(H, I);
    const r = fadd(fsub(S2, Y), fsub(S2, Y));
    const V = fmul(X, I);
    const X3 = fsub(fsub(fmul(r, r), J), fadd(V, V));
    const yJ = fmul(Y, J);
    const zH = fadd(Z, H);
    Y = fsub(fmul(r, fsub(V, X3)), fadd(yJ, yJ));
    Z = fsub(fsub(fmul(zH, zH), Z1Z1), HH);
    X = X3;
  }
  if (Z === 0n) return { x: 0n, y: 0n };
  const zInv = modInverse(Z, FP);
  const zInv2 = fmul(zInv, zInv);
  return { x: fmul(X, zInv2), y: fmul(Y, fmul(zInv2, zInv)) };
}

async function compileOne(
  device: GPUDevice,
  code: string,
  key: string,
  layout: GPUBindGroupLayout,
): Promise<GPUComputePipeline> {
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const errLines: string[] = [];
  for (const m of info.messages) {
    const line = `[shader ${key}] ${m.type}: ${m.message} (line ${m.lineNum}, col ${m.linePos})`;
    if (m.type === 'error') {
      console.error(line);
      errLines.push(line);
    } else {
      console.warn(line);
    }
  }
  if (errLines.length) throw new Error(`WGSL compile failed for ${key}: ${errLines.slice(0, 4).join(' | ')}`);
  return device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module, entryPoint: 'main' },
  });
}

async function readbackU32(device: GPUDevice, buf: GPUBuffer, byteLength: number): Promise<Uint32Array> {
  const staging = device.createBuffer({ size: byteLength, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(buf, 0, staging, 0, byteLength);
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  await staging.mapAsync(GPUMapMode.READ);
  const out = new Uint32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  staging.destroy();
  return out;
}

// Window bits per n — fastest c per size, measured by bench-c-sweep /
// bench-msm-v2 on this GPU. Tiny-n entries pick a small c to shrink the
// bucket reduction, which is the dominant fixed cost there.
export function pickC(n: number): number {
  const logN = Math.round(Math.log2(n));
  const table: Record<number, number> = {
    7: 4,
    8: 4,
    9: 5,
    10: 8,
    11: 8,
    12: 8,
    13: 8,
    14: 8,
    15: 10,
    16: 13,
    17: 13,
    18: 15,
    19: 15,
    20: 15,
  };
  return table[logN] ?? 13;
}

// Fused chunk size per n. Small n is occupancy-starved and wants fewer pairs
// per chunk (more chunks -> more workgroups); large n is saturated and
// prefers bigger chunks (better inversion amortisation). bench-msm-v2.
function pickS(n: number): number {
  const logN = Math.round(Math.log2(n));
  return logN <= 11 ? 2 : logN <= 13 ? 4 : 8;
}

// Bucket-reduction workgroup size per c. Tracks the reduction stride: small c
// stays near the GPU subgroup width (32); large c needs the full 128 to cover
// its wide phases. bench-msm-v2 (c=8 -> 32, c=10 -> 64, c=13 -> 128).
export function pickReduceWg(c: number): number {
  return c <= 9 ? 32 : c <= 12 ? 64 : 128;
}

// Per-level GPU dispatch wiring for one prepared scalar set.
interface LevelBind {
  plannerABind: GPUBindGroup;
  plannerBBind: GPUBindGroup;
  fusedTiles: { bind: GPUBindGroup; nx: number }[];
  carryBind: GPUBindGroup;
  finalizeBinds: GPUBindGroup[]; // one per window-batch
  nCarry: number;
}

/**
 * Per-pool memoization of bind-group layouts + compiled compute pipelines.
 *
 * Compiling a WGSL shader to a GPU pipeline is the dominant per-MsmV2.create
 * cost (~10–100 ms × ~17 pipelines × every distinct n a Chonk batch hits).
 * The cache keys on the rendered WGSL source for pipelines (deterministic
 * from generator args, so two equivalent calls share the cached pipeline)
 * and on the layout shape for bind-group layouts. Values are stored as
 * `Promise<GPUComputePipeline>` so concurrent compilation requests for the
 * same shader collapse onto one compile.
 *
 * Lifetime is tied to the pool — pipelines and layouts hold no references
 * to MsmV2 instances and survive their destruction. Released when the
 * `GPUDevice` is destroyed (host calls `pool.destroy()`).
 */
class PipelineCache {
  private layouts = new Map<string, GPUBindGroupLayout>();
  private pipelines = new Map<string, Promise<GPUComputePipeline>>();

  constructor(private readonly device: GPUDevice) {}

  /** Idempotent: same `types` array → same cached `GPUBindGroupLayout`. */
  getLayout(types: GPUBufferBindingType[]): GPUBindGroupLayout {
    const key = types.join('|');
    let layout = this.layouts.get(key);
    if (layout) return layout;
    layout = this.device.createBindGroupLayout({
      entries: types.map((type, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type } })),
    });
    this.layouts.set(key, layout);
    return layout;
  }

  /**
   * Idempotent: same `code` string → same cached `GPUComputePipeline`. The
   * caller passes `layout`, which itself should come from `getLayout` so the
   * cached layout is reused; otherwise the pipeline layout objects differ
   * and the WebGPU implementation has to revalidate.
   *
   * `key` is a short label included in WGSL compile errors only — not part
   * of the cache key.
   */
  getPipeline(code: string, layout: GPUBindGroupLayout, key: string): Promise<GPUComputePipeline> {
    let p = this.pipelines.get(code);
    if (p) return p;
    p = compileOne(this.device, code, key, layout);
    this.pipelines.set(code, p);
    return p;
  }
}

/**
 * The shared SRS point pool: the base points uploaded to the GPU and converted
 * to Montgomery-form 8×u32 layout exactly once, then bound (as a prefix) by
 * every {@link MsmV2} instance. Build it once per proving session from the
 * canonical SRS; `MsmV2.create` references its buffers without re-uploading or
 * re-converting.
 *
 * Hosts the per-pool layout / pipeline cache (see {@link PipelineCache}) so
 * MsmV2 instances bound to the same pool never recompile a shader they've
 * collectively seen before.
 */
/**
 * The shared per-MSM scratch buffers, owned by {@link MsmV2Pool}. Sized to
 * the high-water mark of every dimension `MsmV2.prepare` has asked for
 * across all instances. Doubling-growth: any buffer reallocates only when
 * its dimension exceeds the current size. After a reallocation the pool's
 * `scratchEpoch` advances; MsmV2 instances detect a stale epoch and rebuild
 * their bind groups against the new buffer identities.
 *
 * Replaces the old per-instance buffer ownership where every cached MsmV2
 * in the bridge LRU held its own 200+ MB of scratch. With the shared pool
 * the aggregate GPU memory is `one max-N copy + KB-sized bind groups per
 * instance`, regardless of LRU size. Cold N-switch goes from ~150 ms
 * (buffer alloc) to ~2 ms (bind-group rebuild).
 */
interface SharedScratch {
  bufA: GPUBuffer;
  bufB: GPUBuffer;
  l0IdxBuf: GPUBufferBinding;
  bucketAndSignBuf: GPUBufferBinding;
  valIdxBuf: GPUBufferBinding;
  rowPtrBuf: GPUBufferBinding;
  planMeta: GPUBuffer;
  pairBlockPlanRing: [GPUBuffer, GPUBuffer];
  scatterPlanRing: [GPUBuffer, GPUBuffer];
  carryPlanRing: [GPUBuffer, GPUBuffer];
  countsBufs: [GPUBuffer, GPUBuffer];
  offsetsBufs: [GPUBuffer, GPUBuffer];
  prefScratchBuf: GPUBuffer;
  scalarsRawBuf: GPUBufferBinding;
  redBuf: GPUBufferBinding;
  isPresentBuf: GPUBufferBinding;
  reducePrefScratch: GPUBufferBinding;
  // Streaming planner + accumulator buffers (Phase 1-4).
  streamPlannerMeta: GPUBuffer;
  arenas: GPUBuffer[];              // one GPU buffer per arena colour (ARENA_LAYOUT.md §1); mkBind-only scratch carved at 256-B offsets

  size1BucketList: GPUBufferBinding;
  denseBucketList: GPUBufferBinding;
  denseCountList: GPUBufferBinding;
  sortedBucketList: GPUBufferBinding;
  sortedCountList: GPUBufferBinding;
  radixHist: GPUBufferBinding;
  cumulativeAdds: GPUBufferBinding;
  wgCuts: GPUBufferBinding;
  threadCuts: GPUBufferBinding;
  queueBuf: GPUBuffer;
  partialsBuf: GPUBuffer;
  partialBucketsList: GPUBuffer;
  accBuf: GPUBuffer;
  streamPrefScratch: GPUBuffer;
  // Stream-walker buffers (Plan §3.1 + C's KNOB 2 variant).
  taskCuts: GPUBufferBinding;       // arena slot — (S+1) cut points/thread × 2 u32
  walkerPartials: GPUBufferBinding; // arena slot — 2*S partial slots/thread (split-start + task-end)
  walkerPartialDest: GPUBufferBinding; // arena slot — bucket_id per partial slot (NO_BUCKET if unused)
  // Optimal walker_combine pipeline buffers.
  partialCount: GPUBufferBinding;   // arena slot — bTotal × atomic<u32> — partials per bucket
  partialOffset: GPUBufferBinding;  // arena slot — (bTotal+1) × u32 — exclusive prefix sum
  partialWritePos: GPUBufferBinding; // arena slot — bTotal × atomic<u32> — scatter scratch
  partialLayout: GPUBufferBinding;  // arena slot — max_partials × u32 — dense per-bucket slot indices
  activeBuckets: GPUBufferBinding;  // arena slot — bTotal × u32 — filtered list of count>=2 bucket_ids
  activeCount: GPUBufferBinding;    // arena slot — 1 × atomic<u32> — size of active_buckets
  // Counting-sort prepass: groups active_buckets by partial_count so each
  // combine_batched thread's S=8 slots have matching N → zero tail divergence.
  // MAX_N = 64 bins (sized in ba_walker_combine_sort_*.template.wgsl).
  countHistogram: GPUBufferBinding; // arena slot — MAX_N × atomic<u32>
  binOffsets: GPUBufferBinding;     // arena slot — MAX_N × u32 — exclusive prefix sum
  binWritePos: GPUBufferBinding;    // arena slot — MAX_N × atomic<u32>
  sortedActiveBuckets: GPUBufferBinding; // arena slot — bTotal × u32 — active_buckets in N order
  // Pair-tree hot-bucket combine. pt_scratch holds intermediate level
  // partials per hot bucket; pt_alloc is a single atomic claim counter
  // reset each MSM. Sized for the worst case where every emitted partial
  // is in a hot bucket — sum(2N over hot) ≤ 2 × total_partials.
  ptScratch: GPUBufferBinding;      // arena slot — pt_buf (512·sT·sS B ≈ 32 MB)
  ptAlloc: GPUBuffer;               // 1 × atomic<u32> — legacy, kept to avoid bind churn
  ptDispatchArgs: GPUBuffer;        // 3 × u32 — sort_scan writes (ceil(hot_count/TPB),1,1); used by pt_init_copy/build/finalize
  ptCombineDispatchArgs: GPUBuffer; // 3 × u32 — pt_dispatch_compute writes per-level (ceil(total_tasks/S/TPB),1,1)
  ptBuildLoopArgs: GPUBuffer;       // 3 × u32 — dispatch_chain writes hot_wgs while any pair-tasks remain, else 0; build's level-by-level indirect dispatch reads this
  cbDispatchArgs: GPUBuffer;        // 3 × u32 — sort_scan writes (ceil(cb_active / (CB_TPB*CB_S)), 1, 1); combine_batched indirect-dispatched off it
  ptPersistentDispatchArgs: GPUBuffer; // 3 × u32 — packer writes (NUM_WGS, 1, 1)
  ptBucketWg: GPUBuffer;               // sBTotal × u32 — per-bucket WG assignment (packer intermediate)
  ptWgMeta: GPUBuffer;                 // MAX_WGS × 4 × u32 — (scratch_off, count, total_partials, _) per WG
  ptWgBucketList: GPUBuffer;           // sBTotal × u32 — bids packed by WG
  ptWgBucketStarts: GPUBuffer;         // (MAX_WGS + 1) × u32 — prefix sum into pt_wg_bucket_list
  // Chunk-pass (stream_walker-shaped reducer).
  ptChunks: GPUBuffer;                 // vec4<u32> × max_chunks — (in_off, count, out_off, bid)
  ptChunksTotal: GPUBuffer;            // 1 × atomic<u32> — chunks emitted in current pass
  // Pair-tree v2 (multi-dispatch). Per-bucket level state, task list, counters.
  ptOff: GPUBufferBinding;          // arena slot — sBTotal × u32 — bucket's current start in pt_buf
  ptCount: GPUBufferBinding;        // arena slot — sBTotal × u32 — bucket's current level count
  ptMeta: GPUBufferBinding;         // arena slot — 4 × u32 — NUM_HOT, total partials, _, _
  ptTasks: GPUBufferBinding;        // arena slot — max tasks per level × vec4<u32>
  ptTotalTasks: GPUBufferBinding;   // arena slot — 1 × atomic<u32>
  // Pad-trio layout in bufA/bufB (depends on the M1 the buffers were
  // sized for). Re-derived whenever bufA grows.
  planeBytes: number;
  padBytesPerPlane: number;
  padXOffset: number;
  padYOffset: number;
  // The M1 the pool's bufA/bufB are sized to (in elements, not bytes).
  // ALL MSMs binding to this pool MUST reference pad slots at element
  // indices [poolM1-3, poolM1-2, poolM1-1] regardless of their own M1 —
  // those are the only slots that contain the pad-trio data. The pool
  // re-writes the pad bytes there whenever it grows bufA/bufB.
  poolM1: number;
}

/** Dimensions a single MSM prepare asks the pool to fit. */
interface ScratchDims {
  M1: number;
  batchSlots: number;
  batchBuckets: number;
  numWindows: number;
  BW: number;
  l0Slots: number;
  rowPtrLen: number;
  planMetaLen: number;
  totalPairBlocks: number;
  totalCarries: number;
  fusedTile: number;
  S: number;
  scalarsBytes: number;
  redM: number;
  reducePrefBytes: number;
  bTotal: number;
  // Streaming planner dimensions.
  streamNumThreads: number;
  streamS: number;
  streamQueueEntries: number;
  streamRadixTiles: number;
}

export class MsmV2Pool {
  /** @internal — used by MsmV2.create to share compiled pipelines. */
  readonly cache: PipelineCache;
  /**
   * Pool-level upper bound on per-bucket pair count. Baked into the
   * `ba_planner_v2_emit` shader as a compile-time PAIR_CAP loop bound;
   * pinned to the pool (`ceil(srsN/2)+16`) so the shader source is
   * pool-invariant and the planner pipeline can be cached across every n
   * the pool serves. The shader's inner loop early-breaks at the real
   * per-bucket pair count, so over-bounding here costs nothing.
   */
  readonly pairCap: number;

  // Shared scratch state — allocated lazily on first MsmV2.prepare call,
  // grown by doubling whenever a dimension exceeds the current size.
  // See SharedScratch above.
  private _scratch: SharedScratch | null = null;
  private _maxDims: ScratchDims = {
    M1: 0,
    batchSlots: 0,
    batchBuckets: 0,
    numWindows: 0,
    BW: 0,
    l0Slots: 0,
    rowPtrLen: 0,
    planMetaLen: 0,
    totalPairBlocks: 0,
    totalCarries: 0,
    fusedTile: 0,
    S: 0,
    scalarsBytes: 0,
    redM: 0,
    reducePrefBytes: 0,
    bTotal: 0,
    streamNumThreads: 0,
    streamS: 0,
    streamQueueEntries: 0,
    streamRadixTiles: 0,
  };
  private _scratchEpoch = 0;
  private _device: GPUDevice;

  /** Bumped whenever `ensureScratch` reallocates any buffer. MsmV2
   * instances cache the value at bind-group build time and rebuild when
   * it advances. */
  get scratchEpoch(): number {
    return this._scratchEpoch;
  }
  /** Current shared scratch buffers. Null until first ensureScratch call. */
  get scratch(): SharedScratch | null {
    return this._scratch;
  }

  private constructor(
    /** Number of base points held by the pool. */
    readonly srsN: number,
    /** Montgomery-form x coordinates — `srsN` × 8×u32. */
    readonly poolX: GPUBuffer,
    /** Montgomery-form y coordinates — `srsN` × 8×u32. */
    readonly poolY: GPUBuffer,
    device: GPUDevice,
  ) {
    this.cache = new PipelineCache(device);
    this.pairCap = Math.ceil(srsN / 2) + 16;
    this._device = device;
  }

  /**
   * The SRS-pool bytes the budget gate charges as `srsBytes` — exactly
   * `poolX.size + poolY.size`, matching `estimateMem`'s `srsBytes` term (the
   * shared scratch/arena is counted separately as the working set, NOT here).
   * Use this — not {@link statsBytes} — to drive the multi-MSM packer's budget,
   * or the scratch double-counts into `srsBytes` once instances bind the pool.
   */
  srsBudgetBytes(): number {
    return this.poolX.size + this.poolY.size;
  }

  /**
   * GPU bytes the pool itself owns — the SRS point coordinates `poolX` +
   * `poolY` (the user's "points memory" line item) PLUS the shared scratch
   * buffers (the per-MSM working set, shared across all MsmV2 instances).
   * Pipelines and bind-group layouts cached in `this.cache` aren't counted
   * here; they're driver-managed shader objects, not allocated storage.
   */
  statsBytes(): number {
    let total = this.poolX.size + this.poolY.size;
    if (this._scratch) {
      const s = this._scratch;
      total += s.arenas.reduce((acc, a) => acc + a.size, 0); // arena-resident buffers, counted once per arena
      total += s.bufA.size + s.bufB.size;
      total += s.planMeta.size;
      total += s.pairBlockPlanRing[0].size + s.pairBlockPlanRing[1].size;
      total += s.scatterPlanRing[0].size + s.scatterPlanRing[1].size;
      total += s.carryPlanRing[0].size + s.carryPlanRing[1].size;
      total += s.countsBufs[0].size + s.countsBufs[1].size;
      total += s.offsetsBufs[0].size + s.offsetsBufs[1].size;
      total += s.prefScratchBuf.size;
      total += s.streamPlannerMeta.size;
      total += s.queueBuf.size + s.partialsBuf.size + s.partialBucketsList.size;
      total += s.accBuf.size + s.streamPrefScratch.size;
    }
    return total;
  }

  /**
   * Grow shared scratch buffers as needed to fit `dims`. Idempotent — if
   * every dimension already fits, no buffer is touched and `scratchEpoch`
   * stays put. If any dimension grows, the underlying buffers are destroyed
   * and reallocated at the new max, the pad-trio is re-written into the
   * fresh bufA/bufB, and `scratchEpoch` advances. Caller must consult
   * `scratchEpoch` afterward to detect when bind groups need rebuilding.
   *
   * `padPts` and `R` are the pad-trio point coordinates + Montgomery R
   * needed to refresh the pad slots on a bufA/bufB realloc.
   */
  ensureScratch(dims: ScratchDims, padPts: Pt[], R: bigint): SharedScratch {
    const device = this._device;
    const cur = this._maxDims;
    let grew = false;
    const grow = (cond: boolean, name: keyof ScratchDims): boolean => {
      if (cond) {
        cur[name] = dims[name];
        return true;
      }
      return false;
    };
    const sbuf = (bytes: number): GPUBuffer =>
      device.createBuffer({
        size: Math.max(bytes, 4),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
    const soaSize = (M: number): number => 2 * PG * M * 4 * 4;

    const s = this._scratch;
    let bufA = s?.bufA;
    let bufB = s?.bufB;
    let l0IdxBuf = s?.l0IdxBuf;
    let bucketAndSignBuf = s?.bucketAndSignBuf;
    let valIdxBuf = s?.valIdxBuf;
    let rowPtrBuf = s?.rowPtrBuf;
    let planMeta = s?.planMeta;
    let pairBlockPlanRing = s?.pairBlockPlanRing;
    let scatterPlanRing = s?.scatterPlanRing;
    let carryPlanRing = s?.carryPlanRing;
    let countsBufs = s?.countsBufs;
    let offsetsBufs = s?.offsetsBufs;
    let prefScratchBuf = s?.prefScratchBuf;
    let scalarsRawBuf = s?.scalarsRawBuf;
    let redBuf = s?.redBuf;
    let isPresentBuf = s?.isPresentBuf;
    let reducePrefScratch = s?.reducePrefScratch;

    // bufA/bufB depend on M1. They also need a pad-trio re-write whenever
    // they realloc, so we handle them together.
    if (!bufA || dims.M1 > cur.M1) {
      bufA?.destroy();
      bufB?.destroy();
      grow(true, 'M1');
      // Step 9 (Plan §14): pair-tree V2 buffers shrunk to 4 B — no longer
      // dispatched. ba_fused_super / ba_carry / ba_finalize bind groups
      // still reference them so the type/binding system stays happy, but
      // none of those pipelines run on the walker path.
      bufA = sbuf(4);
      bufB = sbuf(4);
      grew = true;
    }
    // l0IdxBuf must hold both the L0 input (l0Slots × 4) AND the transpose
    // partials matrix (batchWindows × num_point_tiles × BW × 4). Its size
    // is the max of those — caller passes the larger as `l0Slots`.
    if (!l0IdxBuf || dims.l0Slots > cur.l0Slots) {
      grow(true, 'l0Slots'); // sizes arena A0 (l0IdxBuf carved centrally)
      grew = true;
    }
    if (!bucketAndSignBuf || dims.batchSlots > cur.batchSlots) {
      grow(true, 'batchSlots'); // sizes the arena (bucketAndSign/valIdx carved centrally)
      grew = true;
    }
    if (!rowPtrBuf || dims.rowPtrLen > cur.rowPtrLen) {
      grow(true, 'rowPtrLen'); // sizes arena A1 (rowPtrBuf carved centrally)
      grew = true;
    }
    if (!planMeta || dims.planMetaLen > cur.planMetaLen) {
      planMeta?.destroy();
      grow(true, 'planMetaLen');
      planMeta = sbuf(cur.planMetaLen * 4);
      grew = true;
    }
    if (!pairBlockPlanRing || !scatterPlanRing || dims.totalPairBlocks > cur.totalPairBlocks) {
      pairBlockPlanRing?.forEach(b => b.destroy());
      scatterPlanRing?.forEach(b => b.destroy());
      grow(true, 'totalPairBlocks');
      const SmaxS = Math.max(cur.S, dims.S);
      cur.S = SmaxS;
      // Step 9: pair-tree V2 ring buffers shrunk — only the dead fused_super
      // pipeline reads them.
      pairBlockPlanRing = [sbuf(4), sbuf(4)];
      scatterPlanRing = [sbuf(4), sbuf(4)];
      grew = true;
    }
    if (!carryPlanRing || dims.totalCarries > cur.totalCarries) {
      carryPlanRing?.forEach(b => b.destroy());
      grow(true, 'totalCarries');
      // Step 9: shrunk — only the dead carry pipeline reads it.
      carryPlanRing = [sbuf(4), sbuf(4)];
      grew = true;
    }
    if (!countsBufs || !offsetsBufs || dims.batchBuckets > cur.batchBuckets) {
      countsBufs?.forEach(b => b.destroy());
      offsetsBufs?.forEach(b => b.destroy());
      grow(true, 'batchBuckets');
      countsBufs = [sbuf(cur.batchBuckets * 4), sbuf(cur.batchBuckets * 4)];
      offsetsBufs = [sbuf(cur.batchBuckets * 4), sbuf(cur.batchBuckets * 4)];
      grew = true;
    }
    if (!prefScratchBuf || dims.fusedTile > cur.fusedTile || dims.S > cur.S) {
      prefScratchBuf?.destroy();
      grow(true, 'fusedTile');
      const SmaxS = Math.max(cur.S, dims.S);
      cur.S = SmaxS;
      // Step 9: shrunk — only the dead fused_super pipeline reads it.
      prefScratchBuf = sbuf(4);
      grew = true;
    }
    if (!scalarsRawBuf || dims.scalarsBytes > cur.scalarsBytes) {
      grow(true, 'scalarsBytes'); // sizes arena A0 (scalarsRawBuf carved centrally)
      grew = true;
    }
    if (!redBuf || dims.redM > cur.redM) {
      grow(true, 'redM'); // sizes arena A1 (redBuf + isPresentBuf carved centrally)
      grew = true;
    }
    if (!reducePrefScratch || dims.reducePrefBytes > cur.reducePrefBytes) {
      grow(true, 'reducePrefBytes'); // sizes arena A0 (reducePrefScratch carved centrally)
      grew = true;
    }

    // Streaming planner + accumulator buffers.
    const sT = dims.streamNumThreads || STREAM_NUM_THREADS;
    const sS = dims.streamS || 8;
    const sBTotal = dims.bTotal || 1;
    const sRadixTiles = dims.streamRadixTiles || 1;
    const sMaxQ = dims.streamQueueEntries || 1;
    const sQHeaderLen = 2 * sT;
    const ibuf = (bytes: number): GPUBuffer =>
      device.createBuffer({
        size: Math.max(bytes, 4),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.INDIRECT,
      });
    let streamPlannerMeta = s?.streamPlannerMeta;
    let size1BucketList = s?.size1BucketList;
    let denseBucketList = s?.denseBucketList;
    let denseCountList = s?.denseCountList;
    let sortedBucketList = s?.sortedBucketList;
    let sortedCountList = s?.sortedCountList;
    let radixHist = s?.radixHist;
    let cumulativeAdds = s?.cumulativeAdds;
    let wgCuts = s?.wgCuts;
    let threadCuts = s?.threadCuts;
    let queueBuf = s?.queueBuf;
    let partialsBuf = s?.partialsBuf;
    let partialBucketsList = s?.partialBucketsList;
    let accBuf = s?.accBuf;
    let streamPrefScratch = s?.streamPrefScratch;
    // Stream-walker buffers (Plan §3.1 + KNOB 2).
    let taskCuts = s?.taskCuts;
    let walkerPartials = s?.walkerPartials;
    let walkerPartialDest = s?.walkerPartialDest;
    let partialCount = s?.partialCount;
    let partialOffset = s?.partialOffset;
    let partialWritePos = s?.partialWritePos;
    let partialLayout = s?.partialLayout;
    let activeBuckets = s?.activeBuckets;
    let activeCount = s?.activeCount;
    let countHistogram = s?.countHistogram;
    let binOffsets = s?.binOffsets;
    let binWritePos = s?.binWritePos;
    let sortedActiveBuckets = s?.sortedActiveBuckets;
    let ptScratch = s?.ptScratch;
    let ptAlloc = s?.ptAlloc;
    let ptDispatchArgs = s?.ptDispatchArgs;
    let ptOff = s?.ptOff;
    let ptCount = s?.ptCount;
    let ptMeta = s?.ptMeta;
    let ptTasks = s?.ptTasks;
    let ptTotalTasks = s?.ptTotalTasks;
    let ptCombineDispatchArgs = s?.ptCombineDispatchArgs;
    let ptBuildLoopArgs = s?.ptBuildLoopArgs;
    let cbDispatchArgs = s?.cbDispatchArgs;
    let ptPersistentDispatchArgs = s?.ptPersistentDispatchArgs;
    let ptBucketWg = s?.ptBucketWg;
    let ptWgMeta = s?.ptWgMeta;
    let ptWgBucketList = s?.ptWgBucketList;
    let ptWgBucketStarts = s?.ptWgBucketStarts;
    let ptChunks = s?.ptChunks;
    let ptChunksTotal = s?.ptChunksTotal;
    let arenas = s?.arenas;
    // --- Arenas (ARENA_LAYOUT.md §1): one GPU buffer per colour, sized to
    // high-water (recreated only when a colour grows), carved every call so the
    // slots always reference the live arenas. Colour-mates are never co-bound
    // with mismatched ro/rw access (the WebGPU usage-scope rule). Created before
    // the grow blocks so buffers in any block can carve from them. ---
    const ARENA_ALIGN = 256;
    const alignArena = (b: number): number => Math.ceil(Math.max(b, 4) / ARENA_ALIGN) * ARENA_ALIGN;
    const NUM_ARENAS = 6;
    // High-water bytes per colour, from the shared model that also drives the
    // budget gate in prepare(). The carve() order below must match the
    // per-colour term order inside arenaColourSizes term-for-term.
    const reqArena = arenaColourSizes({
      sT,
      sS,
      sBTotal,
      sRadixTiles,
      batchSlots: cur.batchSlots,
      redM: cur.redM,
      rowPtrLen: cur.rowPtrLen,
      reducePrefBytes: cur.reducePrefBytes,
      scalarsBytes: cur.scalarsBytes,
      l0Slots: cur.l0Slots,
    });
    if (!arenas || reqArena.some((r, c) => r > (arenas![c]?.size ?? 0))) {
      const prevArenas = arenas;
      arenas = reqArena.map((r, c) =>
        device.createBuffer({
          size: Math.max(r, prevArenas?.[c]?.size ?? 0, 4),
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        }),
      );
      prevArenas?.forEach(a => a.destroy());
      grew = true;
    }
    const arenaOff = new Array<number>(NUM_ARENAS).fill(0);
    const carve = (color: number, b: number): GPUBufferBinding => {
      const size = Math.max(b, 4);
      const offset = arenaOff[color];
      arenaOff[color] += alignArena(size);
      return { buffer: arenas![color], offset, size };
    };
    // Carve order per colour must match the reqArena[] sum order above.
    radixHist = carve(3, sRadixTiles * 256 * 4);
    threadCuts = carve(3, sT * 2 * 4);
    walkerPartials = carve(3, 10 * sT * sS * 16);
    countHistogram = carve(3, 64 * 4);
    ptOff = carve(3, sBTotal * 4);
    ptScratch = carve(4, 512 * sT * sS);
    sortedBucketList = carve(4, sBTotal * 4);
    wgCuts = carve(4, MAX_STREAM_WORKGROUPS * 2 * 4);
    partialOffset = carve(5, (sBTotal + 1) * 4);
    sortedActiveBuckets = carve(5, sBTotal * 4);
    partialCount = carve(2, sBTotal * 4);
    partialLayout = carve(2, 2 * sT * sS * 4);
    size1BucketList = carve(2, sBTotal * 2 * 4);
    taskCuts = carve(2, sT * (sS + 1) * 2 * 4);
    valIdxBuf = carve(2, cur.batchSlots * 4);
    bucketAndSignBuf = carve(1, cur.batchSlots * 4);
    denseBucketList = carve(1, sBTotal * 4);
    denseCountList = carve(1, sBTotal * 4);
    binWritePos = carve(1, 64 * 4);
    cumulativeAdds = carve(1, sBTotal * 4);
    ptCount = carve(1, sBTotal * 4);
    ptMeta = carve(1, 16);
    ptTasks = carve(1, 2 * sT * sS * 16);
    ptTotalTasks = carve(1, 4);
    walkerPartialDest = carve(1, 2 * sT * sS * 4);
    rowPtrBuf = carve(1, cur.rowPtrLen * 4);
    isPresentBuf = carve(1, cur.redM * 4);
    redBuf = carve(1, soaSize(cur.redM));
    activeBuckets = carve(0, sBTotal * 4);
    activeCount = carve(0, 4);
    binOffsets = carve(0, 64 * 4);
    partialWritePos = carve(0, sBTotal * 4);
    reducePrefScratch = carve(0, cur.reducePrefBytes);
    sortedCountList = carve(0, sBTotal * 4);
    scalarsRawBuf = carve(0, cur.scalarsBytes);
    l0IdxBuf = carve(0, cur.l0Slots * 4);
    if (!streamPlannerMeta || dims.bTotal > cur.bTotal || dims.streamNumThreads > cur.streamNumThreads) {
      streamPlannerMeta?.destroy();
      queueBuf?.destroy();
      partialsBuf?.destroy();
      partialBucketsList?.destroy();
      accBuf?.destroy();
      streamPrefScratch?.destroy();
      ptAlloc?.destroy();
      ptDispatchArgs?.destroy();
      ptCombineDispatchArgs?.destroy();
      ptBuildLoopArgs?.destroy();
      cbDispatchArgs?.destroy();
      ptPersistentDispatchArgs?.destroy();
      ptBucketWg?.destroy();
      ptWgMeta?.destroy();
      ptWgBucketList?.destroy();
      ptWgBucketStarts?.destroy();
      ptChunks?.destroy();
      ptChunksTotal?.destroy();
      grow(dims.streamNumThreads > cur.streamNumThreads, 'streamNumThreads');
      grow(dims.streamS > cur.streamS, 'streamS');
      grow(dims.streamQueueEntries > cur.streamQueueEntries, 'streamQueueEntries');
      grow(dims.streamRadixTiles > cur.streamRadixTiles, 'streamRadixTiles');
      streamPlannerMeta = ibuf(Math.max((20 + sT) * 4, 256));
      // Step 9: legacy stream-accum buffers shrunk — only the dead
      // ba_stream_accum / ba_partial_sum / ba_planner_emit / ba_emit_fixup /
      // ba_debug_accum / ba_recompute_split pipelines reference these.
      // Walker uses taskCuts + walkerPartials + walkerPartialDest instead.
      queueBuf = sbuf(4);
      partialsBuf = sbuf(4);
      partialBucketsList = sbuf(4);
      accBuf = sbuf(4);
      streamPrefScratch = sbuf(4);
      // Stream-walker allocations (KNOB 2 — per C's variant).
      //   taskCuts:   (S+1) cut points/thread × 2 u32 = (sS+1) × 2 × 4 B/thread
      //   walkerPartials: 2*S slots/thread × PG × 2 vec4 (split-start + task-end)
      //   walkerPartialDest: 2*S u32/thread (bucket_id per partial slot)
      // walkerPartials = partials region (8*sT*sS vec4) + pref tail (2*sT*sS vec4)
      // = 10*sT*sS vec4 × 16 B = 160*sT*sS bytes. Coalesced pref layout requires
      // the pref tail to live in the same buffer.
      // Pair-tree scratch. Worst-case sum(2N over hot) = 2 × total partials
      // emitted = 2 × (2 * T * S). Each scratch slot stores 1 partial = 2
      // vec4 X + 2 vec4 Y (plane-separated, M_scratch = max slots).
      //   buffer bytes = 2 (planes) × M_scratch × PG × 16 bytes
      //   M_scratch    = 2 × (2 * T * S)
      // → buffer = 2 × 4 * T * S × 2 × 16 = 256 * T * S bytes.
      // For T=8192, S=8 → 16 MB.
      // pt_buf: pair-tree v2 holds level-k partials past level-(k-1)'s in a
      // shift layout. Per-bucket exact slots = N + ceil(N/2) + ceil(N/4) +
      // ... ≤ 2N + log2(N). Sum across hot buckets ≤ 2·total + NUM_HOT·17.
      // 4× M_partials_walker is the safe ceiling — bumping past 16 MB to 32.
      ptAlloc = sbuf(4);
      // Indirect dispatch args (x, y, z) written by sortScan and consumed by
      // the pair-tree dispatchWorkgroupsIndirect. Needs INDIRECT usage.
      ptDispatchArgs = device.createBuffer({
        size: 12,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      // pt_tasks: bound by max tasks at level 0 = sum(ceil(N_i / 2)) ≤
      // total_partials/2 + NUM_HOT ≤ M_partials_walker. Each task = vec4<u32>.
      ptCombineDispatchArgs = device.createBuffer({
        size: 12,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      ptBuildLoopArgs = device.createBuffer({
        size: 12,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      cbDispatchArgs = device.createBuffer({
        size: 12,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      ptPersistentDispatchArgs = device.createBuffer({
        size: 12,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      // Packer outputs. MAX_WGS = 64 caps the bin-packing.
      ptBucketWg = sbuf(sBTotal * 4);
      ptWgMeta = sbuf(64 * 4 * 4);
      ptWgBucketList = sbuf(sBTotal * 4);
      ptWgBucketStarts = sbuf((64 + 1) * 4);
      // Chunk-pass scratch. Max chunks at pass 0 ≤ M_partials_walker /
      // CHUNK_SIZE; subsequent passes shrink by CHUNK_SIZE each step.
      // Allocate 2 × that for safety. Per-chunk descriptor = vec4<u32> = 16 B.
      ptChunks = sbuf(2 * sT * sS * 2);
      ptChunksTotal = sbuf(4);
      grew = true;
    }

    // Pad-trio layout in bufA/bufB. Recompute whenever bufA's size changed.
    const planeBytes = cur.M1 * PG * 16;
    const padBytesPerPlane = 3 * PG * 16;
    const padXOffset = planeBytes - padBytesPerPlane;
    const padYOffset = planeBytes + planeBytes - padBytesPerPlane;

    const newScratch: SharedScratch = {
      bufA: bufA!,
      bufB: bufB!,
      l0IdxBuf: l0IdxBuf!,
      bucketAndSignBuf: bucketAndSignBuf!,
      valIdxBuf: valIdxBuf!,
      rowPtrBuf: rowPtrBuf!,
      planMeta: planMeta!,
      pairBlockPlanRing: pairBlockPlanRing!,
      scatterPlanRing: scatterPlanRing!,
      carryPlanRing: carryPlanRing!,
      countsBufs: countsBufs!,
      offsetsBufs: offsetsBufs!,
      prefScratchBuf: prefScratchBuf!,
      scalarsRawBuf: scalarsRawBuf!,
      redBuf: redBuf!,
      isPresentBuf: isPresentBuf!,
      reducePrefScratch: reducePrefScratch!,
      streamPlannerMeta: streamPlannerMeta!,
      size1BucketList: size1BucketList!,
      denseBucketList: denseBucketList!,
      denseCountList: denseCountList!,
      sortedBucketList: sortedBucketList!,
      sortedCountList: sortedCountList!,
      radixHist: radixHist!,
      cumulativeAdds: cumulativeAdds!,
      wgCuts: wgCuts!,
      threadCuts: threadCuts!,
      queueBuf: queueBuf!,
      partialsBuf: partialsBuf!,
      partialBucketsList: partialBucketsList!,
      accBuf: accBuf!,
      streamPrefScratch: streamPrefScratch!,
      taskCuts: taskCuts!,
      walkerPartials: walkerPartials!,
      walkerPartialDest: walkerPartialDest!,
      partialCount: partialCount!,
      partialOffset: partialOffset!,
      partialWritePos: partialWritePos!,
      partialLayout: partialLayout!,
      activeBuckets: activeBuckets!,
      activeCount: activeCount!,
      countHistogram: countHistogram!,
      binOffsets: binOffsets!,
      binWritePos: binWritePos!,
      sortedActiveBuckets: sortedActiveBuckets!,
      arenas: arenas!,
      ptScratch: ptScratch!,
      ptAlloc: ptAlloc!,
      ptDispatchArgs: ptDispatchArgs!,
      ptOff: ptOff!,
      ptCount: ptCount!,
      ptMeta: ptMeta!,
      ptTasks: ptTasks!,
      ptTotalTasks: ptTotalTasks!,
      ptCombineDispatchArgs: ptCombineDispatchArgs!,
      ptBuildLoopArgs: ptBuildLoopArgs!,
      cbDispatchArgs: cbDispatchArgs!,
      ptPersistentDispatchArgs: ptPersistentDispatchArgs!,
      ptBucketWg: ptBucketWg!,
      ptWgMeta: ptWgMeta!,
      ptWgBucketList: ptWgBucketList!,
      ptWgBucketStarts: ptWgBucketStarts!,
      ptChunks: ptChunks!,
      ptChunksTotal: ptChunksTotal!,
      planeBytes,
      padBytesPerPlane,
      padXOffset,
      padYOffset,
      poolM1: cur.M1,
    };

    if (grew) {
      // Step 9: pad-trio writeBuffer to bufA/bufB removed. Those writes
      // populated the V2 pair-tree's IDLE-anchor slots at [M1-3..M1-1] of
      // each plane in bufA, read by the dead fused_super / carry / finalize
      // pipelines. The walker reads its IDLE anchor through
      // l0_index[batchSlots] → point_x/point_y[pt_idx] instead, and
      // batchSlots is written by MsmV2.prepare on every run.
      this._scratch = newScratch;
      this._scratchEpoch++;
    } else {
      this._scratch = newScratch;
    }
    return newScratch;
  }

  /**
   * Upload the canonical SRS and GPU-convert it into the Montgomery point pool.
   * `srsCanonicalBytes` is `srsN × 64` little-endian bytes —
   * `[x0[32] || y0[32] || x1[32] || ...]`, non-Montgomery affine. `srsN` may be
   * any positive integer; the conversion is one `convert_points_only` dispatch
   * (same canonical→Montgomery field multiply MsmV2's pipeline expects, run
   * once for the whole SRS), and its bounds guard discards threads whose
   * `id >= srsN`.
   */
  static async create(device: GPUDevice, srsCanonicalBytes: Uint8Array): Promise<MsmV2Pool> {
    const srsN = srsCanonicalBytes.byteLength / 64;
    if (!Number.isInteger(srsN) || srsN <= 0) {
      throw new Error(`MsmV2Pool.create: byte length ${srsCanonicalBytes.byteLength} is not a positive multiple of 64`);
    }

    // convert_points_only reads the raw input from two storage buffers (its
    // first_half / second_half bindings); split by point count. For odd
    // srsN the two halves are floor(srsN/2) and ceil(srsN/2) entries.
    const halfBytes = (srsN >> 1) * 64;
    const firstHalf = device.createBuffer({
      size: Math.max(4, halfBytes),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const secondHalf = device.createBuffer({
      size: Math.max(4, srsCanonicalBytes.byteLength - halfBytes),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(firstHalf, 0, srsCanonicalBytes as BufferSource, 0, halfBytes);
    device.queue.writeBuffer(
      secondHalf,
      0,
      srsCanonicalBytes as BufferSource,
      halfBytes,
      srsCanonicalBytes.byteLength - halfBytes,
    );

    // Montgomery-form pool: 8×u32 (32 bytes) per coordinate. Exactly srsN
    // slots — no over-allocation for non-power-of-two srsN.
    const poolBytes = srsN * 32;
    const poolUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    const poolX = device.createBuffer({ size: poolBytes, usage: poolUsage });
    const poolY = device.createBuffer({ size: poolBytes, usage: poolUsage });

    // Workgroup shape: pick (workgroup_size, numXWorkgroups) on the same
    // tier table as before for occupancy; numYWorkgroups rounds up to cover
    // srsN with extra threads no-oping via the shader's bounds guard. Same
    // exact totals on power-of-two srsN (no regression); the only overshoot
    // is on non-PoT inputs, where it's at most one extra y-row.
    let workgroupSize: number;
    let numXWorkgroups: number;
    if (srsN <= 256) {
      workgroupSize = 256;
      numXWorkgroups = 1;
    } else if (srsN <= 32768) {
      workgroupSize = 64;
      numXWorkgroups = 4;
    } else {
      workgroupSize = 256;
      numXWorkgroups = srsN <= 131072 ? 8 : 32;
    }
    const numYWorkgroups = Math.max(1, Math.ceil(srsN / (workgroupSize * numXWorkgroups)));

    // The pool's one-shot convert pipeline doesn't go through the cache —
    // it's only run once per pool, and its dispatch shape is data-dependent
    // (workgroup_size / numYWorkgroups), so caching wouldn't help.
    const pool = new MsmV2Pool(srsN, poolX, poolY, device);

    const sm = new ShaderManager(4, srsN, BN254_CURVE_CONFIG, false);
    const code = sm.gen_convert_points_only_shader(workgroupSize, numYWorkgroups, /* packed */ true);
    const layout = pool.cache.getLayout(['read-only-storage', 'read-only-storage', 'storage', 'storage', 'uniform']);
    const pipeline = await pool.cache.getPipeline(code, layout, 'convert-points-pool');

    const params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(params, 0, new Uint32Array([srsN, 0, 0, 0]));
    const bind = device.createBindGroup({
      layout,
      entries: [firstHalf, secondHalf, poolX, poolY, params].map((buffer, binding) => ({
        binding,
        resource: { buffer },
      })),
    });

    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(numXWorkgroups, numYWorkgroups, 1);
    pass.end();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();

    firstHalf.destroy();
    secondHalf.destroy();
    params.destroy();
    return pool;
  }

  /** Free the pool's GPU buffers — the SRS (poolX/Y) and the shared
   * scratch (every buffer in `_scratch`, if allocated). */
  destroy(): void {
    this.poolX.destroy();
    this.poolY.destroy();
    if (this._scratch) {
      const s = this._scratch;
      s.arenas.forEach(a => a.destroy()); // arena-resident scratch (valIdxBuf, ptScratch, …)
      s.bufA.destroy();
      s.bufB.destroy();
      s.planMeta.destroy();
      s.pairBlockPlanRing[0].destroy();
      s.pairBlockPlanRing[1].destroy();
      s.scatterPlanRing[0].destroy();
      s.scatterPlanRing[1].destroy();
      s.carryPlanRing[0].destroy();
      s.carryPlanRing[1].destroy();
      s.countsBufs[0].destroy();
      s.countsBufs[1].destroy();
      s.offsetsBufs[0].destroy();
      s.offsetsBufs[1].destroy();
      s.prefScratchBuf.destroy();
      this._scratch = null;
    }
  }
}

/** One packed member for {@link MsmV2.prepareBatch}: a slice of the concatenated
 *  scalars + its place in the global window space. */
export interface BatchMember {
  /** Point count (homogeneous pack ⇒ same for every member). */
  n: number;
  /** Byte offset of this member's scalars in the concatenated scalars buffer. */
  scalarBaseBytes: number;
  /** Index of this member's first window in the concatenated window space. */
  schedOff: number;
  /** This member's window count. */
  numWindows: number;
}

/** Batch-prepare context (set by {@link MsmV2.prepareBatch}, consumed by the
 *  `prepare()` injection points). Drives the homogeneous super-MSM: one MsmV2
 *  sized to the concatenated union, dispatched once over `Σ NW` global windows.
 *  Null for the single-MSM path, whose behaviour is therefore unchanged. */
interface BatchPrepCtx {
  /** `Σ NW_k` — the concatenated window count (becomes `this.numWindows`). */
  numWindows: number;
  /** `Σ bTotal_k` — concatenated CSR/bucket columns (becomes `this.bTotal`). */
  bTotal: number;
  /** `Σ redM_k` — concatenated red_buf slots (becomes `this.redM` + the M_RED uniform). */
  redM: number;
  /** Pre-built global WindowDesc rows (stride-8 u32), one per global window. */
  windowDescTable: Uint32Array;
  /** Global reduce_off per global window (red_buf slot base for the gather/reduce). */
  reduceOffsets: number[];
  /** Per-global-window scatter-base prefix (Σ n_w), length `Σ NW + 1`. Absent ⇒
   *  uniform n (the homogeneous union, where w·n suffices). Present ⇒ members of
   *  different n pack with no padding. */
  pointOffsets?: Uint32Array;
  /** Σ n_w — the concatenated point/scatter total (the scatter working-set size). */
  totalPoints?: number;
  members: BatchMember[];
}

/**
 * The memory-bounded v2 pair-tree GPU MSM. See the file header for the
 * create / prepare / run lifecycle.
 */
export class MsmV2 {
  // --- create-time (data-independent) state ---
  private device!: GPUDevice;
  // The pool that owns the SRS, the pipeline cache, and the shared scratch
  // buffers this instance binds against. Held by reference; not destroyed
  // by MsmV2.destroy() (the pool outlives any individual instance).
  private pool!: MsmV2Pool;
  private n!: number;
  /** Pippenger window bit width, picked by `pickC(n)`. Public so the
   *  bridge can ship it back to the C++ Horner combine. */
  c!: number;
  /** Per-window widths. Uniform = [c, c, …]; the varSched fixture fills it with
   *  the two-region schedule. Drives the WindowDesc fill and the host combine. */
  private windowCs!: number[];
  /** split-c (Phase 1): build the MSB histogram + run the variable-window decision. */
  private splitC = false;
  private sparseReduce = false;
  private reduceSparsePipe?: GPUComputePipeline;
  private reduceSparseLayout?: GPUBindGroupLayout;
  private reduceSparseBind?: GPUBindGroup;
  /** split-c test hook: force a split at [b_star, c_lo, c_hi], bypassing the cost model. */
  private forceSplit?: [number, number, number];
  /** Reduce-cost weight (alphaBucket) for the split decision. Default 4 (dense reduce). */
  private reduceCostWeight = 4;
  /** Max lower-region window width the split decision may pick (0 = pickC(n)). */
  private maxCLo = 0;
  /** Number of Pippenger windows = ceil(NUMBITS / c). Public — the bridge
   *  reads it when packing per-MSM staging buffers. */
  numWindows!: number;
  private BW!: number;
  private bTotal!: number;
  private R!: bigint;
  private rinv!: bigint;
  // --- tuning knobs (from MsmConfig; resolved in create) ---
  private s!: number;
  private wgi!: number;
  private l0Log!: number;
  private reduceWg!: number;
  private invVariant!: 'loop' | 'pk';
  private montmul!: MontMulVariant;
  private addsub: 'native' | 'unpack' = 'native';
  private profile = false;
  private jacobianCrossover = 0;
  private combineOnHost = true;
  private numBatchesForce = 0; // 0 = budget-driven; >0 forces ≥ this many window-batches (testing/packing)
  private memBudget = MEM_BUDGET; // GPU-buffer budget driving the sT cap + window-batch staging
  private stride!: number; // reduction STRIDE = 2^(c-1)
  private redM!: number;
  private pointXBuf!: GPUBuffer;
  private pointYBuf!: GPUBuffer;
  private padPts!: Pt[];
  private reducePasses!: { isDouble: boolean; shaderPhase: number; p2x: number; p2y: number; ppw: number }[];
  // pipelines
  private plannerAPipe!: GPUComputePipeline;
  private plannerBPipe!: GPUComputePipeline;
  private fusedPipe!: GPUComputePipeline;
  private carryPipe!: GPUComputePipeline;
  private finalizePipe!: GPUComputePipeline;
  private fusedPipeL0!: GPUComputePipeline;
  private carryPipeL0!: GPUComputePipeline;
  private finalizePipeL0!: GPUComputePipeline;
  private decomposePipe!: GPUComputePipeline;
  private msbHistPipe!: GPUComputePipeline;
  private msbDecidePipe!: GPUComputePipeline;
  private msbIdxLargePipe!: GPUComputePipeline;
  private decomposeUpperPipe!: GPUComputePipeline;
  private xposeScatterUpperPipe!: GPUComputePipeline;
  private xposeCountPipe!: GPUComputePipeline;
  private xposeReducePipe!: GPUComputePipeline;
  private xposeScanPipe!: GPUComputePipeline;
  private xposeScatterPipe!: GPUComputePipeline;
  private convActivePipe!: GPUComputePipeline;
  private convMetaPipe!: GPUComputePipeline;
  private reduceLevelPipes: GPUComputePipeline[] = [];
  // Streaming planner + accumulator pipelines
  private classifyPipe!: GPUComputePipeline;
  private metaFixupPipe!: GPUComputePipeline;
  private radixCountPipe!: GPUComputePipeline;
  private radixScanPipe!: GPUComputePipeline;
  private radixScatterPipe!: GPUComputePipeline;
  private cumsumPipe!: GPUComputePipeline;
  private partitionWgPipe!: GPUComputePipeline;
  private partitionThreadPipe!: GPUComputePipeline;
  private size1Pipe!: GPUComputePipeline;
  // Streaming bind groups (built in prepare, rebuilt on epoch change)
  private classifyBinds!: GPUBindGroup[];
  private metaFixupBind!: GPUBindGroup;
  private radixCountBinds!: [GPUBindGroup, GPUBindGroup, GPUBindGroup]; // ping-pong per pass
  private radixScanBind!: GPUBindGroup;
  private radixScatterBinds!: [GPUBindGroup, GPUBindGroup, GPUBindGroup];
  private cumsumBind!: GPUBindGroup;
  private partitionWgBind!: GPUBindGroup;
  private partitionThreadBind!: GPUBindGroup;
  private size1Binds: GPUBindGroup[] = [];
  private streamNumThreads = STREAM_NUM_THREADS;
  private maxPlannerWorkgroups = MAX_STREAM_WORKGROUPS;
  private streamS = 8;
  private numRadixTiles = 1;
  // layouts (needed by prepare to build bind groups)
  private plannerALayout!: GPUBindGroupLayout;
  private plannerBLayout!: GPUBindGroupLayout;
  private fusedLayout!: GPUBindGroupLayout;
  private fusedLayoutL0!: GPUBindGroupLayout;
  private carryLayout!: GPUBindGroupLayout;
  private carryLayoutL0!: GPUBindGroupLayout;
  private finalizeLayout!: GPUBindGroupLayout;
  private finalizeLayoutL0!: GPUBindGroupLayout;
  private decomposeLayout!: GPUBindGroupLayout;
  private msbHistLayout!: GPUBindGroupLayout;
  private msbDecideLayout!: GPUBindGroupLayout;
  private msbIdxLargeLayout!: GPUBindGroupLayout;
  private decomposeUpperLayout!: GPUBindGroupLayout;
  private scatterUpperLayout!: GPUBindGroupLayout;
  private xposeCountLayout!: GPUBindGroupLayout;
  private xposeReduceLayout!: GPUBindGroupLayout;
  private xposeScanLayout!: GPUBindGroupLayout;
  private xposeScatterLayout!: GPUBindGroupLayout;
  private convActiveLayout!: GPUBindGroupLayout;
  private convMetaLayout!: GPUBindGroupLayout;
  private reduceLevelLayout!: GPUBindGroupLayout;
  // Streaming layouts
  private classifyLayout!: GPUBindGroupLayout;
  private metaFixupLayout!: GPUBindGroupLayout;
  private radixCountLayout!: GPUBindGroupLayout;
  private radixScanLayout!: GPUBindGroupLayout;
  private radixScatterLayout!: GPUBindGroupLayout;
  private cumsumLayout!: GPUBindGroupLayout;
  private partitionWgLayout!: GPUBindGroupLayout;
  private partitionThreadLayout!: GPUBindGroupLayout;
  private size1Layout!: GPUBindGroupLayout;
  // Stream-walker (Plan §6 + C's KNOB 2 variant).
  private partitionTaskPipe!: GPUComputePipeline;
  private partitionTaskLayout!: GPUBindGroupLayout;
  private partitionTaskBind!: GPUBindGroup;
  private streamWalkerPipe!: GPUComputePipeline;
  private streamWalkerLayout!: GPUBindGroupLayout;
  private streamWalkerBinds: GPUBindGroup[] = [];
  // Optimal walker_combine pipeline (5 kernels).
  private combineCountPipe!: GPUComputePipeline;
  private combineCountLayout!: GPUBindGroupLayout;
  private combineCountBind!: GPUBindGroup;
  private combineScanPipe!: GPUComputePipeline;
  private combineScanLayout!: GPUBindGroupLayout;
  private combineScanBind!: GPUBindGroup;
  private combineScatterPipe!: GPUComputePipeline;
  private combineScatterLayout!: GPUBindGroupLayout;
  private combineScatterBind!: GPUBindGroup;
  private combineFilterPipe!: GPUComputePipeline;
  private combineFilterLayout!: GPUBindGroupLayout;
  private combineFilterBinds: GPUBindGroup[] = [];
  private combineBatchedPipe!: GPUComputePipeline;
  private combineBatchedLayout!: GPUBindGroupLayout;
  private combineBatchedBinds: GPUBindGroup[] = [];
  private sortCountPipe!: GPUComputePipeline;
  private sortCountLayout!: GPUBindGroupLayout;
  private sortCountBind!: GPUBindGroup;
  private sortScanPipe!: GPUComputePipeline;
  private sortScanLayout!: GPUBindGroupLayout;
  private sortScanBind!: GPUBindGroup;
  private sortScatterPipe!: GPUComputePipeline;
  private sortScatterLayout!: GPUBindGroupLayout;
  private sortScatterBind!: GPUBindGroup;
  private ptInitScanPipe!: GPUComputePipeline;
  private ptInitScanLayout!: GPUBindGroupLayout;
  private ptInitScanBind!: GPUBindGroup;
  private ptInitCopyPipe!: GPUComputePipeline;
  private ptInitCopyLayout!: GPUBindGroupLayout;
  private ptInitCopyBind!: GPUBindGroup;
  private ptBuildPipe!: GPUComputePipeline;
  private ptBuildLayout!: GPUBindGroupLayout;
  private ptBuildBind!: GPUBindGroup;
  private ptDispatchChainPipe!: GPUComputePipeline;
  private ptDispatchChainLayout!: GPUBindGroupLayout;
  private ptDispatchChainBind!: GPUBindGroup;
  private ptCombinePipe!: GPUComputePipeline;
  private ptCombineLayout!: GPUBindGroupLayout;
  private ptCombineBind!: GPUBindGroup;
  private ptFinalizePipe!: GPUComputePipeline;
  private ptFinalizeLayout!: GPUBindGroupLayout;
  private ptFinalizeBinds: GPUBindGroup[] = [];

  // --- prepare-time (data-dependent) state ---
  private prepBuffers: GPUBuffer[] = []; // every uniform buffer prepare() allocated (storage buffers live in pool.scratch)
  // Bumped by MsmV2Pool.scratchEpoch when the pool's shared scratch
  // reallocates. We compare against pool.scratchEpoch on every prepare; if
  // they differ, our bind groups point to dead buffers and we re-enter the
  // slow path even when the data-dependent caps would have allowed a fast-
  // path uniform rewrite. -1 = no scratch yet bound.
  private boundEpoch: number = -1;
  private preparedFor: Uint8Array | null = null; // scalarsBuf identity cache key
  private preparedSrsOffset: number = -1; // srsOffset used by the last prepare

  // Saved state from the first prepare() — used to detect "fits in the
  // already-allocated buffers" on subsequent calls. When a later prepare's
  // plan is bounded above by every one of these values, the fast-path
  // rewrites scalars + per-level / per-tile uniforms in-place instead of
  // destroying and re-creating every GPU buffer and bind group (which
  // dominates wall time at ~150 ms per MSM on M4 Pro). Reset to null on
  // destroy() and on a fit-failure rebuild.
  private capM1: number = 0;
  private capTotalPairBlocks: number = 0;
  private capTotalCarries: number = 0;
  private capLevels: number = 0;
  private capNumBatches: number = 0;
  private capMAXC: number = 0;
  // numWindows the cached buffers were sized for. split-c can change numWindows
  // between prepares (warmup decides no-split, a later prepare splits), so the
  // fast path MUST rebind when it differs or the gather/redStaging (sized to the
  // old numWindows) overflow → gpu=0.
  private capNumWindows: number = 0;
  // Whether the cached buffers/binds were built for a region-split prepare. The
  // fast path only re-uploads scalars — it does NOT refresh idx_large (the
  // scalar-specific compacted large-scalar indices), the upper decompose's
  // nLarge uniforms, or the tight reduceGroups. So a region-split prepare can
  // never share the fast path with a different scalar set: force the slow rebuild
  // whenever either the cached or the incoming prepare is region-split.
  private capRegionSplit = false;
  // Pair-block tile size (derived from capTotalPairBlocks); persists so run()
  // can skip dispatching tiles past the current plan's totalPairBlocks.
  private fusedTileSize: number = 0;
  private numBatches = 1;
  private batchWindows = 0;
  // Non-null only during a prepareBatch() call: makes prepare() build the
  // concatenated super-MSM (union of K homogeneous members) instead of a single
  // MSM. Every consumer is `if (this.batchCtx)`-guarded, so the single-MSM path
  // is byte-identical. See prepareBatch().
  private batchCtx: BatchPrepCtx | null = null;
  private levels = 0;
  private nXposePts = 0;
  // Number of point-tiles the transpose dispatches across (the X dimension
  // of the count/scatter dispatches). The n points of each window are
  // partitioned into `transposeNumPointTiles` tiles of ~`pointsPerTile` each
  // so the count/scatter kernels saturate the GPU instead of running one
  // workgroup per window.
  private transposeNumPointTiles = 1;
  private nReduceInit = 0;
  private numWgsFinalize = 0;
  private rowPtrBuf!: ScratchSlot; // cleared each batch by run()
  private redBuf!: ScratchSlot; // gathered + decoded by run()
  private redStaging!: GPUBuffer; // small mappable L_w gather target
  // profiling (created in prepare when this.profile)
  private querySet: GPUQuerySet | null = null;
  private tsResolveBuf: GPUBuffer | null = null;
  private tsStagingBuf: GPUBuffer | null = null;
  private passCount = 0;
  private passPhases: string[] = [];
  private decomposeBinds!: GPUBindGroup[];
  // split-c MSB histogram (Phase 1). msbHistBuf: 256 u32 bins; msbPerScalarBuf:
  // n u32 (per-scalar msb, 255 sentinel for zero — reused by Phase 2 idx_large).
  private msbHistBind?: GPUBindGroup;
  private msbHistBuf?: GPUBuffer;
  private msbPerScalarBuf?: GPUBuffer;
  // split-c decide kernel (Phase 2). Writes a dedicated WindowDesc + a 16-u32
  // schedule summary; validated by readback against buildWindowDescReference.
  private msbDecideBind?: GPUBindGroup;
  private decideWindowDescBuf?: GPUBuffer;
  private decideSummaryBuf?: GPUBuffer;
  // split-c idx_large compaction (Phase 2B). idx_large holds the upper-region
  // scalar indices (msb >= b_star-1); count ends == decide summary n_large.
  private msbIdxLargeBind?: GPUBindGroup;
  private idxLargeBuf?: GPUBuffer;
  private idxLargeCountBuf?: GPUBuffer;
  // split-c region-split (Phase 2C-ii): when the schedule splits and numBatches==1,
  // the upper W_hi windows iterate only n_large compacted points (idx_large) via a
  // second decompose/count/scatter pass. wLo/wHi are the lower/upper window counts.
  private regionSplit = false;
  private wLo = 0;
  private wHi = 0;
  private nLarge = 0;
  // Tight red_buf base slot per window — the running prefix of per-window bucket
  // counts (2^(c_w-1)). For no-split (uniform stride) this equals w*stride; for
  // split-c the upper windows pack at stride_hi after the lower's stride_max,
  // so the reduction touches Σ 2^(c_w-1) slots, not numWindows*stride_max.
  private reduceOffsets: number[] = [];
  private decomposeUpperBind?: GPUBindGroup;
  private xposeCountUpperBind?: GPUBindGroup;
  private xposeScatterUpperBind?: GPUBindGroup;
  private xposeCountBinds!: GPUBindGroup[];
  private xposeReduceBinds!: GPUBindGroup[];
  private xposeScanBinds!: GPUBindGroup[];
  private xposeScatterBinds!: GPUBindGroup[];
  private convActiveBind!: GPUBindGroup;
  // Uniform buffer for csr_to_v2_active_sums; reused across prepare() calls
  // so a single MsmV2 instance can serve different SRS offsets. Layout:
  // [total_slots, base_offset, wstride, input_size].
  private convActiveParamsBuf!: GPUBuffer;
  // Scalars storage buffer — sized by `n × 32` bytes. Reused across prepare()
  // calls on the same MsmV2 instance: the cache check on (preparedScalars,
  // srsOffset) lets the bridge serve repeated MSMs of the same n by just
  // rewriting this one buffer + the offset uniform, instead of tearing down
  // and re-creating every per-prepare buffer.
  private scalarsRawBuf!: ScratchSlot;
  // Active-sums double-buffer for the pair-tree level loop. Reset at the top
  // of every run() — different scalar distributions produce different
  // per-bucket pair counts, and stale slots from the previous run would be
  // read by subsequent levels and corrupt the accumulation.
  private bufA!: GPUBuffer;
  private bufB!: GPUBuffer;
  // Pad-trio reset state. The planner's lever-E self-pad relies on 3
  // sentinel points sitting at slots [M1-3, M1-2, M1-1] of each plane of
  // every active_sums buffer. Slow-path setup writes those 192 bytes (96
  // per plane × 2 planes) directly into bufA + bufB once and never again;
  // each `encodeIntoBatch` reset uses two `clearBuffer` calls per buffer
  // to wipe the NON-pad regions, leaving the pad slots intact across runs.
  // This replaces the 64×M1-byte `padTemplateBuf` (~52 MB at n=131k) that
  // used to be copied into both bufA and bufB on every run.
  private planeBytes: number = 0; // bytes per plane = M1 × PG × 16
  private padBytesPerPlane: number = 0; // 3 × PG × 16 = 96
  private padXOffset: number = 0; // X plane pad start = planeBytes - padBytesPerPlane
  private padYOffset: number = 0; // Y plane pad start = 2*planeBytes - padBytesPerPlane
  private convMetaBinds!: GPUBindGroup[];
  private reduceInitBind!: GPUBindGroup;
  // One bind per reduce level (lparams = level index); all share the per-window
  // schedule table so a single dispatch per level reduces every window at its
  // own stride. Length = max_levels (the stride_max schedule length).
  private reduceLevelBinds: GPUBindGroup[] = [];
  private levelBinds: LevelBind[] = [];

  private constructor() {}

  /**
   * Build the data-independent half of the pipeline — pipelines and layouts —
   * for an `n`-point MSM, binding a prefix of the shared {@link MsmV2Pool} as
   * the point pool (`n` must be `<= pool.srsN`). `config` tunes the pipeline
   * knobs; every field defaults to current behaviour (see {@link MsmConfig}).
   */
  static async create(device: GPUDevice, n: number, pool: MsmV2Pool, config?: MsmConfig): Promise<MsmV2> {
    const m = new MsmV2();
    m.device = device;
    m.pool = pool;
    m.n = n;
    m.c = config?.c ?? pickC(n);
    // varSched fixture: a two-region variable-width schedule. Set m.c to the
    // envelope (max) width so reduceWg / BW / stride / pref_scratch all size to
    // it; m.windowCs carries the per-window widths (numWindows overridden below).
    if (config?.varSched) {
      m.windowCs = buildVarSchedule(NUMBITS);
      m.c = Math.max(...m.windowCs);
    }
    // split-c forced split (Phase 1): build the create-time schedule from
    // [b_star, c_lo, c_hi] via the ported build_var_window_schedule and size the
    // envelope to its max width — exactly as varSched does for its fixture. Uses
    // NUMBITS (data-independent) since create() runs before any scalar is seen;
    // the data-dependent natural decision lands with Phase 2 (indirect dispatch).
    if (config?.forceSplit) {
      const [fb, fclo, fchi] = config.forceSplit;
      const dec: SplitDecision = { isSplit: true, bStar: fb, cLo: fclo, cHi: fchi };
      m.windowCs = buildVarWindowSchedule(dec, NUMBITS);
      m.c = Math.max(...m.windowCs);
    }
    m.s = config?.s ?? pickS(n);
    m.wgi = config?.wgi ?? DEFAULT_WGI;
    m.l0Log = config?.l0Log ?? DEFAULT_L0_LOG;
    m.reduceWg = config?.reduceWg ?? pickReduceWg(m.c);
    m.invVariant = config?.invVariant ?? DEFAULT_INV_VARIANT;
    m.montmul = config?.montmul ?? 'karat';
    m.addsub = config?.addsub ?? 'native';
    m.jacobianCrossover = config?.jacobianCrossover ?? 0;
    m.combineOnHost = config?.combineOnHost ?? true;
    m.splitC = config?.splitC ?? false;
    m.sparseReduce = config?.sparseReduce ?? false;
    m.forceSplit = config?.forceSplit;
    m.reduceCostWeight = config?.reduceCostWeight ?? 4;
    m.maxCLo = config?.maxCLo ?? 0;
    m.numBatchesForce = config?.numBatchesOverride ?? 0;
    m.memBudget = config?.budgetMiB ? config.budgetMiB * (1 << 20) : MEM_BUDGET;
    const wantProfile = config?.profile ?? false;
    m.profile = wantProfile && device.features.has('timestamp-query');
    if (wantProfile && !m.profile) {
      console.warn('[MsmV2] profile requested but timestamp-query unavailable — disabled');
    }
    // Pull the knobs into the local names the rest of create() uses.
    const { s: S, wgi: WGI, l0Log: L0_LOG, reduceWg: REDUCE_WG, invVariant: INV_VARIANT, addsub: ADDSUB } = m;
    m.numWindows = m.windowCs ? m.windowCs.length : Math.ceil(NUMBITS / m.c);
    // BW / stride are the ENVELOPE (m.c = max width): every window's red slots
    // are padded to stride and its CSR columns bounded by BW, so the reduce
    // schedule and partial_* scratch hash stay uniform across windows.
    m.BW = Math.ceil((2 ** (m.c - 1) + 1) / PLANNER_TPB) * PLANNER_TPB;
    m.bTotal = m.numWindows * m.BW;
    m.stride = 2 ** (m.c - 1);
    m.redM = m.numWindows * m.stride;
    if (!m.windowCs) m.windowCs = new Array(m.numWindows).fill(m.c);
    // split-c (Phase 2C): size redM (the red_buf Y-plane base, baked into
    // size1/stream_walker/combine_*/pt_finalize below) and bTotal for the SPLIT
    // ENVELOPE — 2× the unsplit window count — so a data-dependent split decided
    // in prepare() fits the baked kernels + red_buf with no re-bake. numWindows
    // stays the unsplit count; prepare() sets the actual decided count for
    // dispatch (≤ envelope) and never shrinks redM/bTotal. The decision falls
    // back to no-split if it would exceed the envelope. Default / forceSplit /
    // varSched keep exact sizing.
    if (m.splitC && !config?.forceSplit && !config?.varSched) {
      const envW = Math.min(VAR_WINDOW_MAX_WINDOWS, 2 * Math.ceil(NUMBITS / m.c));
      m.redM = envW * m.stride;
      m.bTotal = envW * m.BW;
    }
    // Walker thread-count lever (sT = MPW·256). Budget-aware by default so a
    // working set that would exceed the 160 MB budget drops sT — the §8
    // priority-1 lever — before anything else; an explicit config overrides.
    // Resolved here (before shader compile) because the cap is baked into the
    // cumsum/partition_wg kernels and must match the per-thread buffer sizing.
    m.maxPlannerWorkgroups =
      config?.maxPlannerWorkgroups ??
      chooseBudgetMpw({
        maxMpw: MAX_STREAM_WORKGROUPS,
        n,
        NW: m.numWindows,
        BW: m.BW,
        redM: m.redM,
        bTotal: m.bTotal,
        stride: m.stride,
        reduceWg: m.reduceWg,
        srsBytes: pool.poolX.size + pool.poolY.size,
        budget: m.memBudget,
      });
    const misc = compute_misc_params(FP, 13);
    m.R = misc.r;
    m.rinv = misc.rinv;
    const sm = new ShaderManager(4, n, BN254_CURVE_CONFIG, false, m.montmul);

    // Bind a prefix of the shared, already-Montgomery-converted SRS pool. The
    // level-0 kernels index points by `val_idx < n`, so a pool with srsN >= n
    // entries is consumed as its first-n prefix — no per-instance upload or
    // Montgomery conversion.
    if (n > pool.srsN) {
      throw new Error(`MsmV2.create: n (${n}) exceeds the pool's srsN (${pool.srsN})`);
    }
    m.pointXBuf = pool.poolX;
    m.pointYBuf = pool.poolY;

    // Pad trio — 3 distinct-x points (a dx==0 pad pair would poison a chunk's
    // batched inversion). Deterministic, so every instance is reproducible.
    const rng = makeRng(0x9111);
    m.padPts = [];
    for (let j = 0; j < 3; j++) m.padPts.push({ x: randomBelow(FP, rng), y: randomBelow(FP, rng) });
    if (m.padPts[0].x === m.padPts[1].x) m.padPts[1].x = (m.padPts[1].x + 1n) % FP;

    // The reduction's data-independent 4-phase schedule (envelope stride_max).
    // Split-c builds a second, shorter schedule for the upper region at prepare()
    // time (stride_hi is data-dependent on n_large).
    m.reducePasses = buildReducePasses(m.stride, L0_LOG);
    // --- Layouts (pool-cached: same `types` shape → same GPUBindGroupLayout
    // across every MsmV2 instance bound to this pool) ---
    const lt = (types: GPUBufferBindingType[]): GPUBindGroupLayout => pool.cache.getLayout(types);
    m.plannerALayout = lt(['read-only-storage', 'storage', 'storage', 'storage', 'storage', 'uniform']);
    m.plannerBLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'storage',
      'storage',
      'uniform',
      'uniform',
    ]);
    m.fusedLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
      'storage',
    ]);
    m.fusedLayoutL0 = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
      'storage',
      'read-only-storage',
      'read-only-storage',
    ]);
    m.carryLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    m.carryLayoutL0 = lt([
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
      'read-only-storage',
      'read-only-storage',
    ]);
    m.finalizeLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    m.finalizeLayoutL0 = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
      'read-only-storage',
      'read-only-storage',
    ]);
    // 4 bindings: scalars (read), bucket_and_sign (write), params, batch.
    // (Previously 5 — separate signs buffer collapsed into the bucket_and_sign pack.)
    // scalars, bucket_and_sign(rw), params, batch, window_desc, point_offsets.
    m.decomposeLayout = lt(['read-only-storage', 'storage', 'uniform', 'uniform', 'read-only-storage', 'read-only-storage']);
    // msb_histogram: scalars(read), msb_hist(rw), msb_per_scalar(rw), params(uniform).
    m.msbHistLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    // decide_window_split: msb_hist(read), window_desc(rw), summary(rw), params(uniform).
    m.msbDecideLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    // idx_large_compact: msb_per_scalar(read), summary(read), idx_large(rw),
    // idx_large_count(rw atomic), params(uniform).
    m.msbIdxLargeLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'storage', 'uniform']);
    // decompose_upper: scalars(read), bucket_and_sign(write), params, batch, window_desc, idx_large(read).
    m.decomposeUpperLayout = lt(['read-only-storage', 'storage', 'uniform', 'uniform', 'read-only-storage', 'read-only-storage']);
    // transpose_scatter_upper: scatter layout (7) + idx_large(read).
    m.scatterUpperLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform', 'read-only-storage', 'uniform', 'read-only-storage']);
    // bucket_and_sign, partials(rw), params, window_desc, batch_window_base, point_offsets.
    m.xposeCountLayout = lt(['read-only-storage', 'storage', 'uniform', 'read-only-storage', 'uniform', 'read-only-storage']);
    m.xposeReduceLayout = lt(['storage', 'storage', 'uniform', 'read-only-storage', 'uniform']);
    m.xposeScanLayout = lt(['storage', 'uniform', 'read-only-storage', 'uniform']);
    // bucket_and_sign, col_ptr, partials, val_idx(rw), params, window_desc, batch_window_base, point_offsets.
    m.xposeScatterLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform', 'read-only-storage', 'uniform', 'read-only-storage']);
    m.convActiveLayout = lt(['read-only-storage', 'storage', 'uniform', 'read-only-storage']);
    // row_ptr, active_counts(rw), active_offsets(rw), params, window_desc, batch_window_base, point_offsets.
    m.convMetaLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform', 'read-only-storage', 'uniform', 'read-only-storage']);
    m.reduceLevelLayout = lt(['storage', 'storage', 'storage', 'uniform', 'uniform', 'read-only-storage']);
    // Streaming planner + accumulator layouts
    m.classifyLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'storage', 'storage', 'storage', 'uniform', 'read-only-storage', 'uniform']);
    m.metaFixupLayout = lt(['storage']);
    m.radixCountLayout = lt(['read-only-storage', 'storage', 'read-only-storage', 'uniform']);
    m.radixScanLayout = lt(['storage', 'read-only-storage', 'uniform']);
    m.radixScatterLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage', 'read-only-storage', 'uniform']);
    m.cumsumLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    m.partitionWgLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    m.partitionThreadLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    // binding 8 (window_desc) is read-only-storage now (size1 has slot headroom) → no window cap.
    m.size1Layout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'read-only-storage', 'uniform', 'storage', 'read-only-storage']);
    // Stream-walker layouts (C's KNOB 2 variant).
    //   partition_task: sorted_count_list, cumulative_adds, thread_cuts, planner_meta(rw), task_cuts(rw), params(uniform)
    m.partitionTaskLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage', 'uniform']);
    //   stream_walker: sorted_bucket_list, sorted_count_list, offsets, task_cuts, l0_index, point_x, point_y, bucket_sums(rw), partials(rw), partial_dest(rw), params(uniform)
    // sorted_bucket_list, arena_a0 (whole A0 monolith — covers sorted_count_list +
    // l0_index), offsets (standalone), task_cuts, point_x, point_y (ro); red_buf,
    // partials_buf, partial_dest (rw); window_desc (ro storage — no window cap);
    // params, batch_offset, arena_off (uniform). 10 storage = the buffer cap.
    m.streamWalkerLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage', 'storage', 'read-only-storage', 'uniform', 'uniform', 'uniform']);
    // === Optimal walker_combine pipeline layouts ===
    //   count: partial_dest, partial_count(rw), params
    m.combineCountLayout = lt(['read-only-storage', 'storage', 'uniform']);
    //   scan: partial_count, partial_offset(rw), params
    m.combineScanLayout = lt(['read-only-storage', 'storage', 'uniform']);
    //   scatter: partial_dest, partial_offset, partial_write_pos(rw), partial_layout(rw), params
    m.combineScatterLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'storage', 'uniform']);
    //   filter: sorted_bucket_list, partial_count, partial_offset, partial_layout, partials_buf, bucket_sums(rw), active_buckets(rw), active_count(rw), params, planner_meta
    // sorted_bucket_list, arena_a2 (monolith — partial_count + partial_layout),
    // partial_offset, partials_buf (ro); red_buf, active_buckets, active_count (rw);
    // params; planner_meta (ro); is_present (rw); batch_offset; window_desc (ro
    // storage — no cap); arena_off. 10 storage = the cap.
    m.combineFilterLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage', 'storage', 'uniform', 'read-only-storage', 'storage', 'uniform', 'read-only-storage', 'uniform']);
    //   batched: active_buckets, active_count, partial_count, partial_offset, partial_layout, l0_index, point_x, point_y, partials_buf(rw), bucket_sums(rw), params
    // active_buckets, active_count, arena_a2 (monolith — partial_count +
    // partial_layout), partial_offset, l0_index, point_x, point_y (ro); partials_buf,
    // red_buf (rw); window_desc (ro storage — no cap); params, batch_offset, arena_off.
    m.combineBatchedLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage', 'read-only-storage', 'uniform', 'uniform', 'uniform']);
    //   sort-count:   active_buckets, active_count, partial_count, count_histogram(rw)
    m.sortCountLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage']);
    //   sort-scan:    count_histogram, bin_offsets(rw), bin_write_pos(rw), pt_dispatch_args(rw), pt_persistent_args(rw)
    m.sortScanLayout = lt(['read-only-storage', 'storage', 'storage', 'storage', 'storage', 'storage']);
    //   sort-scatter: active_buckets, active_count, partial_count, bin_offsets, bin_write_pos(rw), sorted_active_buckets(rw)
    m.sortScatterLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage']);
    // === Pair-tree v2 (multi-dispatch). ===
    //   pt-init-scan: sorted_active, bin_offsets, active_count, partial_count, pt_off(rw), pt_count(rw), pt_meta(rw)
    m.ptInitScanLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage', 'storage']);
    //   pt-init-copy: sorted_active, bin_offsets, active_count, partial_count, partial_offset, partial_layout, partials_buf, pt_off, pt_buf(rw), params
    m.ptInitCopyLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    //   pt-build: bin_offsets, active_count, pt_off(rw), pt_count(rw), pt_tasks(rw), pt_total_tasks(rw)
    m.ptBuildLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'storage', 'storage', 'storage']);
    //   pt-dispatch-chain: pt_total_tasks(ro), pt_combine_args(rw), pt_build_args(rw), pt_hot_args(ro)
    m.ptDispatchChainLayout = lt(['read-only-storage', 'storage', 'storage', 'read-only-storage']);
    //   pt-combine: pt_tasks, pt_total_tasks, pt_buf(rw), params
    m.ptCombineLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    //   pt-finalize: sorted_active, bin_offsets, active_count, pt_off, pt_buf, bucket_sums(rw), params
    // binding 9 (window_desc) is read-only-storage now (pt_finalize has slot headroom) → no window cap.
    m.ptFinalizeLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform', 'storage', 'uniform', 'read-only-storage']);
    // --- Pipelines (data-independent: shape is fixed by c / S / WGI for
    // every shader except planner-b's PAIR_CAP, which we pin to the pool
    // via `pool.pairCap = ceil(srsN/2) + 16`. The shader's PAIR_CAP loop
    // is `break`-bounded so an over-bounded cap is free; pinning it to
    // the pool makes the emit shader source pool-invariant and lets the
    // cache reuse it across every n the pool serves. Every compileOne()
    // here routes through `pool.cache.getPipeline()` keyed on the WGSL
    // source; identical sources collapse to one compile per pool. ---
    const compile = (code: string, label: string, layout: GPUBindGroupLayout) =>
      pool.cache.getPipeline(code, layout, label);
    m.decomposePipe = await compile(sm.gen_decompose_scalars_booth_shader(WGI), `decompose`, m.decomposeLayout);
    m.msbHistPipe = await compile(sm.gen_ba_msb_histogram_shader(), `msb_histogram`, m.msbHistLayout);
    m.msbDecidePipe = await compile(sm.gen_ba_decide_window_split_shader(), `decide_window_split`, m.msbDecideLayout);
    m.msbIdxLargePipe = await compile(sm.gen_ba_idx_large_compact_shader(), `idx_large_compact`, m.msbIdxLargeLayout);
    m.decomposeUpperPipe = await compile(sm.gen_decompose_scalars_booth_upper_shader(WGI), `decompose_upper`, m.decomposeUpperLayout);
    m.xposeScatterUpperPipe = await compile(
      sm.gen_transpose_scatter_tiled_upper_shader(256, Math.min(m.BW, 8192)),
      `xpose-scatter-upper`, m.scatterUpperLayout);
    // Tiled counting-sort transpose: count + scatter dispatch across point-
    // chunks (not just windows) so the GPU stays saturated; reduce folds the
    // per-chunk partials; scan is the unchanged per-window prefix sum. Only
    // on-chip shared atomics — no contended global atomics. tile is the
    // shared histogram/cursor capacity (<= 8192 entries = 32KB).
    m.xposeCountPipe = await compile(
      sm.gen_transpose_count_tiled_shader(256, Math.min(m.BW, 8192)),
      `xpose-count`,
      m.xposeCountLayout,
    );
    m.xposeReducePipe = await compile(sm.gen_transpose_reduce_tiled_shader(256), `xpose-reduce`, m.xposeReduceLayout);
    m.xposeScanPipe = await compile(sm.gen_transpose_scan_shader(m.numWindows), `xpose-scan`, m.xposeScanLayout);
    m.xposeScatterPipe = await compile(
      sm.gen_transpose_scatter_tiled_shader(256, Math.min(m.BW, 8192)),
      `xpose-scatter`,
      m.xposeScatterLayout,
    );
    m.convActivePipe = await compile(
      sm.gen_csr_to_v2_active_sums_shader(WGI, true, true),
      `csr2v2-active`,
      m.convActiveLayout,
    );
    m.convMetaPipe = await compile(sm.gen_csr_to_v2_meta_shader(WGI), `csr2v2-meta`, m.convMetaLayout);
    // Phase 5: ONE reduction pipeline drives every schedule level. The
    // `kind` (0 suffix / 1 tree / 2 double) lives in lparams.w — uniform
    // across the workgroup, so the compiler specialises per-dispatch with
    // no SIMT divergence. Replaces the three kind-specialised pipelines.
    m.reduceLevelPipes[0] = await compile(
      sm.gen_ba_reduce_level_bench_shader(REDUCE_WG, INV_VARIANT, ADDSUB),
      `reduce-level`,
      m.reduceLevelLayout,
    );
    if (m.sparseReduce) {
      // red_buf(rw), is_present(rw — shares an arena buffer with red_buf, so it
      // can't be read-only in the same pass), cparams(uniform), reduce_meta(ro).
      m.reduceSparseLayout = lt(['storage', 'storage', 'uniform', 'read-only-storage']);
      m.reduceSparsePipe = await compile(
        sm.gen_ba_reduce_sparse_shader(REDUCE_WG, INV_VARIANT),
        `reduce-sparse`,
        m.reduceSparseLayout,
      );
    }

    // --- Streaming planner + accumulator pipelines ---
    // All walker dispatch geometry derives from constants in ba_stream_plan.ts.
    // Do not introduce literals for the cap, the planner TPB, or NUM_THREADS
    // here — change them at the source so every kernel and buffer stays
    // consistent. STREAM_NUM_THREADS = MAX_STREAM_WORKGROUPS * STREAM_PLANNER_TPB.
    const MPW = m.maxPlannerWorkgroups;
    const STREAM_T = MPW * STREAM_PLANNER_TPB;
    const STREAM_S = STREAM_S_PLAN;
    const RADIX_TILE = 2048;
    m.streamNumThreads = STREAM_T;
    m.streamS = STREAM_S;
    m.numRadixTiles = Math.ceil(m.bTotal / RADIX_TILE);
    const qHeaderLen = 2 * STREAM_T;
    m.classifyPipe = await compile(
      sm.gen_ba_planner_classify_shader(256), `classify`, m.classifyLayout);
    m.metaFixupPipe = await compile(
      sm.gen_ba_planner_meta_fixup_shader(), `meta-fixup`, m.metaFixupLayout);
    m.radixCountPipe = await compile(
      sm.gen_ba_planner_radix_count_shader(RADIX_TILE), `radix-count`, m.radixCountLayout);
    m.radixScanPipe = await compile(
      sm.gen_ba_planner_radix_scan_shader(), `radix-scan`, m.radixScanLayout);
    m.radixScatterPipe = await compile(
      sm.gen_ba_planner_radix_scatter_shader(RADIX_TILE), `radix-scatter`, m.radixScatterLayout);
    m.cumsumPipe = await compile(
      sm.gen_ba_planner_cumsum_shader(STREAM_T, STREAM_S, 1, MPW, STREAM_PLANNER_TPB),
      `cumsum`, m.cumsumLayout);
    m.partitionWgPipe = await compile(
      sm.gen_ba_planner_partition_wg_shader(MPW), `partition-wg`, m.partitionWgLayout);
    m.partitionThreadPipe = await compile(
      sm.gen_ba_planner_partition_thread_shader(STREAM_PLANNER_TPB), `partition-thread`, m.partitionThreadLayout);
    m.size1Pipe = await compile(
      sm.gen_ba_size1_shader(m.BW, m.stride, m.redM), `size1`, m.size1Layout);
    // Stream-walker (Plan §6 + C's KNOB 2 variant). STREAM_WALKER_TPB per
    // KNOB 1 (16 KB pref_scratch fits Mali Bifrost at TPB=64). NUM_THREADS =
    // nwg * STREAM_PLANNER_TPB (partition_thread's grain); the walker
    // dispatches ceil(num_active/STREAM_WALKER_TPB) workgroups via
    // planner_meta[15..17] written by partition_task.
    m.partitionTaskPipe = await compile(
      sm.gen_ba_planner_partition_task_shader(STREAM_WALKER_TPB, STREAM_S, STREAM_PLANNER_TPB),
      `partition-task`, m.partitionTaskLayout);
    m.streamWalkerPipe = await compile(
      sm.gen_ba_stream_walker_shader(STREAM_WALKER_TPB, STREAM_S, m.BW, m.stride, m.redM, INV_VARIANT),
      `stream-walker`, m.streamWalkerLayout);
    // === Optimal walker_combine pipeline. ===
    m.combineCountPipe = await compile(
      sm.gen_ba_walker_combine_count_shader(256, m.BW),
      `combine-count`, m.combineCountLayout);
    m.combineScanPipe = await compile(
      sm.gen_ba_walker_combine_scan_shader(256),
      `combine-scan`, m.combineScanLayout);
    m.combineScatterPipe = await compile(
      sm.gen_ba_walker_combine_scatter_shader(256, m.BW),
      `combine-scatter`, m.combineScatterLayout);
    m.combineFilterPipe = await compile(
      sm.gen_ba_walker_combine_filter_shader(256, m.BW, m.stride, m.redM),
      `combine-filter`, m.combineFilterLayout);
    m.combineBatchedPipe = await compile(
      sm.gen_ba_walker_combine_batched_shader(STREAM_WALKER_TPB, STREAM_S, m.BW, m.stride, m.redM, INV_VARIANT),
      `combine-batched`, m.combineBatchedLayout);
    m.sortCountPipe = await compile(
      sm.gen_ba_walker_combine_sort_count_shader(256, m.BW),
      `sort-count`, m.sortCountLayout);
    m.sortScanPipe = await compile(
      sm.gen_ba_walker_combine_sort_scan_shader(),
      `sort-scan`, m.sortScanLayout);
    m.sortScatterPipe = await compile(
      sm.gen_ba_walker_combine_sort_scatter_shader(256, m.BW),
      `sort-scatter`, m.sortScatterLayout);
    m.ptInitScanPipe = await compile(
      sm.gen_ba_walker_pt_init_scan_shader(m.BW),
      `pt-init-scan`, m.ptInitScanLayout);
    // TPB = 64. With indirect dispatch from sort-scan's NUM_HOT-based args,
    // pt_init_copy/build/finalize launch ceil(NUM_HOT/64) WGs — no idle
    // workgroups. pt_combine launches ceil(total_tasks/S/64) per level.
    m.ptInitCopyPipe = await compile(
      sm.gen_ba_walker_pt_init_copy_shader(64, m.BW),
      `pt-init-copy`, m.ptInitCopyLayout);
    m.ptBuildPipe = await compile(
      sm.gen_ba_walker_pt_build_shader(64),
      `pt-build`, m.ptBuildLayout);
    m.ptDispatchChainPipe = await compile(
      sm.gen_ba_walker_pt_dispatch_chain_shader(),
      `pt-dispatch-chain`, m.ptDispatchChainLayout);
    m.ptCombinePipe = await compile(
      sm.gen_ba_unified_combine_shader(64, STREAM_S, INV_VARIANT),
      `pt-combine`, m.ptCombineLayout);
    m.ptFinalizePipe = await compile(
      sm.gen_ba_walker_pt_finalize_shader(64, m.BW, m.stride, m.redM),
      `pt-finalize`, m.ptFinalizeLayout);
    // Warm-up: prepare + dispatch a few times so the first timed run pays no
    // shader JIT / command-buffer cold start and sees ramped GPU clocks. The
    // bridge passes warmupRuns: 0 — production wants the first MSM to be real
    // work.
    const warmupRuns = config?.warmupRuns ?? 5;
    if (warmupRuns > 0) {
      try {
        // Warm-up scalars: a deterministic pseudo-random spread. They must
        // not be all-identical — identical scalars collapse every window sum
        // onto the one-dimensional subgroup ⟨Σ Pᵢ⟩, where hostWindowCombine's
        // incomplete Jacobian addition hits a collision / the point at
        // infinity and throws "value is not invertible". A varied spread
        // keeps the combine generic, matching a real MSM's input.
        const dummy = new Uint8Array(n * 32);
        let rng = 0x9e3779b9 >>> 0;
        for (let i = 0; i < dummy.length; i += 4) {
          rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
          dummy[i] = rng & 0xff;
          dummy[i + 1] = (rng >>> 8) & 0xff;
          dummy[i + 2] = (rng >>> 16) & 0xff;
          dummy[i + 3] = (rng >>> 24) & 0xff;
        }
        // Keep each 32-byte scalar's top byte below the Fr modulus's leading
        // byte (0x30) so every warm-up scalar is a valid field element.
        for (let k = 0; k < n; k++) {
          dummy[k * 32 + 31] &= 0x1f;
        }
        m.prepare(dummy);
        for (let w = 0; w < warmupRuns; w++) await m.run();
      } catch (e) {
        console.warn(`[MsmV2] warm-up run threw (ignored): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return m;
  }

  /**
   * Plan every level for `scalarsBuf` (`n × 32` LE non-Montgomery Fr) and
   * (re)build the data-dependent buffers + bind groups. Untimed setup;
   * cached by `scalarsBuf` identity, so the benchmark's repeated reps over
   * one input pay this once.
   *
   * `srsOffset` is the point-index offset into the bound pool — every L0
   * point lookup is shifted by it, so a single MsmV2 instance can serve
   * commits whose `start_index` differs. Defaults to 0 for callers that
   * bind a pool already aligned to their MSM (the dev page) — that path
   * stays byte-identical to the no-offset behavior.
   */
  /**
   * Prepare a HOMOGENEOUS pack of K MSMs (same `n`/`c` as this instance) as one
   * concatenated super-MSM — the multi-MSM "one dispatch over the union" path
   * (MULTI_MSM_PLAN.md step 4). `scalars` is the concatenated scalar bytes
   * (member k at `members[k].scalarBaseBytes`); `windowDescTable` / `reduceOffsets`
   * come from `planBatch` (global work_off/reduce_off + per-window scalarBase).
   * Drives `prepare()` via {@link batchCtx}; at K=1 it reduces to the single-MSM
   * prepare byte-identically (the batch-of-1 invariant). Caps at
   * `VAR_WINDOW_MAX_WINDOWS` global windows (the at-cap consumers' uniform
   * WindowDesc holds 128 rows).
   */
  prepareBatch(
    members: BatchMember[],
    scalars: Uint8Array,
    windowDescTable: Uint32Array,
    reduceOffsets: number[],
    srsOffset: number = 0,
  ): void {
    // Pack contract: every member fits this instance's envelope — c ≤ this.c and
    // n ≤ this.n (the instance is created at the pack's max n, so its baked BW/
    // stride/c are the envelope maxima). Members may differ in BOTH n and c: each
    // window carries its own c/n/scatter-base from the table + point_offsets, so
    // there is no padding. A member exceeding the envelope would overrun the baked
    // buffers, so reject it. (pickC is monotone, so packing at max n covers all.)
    if (!members.every(m => pickC(m.n) <= this.c && m.n <= this.n)) {
      throw new Error(
        `prepareBatch: every member must fit the envelope (c≤${this.c}, n≤${this.n}); ` +
          `got n=[${members.map(m => m.n).join(', ')}] c=[${members.map(m => pickC(m.n)).join(', ')}]`,
      );
    }
    const numWindows = members.reduce((a, m) => a + m.numWindows, 0);
    // window_desc is a storage buffer in every consumer now (the at-cap kernels
    // bind their colour arena monolithically), so there is no fixed-size uniform
    // cap. The only structural bound is the packed-window bid `(window << 15)|mag`,
    // whose window field is 17 bits; the 160MB budget and the 65k-workgroup
    // dispatch cap (both enforced in prepare()) are the limits that bite first.
    const WBID_WINDOW_MAX = 1 << 17;
    if (numWindows > WBID_WINDOW_MAX) {
      throw new Error(`prepareBatch: ${numWindows} global windows exceeds the ${WBID_WINDOW_MAX}-window packed-bid field`);
    }
    // Per-global-window scatter-base prefix (Σ n_w) + sentinel total. Member m's
    // NW windows each span n_m points, so each window's base advances by n_m. Used
    // by decompose/transpose/convMeta so different-n members pack with no padding.
    const pointOffsets = new Uint32Array(numWindows + 1);
    let pAcc = 0;
    for (const m of members) {
      for (let j = 0; j < m.numWindows; j++) {
        pointOffsets[m.schedOff + j] = pAcc;
        pAcc += m.n;
      }
    }
    pointOffsets[numWindows] = pAcc;
    // Same c ⇒ every member shares this instance's BW/stride; the bucket totals are
    // pure multiples of the window count. (Different c — the envelope-BW case — is
    // the follow-on.) The point total Σ n_w sizes the scatter working set.
    // redM is the TIGHT Σ stride_w (= last window's reduce_off + its stride), not
    // numWindows·stride — so a different-c pack packs red_buf tightly per window.
    const lastW = numWindows - 1;
    const totalRedM = numWindows > 0 ? windowDescTable[lastW * 8 + 4] + windowDescTable[lastW * 8 + 2] : 0;
    this.batchCtx = {
      pointOffsets,
      totalPoints: pAcc,
      numWindows,
      // Envelope sparse-hash space (this.BW = max BW from the maxN instance); the
      // per-window num_columns/stride come from the table, so smaller-c windows use
      // less of it. red_buf packs tight (Σ stride_w).
      bTotal: numWindows * this.BW,
      redM: totalRedM,
      windowDescTable,
      reduceOffsets,
      members,
    };
    // Force the slow path: the cache key is a single-MSM scalarsBuf and the
    // geometry changed, so a full rebuild is required.
    this.preparedFor = null;
    try {
      this.prepare(scalars, srsOffset);
    } finally {
      this.batchCtx = null;
    }
  }

  prepare(scalarsBuf: Uint8Array, srsOffset: number = 0): void {
    // Cache key includes srsOffset so a re-prepare with same scalars but
    // different offset rewrites the uniform.
    if (this.preparedFor === scalarsBuf && this.preparedSrsOffset === srsOffset) return;

    const device = this.device;
    const n = this.n;
    // Reinterpret the LE byte buffer as packed u32 (no copy when 4-byte aligned).
    // A batched (concatenated) prepare views all K members' scalars; a single
    // MSM views just its n·8 words.
    const scalarWords = this.batchCtx ? scalarsBuf.byteLength >>> 2 : n * 8;
    let scalars: Uint32Array;
    if (scalarsBuf.byteOffset % 4 === 0) {
      scalars = new Uint32Array(scalarsBuf.buffer, scalarsBuf.byteOffset, scalarWords);
    } else {
      scalars = new Uint32Array(scalarWords);
      new Uint8Array(scalars.buffer).set(scalarsBuf);
    }
    // split-c (Phase 2C): pick the variable-window schedule from the scalar MSB
    // distribution and fill this.windowCs (the per-window WIDTHS) PADDED to the
    // create-time envelope numWindows. numWindows / bTotal / redM / the baked
    // kernels stay the envelope (set in create), so the data-dependent schedule
    // needs no re-baking; padding windows (beyond the actual schedule) cover zero
    // scalar bits ⇒ no contribution, and the host combine skips them (empty).
    // The host histogram here is a correctness-first stepping stone — the GPU
    // histogram+decide kernels (Phase 2A/2B, validated) swap in for full
    // GPU-residence (SPLIT_C_PLAN.md Phase 2C/2D). forceSplit keeps its
    // create-time schedule. m.c == pickC(n) == cLo, so all widths are ≤ c.
    // idx_large for region-split: the dense indices whose MSB reaches the upper
    // region (host-computed stepping stone; the GPU idx_large kernel swaps in for
    // residence). Survives to the bind block below where it's uploaded.
    let idxLargeHost: Uint32Array | null = null;
    let wantRegionSplit = false;
    this.regionSplit = false;
    this.wLo = this.numWindows;
    this.wHi = 0;
    this.nLarge = 0;
    if (this.batchCtx) {
      // Concatenated super-MSM: numWindows / bTotal / redM become the union totals.
      // Per-window widths come from the prebuilt table's window_bits (+0), so a
      // pack of different-c members carries each window's own c (and the reduce
      // schedule + host combine read it per window). bTotal is the envelope
      // (numWindows · max-BW from the maxN instance); redM is the tight Σ stride_w.
      this.windowCs = Array.from({ length: this.batchCtx.numWindows }, (_, w) => this.batchCtx!.windowDescTable[w * 8 + 0]);
      this.numWindows = this.batchCtx.numWindows;
      this.bTotal = this.batchCtx.bTotal;
      this.redM = this.batchCtx.redM;
      // The radix sort tiles the WHOLE concatenated dense-bucket space — recompute
      // its tile count from the union bTotal (create() sized it for one member).
      this.numRadixTiles = Math.ceil(this.bTotal / 2048);
      this.wLo = this.numWindows;
      this.wHi = 0;
    } else if (this.splitC && !this.forceSplit) {
      const hist = computeMsbHistogram(scalars, n);
      const eff = effectiveNumBits(hist);
      const dec = chooseVarWindowSplit(hist, n, eff, pickC, undefined, this.reduceCostWeight, this.maxCLo);
      const envW = Math.min(VAR_WINDOW_MAX_WINDOWS, 2 * Math.ceil(NUMBITS / this.c));
      let sched = dec.isSplit ? buildVarWindowSchedule(dec, eff) : [];
      // Fall back to the unsplit schedule unless the decision stays inside the
      // regime the region-split data path is validated for. Two guards:
      //  (1) window count ≤ the create-time envelope (redM/bTotal baked for envW), and
      //  (2) every window width ≤ pickC(n). The region-split buffers (red_buf, CSR,
      //      partials, and the size1/walker/combine kernels that bake the pickC
      //      stride) are sized for c_w ≤ pickC; a wider c_lo silently overruns them
      //      (verified: it corrupts the result). Sizing those envelopes for a wider
      //      c_lo is the follow-on that lets the walker-cut lever actually execute —
      //      until then maxCLo widens the *decision* but the schedule safely
      //      collapses back here, so the knob can never produce a wrong result.
      const maxCw = sched.length > 0 ? Math.max(...sched) : 0;
      if (sched.length === 0 || sched.length > envW || maxCw > this.c) {
        sched = new Array(Math.ceil(NUMBITS / this.c)).fill(this.c);
      } else if (dec.isSplit) {
        // Region-split: the upper W_hi windows iterate only the n_large scalars
        // whose msb >= b_star-1 (the small majority contributes zero there).
        const wLo = Math.ceil(Math.min(dec.bStar, eff + 2) / dec.cLo);
        const wHi = sched.length - wLo;
        if (wHi > 0) {
          const threshold = dec.bStar - 1;
          const idx = new Uint32Array(n);
          let cnt = 0;
          for (let i = 0; i < n; i++) {
            const base = i * 8;
            let msb = -1;
            for (let w = 7; w >= 0; w--) {
              if (scalars[base + w] !== 0) { msb = w * 32 + (31 - Math.clz32(scalars[base + w])); break; }
            }
            if (msb >= threshold) { idx[cnt++] = i; }
          }
          idxLargeHost = idx.subarray(0, cnt);
          this.wLo = wLo;
          this.wHi = wHi;
          this.nLarge = cnt;
          wantRegionSplit = true;
        }
      }
      this.windowCs = sched;
      this.numWindows = sched.length;
      if (!wantRegionSplit) this.wLo = this.numWindows;
    }
    const c = this.c;
    const NUM_WINDOWS = this.numWindows;
    const BW = this.BW;
    const B_TOTAL = this.bTotal;
    const R = this.R;
    const { s: S, wgi: WGI, reduceWg: REDUCE_WG } = this;

    // --- Host: scalars (canonical) -> 8×u32 + Booth-decode -> level-0 counts.
    // The Booth decompose + per-level planLevel walk is cheap (~1 ms for
    // n=88_899). We run it on every prepare to compute dispatch sizes, then
    // either reuse the existing GPU buffers (fast path) or rebuild. `scalars`
    // (the LE→u32 view) was built at the top of prepare for the split-c decision.
    // Level-0 histogram from the raw bytes — no BigInt in the hot path.
    // Level-0 histogram. A batched prepare decodes each member from its own
    // scalar slice (bit_base is MSM-local) and places its NW·BW counts at its
    // global window base (schedOff·BW) in the concatenated bucket grid.
    // Legacy A/B-ping-pong pair-tree planning REMOVED. The walker +
    // walker_combine + pair-tree-V2 (`pt_*`) reduce replaced the original
    // Pippenger pair-tree: run() dispatches none of fusedPipe/carryPipe/
    // finalizePipe/levelBinds, and bufA/bufB + padParams0/1Buf are bound to no
    // pipeline (verified absent from all 44 bind groups). The O(n·windows)
    // buildInitCounts + O(levels·windows·BW) host simulation that ran here only
    // sized those now-dead buffers — ~10 ms/call at n=131k. The downstream
    // M1/totalPairBlocks/totalCarries still size the dead bufA/bufB + plan rings
    // (4 B each), so they stay as trivial constants.
    const levelPlans: LevelPlan[] = [];
    const levels = 0;
    let wstride1 = 1;

    // --- Lever G: budget-driven window-batch count (ARENA_LAYOUT.md §7).
    const RED_M = this.redM;
    // MAXC / reducePrefBytes don't depend on the batch count; compute them
    // up-front because both the budget model and the fast-path fit-check need MAXC.
    let MAXC = 1;
    for (const p of this.reducePasses) {
      MAXC = Math.max(MAXC, Math.ceil(p.ppw / REDUCE_WG));
    }
    const reducePrefBytes = NUM_WINDOWS * REDUCE_WG * MAXC * 2 * 16;
    // Total GPU working-set footprint for window-batch count `nb`: the 6 arenas
    // (arenaColourSizes — identical formulas to ensureScratch's carve sites) +
    // the standalone CSR counts/offsets (16·bw·BW) + planMeta + the SRS point
    // pool. Only the scatter/csr terms shrink as nb rises (bw = ⌈NW/nb⌉); THREAD,
    // GRID and RED are fixed, so the gate only ever stages the PASS zone.
    const srsBytes = this.pool.poolX.size + this.pool.poolY.size;
    const estimateMem = (nb: number): number => {
      const bw = Math.ceil(NUM_WINDOWS / nb);
      // A different-n union sizes the scatter zone (bucket_and_sign/val_idx) to the
      // real point total Σ n_w and the scalars to the concatenated bytes, not the
      // class max — that's the no-padding saving. l0Slots stays the bw·n upper bound
      // (the partials matrix is dispatch-sized from the class max n).
      const scatterSlots = this.batchCtx?.totalPoints ?? bw * n;
      const scalarsBytes = this.batchCtx ? scalarsBuf.byteLength : 32 * n;
      const arenaBytes = arenaColourSizes({
        sT: this.streamNumThreads,
        sS: this.streamS,
        sBTotal: B_TOTAL,
        sRadixTiles: this.numRadixTiles,
        batchSlots: scatterSlots,
        redM: RED_M,
        rowPtrLen: bw * (BW + 1),
        reducePrefBytes,
        scalarsBytes,
        l0Slots: bw * n + 3,
      }).reduce((acc, b) => acc + b, 0);
      const countsOffsetsBytes = 4 * (bw * BW) * 4; // countsBufs[2] + offsetsBufs[2]
      const planMetaBytes = (3 * NUM_WINDOWS + 6) * 4;
      // windowDescBuf: WD_ROWS (≥128) rows × 8 u32. Tiny per single MSM, but it
      // scales with the pack's window count, so the budget must count it.
      const windowDescBytes = Math.max(NUM_WINDOWS, 128) * 8 * 4;
      return srsBytes + arenaBytes + countsOffsetsBytes + planMetaBytes + windowDescBytes;
    };
    const wgFits = (nb: number): boolean => Math.ceil((Math.ceil(NUM_WINDOWS / nb) * n) / WGI) < 65000;
    // Raise the batch count until each batch fits both the 65k-workgroup cap and
    // the budget. Footprint is monotone-decreasing in numBatches, so the first
    // satisfying count gives the largest feasible bw; if nothing fits by
    // NUM_WINDOWS, proceed best-effort (as the prior wgFits-only loop did).
    let numBatches = 1;
    if (!this.batchCtx) {
      // A batched pack is one dispatch over the whole union (numBatches stays 1);
      // the bin-packer sized the pack to fit the budget. Single-MSM raises the
      // window-batch count until each batch fits the wg cap + budget.
      while (numBatches < NUM_WINDOWS && (!wgFits(numBatches) || estimateMem(numBatches) > this.memBudget)) numBatches++;
      if (this.numBatchesForce) numBatches = Math.min(NUM_WINDOWS, Math.max(numBatches, this.numBatchesForce));
    } else {
      // Union: one dispatch over the whole pack (no window-staging). The same
      // 160MB accounting still applies — the host packer (packByBudget) sizes the
      // pack to fit, so a union that overflows is a packer bug. Surface it loudly
      // via the identical arenaColourSizes-based estimate instead of OOMing the GPU.
      const footprint = estimateMem(1);
      if (footprint > this.memBudget) {
        throw new Error(
          `prepareBatch: union footprint ${(footprint / (1 << 20)).toFixed(1)}MiB exceeds the ` +
            `${(this.memBudget / (1 << 20)).toFixed(0)}MiB budget (${NUM_WINDOWS} windows, ${B_TOTAL} buckets). Pack fewer members.`,
        );
      }
      if (!wgFits(1)) {
        throw new Error(`prepareBatch: union exceeds the 65k-workgroup dispatch cap (${NUM_WINDOWS} windows × ${n} points). Pack fewer members.`);
      }
    }
    const batchWindows = Math.ceil(NUM_WINDOWS / numBatches);
    const batchBuckets = batchWindows * BW;
    // Scatter working-set size = Σ_w n_w. Uniform-n ⇒ batchWindows·n; a different-n
    // union supplies the real total via point_offsets so smaller members don't pad.
    const batchSlots = this.batchCtx?.totalPoints ?? batchWindows * n;
    // Region-split only when a single batch holds all windows (the region/batch
    // boundary interaction is a follow-up). Multi-batch splits fall back to the
    // unified all-n decompose/transpose (correct, just not the perf win yet).
    this.regionSplit = wantRegionSplit && numBatches === 1;
    // When the region-split can't run (no split, or multi-batch fallback), the
    // reduce covers every window in one stride_max region — reset wLo/wHi so the
    // lower dispatch spans all numWindows and no upper dispatch is issued.
    if (!this.regionSplit) {
      this.wLo = this.numWindows;
      this.wHi = 0;
    }
    for (const p of levelPlans) {
      p.totalPairBlocks = batchWindows * p.pairBlocksPerWindow;
      p.totalCarries = batchWindows * p.carriesPerWindow;
    }
    // `let` so the slow path can apply OVERSIZE_FACTOR padding without
    // re-binding through a parallel set of names.
    let M1 = batchWindows * wstride1 + 3;
    let maxTotalPairBlocks = Math.max(1, ...levelPlans.map(p => p.totalPairBlocks));
    let maxTotalCarries = Math.max(1, ...levelPlans.map(p => p.totalCarries));

    // --- Fast path: subsequent prepare() with a plan that fits in the
    // already-allocated buffers + bind groups. Skips the destroy+realloc of
    // ~40 GPU buffers (the dominant per-MSM cost on M4 Pro; ~150 ms each).
    // Only rewrites the data-dependent uniforms in place. Also requires
    // that the pool's shared scratch hasn't grown since we last bound to
    // it — if it has, our bind groups reference dead buffers and we MUST
    // rebuild them.
    const fits =
      !this.batchCtx &&
      this.preparedFor !== null &&
      this.capM1 > 0 &&
      M1 <= this.capM1 &&
      maxTotalPairBlocks <= this.capTotalPairBlocks &&
      maxTotalCarries <= this.capTotalCarries &&
      levels <= this.capLevels &&
      numBatches === this.capNumBatches &&
      NUM_WINDOWS === this.capNumWindows &&
      MAXC <= this.capMAXC &&
      // Region-split state (idx_large, upper nLarge uniforms, tight reduceGroups)
      // is scalar-specific and the fast path doesn't refresh it. Never share it.
      !this.regionSplit &&
      !this.capRegionSplit &&
      this.boundEpoch === this.pool.scratchEpoch;
    if (fits) {
      this.fastPathRewrite(scalars, srsOffset, levelPlans, levels);
      this.preparedFor = scalarsBuf;
      this.preparedSrsOffset = srsOffset;
      return;
    }

    // --- Slow path: first prepare on this instance, OR new plan exceeds
    // the cached caps. Destroy everything and rebuild.
    //
    // OVERSIZE_FACTOR pads buffers so subsequent prepares with slightly
    // different scalar distributions (yielding slightly different per-
    // bucket pair/carry counts → different M1/totalPairBlocks/totalCarries) stay on
    // the fast path. Without padding the fits-check rejects ~30% of
    // follow-up prepares — see [phase] traces showing alternating 9 ms /
    // 80 ms prepares for the same n. Padding by 30% leaves room for
    // typical scalar-distribution variance without growing buffers so
    // much that the planner pays for indexing empty slots.
    //
    // wstride1 is the per-window stride the planner uses to index
    // buckets. Padding it spreads buckets further apart in memory;
    // intervening slots stay zero (no-op for level shaders). M1 is
    // derived from the padded wstride1 so pad-trio indices (M1-3/-2/-1)
    // sit at the tail of the padded region and stay consistent across
    // all fast-path runs against this instance.
    const OVERSIZE_FACTOR = 1.3;
    wstride1 = Math.ceil(wstride1 * OVERSIZE_FACTOR);
    M1 = batchWindows * wstride1 + 3;
    maxTotalPairBlocks = Math.ceil(maxTotalPairBlocks * OVERSIZE_FACTOR);
    maxTotalCarries = Math.ceil(maxTotalCarries * OVERSIZE_FACTOR);
    for (const b of this.prepBuffers) b.destroy();
    this.prepBuffers = [];
    this.levelBinds = [];
    this.levels = levels;
    this.numBatches = numBatches;
    this.batchWindows = batchWindows;
    this.capM1 = M1;
    this.capTotalPairBlocks = maxTotalPairBlocks;
    this.capTotalCarries = maxTotalCarries;
    this.capLevels = levels;
    this.capNumBatches = numBatches;
    this.capMAXC = MAXC;
    this.capNumWindows = NUM_WINDOWS;
    this.capRegionSplit = this.regionSplit;

    // Only uniform buffers are per-instance now — the big storage buffers
    // live in `pool.scratch` and are shared across every MsmV2 bound to
    // this pool. `prepBuffers` tracks only the uniforms we own and must
    // destroy in destroy(); ensureScratch's buffers belong to the pool.
    const ubuf = (data: Uint32Array): GPUBuffer => {
      const b = device.createBuffer({
        size: Math.max(16, Math.ceil(data.byteLength / 16) * 16),
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(b, 0, data as BufferSource);
      this.prepBuffers.push(b);
      return b;
    };
    // Accepts a raw GPUBuffer (whole-buffer binding) or a {buffer, offset, size}
    // slot (sub-range of the shared arena), so buffers migrate into the arena one
    // batch at a time while un-migrated ones keep binding as whole buffers.
    const mkBind = (layout: GPUBindGroupLayout, buffers: (GPUBuffer | GPUBufferBinding)[]): GPUBindGroup =>
      device.createBindGroup({
        layout,
        entries: buffers.map((b, binding) => ({
          binding,
          resource: b instanceof GPUBuffer ? { buffer: b } : b,
        })),
      });

    const WSTRIDE = n;

    // Tiled-transpose geometry: split each window's n points into
    // `transposeNumPointTiles` tiles of ~`pointsPerTile` each so the
    // count/scatter dispatch saturates the GPU instead of running one
    // workgroup per window. The tile count is floor(n/BW) (n = the class max in a
    // union, so it covers the largest window; smaller windows leave trailing tiles
    // empty).
    const transposeNumPointTiles = Math.max(1, Math.floor(n / BW));
    const pointsPerTile = Math.ceil(n / transposeNumPointTiles);
    const partialStride = transposeNumPointTiles * BW;
    // l0IdxBuf doubles as the transpose partials matrix (batchWindows·partialStride,
    // dispatch-sized from the class max n) AND the level-0 point-index input (the
    // first batchSlots = Σ n_w entries). The self-pad trio sits ABOVE both at PAD,
    // so the transpose can't clobber it. For a uniform pack PAD = batchSlots (the
    // partials matrix is ≤ batchSlots) ⇒ byte-identical; a different-n union makes
    // the partials matrix the binding term (the scatter buffers stay Σ n_w).
    const l0PadAnchor = Math.max(batchSlots, batchWindows * partialStride);
    const l0Slots = l0PadAnchor + 3;
    this.transposeNumPointTiles = transposeNumPointTiles;

    const FUSED_TILE = Math.min(
      Math.ceil((1 << 16) / WGI) * WGI,
      Math.max(WGI, Math.ceil(this.capTotalPairBlocks / WGI) * WGI),
    );
    this.fusedTileSize = FUSED_TILE;

    // Ask the pool to grow its shared scratch to fit this MSM's plan. Most
    // prepares hit no growth (after the first MSM saturates max-N); growth
    // bumps pool.scratchEpoch and our cached `boundEpoch` becomes stale.
    const scratch = this.pool.ensureScratch(
      {
        M1,
        batchSlots,
        batchBuckets,
        numWindows: NUM_WINDOWS,
        BW,
        l0Slots,
        rowPtrLen: batchWindows * (BW + 1),
        planMetaLen: 3 * NUM_WINDOWS + 6,
        totalPairBlocks: maxTotalPairBlocks,
        totalCarries: maxTotalCarries,
        fusedTile: FUSED_TILE,
        S,
        scalarsBytes: scalars.byteLength,
        redM: RED_M,
        reducePrefBytes,
        bTotal: B_TOTAL,
        streamNumThreads: this.streamNumThreads,
        streamS: this.streamS,
        streamQueueEntries: B_TOTAL + this.streamNumThreads * (2 * this.streamS - 1),
        streamRadixTiles: this.numRadixTiles,
      },
      this.padPts,
      R,
    );
    this.boundEpoch = this.pool.scratchEpoch;

    // Pad-trio layout from pool. Pool re-wrote the pad bytes into bufA/B if
    // it grew them; otherwise we inherit pad bytes from the previous owner.
    // Either way, the per-run reset's clearBuffer ranges avoid these slots.
    this.planeBytes = scratch.planeBytes;
    this.padBytesPerPlane = scratch.padBytesPerPlane;
    this.padXOffset = scratch.padXOffset;
    this.padYOffset = scratch.padYOffset;

    // Local aliases so the per-level / per-tile bind-group setup below
    // reads the same identifiers it always has. Each is a reference to
    // pool.scratch.X — destroyed and re-created by the pool, not by us.
    const bufA = scratch.bufA;
    const bufB = scratch.bufB;
    this.bufA = bufA;
    this.bufB = bufB;
    const l0IdxBuf = scratch.l0IdxBuf;
    // L0 seed pad-trio — three index slots at [l0PadAnchor, +1, +2] that l0-mode
    // shaders use as a "self-pad anchor" (the walker's IDLE_ANCHOR). It sits ABOVE
    // the transpose partials matrix so the transpose can't clobber it; for a uniform
    // pack l0PadAnchor == batchSlots (byte-identical).
    writeSlot(device.queue, l0IdxBuf, l0PadAnchor * 4, new Uint32Array([0, 1, 2]));
    const countsBufs = scratch.countsBufs;
    const offsetsBufs = scratch.offsetsBufs;
    const planMeta = scratch.planMeta;
    const pairBlockPlanRing = scratch.pairBlockPlanRing;
    const scatterPlanRing = scratch.scatterPlanRing;
    const carryPlanRing = scratch.carryPlanRing;
    const prefScratchBuf = scratch.prefScratchBuf;
    const scalarsRawBuf = scratch.scalarsRawBuf;
    writeSlot(device.queue, scalarsRawBuf, 0, scalars as BufferSource);
    this.scalarsRawBuf = scalarsRawBuf;
    const bucketAndSignBuf = scratch.bucketAndSignBuf;
    const rowPtrBuf = scratch.rowPtrBuf;
    const valIdxBuf = scratch.valIdxBuf;
    // ALL active-sums indices must reference the POOL's M1, not this MSM's.
    // The pool's bufA/bufB are sized to its max-M1 (across all MSMs that
    // have ever bound to it), and the pad-trio sits at [poolM1-3, poolM1-2,
    // poolM1-1]. This MSM's planner writes into [0, batchWindows*wstride1)
    // which is always < poolM1, so the pad slots don't get clobbered.
    const poolM1 = scratch.poolM1;
    const padParams0Buf = ubuf(new Uint32Array([batchSlots, batchSlots + 1, poolM1 - 1, 0]));
    const padParams1Buf = ubuf(new Uint32Array([poolM1 - 3, poolM1 - 2, poolM1 - 1, 0]));
    const decomposeParams = ubuf(new Uint32Array([n, batchWindows, c, 8]));
    // WindowDesc table (SPLIT_C_PLAN.md): one row per GLOBAL window, stride 8 u32.
    // Filled uniformly here (no-split) → kernels that read it reproduce today's
    // geometry byte-identically; split-c later fills it with the variable schedule.
    // Row w: [window_bits, bit_base, num_buckets(red slots), work_off,
    //         reduce_off, num_columns].
    // Sized to numBatches*batchWindows (>= NUM_WINDOWS): the last batch pads
    // its window count up to batchWindows, and csr_to_v2_meta reads WindowDesc
    // for every padded slot (those windows resolve to cleared-zero row_ptr =>
    // count 0). The padding rows continue the uniform sequence; nb=1 has no
    // padding so the table is exactly NUM_WINDOWS rows (byte-identical).
    const WD_STRIDE = 8;
    // >= numBatches*batchWindows for the short-batch padded slots; >= 128 rows
    // (4096 B) so the at-cap consumers can bind it as a fixed array<vec4<u32>,256>
    // uniform (their storage-buffer slots are full). VAR_WINDOW_MAX_WINDOWS=128.
    const WD_ROWS = Math.max(numBatches * batchWindows, 128);
    const wdData = new Uint32Array(WD_ROWS * WD_STRIDE);
    let wdBitBase = 0; // prefix of window widths
    let wdWorkOff = 0; // prefix of num_columns (packed CSR bucket base)
    let wdReduceOff = 0; // tight prefix of per-window bucket counts (2^(c_w-1))
    this.reduceOffsets = new Array(WD_ROWS);
    if (this.batchCtx) {
      // Concatenated super-MSM: the global table (global work_off/reduce_off,
      // MSM-local bit_base, per-window scalar_base) is prebuilt by planBatch.
      // Padding rows [numWindows, WD_ROWS) stay zero — never dispatched.
      wdData.set(this.batchCtx.windowDescTable);
      for (let w = 0; w < WD_ROWS; w++) {
        this.reduceOffsets[w] = w < this.batchCtx.reduceOffsets.length ? this.batchCtx.reduceOffsets[w] : 0;
      }
    } else {
      // Tight reduce_off (Σ 2^(c_k-1)) only when the region-split reduce is active:
      // the upper windows then pack at stride_hi and a stride_hi schedule reduces
      // them. Otherwise (no-split, or the multi-batch split fallback that can't
      // region-split) use envelope spacing w*stride_max — a uniform stride_max
      // reduce over each window's slot, empties skipped by is_present. For uniform
      // windowCs the two coincide (byte-identical to the pre-split path).
      for (let w = 0; w < WD_ROWS; w++) {
        const o = w * WD_STRIDE;
        // Per-window width: the schedule for real windows, envelope c for the
        // short-batch padding rows. Uniform fill ⇒ cw == c, byte-identical.
        const cw = w < this.windowCs.length ? this.windowCs[w] : c;
        const strideW = 2 ** (cw - 1);
        const numColsW = Math.ceil((2 ** (cw - 1) + 1) / PLANNER_TPB) * PLANNER_TPB;
        const reduceOff = this.regionSplit ? wdReduceOff : w * this.stride;
        wdData[o + 0] = cw; // window_bits
        wdData[o + 1] = wdBitBase; // bit_base (prefix of widths)
        wdData[o + 2] = strideW; // num_buckets (this window's red slots)
        wdData[o + 3] = wdWorkOff; // work_off (prefix of num_columns — packed CSR base)
        wdData[o + 4] = reduceOff;
        wdData[o + 5] = numColsW; // num_columns (this window's CSR column count)
        this.reduceOffsets[w] = reduceOff;
        wdBitBase += cw;
        wdWorkOff += numColsW;
        wdReduceOff += strideW;
      }
    }
    const windowDescBuf = device.createBuffer({
      size: wdData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(windowDescBuf, 0, wdData as BufferSource);
    this.prepBuffers.push(windowDescBuf);

    // point_offsets: per-(dispatch-window) scatter base — window w's points occupy
    // [point_offsets[w], point_offsets[w+1]) of the (window,point) scatter region,
    // so decompose/transpose iterate each window's own n_w = point_offsets[w+1] -
    // point_offsets[w] and place it at point_offsets[w]. Uniform-n ⇒ w·n (byte-
    // identical to the old `w*input_size` layout); a heterogeneous union supplies the
    // real per-window prefix (Σ n_w) via batchCtx so members of different n pack with
    // no padding. Indexed by the dispatch window (gid.y), so batch-local for a single
    // MSM, global for the union (numBatches=1). Length batchWindows+1 (+ sentinel).
    const pointOffsets = new Uint32Array(batchWindows + 1);
    if (this.batchCtx?.pointOffsets) {
      pointOffsets.set(this.batchCtx.pointOffsets.subarray(0, batchWindows + 1));
    } else {
      for (let w = 0; w <= batchWindows; w++) pointOffsets[w] = w * n;
    }
    const pointOffsetsBuf = device.createBuffer({
      size: Math.max(16, pointOffsets.byteLength),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(pointOffsetsBuf, 0, pointOffsets as BufferSource);
    this.prepBuffers.push(pointOffsetsBuf);

    // split-c MSB histogram resources (Phase 1) — only when the decision is on.
    // msbHistBuf: 256 u32 bins (cleared before each dispatch). msbPerScalarBuf:
    // n u32 (per-scalar msb, reused by Phase 2 idx_large). Both standalone so
    // they don't perturb the arena's 6-colour conflict graph.
    if (this.splitC) {
      const msbHistBuf = device.createBuffer({
        size: 256 * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      const msbPerScalarBuf = device.createBuffer({
        size: n * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      const msbHistParams = ubuf(new Uint32Array([n, 8, 0, 0]));
      this.msbHistBuf = msbHistBuf;
      this.msbPerScalarBuf = msbPerScalarBuf;
      this.msbHistBind = mkBind(this.msbHistLayout, [scalarsRawBuf, msbHistBuf, msbPerScalarBuf, msbHistParams]);
      this.prepBuffers.push(msbHistBuf, msbPerScalarBuf);

      // Decide kernel: a dedicated WindowDesc (WD_ROWS rows) + a 16-u32 summary,
      // written from the histogram. Separate from windowDescBuf so it's validated
      // standalone (readback) without disturbing the consumed table; region-split
      // (Phase 2C) will switch the pipeline to consume this directly.
      const decideWindowDescBuf = device.createBuffer({
        size: WD_ROWS * WD_STRIDE * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      const decideSummaryBuf = device.createBuffer({
        size: 16 * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      const decideParams = ubuf(new Uint32Array([n, c, WD_ROWS, 0]));
      this.decideWindowDescBuf = decideWindowDescBuf;
      this.decideSummaryBuf = decideSummaryBuf;
      this.msbDecideBind = mkBind(this.msbDecideLayout, [msbHistBuf, decideWindowDescBuf, decideSummaryBuf, decideParams]);
      this.prepBuffers.push(decideWindowDescBuf, decideSummaryBuf);

      // idx_large compaction (Phase 2B): upper-region scalar indices. Sized to n
      // (the unsplit envelope upper bound on n_large); the count is GPU-resident.
      const idxLargeBuf = device.createBuffer({
        size: n * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      const idxLargeCountBuf = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      const idxLargeParams = ubuf(new Uint32Array([n, 0, 0, 0]));
      this.idxLargeBuf = idxLargeBuf;
      this.idxLargeCountBuf = idxLargeCountBuf;
      this.msbIdxLargeBind = mkBind(this.msbIdxLargeLayout, [msbPerScalarBuf, decideSummaryBuf, idxLargeBuf, idxLargeCountBuf, idxLargeParams]);
      this.prepBuffers.push(idxLargeBuf, idxLargeCountBuf);
    }
    // Layout: [num_point_tiles, input_size, row_stride, points_per_tile].
    // input_size (slot 1) = points the count/scatter iterate (n for the lower /
    // no-split region; the split-c upper region binds its own xposeParamsUpper
    // with input_size=n_large). row_stride (slot 2, always n) is the
    // bucket_and_sign/val_idx window stride, so cci_offset = window*n for every
    // region. reduce/scan get per-window columns from WindowDesc and ignore both.
    // params[1] = 0 is the sentinel for "iterate each window's own n_w from
    // point_offsets" (the main / union path); the split-c upper region overrides it
    // with n_large. reduce/scan ignore params[1] (they read WindowDesc columns).
    const xposeParams = ubuf(new Uint32Array([transposeNumPointTiles, 0, n, pointsPerTile]));
    // params[1] = base_offset, written per-prepare() via writeBuffer below.
    // Default 0 — non-bridge callers (the dev page) bind a per-MSM pool
    // starting at index 0 and need no offset.
    const convActiveParams = ubuf(new Uint32Array([batchSlots, 0, WSTRIDE, n]));
    this.convActiveParamsBuf = convActiveParams;
    const convMetaParams = ubuf(new Uint32Array([this.batchWindows, n, 0, 0]));
    const batchWindowBaseBufs: GPUBuffer[] = [];
    for (let bi = 0; bi < numBatches; bi++) {
      // .x = gwin offset (this batch's first window); .y = work_off subtraction
      // base (= .x here, batch-local). The split-c upper region binds .x=W_lo,
      // .y=0 so its partials continue after the lower region's (no collision).
      // .z = M_RED (red_buf Y-plane stride) — the red-slot writers (walker, size1,
      // combine_filter/batched, pt_finalize) read it as a runtime uniform instead
      // of a baked const. = this MSM's RED_M for the single-MSM path (byte-
      // identical); a packed multi-MSM pass overrides it to Σ redM.
      batchWindowBaseBufs.push(ubuf(new Uint32Array([bi * batchWindows, bi * batchWindows, RED_M, 0])));
    }

    this.decomposeBinds = batchWindowBaseBufs.map(bwb =>
      mkBind(this.decomposeLayout, [scalarsRawBuf, bucketAndSignBuf, decomposeParams, bwb, windowDescBuf, pointOffsetsBuf]),
    );
    // The transpose borrows l0IdxBuf as the per-chunk partials matrix. Its
    // [0, batchSlots) region is dormant until convActive (which runs strictly
    // after the transpose, per batch) overwrites it; the level-0 seed trio
    // sits above batchSlots and is never touched by the partials region.
    const partialsBuf = l0IdxBuf;
    this.xposeCountBinds = batchWindowBaseBufs.map(bwb =>
      mkBind(this.xposeCountLayout, [bucketAndSignBuf, partialsBuf, xposeParams, windowDescBuf, bwb, pointOffsetsBuf]));
    this.xposeReduceBinds = batchWindowBaseBufs.map(bwb =>
      mkBind(this.xposeReduceLayout, [partialsBuf, rowPtrBuf, xposeParams, windowDescBuf, bwb]));
    this.xposeScanBinds = batchWindowBaseBufs.map(bwb =>
      mkBind(this.xposeScanLayout, [rowPtrBuf, xposeParams, windowDescBuf, bwb]));
    this.xposeScatterBinds = batchWindowBaseBufs.map(bwb =>
      mkBind(this.xposeScatterLayout, [
        bucketAndSignBuf,
        rowPtrBuf,
        partialsBuf,
        valIdxBuf,
        xposeParams,
        windowDescBuf,
        bwb,
        pointOffsetsBuf,
      ]));
    // Region-split (Phase 2C-ii): upper-region binds. The upper W_hi windows
    // iterate only n_large compacted points via decompose_upper + count/scatter
    // over input_size=n_large, batch_window_base = W_lo. idx_large is uploaded
    // host-side (stepping stone). Built only when this.regionSplit.
    if (this.regionSplit && idxLargeHost && this.idxLargeBuf) {
      device.queue.writeBuffer(this.idxLargeBuf, 0, idxLargeHost as BufferSource);
      const upperBwb = ubuf(new Uint32Array([this.wLo, 0, 0, 0]));
      const decomposeUpperParams = ubuf(new Uint32Array([this.nLarge, this.wHi, n, 8]));
      const xposeParamsUpper = ubuf(new Uint32Array([transposeNumPointTiles, this.nLarge, n, pointsPerTile]));
      this.decomposeUpperBind = mkBind(this.decomposeUpperLayout, [scalarsRawBuf, bucketAndSignBuf, decomposeUpperParams, upperBwb, windowDescBuf, this.idxLargeBuf]);
      this.xposeCountUpperBind = mkBind(this.xposeCountLayout, [bucketAndSignBuf, partialsBuf, xposeParamsUpper, windowDescBuf, upperBwb, pointOffsetsBuf]);
      this.xposeScatterUpperBind = mkBind(this.scatterUpperLayout, [bucketAndSignBuf, rowPtrBuf, partialsBuf, valIdxBuf, xposeParamsUpper, windowDescBuf, upperBwb, this.idxLargeBuf]);
    }
    this.convActiveBind = mkBind(this.convActiveLayout, [valIdxBuf, l0IdxBuf, convActiveParams, bucketAndSignBuf]);
    this.convMetaBinds = batchWindowBaseBufs.map(bwb =>
      mkBind(this.convMetaLayout, [rowPtrBuf, countsBufs[0], offsetsBufs[0], convMetaParams, windowDescBuf, bwb, pointOffsetsBuf]));
    this.rowPtrBuf = rowPtrBuf;
    this.nXposePts = Math.ceil(n / WGI);

    // --- Reduction (table-driven, single dispatch-set) ---
    // MAXC was computed above (the fits-check needs it). max_levels is the row
    // stride of the per-window schedule table — the longest group's schedule
    // length, which is the stride_max schedule (this.reducePasses). ONE dispatch
    // per level covers every window: each reads its own base + per-level
    // (pa,pb,ppw,kind) from reduce_sched, so a narrow c_hi window reduces only
    // 2^(c_hi-1) buckets and no-ops the levels past its shorter schedule while
    // the wide stride_max windows run all max_levels. No extra dispatches for the
    // split — the reduce work drops with c_hi without adding dispatch latency.
    const redBuf = scratch.redBuf;
    const isPresentBuf = scratch.isPresentBuf;
    const reducePrefScratch = scratch.reducePrefScratch;
    const maxLevels = this.reducePasses.length;
    // Per-window schedule table: row w = [base, 0,0,0] then max_levels × (pa, pb,
    // ppw, kind). capMAXC (from the widest stride_max schedule) bounds every
    // window's per-thread scratch use, so the shared reducePrefScratch fits.
    const rowVec4 = 1 + maxLevels;
    const schedTable = new Uint32Array(this.numWindows * rowVec4 * 4);
    const schedCache = new Map<number, { flat: Uint32Array; nLev: number }>();
    for (let w = 0; w < this.numWindows; w++) {
      const cw = this.windowCs[w];
      const strideW = 2 ** (cw - 1);
      const rowU32 = w * rowVec4 * 4;
      schedTable[rowU32 + 0] = this.reduceOffsets[w]; // base = tight/envelope reduce_off
      // stride 1 (cw==1) needs no reduction (the lone bucket already sits at base
      // and is the window sum), and the schedule recurrence needs stride >= 2 —
      // leave the whole row as no-ops (ppw==0).
      if (strideW >= 2) {
        let entry = schedCache.get(strideW);
        if (!entry) {
          const passes = strideW === this.stride ? this.reducePasses : buildReducePasses(strideW, this.l0Log);
          entry = { flat: flattenReduceSchedule(passes), nLev: passes.length };
          schedCache.set(strideW, entry);
        }
        for (let lv = 0; lv < entry.nLev; lv++) {
          const o = rowU32 + (1 + lv) * 4;
          schedTable[o + 0] = entry.flat[lv * 4 + 1]; // pa
          schedTable[o + 1] = entry.flat[lv * 4 + 2]; // pb
          schedTable[o + 2] = entry.flat[lv * 4 + 3]; // ppw
          schedTable[o + 3] = entry.flat[lv * 4 + 0]; // kind
        }
      }
    }
    const schedBuf = device.createBuffer({ size: schedTable.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(schedBuf, 0, schedTable as BufferSource);
    this.prepBuffers.push(schedBuf);
    const cparams = ubuf(new Uint32Array([RED_M, this.capMAXC, maxLevels, 0]));
    this.reduceLevelBinds = Array.from({ length: maxLevels }, (_, lv) => {
      const lparams = ubuf(new Uint32Array([lv, 0, 0, 0]));
      return mkBind(this.reduceLevelLayout, [redBuf, isPresentBuf, reducePrefScratch, cparams, lparams, schedBuf]);
    });
    // Sparse reduce: per-window (base, B) meta + bind. base = tight reduce_off,
    // B = this window's bucket count (2^(c_w-1)). cparams.x = M (red_buf stride).
    if (this.sparseReduce && this.reduceSparseLayout) {
      const metaData = new Uint32Array(NUM_WINDOWS * 4);
      for (let w = 0; w < NUM_WINDOWS; w++) {
        const cw = w < this.windowCs.length ? this.windowCs[w] : c;
        metaData[w * 4 + 0] = this.reduceOffsets[w];
        metaData[w * 4 + 1] = 2 ** (cw - 1);
      }
      const metaBuf = device.createBuffer({
        size: Math.max(16, metaData.byteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(metaBuf, 0, metaData as BufferSource);
      this.prepBuffers.push(metaBuf);
      const cparamsSparse = ubuf(new Uint32Array([RED_M, 0, 0, 0]));
      this.reduceSparseBind = mkBind(this.reduceSparseLayout, [redBuf, isPresentBuf, cparamsSparse, metaBuf]);
    }
    this.redBuf = redBuf;

    // --- Streaming planner + accumulator bind groups ---
    {
      const sp = scratch.streamPlannerMeta;
      const s1 = scratch.size1BucketList;
      const db = scratch.denseBucketList;
      const dc = scratch.denseCountList;
      const sb = scratch.sortedBucketList;
      const sc = scratch.sortedCountList;
      const rh = scratch.radixHist;
      const ca = scratch.cumulativeAdds;
      const wc = scratch.wgCuts;
      const tc = scratch.threadCuts;
      const qb = scratch.queueBuf;
      const pb = scratch.partialsBuf;
      const pbl = scratch.partialBucketsList;
      const ab = scratch.accBuf;
      const sps = scratch.streamPrefScratch;
      const classifyParams = ubuf(new Uint32Array([this.batchWindows, 0, 0, 0]));
      this.classifyBinds = batchWindowBaseBufs.map(bwb =>
        mkBind(this.classifyLayout, [countsBufs[0], offsetsBufs[0], s1, db, dc, sp, classifyParams, windowDescBuf, bwb]));
      this.metaFixupBind = mkBind(this.metaFixupLayout, [sp]);
      const radixParams = [
        ubuf(new Uint32Array([0, 0, 0, 0])),
        ubuf(new Uint32Array([1, 0, 0, 0])),
        ubuf(new Uint32Array([2, 0, 0, 0])),
      ];
      this.radixCountBinds = [
        mkBind(this.radixCountLayout, [dc, rh, sp, radixParams[0]]),
        mkBind(this.radixCountLayout, [sc, rh, sp, radixParams[1]]),
        mkBind(this.radixCountLayout, [dc, rh, sp, radixParams[2]]),
      ];
      const scanParams = ubuf(new Uint32Array([this.numRadixTiles, 0, 0, 0]));
      this.radixScanBind = mkBind(this.radixScanLayout, [rh, sp, scanParams]);
      this.radixScatterBinds = [
        mkBind(this.radixScatterLayout, [db, dc, rh, sb, sc, sp, radixParams[0]]),
        mkBind(this.radixScatterLayout, [sb, sc, rh, db, dc, sp, radixParams[1]]),
        mkBind(this.radixScatterLayout, [db, dc, rh, sb, sc, sp, radixParams[2]]),
      ];
      const cumsumParams = ubuf(new Uint32Array([0, 0, 0, 0]));
      this.cumsumBind = mkBind(this.cumsumLayout, [sc, ca, sp, cumsumParams]);
      const pwgParams = ubuf(new Uint32Array([0, 0, 0, 0]));
      this.partitionWgBind = mkBind(this.partitionWgLayout, [sc, ca, sp, wc, pwgParams]);
      const ptParams = ubuf(new Uint32Array([0, 0, 0, 0]));
      this.partitionThreadBind = mkBind(this.partitionThreadLayout, [sc, ca, wc, sp, tc, ptParams]);
      // size1 is per-batch: binding 6 carries batch_offset (= bi·batchWindows) so
      // size-1 buckets land in their global red_buf slice, like the walker/combine.
      this.size1Binds = batchWindowBaseBufs.map(bwb =>
        mkBind(this.size1Layout, [s1, l0IdxBuf, this.pointXBuf, this.pointYBuf, scratch.redBuf, sp, bwb, scratch.isPresentBuf, windowDescBuf]),
      );
      // Stream-walker bind groups (Plan §6 + C's KNOB 2 variant).
      const taskc = scratch.taskCuts;
      const wp = scratch.walkerPartials;
      const pdest = scratch.walkerPartialDest;
      const ptaskParams = ubuf(new Uint32Array([0, 0, 0, 0]));
      this.partitionTaskBind = mkBind(this.partitionTaskLayout, [sc, ca, tc, sp, taskc, ptaskParams]);
      // Walker params: (NUM_THREADS, IDLE_ANCHOR, M_buckets, M_partials).
      const M_partials_walker = 2 * this.streamNumThreads * this.streamS;
      const walkerParams = ubuf(new Uint32Array([this.streamNumThreads, l0PadAnchor, B_TOTAL, M_partials_walker]));
      // Bind the whole A0 monolith once; sorted_count_list + l0_index are
      // sub-ranges of it, addressed via these u32 element offsets (.x, .y).
      // Collapsing the two sub-range bindings into one frees the slot that lets
      // window_desc be a storage buffer (no fixed uniform ⇒ no window cap). Same
      // bytes, same arena. offsets is standalone (not A0) ⇒ its own binding.
      const a0Buf = slotBuf(sc);
      if (slotBuf(l0IdxBuf) !== a0Buf) {
        throw new Error('stream_walker: sorted_count_list and l0_index must share arena A0');
      }
      const walkerArenaOff = ubuf(new Uint32Array([slotOff(sc) / 4, slotOff(l0IdxBuf) / 4, 0, 0]));
      this.streamWalkerBinds = batchWindowBaseBufs.map(bwb =>
        mkBind(this.streamWalkerLayout, [
          sb, a0Buf, offsetsBufs[0], taskc, this.pointXBuf, this.pointYBuf,
          scratch.redBuf, wp, pdest, windowDescBuf, walkerParams, bwb, walkerArenaOff,
        ]),
      );
      const numPartialSlots = M_partials_walker;
      // === Optimal walker_combine bind groups. ===
      const pcount = scratch.partialCount;
      const poffset = scratch.partialOffset;
      const pwpos = scratch.partialWritePos;
      const playout = scratch.partialLayout;
      const abkts = scratch.activeBuckets;
      const acnt = scratch.activeCount;
      // count: params.x = num_partial_slots = M_partials_walker.
      const countParams = ubuf(new Uint32Array([numPartialSlots, 0, 0, 0]));
      this.combineCountBind = mkBind(this.combineCountLayout, [pdest, pcount, countParams]);
      // scan: params.x = num_dense (read from planner_meta at dispatch time? we use B_TOTAL as upper bound)
      const combineScanParams = ubuf(new Uint32Array([B_TOTAL, 0, 0, 0]));
      this.combineScanBind = mkBind(this.combineScanLayout, [pcount, poffset, combineScanParams]);
      // scatter: params.x = num_partial_slots
      this.combineScatterBind = mkBind(this.combineScatterLayout, [pdest, poffset, pwpos, playout, countParams]);
      // arena_a2 monolith: partial_count + partial_layout are A2 sub-ranges; bind
      // the whole arena once and address them by offset (shared by both at-cap
      // combine kernels), freeing the slot that lets window_desc be storage (no cap).
      const a2Buf = slotBuf(pcount);
      if (slotBuf(playout) !== a2Buf) {
        throw new Error('combine: partial_count and partial_layout must share arena A2');
      }
      const combineArenaOff = ubuf(new Uint32Array([slotOff(pcount) / 4, slotOff(playout) / 4, 0, 0]));
      // filter: params = (num_dense, M_buckets, M_partials, _)
      const filterParams = ubuf(new Uint32Array([B_TOTAL, batchSlots, M_partials_walker, 0]));
      this.combineFilterBinds = batchWindowBaseBufs.map(bwb =>
        mkBind(this.combineFilterLayout, [sb, a2Buf, poffset, wp, scratch.redBuf, abkts, acnt, filterParams, scratch.streamPlannerMeta, scratch.isPresentBuf, bwb, windowDescBuf, combineArenaOff]),
      );
      // batched: params = (NUM_ACTIVE — dynamic, set at runtime, IDLE_ANCHOR, M_buckets, M_partials)
      // For now, we'll use 0 for NUM_ACTIVE here and update before dispatch (or dispatch ceil(B_TOTAL/S) and gate internally).
      // Walker params include IDLE_ANCHOR at param.y of the walker uniform — reuse the same value (batchSlots).
      // Counting-sort prepass binds. Reads active_buckets/active_count from
      // filter's output; writes sorted_active_buckets which combine_batched
      // reads at binding 0 (in place of the unsorted active_buckets).
      const chist = scratch.countHistogram;
      const boffs = scratch.binOffsets;
      const bwpos = scratch.binWritePos;
      const sabkts = scratch.sortedActiveBuckets;
      this.sortCountBind = mkBind(this.sortCountLayout, [abkts, acnt, pcount, chist]);
      this.sortScanBind = mkBind(this.sortScanLayout, [chist, boffs, bwpos, scratch.ptDispatchArgs, scratch.ptPersistentDispatchArgs, scratch.cbDispatchArgs]);
      this.sortScatterBind = mkBind(this.sortScatterLayout, [abkts, acnt, pcount, boffs, bwpos, sabkts]);
      // Pair-tree: handles hot buckets (N > HOT_THRESHOLD=8). Reads sorted
      // active list + bin_offsets to locate the hot tail; allocates scratch
      // slices via atomicAdd on pt_alloc; writes directly to bucket_sums.
      //   params.x = M_partials, .y = M_buckets, .z = M_scratch, .w = HOT_THRESHOLD
      // === Pair-tree v2 (multi-dispatch). pt_buf reuses ptScratch (32 MB
      // after the bump to 4× M_partials_walker). M_pt is the plane stride
      // for pt_buf; must equal exactly the per-plane slot capacity.
      //   ptScratch bytes  = 512 * sT * sS = 512 * T * S
      //   slots/plane      = bytes / (2 planes × PG × sizeof(vec4))
      //                    = bytes / 64
      //                    = 8 * T * S = 4 * M_partials_walker
      const M_pt = 4 * M_partials_walker;
      const ptBuf = scratch.ptScratch;
      const ptOffBuf = scratch.ptOff;
      const ptCountBuf = scratch.ptCount;
      const ptMetaBuf = scratch.ptMeta;
      const ptTasksBuf = scratch.ptTasks;
      const ptTotalBuf = scratch.ptTotalTasks;
      const ptDispatchBuf = scratch.ptDispatchArgs;
      // pt_init_copy params: (M_partials, M_pt)
      const ptInitCopyParams = ubuf(new Uint32Array([M_partials_walker, M_pt, 0, 0]));
      // pt_combine params: (M_pt)
      const ptCombineParams = ubuf(new Uint32Array([M_pt, 0, 0, 0]));
      // pt_finalize params: (M_pt, M_buckets=B_TOTAL)
      const ptFinalizeParams = ubuf(new Uint32Array([M_pt, B_TOTAL, 0, 0]));

      this.ptInitScanBind = mkBind(this.ptInitScanLayout, [sabkts, boffs, acnt, pcount, ptOffBuf, ptCountBuf, ptMetaBuf]);
      this.ptInitCopyBind = mkBind(this.ptInitCopyLayout, [sabkts, boffs, acnt, pcount, poffset, playout, wp, ptOffBuf, ptBuf, ptInitCopyParams]);
      this.ptBuildBind = mkBind(this.ptBuildLayout, [boffs, acnt, ptOffBuf, ptCountBuf, ptTasksBuf, ptTotalBuf]);
      // chain dispatch reads previous level's total and the hot_wgs source,
      // writes combine + build args. Build's level-loop indirect dispatch
      // turns into a no-op once total hits zero, so dead late levels cost
      // ~1 µs (dispatch_compute alone) instead of ~150 µs.
      this.ptDispatchChainBind = mkBind(this.ptDispatchChainLayout, [ptTotalBuf, scratch.ptCombineDispatchArgs, scratch.ptBuildLoopArgs, scratch.ptDispatchArgs]);
      this.ptCombineBind = mkBind(this.ptCombineLayout, [ptTasksBuf, ptTotalBuf, ptBuf, ptCombineParams]);
      this.ptFinalizeBinds = batchWindowBaseBufs.map(bwb =>
        mkBind(this.ptFinalizeLayout, [sabkts, boffs, acnt, ptOffBuf, ptBuf, scratch.redBuf, ptFinalizeParams, scratch.isPresentBuf, bwb, windowDescBuf]),
      );
      // combine_batched now reads sorted_active_buckets at binding 0 → zero
      // tail divergence per S=8 thread group.
      this.combineBatchedBinds = batchWindowBaseBufs.map(bwb =>
        mkBind(this.combineBatchedLayout, [sabkts, acnt, a2Buf, poffset, l0IdxBuf, this.pointXBuf, this.pointYBuf, wp, scratch.redBuf, windowDescBuf, walkerParams, bwb, combineArenaOff]),
      );
    }

    this.redStaging = device.createBuffer({
      size: NUM_WINDOWS * 64,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    this.prepBuffers.push(this.redStaging);
    this.nReduceInit = Math.ceil(RED_M / WGI);

    // --- Per-level bind groups ---
    const finalizeParamsBufs: GPUBuffer[] = [];
    for (let bi = 0; bi < numBatches; bi++) {
      // active_sums element stride is poolM1, not this MSM's M1 (the
      // buffer is sized to the pool's max; see padParams comment above).
      finalizeParamsBufs.push(ubuf(new Uint32Array([batchBuckets, poolM1, bi * batchBuckets, B_TOTAL])));
    }
    // --- Profiling: (re)create the timestamp query set, sized to the pass
    // count of the run() this prepare() set up. ---
    this.querySet?.destroy();
    this.querySet = null;
    this.tsResolveBuf = null;
    this.tsStagingBuf = null;
    if (this.profile) {
      let passes = 0;
      for (let bi = 0; bi < numBatches; bi++) {
        // 7 preprocess + 16 planner + 3 walker (size1+stream_walker+walker_index marker)
        // + 5 combine kernels (count, scan, scatter, filter, batched)
        // + 3 counting-sort prepass kernels (sort_count, sort_scan, sort_scatter)
        // + pair-tree multi-dispatch: 2 (init) + 17 × 3 (build + dispatch + combine) + 1 (finalize) = 54
        passes += 7 + 16 + 3 + 3 + 3 + (2 + 17 * 3 + 1);
      }
      // Reduce = one dispatch per level (table-driven), or a single dispatch for
      // the sparse path. +1 keeps the historical slack slot.
      passes += 1 + (this.sparseReduce ? 1 : this.reduceLevelBinds.length);
      // Region-split adds 3 preprocess dispatches (upper decompose/count/scatter).
      if (this.regionSplit) passes += 3;
      this.passCount = passes;
      this.querySet = device.createQuerySet({ type: 'timestamp', count: passes * 2 });
      this.tsResolveBuf = device.createBuffer({
        size: passes * 16,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });
      this.tsStagingBuf = device.createBuffer({
        size: passes * 16,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      this.prepBuffers.push(this.tsResolveBuf, this.tsStagingBuf);
    }

    // Write the per-prepare base_offset into the conv-active uniform at
    // params[1]. The other three fields ([total_slots, _, wstride, input_size])
    // were initialized in create() and are MSM-instance-invariant; only the
    // offset varies per call. 4-byte write at offset 4 in the buffer.
    this.device.queue.writeBuffer(this.convActiveParamsBuf, 4, new Uint32Array([srsOffset]));

    this.preparedFor = scalarsBuf;
    this.preparedSrsOffset = srsOffset;
  }

  /**
   * Fast path: the new plan's data-dependent sizes are all bounded by the
   * caps recorded on the first prepare for this instance, so we keep every
   * GPU buffer and bind group alive and only:
   *   1. re-upload the n×32 scalar bytes into the cached scalarsRawBuf,
   *   2. rewrite the SRS base_offset slot of the conv-active uniform,
   *   3. rewrite each level's plannerParams (pairBlocksPerWindow /
   *      carriesPerWindow) + carryParams (totalCarries) + every cached
   *      tileParams (totalPairBlocks),
   *   4. update the JS-side dispatch counts (`tile.nx`, `levelBinds[lv]
   *      .nCarry`) that run() reads.
   * On the M4 Pro this collapses the per-MSM setup from ~150 ms (drives
   * ~40 createBuffer calls + dozens of createBindGroup) to ~1 ms.
   *
   * Caller has already verified `fits` (M1, maxTotalPairBlocks, maxTotalCarries,
   * levels, numBatches, MAXC all ≤ the saved caps).
   */
  private fastPathRewrite(scalars: Uint32Array, srsOffset: number, _levelPlans: LevelPlan[], _levels: number): void {
    const device = this.device;
    writeSlot(device.queue, this.scalarsRawBuf, 0, scalars as BufferSource);
    if (srsOffset !== this.preparedSrsOffset) {
      device.queue.writeBuffer(this.convActiveParamsBuf, 4, new Uint32Array([srsOffset]));
    }
  }

  /**
   * Encode + submit the whole batched pipeline, then decode `red_buf` and
   * host-combine the windows into the affine MSM result (normal form). Must
   * be called after `prepare`. This is the timed phase. When the instance was
   * created with `profile`, the result carries a per-pass GPU breakdown;
   * otherwise `profile` is `null`.
   */
  /**
   * Number of bytes this MSM's per-window sums occupy in the dst staging
   * buffer when encoded via `encodeIntoBatch`. `numWindows × 64` (one 32-byte
   * x + 32-byte y per window).
   */
  get windowSumsByteLength(): number {
    return this.numWindows * 64;
  }

  /**
   * Encode this MSM's full pipeline (active-sums reset → decompose → transpose
   * → conv → level loop → bucket reduction → per-window result gather) into a
   * **caller-owned** encoder, writing the per-window sums to `dstStaging`
   * starting at byte `dstByteOff`. Does not submit. Used by the bridge to
   * collapse N MSMs into one `submit` + one `mapAsync` (the dominant
   * end-to-end cost — Chrome's polling latency on each `mapAsync` is the
   * single biggest per-MSM overhead).
   */
  encodeIntoBatch(
    enc: GPUCommandEncoder,
    dstStaging: GPUBuffer,
    dstByteOff: number,
    scalarsSrcBuf?: GPUBuffer,
    scalarsSrcByteOff: number = 0,
  ): void {
    if (this.preparedFor === null) throw new Error('MsmV2.encodeIntoBatch: call prepare() first');
    const { wgi: WGI } = this;
    let passIdx = 0;
    const profEnabled = this.profile && this.querySet;
    if (profEnabled) this.passPhases = [];
    let curPhase = 'misc';
    const setPhase = (p: string) => { curPhase = p; };
    const dispatch = (pipe: GPUComputePipeline, bind: GPUBindGroup, nx: number, ny = 1): void => {
      const desc: GPUComputePassDescriptor = {};
      if (profEnabled) {
        desc.timestampWrites = {
          querySet: this.querySet!,
          beginningOfPassWriteIndex: 2 * passIdx,
          endOfPassWriteIndex: 2 * passIdx + 1,
        };
        this.passPhases.push(curPhase);
        passIdx++;
      }
      const pass = enc.beginComputePass(desc);
      pass.setPipeline(pipe);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(Math.max(1, nx), Math.max(1, ny), 1);
      pass.end();
    };

    // Per-MSM scalars upload INTO the encoder. When two same-N MSMs share an
    // MsmV2 instance in one batched submit, prepare()'s queue-ordered
    // writeBuffer races (the second prepare's writeBuffer overwrites
    // scalarsRawBuf before submit runs). copyBufferToBuffer in the encoder
    // is order-correct: copyA → passA → copyB → passB executes sequentially
    // on the GPU, so passA reads A and passB reads B. The bridge stages all
    // batch scalars into one source buffer with one writeBuffer; each MSM's
    // encode copies its slice.
    if (scalarsSrcBuf) {
      enc.copyBufferToBuffer(
        scalarsSrcBuf,
        scalarsSrcByteOff,
        slotBuf(this.scalarsRawBuf),
        slotOff(this.scalarsRawBuf),
        this.n * 32,
      );
    }

    // Stream-walker buffers (Plan §6 + C's KNOB 2 variant).
    // walkerPartialDest is cleared INSIDE the batch loop instead — see note
    // there. Cleared once here too would just be redundant.
    clearSlot(enc, this.pool.scratch!.threadCuts);
    clearSlot(enc, this.pool.scratch!.walkerPartials);
    clearSlot(enc, this.pool.scratch!.taskCuts);
    // Pair-tree alloc counter — claims start from 0 each MSM (legacy v1 buf).
    enc.clearBuffer(this.pool.scratch!.ptAlloc);
    // Pair-tree v2 task counter — pt_dispatch_compute resets it each level,
    // but the very first level needs it zeroed too.
    clearSlot(enc, this.pool.scratch!.ptTotalTasks);
    // red_buf / is_present span ALL windows globally — each batch writes its
    // own [bi*batchWindows*STRIDE, (bi+1)*batchWindows*STRIDE) slice via the
    // batch_offset uniform. Clearing once per encode (not per batch) lets
    // batches accumulate side-by-side without overwriting one another.
    clearSlot(enc, this.pool.scratch!.redBuf);
    clearSlot(enc, this.pool.scratch!.isPresentBuf);
    // NOTE: partialCount, partialWritePos, activeCount, countHistogram are
    // cleared INSIDE the batch loop (below) — they are all atomicAdd'd per
    // batch, so leaving them cumulative across batches makes sortScatter
    // place batch-N bids using a histogram that double-counts batch-N-1's
    // entries. The mismatch leaves stale zeros in sortedActiveBuckets that
    // combine_batched then reads as bid=0, partial_count[0]=0, cnt=0, and
    // the pos >= cnt-1 termination underflows. (Capped at 1024 iters now,
    // but the underlying state is wrong.)

    for (let bi = 0; bi < this.numBatches; bi++) {
      const tbw = Math.min(this.batchWindows, this.numWindows - bi * this.batchWindows);
      const tSlots = tbw * this.n;
      setPhase('preprocess');
      // Region-split (Phase 2C-ii, numBatches==1 only): decompose + count +
      // scatter run as two regions — lower W_lo windows over all n, upper W_hi
      // windows over only n_large compacted points (idx_large). reduce + scan
      // stay over all tbw windows (they work on the CSR, point-count-agnostic).
      // No-split / multi-batch: the single unified all-n pass (= today).
      if (this.regionSplit) {
        const nXLarge = Math.ceil(this.nLarge / WGI);
        dispatch(this.decomposePipe, this.decomposeBinds[bi], this.nXposePts, this.wLo);
        dispatch(this.decomposeUpperPipe, this.decomposeUpperBind!, nXLarge, this.wHi);
        clearSlot(enc, this.rowPtrBuf);
        dispatch(this.xposeCountPipe, this.xposeCountBinds[bi], this.transposeNumPointTiles, this.wLo);
        dispatch(this.xposeCountPipe, this.xposeCountUpperBind!, this.transposeNumPointTiles, this.wHi);
        dispatch(this.xposeReducePipe, this.xposeReduceBinds[bi], Math.ceil(this.BW / 256), tbw);
        dispatch(this.xposeScanPipe, this.xposeScanBinds[bi], tbw, 1);
        dispatch(this.xposeScatterPipe, this.xposeScatterBinds[bi], this.transposeNumPointTiles, this.wLo);
        dispatch(this.xposeScatterUpperPipe, this.xposeScatterUpperBind!, this.transposeNumPointTiles, this.wHi);
      } else {
        dispatch(this.decomposePipe, this.decomposeBinds[bi], this.nXposePts, tbw);
        clearSlot(enc, this.rowPtrBuf);
        dispatch(this.xposeCountPipe, this.xposeCountBinds[bi], this.transposeNumPointTiles, tbw);
        dispatch(this.xposeReducePipe, this.xposeReduceBinds[bi], Math.ceil(this.BW / 256), tbw);
        dispatch(this.xposeScanPipe, this.xposeScanBinds[bi], tbw, 1);
        dispatch(this.xposeScatterPipe, this.xposeScatterBinds[bi], this.transposeNumPointTiles, tbw);
      }
      dispatch(this.convActivePipe, this.convActiveBind, Math.ceil(tSlots / WGI), 1);
      dispatch(this.convMetaPipe, this.convMetaBinds[bi], Math.ceil(this.BW / this.wgi), this.batchWindows);
      setPhase('planner');
      const spMeta = this.pool.scratch!.streamPlannerMeta;
      enc.clearBuffer(spMeta);
      // cumulative_adds is read by partition_thread / partition_task at
      // index 0 (and via OOB-returns-0 at num_dense-1u when num_dense==0).
      // It is written by ba_planner_cumsum only over [0, num_dense). For a
      // batch whose every covered window has zero scalars (profile D/E at
      // logn>=20), num_dense==0, cumsum writes nothing, and the prior
      // batch's value at index 0 leaks into partition_task's start_adds.
      // The resulting wraparound in (end_adds - start_adds) produces HUGE
      // task_cuts cut_offsets, which drive ba_stream_walker into an
      // infinite loop (cur_sorted advances past task_end_sort and never
      // returns; task_done never fires).
      clearSlot(enc, this.pool.scratch!.cumulativeAdds);
      // walker_combine atomic counters — must be per-batch, not per-MSM.
      // See note above the batch loop for the failure mode if cumulative.
      clearSlot(enc, this.pool.scratch!.partialCount);
      clearSlot(enc, this.pool.scratch!.partialWritePos);
      clearSlot(enc, this.pool.scratch!.activeCount);
      clearSlot(enc, this.pool.scratch!.countHistogram);
      // walkerPartialDest must also be per-batch. Walker only initializes its
      // own dispatched slots to NO_BUCKET (=0xFFFFFFFF); slots beyond that
      // would otherwise leak the previous batch's partial mapping into
      // combine_count/scatter. clearBuffer writes zeros — combine_count and
      // combine_scatter accept both 0 and NO_BUCKET as "no partial here"
      // since the classifier's magnitude filter guarantees no real bid is 0.
      clearSlot(enc, this.pool.scratch!.walkerPartialDest);
      dispatch(this.classifyPipe, this.classifyBinds[bi], Math.ceil(this.BW / 256), this.batchWindows);
      dispatch(this.metaFixupPipe, this.metaFixupBind, 1, 1);
      for (let rpass = 0; rpass < 3; rpass++) {
        dispatch(this.radixCountPipe, this.radixCountBinds[rpass], this.numRadixTiles, 1);
        dispatch(this.radixScanPipe, this.radixScanBind, 1, 1);
        dispatch(this.radixScatterPipe, this.radixScatterBinds[rpass], this.numRadixTiles, 1);
      }
      dispatch(this.cumsumPipe, this.cumsumBind, 1, 1);
      dispatch(this.partitionWgPipe, this.partitionWgBind, 1, 1);
      dispatch(this.partitionThreadPipe, this.partitionThreadBind, this.maxPlannerWorkgroups, 1);
      // Stream-walker KNOB 2 planner: precompute per-thread task cuts +
      // emit walker's indirect dispatch args at planner_meta[15..17].
      dispatch(this.partitionTaskPipe, this.partitionTaskBind, this.maxPlannerWorkgroups, 1);
      setPhase('accumulate');
      // NOTE: redBuf and isPresentBuf are cleared ONCE per encode (above
      // the batch loop), not per batch. Each batch writes its own global
      // window range — red_slot now includes batch_offset.x = bi * batchWindows
      // — so batches accumulate side-by-side without overwriting one another.
      // Indirect-dispatched accumulation kernels.
      const indirectDispatch = (pipe: GPUComputePipeline, bind: GPUBindGroup, buf: GPUBuffer, off: number): void => {
        const desc: GPUComputePassDescriptor = {};
        if (profEnabled) {
          desc.timestampWrites = {
            querySet: this.querySet!,
            beginningOfPassWriteIndex: 2 * passIdx,
            endOfPassWriteIndex: 2 * passIdx + 1,
          };
          this.passPhases.push(curPhase);
          passIdx++;
        }
        const pass = enc.beginComputePass(desc);
        pass.setPipeline(pipe);
        pass.setBindGroup(0, bind);
        pass.dispatchWorkgroupsIndirect(buf, off);
        pass.end();
      };
      setPhase('size1');
      indirectDispatch(this.size1Pipe, this.size1Binds[bi], spMeta, 8 * 4);
      // Stream-walker replaces stream_accum + partial_sum + emit + emit_fixup.
      // partition_task wrote the walker's indirect args to planner_meta[15..17]
      // (= byte offset 60 = 15 * 4).
      setPhase('stream_walker');
      indirectDispatch(this.streamWalkerPipe, this.streamWalkerBinds[bi], spMeta, 15 * 4);
      // === Optimal walker_combine: cross-bucket batched-inversion pipeline. ===
      // Phase A: count partials per bucket.
      // Phase B: prefix-sum partial_count → partial_offset; scatter dense layout.
      // Phase C: filter into active_buckets, copy 1-partial buckets straight to sums.
      // Phase D: batched-inversion combine for count>=2 buckets.
      setPhase('walker_index');
      const M_partials_walker = 2 * this.streamNumThreads * this.streamS;
      dispatch(this.combineCountPipe, this.combineCountBind, Math.ceil(M_partials_walker / 256), 1);
      dispatch(this.combineScanPipe, this.combineScanBind, 1, 1);
      dispatch(this.combineScatterPipe, this.combineScatterBind, Math.ceil(M_partials_walker / 256), 1);
      dispatch(this.combineFilterPipe, this.combineFilterBinds[bi], Math.ceil(this.bTotal / 256), 1);
      // Counting-sort prepass: group active_buckets by partial_count so each
      // combine_batched thread's S=8 slots have matching N (zero tail
      // divergence). Validated to claw back ~6.5 ms at logn=17 / M2.
      dispatch(this.sortCountPipe, this.sortCountBind, Math.ceil(this.bTotal / 256), 1);
      dispatch(this.sortScanPipe, this.sortScanBind, 1, 1);
      dispatch(this.sortScatterPipe, this.sortScatterBind, Math.ceil(this.bTotal / 256), 1);
      setPhase('combine_batched');
      // combine_batched handles cool (N≤8) buckets. Pair-tree handles hot.
      indirectDispatch(this.combineBatchedPipe, this.combineBatchedBinds[bi], this.pool.scratch!.cbDispatchArgs, 0);
      // === Pair-tree v2: multi-dispatch with cross-thread fan-out. ===
      // Each level is its own dispatch over a flat pair-task list spanning
      // ALL hot buckets, so a single giant bucket (e.g. profile E's N=131K
      // case) parallelizes across thousands of threads instead of
      // serializing inside one thread.
      //
      // pt_init_scan (1 thread): compute per-hot-bucket slice_base in
      //   pt_buf via exclusive prefix-sum of 2*N (the 2× reserves the
      //   per-level shift region). Seeds pt_off, pt_count for level 0.
      // pt_init_copy: parallel copy of level-0 partials into pt_buf at
      //   slice_base.
      // For each of MAX_LEVELS levels:
      //   pt_build (1 thread/hot bucket): emit pair-tasks into pt_tasks
      //     via workgroup-aggregated atomicAdd, advance (pt_off, pt_count)
      //     to next level's region.
      //   pt_dispatch (1 thread): convert pt_total_tasks → indirect
      //     dispatch args, reset pt_total_tasks for the next level.
      //   pt_combine (indirect): each thread = S=8 pair-tasks → 1 safegcd
      //     amortised across S adds. Cross-thread fan-out at this stage
      //     is the whole point.
      // pt_finalize: write each hot bucket's converged partial to
      //   bucket_sums.
      //
      // MAX_LEVELS = 17 covers up to N = 2^17 (= every input collapsed
      // into one bucket at logn=17).
      // Multi-dispatch pair-tree with skip-dead-levels chaining.
      setPhase('pt_init');
      const PT_LEVELS = 17;
      const ptHotArgs = this.pool.scratch!.ptDispatchArgs;
      const ptCombineArgs = this.pool.scratch!.ptCombineDispatchArgs;
      const ptBuildArgs = this.pool.scratch!.ptBuildLoopArgs;
      dispatch(this.ptInitScanPipe, this.ptInitScanBind, 1, 1);
      indirectDispatch(this.ptInitCopyPipe, this.ptInitCopyBind, ptHotArgs, 0);
      enc.copyBufferToBuffer(ptHotArgs, 0, ptBuildArgs, 0, 12);
      setPhase('pt_loop');
      for (let lvl = 0; lvl < PT_LEVELS; lvl++) {
        clearSlot(enc, this.pool.scratch!.ptTotalTasks);
        indirectDispatch(this.ptBuildPipe, this.ptBuildBind, ptBuildArgs, 0);
        dispatch(this.ptDispatchChainPipe, this.ptDispatchChainBind, 1, 1);
        indirectDispatch(this.ptCombinePipe, this.ptCombineBind, ptCombineArgs, 0);
      }
      setPhase('pt_finalize');
      indirectDispatch(this.ptFinalizePipe, this.ptFinalizeBinds[bi], ptHotArgs, 0);
    }
    setPhase('reduce');
    // Phase 2: reduce_init is gone — walker kernels write red_buf + is_present
    // directly via the bid → red_slot mapping. See UNIFIED_COMBINE_PLAN.md.
    // Phase 5: ONE pipeline drives every level (kind branched at runtime
    // off lparams.w). reduceLevelKinds is no longer consulted.
    if (this.sparseReduce && this.reduceSparsePipe && this.reduceSparseBind) {
      // Sparse path: one dispatch, one workgroup per window; the kernel walks
      // only the active buckets (gap-aware), skipping empties. Byte-identical to
      // the dense tree.
      dispatch(this.reduceSparsePipe, this.reduceSparseBind, this.numWindows, 1);
    } else {
      const reducePipe = this.reduceLevelPipes[0];
      // One dispatch per level over all windows; each window reads its own base +
      // per-level schedule from reduce_sched, so narrow split-c windows no-op the
      // levels past their shorter schedule (ppw==0) — fewer buckets, same dispatch
      // count as the uniform reduce.
      for (let lv = 0; lv < this.reduceLevelBinds.length; lv++) {
        dispatch(reducePipe, this.reduceLevelBinds[lv], this.numWindows, 1);
      }
    }
    // Per-window weighted sum gather. Same SoA stride math as run(), just
    // targeting an external staging buffer at an external offset. The red_buf
    // Y-plane stays at the envelope redM (the baked M_RED the writers use); the
    // per-window base is the tight reduceOffsets prefix.
    const yPlane = 32 * this.redM;
    for (let w = 0; w < this.numWindows; w++) {
      const g = 32 * this.reduceOffsets[w];
      enc.copyBufferToBuffer(slotBuf(this.redBuf), slotOff(this.redBuf) + g, dstStaging, dstByteOff + w * 64, 32);
      enc.copyBufferToBuffer(slotBuf(this.redBuf), slotOff(this.redBuf) + yPlane + g, dstStaging, dstByteOff + w * 64 + 32, 32);
    }
    if (this.profile && this.querySet && this.tsResolveBuf && this.tsStagingBuf) {
      enc.resolveQuerySet(this.querySet, 0, this.passCount * 2, this.tsResolveBuf, 0);
      enc.copyBufferToBuffer(this.tsResolveBuf, 0, this.tsStagingBuf, 0, this.passCount * 16);
    }
  }

  /**
   * Read this MSM's per-pass GPU timestamps (in nanoseconds) and sum them
   * to return total GPU compute time in milliseconds. Returns 0 when profile
   * mode is disabled. Caller must ensure the encoder that ran this MSM has
   * already been submitted and either `device.queue.onSubmittedWorkDone()`
   * or the staging buffer's `mapAsync` has resolved.
   */
  async readProfileGpuMs(): Promise<number> {
    if (!this.profile || !this.tsStagingBuf) return 0;
    try {
      await this.tsStagingBuf.mapAsync(GPUMapMode.READ);
    } catch {
      return 0;
    }
    const ts = new BigUint64Array(this.tsStagingBuf.getMappedRange().slice(0));
    this.tsStagingBuf.unmap();
    let totalNs = 0n;
    for (let p = 0; p < this.passCount; p++) totalNs += ts[2 * p + 1] - ts[2 * p];
    return Number(totalNs) / 1e6;
  }

  /**
   * Decode this MSM's per-window sums from a previously-mapped staging
   * buffer's bytes (`numWindows × 64` LE Montgomery-form bytes starting
   * at `byteOff`). Pure JS; no GPU ops. The Montgomery → canonical
   * conversion happens here (multiply by `rinv`).
   */
  decodeWindowSumsFromBytes(bytes: Uint8Array, byteOff: number): Pt[] {
    // The mapped range is u32-aligned (256-aligned) since GPU staging buffers
    // are aligned to the queue's transfer alignment. Read as Uint32Array view
    // — zero-copy.
    const red = new Uint32Array(bytes.buffer, bytes.byteOffset + byteOff, this.numWindows * 16);
    const out: Pt[] = new Array(this.numWindows);
    for (let w = 0; w < this.numWindows; w++) {
      const x = (packedU32x8ToBigint(red, w * 16) * this.rinv) % FP;
      const y = (packedU32x8ToBigint(red, w * 16 + 8) * this.rinv) % FP;
      out[w] = { x, y };
    }
    return out;
  }

  /**
   * Run ONLY the MSB-histogram kernel and read back its outputs (split-c Phase 1
   * validation). Requires `splitC` + a prior `prepare()`. Returns the 256-bin
   * histogram and the per-scalar msb array; compare against {@link computeMsbHistogram}.
   */
  async debugMsbHistogram(): Promise<{ hist: Uint32Array; msbPerScalar: Uint32Array }> {
    if (this.preparedFor === null) throw new Error('MsmV2.debugMsbHistogram: call prepare() first');
    if (!this.msbHistBind || !this.msbHistBuf || !this.msbPerScalarBuf) {
      throw new Error('MsmV2.debugMsbHistogram: requires splitC=true');
    }
    const enc = this.device.createCommandEncoder();
    enc.clearBuffer(this.msbHistBuf);
    const pass = enc.beginComputePass();
    pass.setPipeline(this.msbHistPipe);
    pass.setBindGroup(0, this.msbHistBind);
    pass.dispatchWorkgroups(Math.ceil(this.n / 256), 1, 1);
    pass.end();
    this.device.queue.submit([enc.finish()]);
    const hist = await readbackU32(this.device, this.msbHistBuf, 256 * 4);
    const msbPerScalar = await readbackU32(this.device, this.msbPerScalarBuf, this.n * 4);
    return { hist, msbPerScalar };
  }

  /**
   * Run histogram + decide kernels and read back the GPU-built WindowDesc + the
   * 16-u32 schedule summary (split-c Phase 2A validation). Requires `splitC` + a
   * prior `prepare()`. Compare against {@link buildWindowDescReference}.
   */
  async debugDecideWindowSplit(): Promise<{ windowDesc: Uint32Array; summary: Uint32Array }> {
    if (this.preparedFor === null) throw new Error('MsmV2.debugDecideWindowSplit: call prepare() first');
    if (!this.msbHistBind || !this.msbHistBuf || !this.msbDecideBind || !this.decideWindowDescBuf || !this.decideSummaryBuf) {
      throw new Error('MsmV2.debugDecideWindowSplit: requires splitC=true');
    }
    const enc = this.device.createCommandEncoder();
    enc.clearBuffer(this.msbHistBuf);
    const hp = enc.beginComputePass();
    hp.setPipeline(this.msbHistPipe);
    hp.setBindGroup(0, this.msbHistBind);
    hp.dispatchWorkgroups(Math.ceil(this.n / 256), 1, 1);
    hp.end();
    const dp = enc.beginComputePass();
    dp.setPipeline(this.msbDecidePipe);
    dp.setBindGroup(0, this.msbDecideBind);
    dp.dispatchWorkgroups(1, 1, 1);
    dp.end();
    this.device.queue.submit([enc.finish()]);
    const windowDesc = await readbackU32(this.device, this.decideWindowDescBuf, this.decideWindowDescBuf.size);
    const summary = await readbackU32(this.device, this.decideSummaryBuf, 16 * 4);
    return { windowDesc, summary };
  }

  /**
   * Run histogram + decide + idx_large compaction and read back idx_large + its
   * count (split-c Phase 2B validation). The count must equal the decide summary's
   * n_large, and every returned index must have msb >= b_star-1.
   */
  async debugIdxLarge(): Promise<{ count: number; idxLarge: Uint32Array; summary: Uint32Array }> {
    if (this.preparedFor === null) throw new Error('MsmV2.debugIdxLarge: call prepare() first');
    if (!this.msbHistBind || !this.msbHistBuf || !this.msbDecideBind || !this.msbIdxLargeBind || !this.idxLargeBuf || !this.idxLargeCountBuf || !this.decideSummaryBuf) {
      throw new Error('MsmV2.debugIdxLarge: requires splitC=true');
    }
    const enc = this.device.createCommandEncoder();
    enc.clearBuffer(this.msbHistBuf);
    const hp = enc.beginComputePass();
    hp.setPipeline(this.msbHistPipe);
    hp.setBindGroup(0, this.msbHistBind);
    hp.dispatchWorkgroups(Math.ceil(this.n / 256), 1, 1);
    hp.end();
    const dp = enc.beginComputePass();
    dp.setPipeline(this.msbDecidePipe);
    dp.setBindGroup(0, this.msbDecideBind);
    dp.dispatchWorkgroups(1, 1, 1);
    dp.end();
    enc.clearBuffer(this.idxLargeCountBuf);
    const ip = enc.beginComputePass();
    ip.setPipeline(this.msbIdxLargePipe);
    ip.setBindGroup(0, this.msbIdxLargeBind);
    ip.dispatchWorkgroups(Math.ceil(this.n / 256), 1, 1);
    ip.end();
    this.device.queue.submit([enc.finish()]);
    const countArr = await readbackU32(this.device, this.idxLargeCountBuf, 4);
    const count = countArr[0];
    const summary = await readbackU32(this.device, this.decideSummaryBuf, 16 * 4);
    const idxLarge = await readbackU32(this.device, this.idxLargeBuf, this.n * 4);
    return { count, idxLarge, summary };
  }

  async run(): Promise<{ x: bigint; y: bigint; profile: ProfileBreakdown | null; windowSums: Pt[]; c: number }> {
    if (this.preparedFor === null) throw new Error('MsmV2.run: call prepare() first');
    const device = this.device;
    const wallT0 = performance.now();
    const enc = device.createCommandEncoder();
    this.encodeIntoBatch(enc, this.redStaging, 0);
    if (this.profile && this.querySet && this.tsResolveBuf && this.tsStagingBuf) {
      enc.resolveQuerySet(this.querySet, 0, this.passCount * 2, this.tsResolveBuf, 0);
      enc.copyBufferToBuffer(this.tsResolveBuf, 0, this.tsStagingBuf, 0, this.passCount * 16);
    }
    device.queue.submit([enc.finish()]);
    // walker_combine runs the split-bucket reduce on the GPU within the
    // same encoder, so there's no host fixup to interleave any more.
    await this.redStaging.mapAsync(GPUMapMode.READ);
    const stagingBytes = new Uint8Array(this.redStaging.getMappedRange());
    const L = this.decodeWindowSumsFromBytes(stagingBytes, 0);
    this.redStaging.unmap();
    this.windowSums = L;
    // The bridge ships these per-window sums to the C++ hook for a native
    // bb::g1 combine; the benchmark harness (combineOnHost) does it here.
    const result = this.combineOnHost ? hostWindowCombine(L, this.windowCs) : { x: 0n, y: 0n };


    // Per-pass GPU timestamps were tracked here pre-refactor; the new
    // encodeIntoBatch path doesn't capture category labels (the dev page's
    // profile-mode breakdown is no longer reconstructed from this code path
    // — use the dev sweep page directly for that). Wall time still works.
    let profile: ProfileBreakdown | null = null;
    if (this.profile && this.tsStagingBuf) {
      const phaseNs: Record<string, bigint> = {};
      let totalNs = 0n;
      try {
        await this.tsStagingBuf.mapAsync(GPUMapMode.READ);
        const tsArr = new BigUint64Array(this.tsStagingBuf.getMappedRange().slice(0));
        this.tsStagingBuf.unmap();
        for (let p = 0; p < this.passCount; p++) {
          const dur = tsArr[2 * p + 1] - tsArr[2 * p];
          totalNs += dur;
          const phase = this.passPhases[p] ?? 'misc';
          phaseNs[phase] = (phaseNs[phase] ?? 0n) + dur;
        }
      } catch {
        // mapAsync raced (already-mapped from a prior run); skip this sample.
      }
      const phaseMs: Record<string, number> = {};
      for (const key of Object.keys(phaseNs)) phaseMs[key] = Number(phaseNs[key]) / 1e6;
      if (typeof window !== 'undefined') {
        (window as unknown as { __lastPhaseMs?: Record<string, number> }).__lastPhaseMs = phaseMs;
      }
      const totalMs = Number(totalNs) / 1e6;
      profile = {
        decompose: totalMs,
        transpose: 0,
        convert: 0,
        planner: 0,
        fused: 0,
        carry: 0,
        finalize: 0,
        redInit: 0,
        redLevel: 0,
        wall: performance.now() - wallT0,
      };
    }
    return { x: result.x, y: result.y, profile, windowSums: L, c: this.c };
  }

  /** Per-window weighted sums L_w (normal form), set by the last run(). */
  windowSums: Pt[] = [];

  /**
   * GPU bytes the instance itself owns — every buffer in `prepBuffers`,
   * which the slow-path setup pushes every allocation into. Excludes the
   * shared point pool (count that via `MsmV2Pool.statsBytes()`). Used by
   * the bench harness to track per-phase memory savings as the memory-
   * reduction plan lands. Sums after destroy() are 0.
   */
  statsBytes(): number {
    let total = 0;
    for (const b of this.prepBuffers) total += b.size;
    return total;
  }

  /**
   * Release every GPU buffer owned by this instance. The shared point pool is
   * owned by the {@link MsmV2Pool}, not by an instance, and is not freed here.
   */
  destroy(): void {
    for (const b of this.prepBuffers) b.destroy();
    this.prepBuffers = [];
    this.preparedFor = null;
    this.querySet?.destroy();
    this.querySet = null;
  }
}
