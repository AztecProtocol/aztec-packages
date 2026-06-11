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
import { buildFoldTower } from './fold_tower.js';
import { buildHalvingSchedule, type HalvingSchedule } from './halving_reduce.js';
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
const WI_IDX_TPB = 256; // walker_index v2 kernel workgroup size (and indirect-arg grain)
const FP = BN254_BASE_FIELD;
const NUMBITS = 254; // scalar field bit length
// High-mem ping-pong fused-block width (pairs sharing one batched inversion).
// FIXED (not pickS(n)) so the fused/emit kernels stay one-program — a baked
// constant keeps the inversion loops unrolled while the WGSL string is invariant
// across every n the pool serves. walkChunkPlan + planner_emit + fused must all
// use this same value.
const HIGH_MEM_S = 2;
// Default small-N auto-gate threshold for the high-mem ping-pong (0 = off).
// DEFAULT OFF: rigorous profile=false measurement (msm-batch-bench) shows the
// ping-pong is perf-NEUTRAL vs the walker in true GPU time across all N — the
// 1.7-2× that the profiled msm-bench reported was an artifact of profile=true
// penalising the walker's higher dispatch count via per-timestamp-query overhead.
// The implementation stays available behind MsmConfig.pingpongBelow / ?ppbelow=N
// (it issues ~half the walker's dispatches, so it may still win on devices where
// CPU-side dispatch/submit overhead dominates — e.g. mobile — pending that
// characterization). The bridge does not forward config, so this default is what
// reaches production.
const PINGPONG_BELOW_DEFAULT = 0;
// High-mem ping-pong cooperative deep-tail collapse (Thread 2). One workgroup
// per bucket reduces its <= CAP remaining points to a single sum in workgroup
// memory, collapsing the starved deep-tail levels into one dispatch.
const COOP_TAIL_WG = 256;
const COOP_TAIL_CAP = 256;
const COOP_TAIL_STARVE = 4096; // switch to coop-tail once active buckets drop below this
// Halving ba kernels' workgroup size: bounded by the workgroup-memory
// partial-product slots (WG × (cpairs-1) × 32B — 14KB at C=8).
const HALVE_BA_WG = 64;

// A scratch buffer is either a standalone GPUBuffer or a {buffer,offset,size}
// slot carved from an arena (ARENA_LAYOUT.md §1). These helpers act on either,
// so clear/write/copy sites work whether or not the buffer has been migrated.
type ScratchSlot = GPUBuffer | GPUBufferBinding;
const slotBuf = (x: ScratchSlot): GPUBuffer => (x instanceof GPUBuffer ? x : x.buffer);
const slotOff = (x: ScratchSlot): number => (x instanceof GPUBuffer ? 0 : (x.offset ?? 0));
const slotSize = (x: ScratchSlot): number => (x instanceof GPUBuffer ? x.size : (x.size ?? 0));
const clearSlot = (enc: GPUCommandEncoder, x: ScratchSlot): void =>
  enc.clearBuffer(slotBuf(x), slotOff(x), slotSize(x));
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
    // activeBuckets is sized for (bid, n) PAIRS (walker_index v2's idx_alloc
    // writes both); the v1 path uses the first half as plain bids.
    // activeCount carries [count, alloc_total] — 2 u32.
    a(sBTotal * 8) +
      a(8) +
      a(64 * 4) +
      a(sBTotal * 4) +
      a(reducePrefBytes) +
      a(sBTotal * 4) +
      a(scalarsBytes) +
      a(l0Slots * 4),
    // A1: bucketAndSign denseBucketList denseCountList binWritePos cumulativeAdds ptCount ptMeta ptTasks ptTotalTasks walkerPartialDest rowPtrBuf isPresentBuf redBuf
    a(batchSlots * 4) +
      a(sBTotal * 4) +
      a(sBTotal * 4) +
      a(64 * 4) +
      a(sBTotal * 4) +
      a(sBTotal * 4) +
      a(16) +
      a(2 * sT * sS * 16) +
      a(4) +
      a(2 * sT * sS * 4 + 8) + // walkerPartialDest: +2 u32 residency-counter slots (live, peak)
      a(rowPtrLen * 4) +
      a(redM * 4) +
      a(soa),
    // A2: partialCount partialLayout size1BucketList taskCuts valIdxBuf
    a(sBTotal * 4) + a(2 * sT * sS * 4) + a(sBTotal * 2 * 4) + a(sT * (sS + 1) * 2 * 4) + a(batchSlots * 4),
    // A3: radixHist threadCuts walkerPartials countHistogram ptOff
    a(sRadixTiles * 256 * 4) + a(sT * 2 * 4) + a(10 * sT * sS * 16) + a(64 * 4) + a(sBTotal * 4),
    // A4: ptScratch sortedBucketList wgCuts
    a(512 * sT * sS) + a(sBTotal * 4) + a(MAX_STREAM_WORKGROUPS * 2 * 4),
    // A5: partialOffset sortedActiveBuckets redZBuf
    // redZBuf = Jacobian Z-plane (Thread-1 reduce), PG vec4/slot over redM slots
    // = half of redBuf's SoA. Only written when the Jacobian reduce is active,
    // but sized at high-water redM like redBuf (grows on the same redM trigger).
    a((sBTotal + 1) * 4) + a(sBTotal * 4) + a(PG * redM * 4 * 4),
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
  return STREAM_MPW_FLOOR;
}

// Planner workgroups per walker workgroup. The planner partitions work at
// STREAM_PLANNER_TPB, but the walker runs at STREAM_WALKER_TPB, so the walker's
// indirect launch emits `mpw · WALKERS_PER_MPW` workgroups (currently 4×).
const WALKERS_PER_MPW = STREAM_PLANNER_TPB / STREAM_WALKER_TPB;
// Smallest planner cap the working-set sizing supports (Plan §8 floor); also the
// fallback chooseBudgetMpw returns when nothing fits the budget.
const STREAM_MPW_FLOOR = 4;

// Peak resident walker workgroups (R) measured by the kernel's atomic residency
// counter on THIS GPU. 0 until the first calibrating run fills it; reused by every
// later create() so the planner cap fits one resident wave with no re-measure.
// Process-scoped because residency is a property of the GPU, not of the MSM.
let cachedResidentWalkerWg = 0;

/**
 * Largest planner cap that keeps the walker's launch within a single resident
 * wave. The indirect dispatch emits `mpw · WALKERS_PER_MPW` workgroups; capping
 * `mpw` at `⌊R / WALKERS_PER_MPW⌋` keeps that ≤ R, so every workgroup is resident
 * at once and there is no straggler second wave (the tail). Returns `budgetMpw`
 * unchanged until R is known — the first run then calibrates and caches it.
 */
function residencyFitMpw(budgetMpw: number): number {
  if (cachedResidentWalkerWg <= 0) return budgetMpw;
  const rFit = Math.floor(cachedResidentWalkerWg / WALKERS_PER_MPW);
  return Math.max(STREAM_MPW_FLOOR, Math.min(budgetMpw, rFit));
}

// Defaults for the size-independent knobs (see MsmConfig). `c`, `s` and
// `reduceWg` are instead chosen per problem size — by pickC / pickS /
// pickReduceWg below. All values are the bench-msm-v2 sweep optimum.
const DEFAULT_WGI = 128; // generic kernel workgroup size
const DEFAULT_L0_LOG = 1; // reduction leaf-partition log2
const DEFAULT_INV_VARIANT: 'loop' | 'pk' = 'pk';

// Reduction-coordinate regime (Thread-1 port from wt/structure). Below this
// total-thread count the densest reduce level can't saturate the GPU, so the
// inversion-free Jacobian reduce (no amortised batch inversion) beats the
// affine reduce; above it the affine path's amortised inversion wins. Measured
// on M2 (T_sat scales with core count; the affine/Jacobian cost ratio does not).
const T_SAT_REDUCE = 16384;
const JAC_AUTO = -1; // jacobianCrossover sentinel: auto-select the regime from T_SAT_REDUCE

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
  /**
   * Use the packed-native 14-bit safegcd inverse (e0=R² Montgomery-form output)
   * in the stream_walker only — consumes/produces f8 directly, no BigInt round-
   * trip. Adreno register-pressure win; byte-identical. Default false; other
   * kernels keep `invVariant`. The win is the walker (the hot batched inversion).
   */
  pk14Inverse?: boolean;
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
   * Per-level affine/Jacobian cut (Thread-1 step-4). When set, each reduce level
   * independently runs Jacobian if it can't saturate the batch-affine path
   * (doublings always Jacobian; adds Jacobian iff numWindows·ppw <
   * {@link reduceSatThreshold}), else batch-affine. Saturated late tree levels
   * stay affine even with a Jacobian middle — the jac→affine flip is bridged by
   * a batched convert. Supersedes the single contiguous `jacobianCrossover` suffix.
   */
  perLevelJac?: boolean;
  /** Per-level cut saturation threshold (active threads); ppw·numWindows below this runs Jacobian. Default 8192. */
  reduceSatThreshold?: number;
  /** Slots per thread (one safegcd per chunk) in the batched jac→affine convert. Default 8. */
  convChunk?: number;
  /**
   * Convert-affordability bound (slots = numWindows·stride). The per-level cut
   * only pushes the doublings to Jacobian — forcing one jac→affine convert —
   * when numWindows·stride ≤ this. Above it, only the free starved suffix runs
   * Jacobian (no convert). On M2 the crossover is c=13 (82k, pays) vs c=15 (279k). Default 150000.
   */
  convertBound?: number;
  /**
   * Thread 2 forced flag: run the high-memory A/B ping-pong pair-tree bucket-sum
   * stage instead of the stream-walker + combine. Default false. The bucket→
   * window reduce is unchanged (still the Jacobian/affine reduce). Intended for
   * small/skewed MSMs where the multi-dispatch tree saturates the GPU the serial
   * walker starves; gated on a small-N threshold in a later step.
   */
  highMemPingpong?: boolean;
  /**
   * Small-N auto-gate for the high-mem ping-pong: when `n ≤ pingpongBelow`, route
   * the MSM through the ping-pong instead of the walker (0 = off, default). The
   * ping-pong wins ~1.4-1.8× below the crossover (≈ logN 14-15 on M2) and loses
   * above it. Independent of (and OR'd with) the forced `highMemPingpong` flag.
   */
  pingpongBelow?: number;
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
   * Override the measured resident-workgroup count R used by the residency fit
   * (see {@link MsmV2.calibrateResidency}). 0 (default) measures R on-device via
   * the walker's atomic probe. Set it to skip the probe and force a specific R —
   * for tests exercising the refit path, or to pin a known device R.
   */
  residentWgOverride?: number;
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
   * wi4 Phase-1 probes (WALKER_INDEX_PLAN.md): dispatch the two
   * cost-model kernels (sorted-runs sweep + build) between stream_walker
   * and the real index pipeline, labelled wi_p1/wi_p2. They write only to
   * pair-tree scratch (rewritten afterwards) — correctness-neutral.
   */
  wiProbe?: boolean;
  /**
   * Use the sparse bucket reduction (skips empty buckets via a gap-aware suffix
   * sum) instead of the dense table-driven tree. Byte-identical result; wins on
   * structured/sparse scalar distributions (the production wire commits). v0 is
   * one-thread-per-window (validation); v1 batches the inversions for speed.
   */
  sparseReduce?: boolean;
  /**
   * Use the fold-tower bucket reduction (GROUPED_REDUCE_PLAN.md): 2-3 wide
   * batch-affine fold dispatches + a per-window Jacobian tail replace the
   * 35-level dense schedule. Byte-identical result.
   */
  groupedReduce?: boolean;
  /** Fold-tower rows-per-chunk per level (sweep knob; see buildFoldTower). */
  foldMTower?: number[];
  /** Fold-tower combine input length cap (sweep knob; default and maximum 32
   *  — the combine kernel is one small workgroup per window). */
  foldTailMax?: number;
  /** Fold regime threshold: a level runs batch-affine with the largest k
   *  (chunks/thread, C = k·(2+streams) adds per inversion) keeping
   *  chunks/k ≥ foldSat threads; below it the level runs the inversion-free
   *  Jacobian fold. Default 2560. */
  foldSat?: number;
  /** Force a fixed affine k on every fold level (sweep/debug). */
  foldK?: number;
  /** Use the workgroup-cooperative inversion kernel for affine fold levels
   *  (the per-row pk14 batches across the whole workgroup; k pinned to 1). */
  foldCoop?: boolean;
  /** Use the thread-local tower kernel for affine M = 8 stream-less levels
   *  (in-register binary tower, 5 round-batched inversions, no barriers). */
  foldTlocal?: boolean;
  /** Halving bucket reduction (Mitschabaude): one dispatch per wide depth —
   *  batch-affine 8/4 pairs per thread while saturated, Jacobian pairs once
   *  thin — plus a one-workgroup-per-window finisher. No split-c support. */
  halvingReduce?: boolean;
  /** Halving finisher entry budget (live values per window). Default 64
   *  (measured M4 optimum — finisher chains scale with per-array length). */
  halveCap?: number;
  /** Width down to which the wide phase keeps batch-4 before falling back
   *  to Jacobian pairs. Default = foldSat. */
  halveBa4Floor?: number;
  /** Early exit: the GPU pipeline ends at the staged-partials pass; the
   *  per-window finishing sum and the cross-window Horner combine run in ONE
   *  native WASM call (finish_and_combine_windows) on the readback bytes.
   *  Requires halvingReduce. */
  earlyExit?: boolean;
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
  /**
   * Two-level preprocess (pp2), the default since its 3-device validation:
   * 4 kernels — fused decompose+coarse-bin count materializing u16 digit
   * pairs, a per-window cursor scan, a direct bin scatter, and a per-bin
   * counting sort emitting the final l0 entries + bucket meta. One universal
   * composition, no device-specific paths (WebGPU cannot identify hardware).
   * Covers uniform-schedule single-batch MSMs and same-class concatenated
   * unions with c in [8, 15], even per-window point counts and n <= 2^20;
   * anything else (mixed-class unions, multi-batch, region-split, tiny or
   * over-wide c) falls back to the classic 7-dispatch pipeline per prepare.
   * Set false to force the classic pipeline everywhere.
   */
  preprocessV2?: boolean;
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

// One level of the high-mem ping-pong pair-tree's pre-built bind groups
// (Thread 2). The active_sums plane (bufA/bufB), plan rings and counts/offsets
// ping-pong by level parity; level 0 reads the packed l0_index and gathers from
// the SRS pool (the L0 layout variants).
interface PingLevelBind {
  plannerABind: GPUBindGroup;
  plannerBBind: GPUBindGroup;
  fusedTiles: { bind: GPUBindGroup; nx: number }[];
  carryBind: GPUBindGroup;
  finalizeAccumBinds: GPUBindGroup[]; // one per window-batch (bb_base)
  nCarry: number;
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

// One contiguous MSM inside the host histogram: a scalar slice (byte base + n),
// its window width c, and where its windows land in the concatenated global
// window grid. The single-MSM path is one segment at base 0 / window 0; the
// union path is one segment per BatchMember at its scalarBaseBytes / schedOff.
interface HistSegment {
  scalarByteBase: number;
  n: number;
  c: number;
  schedOff: number;
  numWindows: number;
}

// Host level-0 histogram for the high-mem ping-pong planner: signed-Booth recode
// every (scalar, window) into its bucket, tallying per-bucket counts at the
// global window base `schedOff·BW + w_local·BW`. Used only to size the per-level
// dispatches at encode time without a GPU readback — the actual work is driven
// by the GPU-built counts (csr_to_v2_meta). Byte-based (no BigInt) so it stays
// cheap at n = 131k; the recode + lookback match `boothDigit` and the GPU
// decompose exactly. Each segment is uniform-c (a member's own c); the union
// concatenates members, each decoded MSM-local at its bit_base = w_local·c.
function buildInitCounts(
  scalarBytes: Uint8Array,
  segments: HistSegment[],
  totalWindows: number,
  BW: number,
): Uint32Array {
  const initCounts = new Uint32Array(totalWindows * BW);
  for (const seg of segments) {
    const c = seg.c;
    const cMask = (1 << c) - 1;
    for (let i = 0; i < seg.n; i++) {
      const off = seg.scalarByteBase + i * 32;
      let lookback = 0;
      for (let w = 0; w < seg.numWindows; w++) {
        const lo = w * c;
        const inOff = lo >>> 3;
        const byteOff = off + inOff;
        const bitShift = lo & 7;
        // Up to 4 bytes covering bits [lo, lo+c) of THIS scalar (bytes past index
        // 31 read as 0 so high windows don't pull in the next scalar's bytes).
        const b0 = scalarBytes[byteOff];
        const b1 = inOff + 1 < 32 ? scalarBytes[byteOff + 1] : 0;
        const b2 = inOff + 2 < 32 ? scalarBytes[byteOff + 2] : 0;
        const b3 = inOff + 3 < 32 ? scalarBytes[byteOff + 3] : 0;
        const v = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
        const winBits = (v >>> bitShift) & cMask;
        const raw = (winBits << 1) | lookback;
        const neg = (raw >>> c) & 1;
        const negMask = neg ? 0xffffffff : 0;
        const encode = (raw + 1) >>> 1;
        const bucket = (((encode - neg) >>> 0) ^ negMask) & cMask;
        initCounts[(seg.schedOff + w) * BW + bucket]++;
        lookback = (v >>> (bitShift + c - 1)) & 1;
      }
    }
  }
  return initCounts;
}

// Walk the monotonic bucket-split pair-tree for one chunk's level-0 histogram,
// yielding each level's (pairBlocksPerWindow, carriesPerWindow) and the peak
// per-window stride (sum of next-level counts — sizes M1 / bufA-B). One level =
// halve every bucket's points into pairs (pc) + an odd carry (cf), nc = pc+cf;
// stop when no bucket has any points left.
function walkChunkPlan(
  chunkInit: Uint32Array,
  s: number,
  numWindows: number,
  BW: number,
): { levelPlans: LevelPlan[]; wstride1: number } {
  const levelPlans: LevelPlan[] = [];
  let wstride1 = 1;
  const bt = numWindows * BW;
  const countsA = new Uint32Array(bt);
  const countsB = new Uint32Array(bt);
  let countsCur: Uint32Array = chunkInit;
  let countsNext: Uint32Array = countsA;
  for (let lv = 0; lv < 64; lv++) {
    let anyActive = false;
    let pairBlocksPerWindow = 1;
    let carriesPerWindow = 1;
    for (let w = 0; w < numWindows; w++) {
      let pairs = 0;
      let carries = 0;
      let strideCnt = 0;
      const wbase = w * BW;
      for (let bl = 0; bl < BW; bl++) {
        const g = wbase + bl;
        const cnt = countsCur[g];
        if (cnt > 0) anyActive = true;
        const pc = cnt >>> 1;
        const cf = cnt === 1 ? 0 : cnt & 1;
        const nc = pc + cf;
        countsNext[g] = nc;
        pairs += pc;
        carries += cf;
        strideCnt += nc;
      }
      const blocks = Math.ceil(pairs / s);
      if (blocks > pairBlocksPerWindow) pairBlocksPerWindow = blocks;
      if (carries > carriesPerWindow) carriesPerWindow = carries;
      if (strideCnt > wstride1) wstride1 = strideCnt;
    }
    if (!anyActive) break;
    levelPlans.push({ pairBlocksPerWindow, carriesPerWindow, totalPairBlocks: 0, totalCarries: 0 });
    countsCur = countsNext;
    countsNext = countsCur === countsA ? countsB : countsA;
  }
  return { levelPlans, wstride1 };
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
export function hostWindowCombine(L: Pt[], windowCs: number[]): Pt {
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
  // High-mem ping-pong harvest target: bucket sums (affine SoA, bTotal columns/
  // window). ba_reduce_init repacks it into redBuf. 4 B stub unless high-mem.
  bucketResultBuf: GPUBuffer;
  // High-mem ping-pong per-global-bucket first-touch flag (bTotal × u32).
  // Standalone (NOT arena) so it never colour-conflicts with l0IdxBuf in the L0
  // finalize bind's ro/rw set. 4 B stub unless high-mem.
  touchedBuf: GPUBuffer;
  l0IdxBuf: GPUBufferBinding;
  l0BaseBuf: GPUBuffer;
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
  redZBuf: GPUBufferBinding; // arena A5 — Jacobian Z-plane for the Thread-1 reduce
  reducePrefScratch: GPUBufferBinding;
  // Streaming planner + accumulator buffers (Phase 1-4).
  streamPlannerMeta: GPUBuffer;
  // pp2 preprocess bin-count / cursor matrix: [window][bin][tile] + sentinel.
  // 4 B stub until a preprocessV2 instance prepares.
  ppvBinCounts: GPUBuffer;
  arenas: GPUBuffer[]; // one GPU buffer per arena colour (ARENA_LAYOUT.md §1); mkBind-only scratch carved at 256-B offsets

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
  taskCuts: GPUBufferBinding; // arena slot — (S+1) cut points/thread × 2 u32
  walkerPartials: GPUBufferBinding; // arena slot — 2*S partial slots/thread (split-start + task-end)
  walkerPartialDest: GPUBufferBinding; // arena slot — bucket_id per partial slot (NO_BUCKET if unused)
  // Optimal walker_combine pipeline buffers.
  partialCount: GPUBufferBinding; // arena slot — bTotal × atomic<u32> — partials per bucket
  partialOffset: GPUBufferBinding; // arena slot — (bTotal+1) × u32 — exclusive prefix sum
  partialWritePos: GPUBufferBinding; // arena slot — bTotal × atomic<u32> — scatter scratch
  partialLayout: GPUBufferBinding; // arena slot — max_partials × u32 — dense per-bucket slot indices
  activeBuckets: GPUBufferBinding; // arena slot — bTotal × u32 — filtered list of count>=2 bucket_ids
  activeCount: GPUBufferBinding; // arena slot — 1 × atomic<u32> — size of active_buckets
  // Counting-sort prepass: groups active_buckets by partial_count so each
  // combine_batched thread's S=8 slots have matching N → zero tail divergence.
  // MAX_N = 64 bins (sized in ba_walker_combine_sort_*.template.wgsl).
  countHistogram: GPUBufferBinding; // arena slot — MAX_N × atomic<u32>
  binOffsets: GPUBufferBinding; // arena slot — MAX_N × u32 — exclusive prefix sum
  binWritePos: GPUBufferBinding; // arena slot — MAX_N × atomic<u32>
  sortedActiveBuckets: GPUBufferBinding; // arena slot — bTotal × u32 — active_buckets in N order
  // Pair-tree hot-bucket combine. pt_scratch holds intermediate level
  // partials per hot bucket; pt_alloc is a single atomic claim counter
  // reset each MSM. Sized for the worst case where every emitted partial
  // is in a hot bucket — sum(2N over hot) ≤ 2 × total_partials.
  ptScratch: GPUBufferBinding; // arena slot — pt_buf (512·sT·sS B ≈ 32 MB)
  ptAlloc: GPUBuffer; // 1 × atomic<u32> — legacy, kept to avoid bind churn
  ptDispatchArgs: GPUBuffer; // 3 × u32 — sort_scan writes (ceil(hot_count/TPB),1,1); used by pt_init_copy/build/finalize
  ptCombineDispatchArgs: GPUBuffer; // 3 × u32 — pt_dispatch_compute writes per-level (ceil(total_tasks/S/TPB),1,1)
  ptBuildLoopArgs: GPUBuffer; // 3 × u32 — dispatch_chain writes hot_wgs while any pair-tasks remain, else 0; build's level-by-level indirect dispatch reads this
  cbDispatchArgs: GPUBuffer; // 3 × u32 — sort_scan writes (ceil(cb_active / (CB_TPB*CB_S)), 1, 1); combine_batched indirect-dispatched off it
  // walker_index indirect args: [0..2] slot-wide (idx_count/idx_scatter,
  // written by partition_task), [3..5] dense-wide (idx_alloc, partition_task),
  // [6..8] active-wide (idx_sort, written by idx_epilogue).
  wiIdxArgs: GPUBuffer; // 9 × u32
  ptPersistentDispatchArgs: GPUBuffer; // 3 × u32 — packer writes (NUM_WGS, 1, 1)
  ptBucketWg: GPUBuffer; // sBTotal × u32 — per-bucket WG assignment (packer intermediate)
  ptWgMeta: GPUBuffer; // MAX_WGS × 4 × u32 — (scratch_off, count, total_partials, _) per WG
  ptWgBucketList: GPUBuffer; // sBTotal × u32 — bids packed by WG
  ptWgBucketStarts: GPUBuffer; // (MAX_WGS + 1) × u32 — prefix sum into pt_wg_bucket_list
  // Chunk-pass (stream_walker-shaped reducer).
  ptChunks: GPUBuffer; // vec4<u32> × max_chunks — (in_off, count, out_off, bid)
  ptChunksTotal: GPUBuffer; // 1 × atomic<u32> — chunks emitted in current pass
  // Pair-tree v2 (multi-dispatch). Per-bucket level state, task list, counters.
  ptOff: GPUBufferBinding; // arena slot — sBTotal × u32 — bucket's current start in pt_buf
  ptCount: GPUBufferBinding; // arena slot — sBTotal × u32 — bucket's current level count
  ptMeta: GPUBufferBinding; // arena slot — 4 × u32 — NUM_HOT, total partials, _, _
  ptTasks: GPUBufferBinding; // arena slot — max tasks per level × vec4<u32>
  ptTotalTasks: GPUBufferBinding; // arena slot — 1 × atomic<u32>
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
  // pp2 bin-count matrix length in u32s (incl. sentinel). 0 = not requested.
  ppvBinLen: number;
  // High-memory A/B ping-pong pair-tree mode (Thread 2). When false the pool
  // keeps bufA/bufB, the plan rings and prefScratch at a 4 B stub (the walker
  // path never touches them); when true they are sized to the real pair-tree
  // working set. Once a pool has served one high-mem prepare it stays capable.
  highMem: boolean;
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
    ppvBinLen: 0,
    highMem: false,
  };
  // High-water byte size of bucketResultBuf. cur.bTotal is not grow-tracked
  // (the stream block reallocs on every slow path), so the ping-pong harvest
  // buffer keeps its own monotone high-water mark to stay fast-path-safe.
  private _bucketResultBytes = 0;
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
      total += s.bufA.size + s.bufB.size + s.bucketResultBuf.size + s.touchedBuf.size;
      total += s.planMeta.size;
      total += s.pairBlockPlanRing[0].size + s.pairBlockPlanRing[1].size;
      total += s.scatterPlanRing[0].size + s.scatterPlanRing[1].size;
      total += s.carryPlanRing[0].size + s.carryPlanRing[1].size;
      total += s.countsBufs[0].size + s.countsBufs[1].size;
      total += s.offsetsBufs[0].size + s.offsetsBufs[1].size;
      total += s.prefScratchBuf.size;
      total += s.streamPlannerMeta.size;
      total += s.ppvBinCounts.size;
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
    let bucketResultBuf = s?.bucketResultBuf;
    let touchedBuf = s?.touchedBuf;
    let l0IdxBuf = s?.l0IdxBuf;
    let l0BaseBuf = s?.l0BaseBuf;
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
    let redZBuf = s?.redZBuf;
    let reducePrefScratch = s?.reducePrefScratch;

    // High-mem ping-pong buffers (bufA/bufB, plan rings, prefScratch) are sized
    // to the real pair-tree working set only once this pool has served a
    // high-mem prepare. `himTransition` is the false→true edge that forces the
    // first real allocation; thereafter `cur.highMem` stays set so later walker
    // prepares keep the buffers real (a different MSM on the pool may still be
    // high-mem). Walker-only pools never flip it and keep the 4 B stubs.
    const himTransition = dims.highMem && !cur.highMem;
    cur.highMem = cur.highMem || dims.highMem;

    // bufA/bufB depend on M1. They also need a pad-trio re-write whenever
    // they realloc, so we handle them together.
    if (!bufA || dims.M1 > cur.M1 || himTransition) {
      bufA?.destroy();
      bufB?.destroy();
      grow(true, 'M1');
      // Stubbed to 4 B unless the pool is high-mem capable — the ba_fused_super
      // / ba_carry / ba_finalize bind groups always reference these so the
      // binding system stays happy, but the walker path never dispatches them.
      bufA = cur.highMem ? sbuf(soaSize(cur.M1)) : sbuf(4);
      bufB = cur.highMem ? sbuf(soaSize(cur.M1)) : sbuf(4);
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
    if (!pairBlockPlanRing || !scatterPlanRing || dims.totalPairBlocks > cur.totalPairBlocks || himTransition) {
      pairBlockPlanRing?.forEach(b => b.destroy());
      scatterPlanRing?.forEach(b => b.destroy());
      grow(true, 'totalPairBlocks');
      const SmaxS = Math.max(cur.S, dims.S);
      cur.S = SmaxS;
      // pair_block_plan: 2·S u32/block; scatter_plan: S u32/block. Stubbed to
      // 4 B until the pool is high-mem capable (only ba_fused_super reads them).
      pairBlockPlanRing = cur.highMem
        ? [sbuf(2 * cur.totalPairBlocks * SmaxS * 4), sbuf(2 * cur.totalPairBlocks * SmaxS * 4)]
        : [sbuf(4), sbuf(4)];
      scatterPlanRing = cur.highMem
        ? [sbuf(cur.totalPairBlocks * SmaxS * 4), sbuf(cur.totalPairBlocks * SmaxS * 4)]
        : [sbuf(4), sbuf(4)];
      grew = true;
    }
    if (!carryPlanRing || dims.totalCarries > cur.totalCarries || himTransition) {
      carryPlanRing?.forEach(b => b.destroy());
      grow(true, 'totalCarries');
      // carry_plan: 2 u32/carry. Stubbed until high-mem capable.
      carryPlanRing = cur.highMem
        ? [sbuf(2 * cur.totalCarries * 4), sbuf(2 * cur.totalCarries * 4)]
        : [sbuf(4), sbuf(4)];
      grew = true;
    }
    if (!countsBufs || !offsetsBufs || !l0BaseBuf || dims.batchBuckets > cur.batchBuckets) {
      countsBufs?.forEach(b => b.destroy());
      offsetsBufs?.forEach(b => b.destroy());
      l0BaseBuf?.destroy();
      grow(true, 'batchBuckets');
      countsBufs = [sbuf(cur.batchBuckets * 4), sbuf(cur.batchBuckets * 4)];
      offsetsBufs = [sbuf(cur.batchBuckets * 4), sbuf(cur.batchBuckets * 4)];
      // Dedicated l0_base buffer (per-sorted-bucket l0 base cursor), NOT an A0
      // sub-range: the walker reads it as its own binding so its hot loop doesn't
      // add a third widely-separated arena_a0 region (that cost ~36 ms at logn17).
      l0BaseBuf = sbuf(cur.batchBuckets * 4);
      grew = true;
    }
    if (!prefScratchBuf || dims.fusedTile > cur.fusedTile || dims.S > cur.S || himTransition) {
      prefScratchBuf?.destroy();
      grow(true, 'fusedTile');
      const SmaxS = Math.max(cur.S, dims.S);
      cur.S = SmaxS;
      // 2 vec4 (8 u32) of inversion scratch per slot, S slots/thread over one
      // FUSED_TILE of threads. Stubbed until high-mem capable.
      prefScratchBuf = cur.highMem ? sbuf(cur.fusedTile * SmaxS * 8 * 4) : sbuf(4);
      grew = true;
    }
    // bucketResultBuf — affine SoA, bTotal columns/window (soaSize). Keeps its
    // own monotone high-water (`_bucketResultBytes`) since cur.bTotal is not
    // grow-tracked; gated on high-mem so the walker keeps a 4 B stub.
    {
      const wantBR = cur.highMem ? soaSize(dims.bTotal) : 4;
      if (!bucketResultBuf || wantBR > this._bucketResultBytes) {
        bucketResultBuf?.destroy();
        touchedBuf?.destroy();
        bucketResultBuf = sbuf(wantBR);
        touchedBuf = sbuf(cur.highMem ? dims.bTotal * 4 : 4);
        this._bucketResultBytes = Math.max(this._bucketResultBytes, wantBR);
        grew = true;
      } else if (!touchedBuf) {
        touchedBuf = sbuf(cur.highMem ? dims.bTotal * 4 : 4);
      }
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
    let ppvBinCounts = s?.ppvBinCounts;
    if (!ppvBinCounts || dims.ppvBinLen > cur.ppvBinLen) {
      ppvBinCounts?.destroy();
      grow(dims.ppvBinLen > cur.ppvBinLen, 'ppvBinLen');
      ppvBinCounts = sbuf(cur.ppvBinLen * 4);
      grew = true;
    }
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
    let wiIdxArgs = s?.wiIdxArgs;
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
    redZBuf = carve(5, PG * cur.redM * 4 * 4);
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
    walkerPartialDest = carve(1, 2 * sT * sS * 4 + 8); // +2 u32 residency-counter slots (live, peak)
    rowPtrBuf = carve(1, cur.rowPtrLen * 4);
    isPresentBuf = carve(1, cur.redM * 4);
    redBuf = carve(1, soaSize(cur.redM));
    activeBuckets = carve(0, sBTotal * 8); // (bid, n) pairs on the v2 path; v1 uses bid-only entries
    activeCount = carve(0, 8); // [active_count, alloc_total]
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
      wiIdxArgs?.destroy();
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
      // walker_index indirect args (3 triples — see SharedScratch).
      wiIdxArgs = device.createBuffer({
        size: 9 * 4,
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
      bucketResultBuf: bucketResultBuf!,
      touchedBuf: touchedBuf!,
      l0IdxBuf: l0IdxBuf!,
      l0BaseBuf: l0BaseBuf!,
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
      redZBuf: redZBuf!,
      reducePrefScratch: reducePrefScratch!,
      streamPlannerMeta: streamPlannerMeta!,
      ppvBinCounts: ppvBinCounts!,
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
      wiIdxArgs: wiIdxArgs!,
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
      // High-mem ping-pong reads an IDLE anchor (the lever-E self-pad trio) at
      // slots [M1-3..M1-1] of each plane in bufA/bufB; the planner points padded
      // lanes there so the fused add is a no-op. Seed it on realloc. The walker
      // reads its IDLE anchor through l0_index[batchSlots] → point_x/point_y
      // instead, so when the pool is not high-mem capable there is nothing to do.
      if (cur.highMem) {
        const padBuf = buildPadBuf(cur.M1, padPts, R);
        const padBytes = new Uint8Array(padBuf.buffer);
        const xPadSlice = padBytes.subarray(padXOffset, padXOffset + padBytesPerPlane);
        const yPadSlice = padBytes.subarray(padYOffset, padYOffset + padBytesPerPlane);
        device.queue.writeBuffer(newScratch.bufA, padXOffset, xPadSlice as BufferSource);
        device.queue.writeBuffer(newScratch.bufA, padYOffset, yPadSlice as BufferSource);
        device.queue.writeBuffer(newScratch.bufB, padXOffset, xPadSlice as BufferSource);
        device.queue.writeBuffer(newScratch.bufB, padYOffset, yPadSlice as BufferSource);
      }
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
      s.bucketResultBuf.destroy();
      s.touchedBuf.destroy();
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
      s.ppvBinCounts.destroy();
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
  /** Per-window bit-width schedule (uniform fill = c repeated). The page-side
   *  Horner fold needs the widths to weight each window's sum. */
  get windowSchedule(): number[] {
    return this.windowCs;
  }

  /** Pippenger window bit width, picked by `pickC(n)`. Public so the
   *  bridge can ship it back to the C++ Horner combine. */
  c!: number;
  /** Per-window widths. Uniform = [c, c, …]; the varSched fixture fills it with
   *  the two-region schedule. Drives the WindowDesc fill and the host combine. */
  private windowCs!: number[];
  /** split-c (Phase 1): build the MSB histogram + run the variable-window decision. */
  private splitC = false;
  private wiProbe = false;
  private sparseReduce = false;
  private reduceSparsePipe?: GPUComputePipeline;
  private reduceSparseLayout?: GPUBindGroupLayout;
  private reduceSparseBind?: GPUBindGroup;
  // Fold-tower reduction (GROUPED_REDUCE_PLAN.md). foldPipes is indexed by the
  // level's stream count (= level index, ≤ 2).
  private groupedReduce = false;
  private foldMTower?: number[];
  private foldTailMax?: number;
  private foldLevelPipes: GPUComputePipeline[] = [];
  private foldRegimes: { jac: boolean; k: number; pair: boolean; tlocal?: boolean }[] = [];
  private foldSat = 2560;
  private foldK = 0;
  private foldCoop = false;
  private foldTlocal = false;
  private halvingReduce = false;
  private halveCap = 256;
  private halveBa4Floor?: number;
  private earlyExitMode = false;
  private halveSchedule?: HalvingSchedule;
  private halveBa8Pipe?: GPUComputePipeline;
  private halveBa4Pipe?: GPUComputePipeline;
  private halveJacPipe?: GPUComputePipeline;
  private halveFinishArraysPipe?: GPUComputePipeline;
  private halveFinishRootPipe?: GPUComputePipeline;
  private halveStageLayout?: GPUBindGroupLayout;
  private halveStageBuf?: GPUBuffer;
  private halveArraysBind?: GPUBindGroup;
  private halveDepthDispatch: { pipe: GPUComputePipeline; bind: GPUBindGroup; nx: number }[] = [];
  private halveFinishBind?: GPUBindGroup;
  private halveZInitBind?: GPUBindGroup;
  private halveZInitAt = -1;
  private foldWeightPipe?: GPUComputePipeline;
  private foldSumPipe?: GPUComputePipeline;
  private foldSumBind1?: GPUBindGroup;
  private foldSumBind2?: GPUBindGroup;
  private foldWeightNx = 1;
  private foldLayout?: GPUBindGroupLayout;
  private foldJacLayout?: GPUBindGroupLayout;
  private foldTailLayout?: GPUBindGroupLayout;
  private foldLevelBinds: GPUBindGroup[] = [];
  private foldLevelNx: number[] = [];
  private foldTailBind?: GPUBindGroup;
  private foldMaxLevels = 0;
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
  private pk14Inverse = false;
  private montmul!: MontMulVariant;
  private addsub: 'native' | 'unpack' = 'native';
  private profile = false;
  private jacobianCrossover = 0;
  // Thread-1 Jacobian reduce: levels with index >= jacFromLevel run the
  // inversion-free Jacobian kernel (a contiguous suffix so Z stays consistent);
  // useJac[] is the per-level mask. jacFromLevel = numLevels (default) = off.
  private jacFromLevel = Number.MAX_SAFE_INTEGER;
  private useJac: boolean[] = [];
  // Step-4 per-level cut: useJac[lv] picks the kernel per level (vs the single
  // contiguous jacFromLevel suffix). At a jac→affine flip the batched convert
  // (jacToAffinePipe) normalises all live slots back to affine + restores is_present.
  private perLevelJac = false;
  private reduceSatThreshold = 8192;
  private convChunk = 8;
  private convertBound = 150000;
  /** Thread 2: run the high-memory A/B ping-pong pair-tree bucket-sum stage
   * (multi-dispatch, saturates the GPU on small/skewed MSMs) instead of the
   * stream-walker + combine. Forced flag, default off; the reduce is unchanged. */
  private highMemPingpong = false;
  /** Small-N auto-gate: route MSMs with n ≤ this through the ping-pong (0 = off). */
  private pingpongBelow = 0;
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
  // High-mem ping-pong (Thread 2): the finalize-ACCUMULATE harvest (touched-
  // gated copy/affine-add), the cooperative deep-tail collapse, and the
  // bucket_result→red_buf reduce-init bridge. Only compiled/dispatched when
  // highMemPingpong is on.
  private finalizeAccumPipe!: GPUComputePipeline;
  private finalizeAccumPipeL0!: GPUComputePipeline;
  private coopTailPipe?: GPUComputePipeline;
  private reduceInitPipe!: GPUComputePipeline;
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
  // pp2 two-level preprocess (config.preprocessV2). Pipelines compiled in
  // create() only when the flag is on AND the create-time schedule is uniform;
  // pp2Active gates dispatch per prepare (single batch, no region split).
  private pp2Enabled = false;
  private pp2Active = false;
  private pp2DigitCountPipe?: GPUComputePipeline;
  private pp2ScanPipe?: GPUComputePipeline;
  private pp2ScatterPipe?: GPUComputePipeline;
  private pp2SortEmitPipe?: GPUComputePipeline;
  private pp2DigitCountBind?: GPUBindGroup;
  private pp2ScanBind?: GPUBindGroup;
  private pp2ScatterBind?: GPUBindGroup;
  private pp2SortEmitBind?: GPUBindGroup;
  private pp2ParamsBuf?: GPUBuffer;
  private pp2BinShift = 0;
  private pp2BinsP = 0;
  private pp2NumTiles = 0;
  private pp2FallbackLogged = false;
  private reduceLevelPipes: GPUComputePipeline[] = [];
  // Thread-1 Jacobian reduce-tail pipelines (z-seed + inversion-free level +
  // per-window Jacobian->affine finalize).
  private zInitPipe!: GPUComputePipeline;
  private jacLevelPipe!: GPUComputePipeline;
  private jacFinalizePipe!: GPUComputePipeline;
  // Step-4 batched jac->affine convert (bridges a mid-schedule jac->affine flip).
  private jacToAffinePipe!: GPUComputePipeline;
  private jacToAffineLayout!: GPUBindGroupLayout;
  private reduceJacToAffineBind?: GPUBindGroup;
  private jacToAffineNx = 0;
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
  // The planner cap before the residency fit (budget pick, or the explicit config
  // cap). calibrateResidency re-fits against this, never against the live value.
  private budgetMpw = MAX_STREAM_WORKGROUPS;
  // Config pinned the cap (?mpw= / explicit) — honor it; skip the residency fit.
  private mpwPinned = false;
  // Override the measured residency R (0 = measure on-device). Lets a test force a
  // specific R to exercise the refit path, or pin a known device R without the
  // throwaway probe run.
  private residentWgOverride = 0;
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
  private finalizeAccumLayout!: GPUBindGroupLayout;
  private finalizeAccumLayoutL0!: GPUBindGroupLayout;
  private reduceInitLayout!: GPUBindGroupLayout;
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
  private pp2DigitCountLayout!: GPUBindGroupLayout;
  private pp2ScanLayout!: GPUBindGroupLayout;
  private pp2ScatterLayout!: GPUBindGroupLayout;
  private pp2SortEmitLayout!: GPUBindGroupLayout;
  // Captured at prepare: prepareBatch nulls batchCtx before run(), so the
  // union member count is NOT derivable at encode time.
  private pp2MemberCount = 1;
  private reduceLevelLayout!: GPUBindGroupLayout;
  private zInitLayout!: GPUBindGroupLayout;
  private jacLevelLayout!: GPUBindGroupLayout;
  private jacFinalizeLayout!: GPUBindGroupLayout;
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
  private resolveL0BasePipe!: GPUComputePipeline;
  private resolveL0BaseLayout!: GPUBindGroupLayout;
  private resolveL0BaseBinds: GPUBindGroup[] = [];
  private streamWalkerPipe!: GPUComputePipeline;
  private streamWalkerLayout!: GPUBindGroupLayout;
  private streamWalkerBinds: GPUBindGroup[] = [];
  // The walker's arena_off uniform (binding 12). Its spare .z lane is the
  // residency-measure flag: 1 on the throwaway calibration dispatch (enables the
  // RMW counter overlaid on partial_dest's tail), 0 on every real run.
  private walkerArenaOffBuf!: GPUBuffer;
  // Optimal walker_combine pipeline (5 kernels).
  private combineBatchedPipe!: GPUComputePipeline;
  private combineBatchedLayout!: GPUBindGroupLayout;
  private combineBatchedBinds: GPUBindGroup[] = [];
  // walker_index v2 (WALKER_INDEX_PLAN.md) — 5-dispatch parallel index pipeline.
  private idxCountPipe!: GPUComputePipeline;
  private idxCountLayout!: GPUBindGroupLayout;
  private idxCountBind!: GPUBindGroup;
  private idxAllocPipe!: GPUComputePipeline;
  private idxAllocLayout!: GPUBindGroupLayout;
  private idxAllocBind!: GPUBindGroup;
  private idxEpiloguePipe!: GPUComputePipeline;
  private idxEpilogueLayout!: GPUBindGroupLayout;
  private idxEpilogueBind!: GPUBindGroup;
  private idxScatterPipe!: GPUComputePipeline;
  private idxScatterLayout!: GPUBindGroupLayout;
  private idxScatterBinds: GPUBindGroup[] = [];
  private idxSortPipe!: GPUComputePipeline;
  private idxSortLayout!: GPUBindGroupLayout;
  private idxSortBind!: GPUBindGroup;
  private idxP1Pipe!: GPUComputePipeline;
  private idxP2Pipe!: GPUComputePipeline;
  private idxProbeLayout!: GPUBindGroupLayout;
  private idxP1Bind!: GPUBindGroup;
  private idxP2Bind!: GPUBindGroup;
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
  // ?split_submit=1 diagnostic: per-phase submit promises captured during
  // encodeIntoBatch; run() awaits them in order so a GPU device-loss names the
  // exact phase in flight (Adreno watchdog localisation). Off by default.
  private splitCmdBuffers: Array<[string, GPUCommandBuffer]> = [];
  private get splitSubmitDiag(): boolean {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('split_submit') === '1';
  }
  // l0_base v2 (resolve_l0base precompute) on by default; ?l0_precompute=0 reverts
  // the walker to the inline off_at(flat_bid(.)) dependent gather and skips the
  // resolve dispatch (binding 2 becomes the raw offsets CSR). For A/B isolating
  // whether the precompute path is implicated in a device-loss.
  private get l0Precompute(): boolean {
    return typeof location === 'undefined' || new URLSearchParams(location.search).get('l0_precompute') !== '0';
  }
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
  // High-mem ping-pong per-level binds + the reduce-init bridge (Thread 2).
  // Built in prepare() only when highMemPingpong runs; `pingLevels` is the data-
  // dependent level count for THIS prepare. coopTailLevel collapses the starved
  // deep tail into one coop dispatch (−1 = never).
  private pingLevelBinds: PingLevelBind[] = [];
  private pingReduceInitBind?: GPUBindGroup;
  private pingLevels = 0;
  private pingNumWgsFinalize = 0;
  private pingNReduceInit = 0;
  private coopTailLevel = -1;
  // One bind per reduce level (lparams = level index); all share the per-window
  // schedule table so a single dispatch per level reduces every window at its
  // own stride. Length = max_levels (the stride_max schedule length).
  private reduceLevelBinds: GPUBindGroup[] = [];
  private reduceZInitBind?: GPUBindGroup;
  private reduceJacLevelBinds: GPUBindGroup[] = [];
  private reduceJacFinalizeBind?: GPUBindGroup;
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
    m.pk14Inverse = config?.pk14Inverse ?? false;
    m.montmul = config?.montmul ?? 'karat';
    m.addsub = config?.addsub ?? 'native';
    m.jacobianCrossover = config?.jacobianCrossover ?? 0;
    // High-mem ping-pong is enabled either by the forced flag OR the small-N
    // auto-gate (`pingpongBelow`: use ping-pong when n ≤ threshold). The mode
    // wins ~1.4-1.8× at small n where the walker's fixed planner/combine overhead
    // starves the GPU; it loses at large n. Default gate 0 = off (forced flag and
    // gate both off ⇒ walker), pending device characterization of the crossover.
    // prepare()'s uniform-c check still falls back to the walker for split-c.
    // undefined ⇒ production default; explicit 0 ⇒ off; N>0 ⇒ N.
    const pbCfg = config?.pingpongBelow;
    m.pingpongBelow = pbCfg === undefined ? PINGPONG_BELOW_DEFAULT : pbCfg > 0 ? pbCfg : 0;
    m.highMemPingpong = (config?.highMemPingpong ?? false) || (m.pingpongBelow > 0 && n <= m.pingpongBelow);
    m.perLevelJac = config?.perLevelJac ?? false;
    m.reduceSatThreshold =
      config?.reduceSatThreshold && config.reduceSatThreshold > 0 ? config.reduceSatThreshold : 8192;
    m.convChunk = config?.convChunk && config.convChunk > 0 ? config.convChunk : 8;
    m.convertBound = config?.convertBound && config.convertBound > 0 ? config.convertBound : 150000;
    m.combineOnHost = config?.combineOnHost ?? true;
    m.splitC = config?.splitC ?? false;
    m.wiProbe = config?.wiProbe ?? false;
    m.sparseReduce = config?.sparseReduce ?? false;
    m.groupedReduce = config?.groupedReduce ?? false;
    m.foldMTower = config?.foldMTower;
    m.foldTailMax = config?.foldTailMax;
    m.foldSat = config?.foldSat ?? 2560;
    m.foldK = config?.foldK ?? 0;
    m.foldCoop = config?.foldCoop ?? false;
    m.foldTlocal = config?.foldTlocal ?? false;
    m.halvingReduce = config?.halvingReduce ?? false;
    m.halveCap = config?.halveCap ?? 64;
    m.halveBa4Floor = config?.halveBa4Floor;
    m.earlyExitMode = (config?.earlyExit ?? false) && (config?.halvingReduce ?? false);
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
    // pp2 create-time eligibility: uniform create-time schedule (varSched /
    // forceSplit bake a variable one), c in the range the bin geometry covers,
    // n within the binned-entry's 21-bit index field, and the all-window
    // coarse-bin histogram within K1's 16 KB shared budget. A splitC config is
    // NOT disqualifying here: the split is decided per prepare, and pp2Active
    // re-checks the live schedule each time — prepares that decide no-split
    // keep pp2, split ones fall back.
    if (config?.preprocessV2 ?? true) {
      const shift = Math.max(0, m.c - 7);
      const binsP = m.BW >> shift;
      m.pp2Enabled =
        m.windowCs.every(cw => cw === m.c) &&
        m.c >= 8 &&
        m.c <= 15 &&
        n >= 1024 &&
        n <= 1 << 20 &&
        n % 2 === 0 &&
        m.numWindows * binsP <= 4096;
      if (m.pp2Enabled) {
        m.pp2BinShift = shift;
        m.pp2BinsP = binsP;
        console.log(`[MsmV2] preprocessV2 enabled: shift=${shift} binsP=${binsP} (n=${n} c=${m.c} NW=${m.numWindows})`);
      } else if (config?.preprocessV2) {
        console.warn(`[MsmV2] preprocessV2 requested but ineligible at n=${n} c=${m.c} — using classic preprocess`);
      }
    }
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
    // Walker thread-count lever (sT = MPW·256). Two caps compose:
    //   • budget — chooseBudgetMpw drops sT (the §8 priority-1 lever) before
    //     anything else if the working set would exceed the memory budget;
    //   • residency — residencyFitMpw caps it so the walker's indirect launch
    //     (MPW·WALKERS_PER_MPW workgroups) fits one resident wave, removing the
    //     straggler tail. R is measured by the kernel's atomic counter and cached
    //     per process; until then this is the budget cap and the first run
    //     calibrates (see calibrateResidency).
    // The cap is a runtime uniform (cumsum's params.x) plus host buffer sizing —
    // NOT baked into any shader — so it can be lowered without a recompile. An
    // explicit config cap pins MPW and bypasses the residency fit (A/B control).
    m.mpwPinned = config?.maxPlannerWorkgroups !== undefined;
    m.residentWgOverride = config?.residentWgOverride ?? 0;
    m.budgetMpw =
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
    m.maxPlannerWorkgroups = m.mpwPinned ? m.budgetMpw : residencyFitMpw(m.budgetMpw);
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
    // Reduction-coordinate regime (Thread-1 port). Levels with index >=
    // jacFromLevel run the inversion-free Jacobian kernel; the Jacobian region
    // is a contiguous suffix so Z stays consistent across it. The mask is over
    // the envelope (stride_max) schedule and applies uniformly across windows —
    // narrow split-c windows no-op their past-schedule levels (ppw == 0) in
    // either coordinate system, and the affine->jac->affine round-trip at Z = R
    // is identity, so a window that completes in the affine prefix is preserved.
    //   jacobianCrossover === 0 (default): all-affine.
    //   === JAC_AUTO (-1): auto-select from the device saturation point.
    //   > 0: manual ppw threshold — first level with ppw <= value is the cut
    //        (e.g. 999999 => level 0 => all-Jacobian, for byte-identical validation).
    if (m.jacobianCrossover === JAC_AUTO) {
      const maxPpw = Math.max(...m.reducePasses.map(p => p.ppw));
      m.jacFromLevel = m.numWindows * maxPpw < T_SAT_REDUCE ? 0 : m.reducePasses.length;
    } else if (m.jacobianCrossover <= 0) {
      m.jacFromLevel = m.reducePasses.length;
    } else {
      let f = m.reducePasses.length;
      for (let i = 0; i < m.reducePasses.length; i++) {
        if (m.reducePasses[i].ppw <= m.jacobianCrossover) {
          f = i;
          break;
        }
      }
      m.jacFromLevel = f;
    }
    // Step-4 per-level cut overrides the contiguous suffix when perLevelJac is set.
    // Two Jacobian regions: (1) the starved SUFFIX (trailing low-ppw tree tail) —
    // monotone, so a contiguous suffix reached by one z-init and closed by
    // jac_finalize, NO convert: a free win over all-affine at every c. (2) the
    // MIDDLE (doublings + earlier starved runs) — forces one jac→affine convert
    // for the saturated final-tree head, so it's gated on convert affordability
    // (numWindows·stride <= convertBound), since convert cost scales with slots.
    if (m.perLevelJac) {
      const nw = m.numWindows;
      const T = m.reduceSatThreshold;
      const n = m.reducePasses.length;
      const suffix = new Array<boolean>(n).fill(false);
      let allStarved = true;
      for (let i = n - 1; i >= 0; i--) {
        if (nw * m.reducePasses[i].ppw >= T) allStarved = false;
        suffix[i] = allStarved;
      }
      const convertAffordable = nw * m.stride <= m.convertBound;
      m.useJac = m.reducePasses.map((p, i) => suffix[i] || (convertAffordable && (p.isDouble || nw * p.ppw < T)));
    } else {
      m.useJac = m.reducePasses.map((_, i) => i >= m.jacFromLevel);
    }
    // --- Layouts (pool-cached: same `types` shape → same GPUBindGroupLayout
    // across every MsmV2 instance bound to this pool) ---
    const lt = (types: GPUBufferBindingType[]): GPUBindGroupLayout => pool.cache.getLayout(types);
    // planner A: counts(ro), carry_off(rw), new_counts(rw), new_offsets(rw),
    // plan_meta(rw), params(uniform), geom(uniform = BW/num_windows).
    m.plannerALayout = lt(['read-only-storage', 'storage', 'storage', 'storage', 'storage', 'uniform', 'uniform']);
    // planner B: + geom(uniform) at binding 10.
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
    // Accumulate-finalize (Thread 2): finalize layout + a read_write `touched`
    // first-touch flag at index 5; the L0 variant shifts point_x/point_y to 6/7.
    // counts(ro), offsets(ro), active(ro), bucket_result(rw), params(uniform), touched(rw).
    m.finalizeAccumLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
      'storage',
    ]);
    m.finalizeAccumLayoutL0 = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
      'storage',
      'read-only-storage',
      'read-only-storage',
    ]);
    // reduce-init bridge: bucket_result(ro), red_buf(rw), is_present(rw), params(uniform).
    m.reduceInitLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    // 4 bindings: scalars (read), bucket_and_sign (write), params, batch.
    // (Previously 5 — separate signs buffer collapsed into the bucket_and_sign pack.)
    // scalars, bucket_and_sign(rw), params, batch, window_desc, point_offsets.
    m.decomposeLayout = lt([
      'read-only-storage',
      'storage',
      'uniform',
      'uniform',
      'read-only-storage',
      'read-only-storage',
    ]);
    // msb_histogram: scalars(read), msb_hist(rw), msb_per_scalar(rw), params(uniform).
    m.msbHistLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    // decide_window_split: msb_hist(read), window_desc(rw), summary(rw), params(uniform).
    m.msbDecideLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    // idx_large_compact: msb_per_scalar(read), summary(read), idx_large(rw),
    // idx_large_count(rw atomic), params(uniform).
    m.msbIdxLargeLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'storage', 'uniform']);
    // decompose_upper: scalars(read), bucket_and_sign(write), params, batch, window_desc, idx_large(read).
    m.decomposeUpperLayout = lt([
      'read-only-storage',
      'storage',
      'uniform',
      'uniform',
      'read-only-storage',
      'read-only-storage',
    ]);
    // transpose_scatter_upper: scatter layout (7) + idx_large(read).
    m.scatterUpperLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
      'read-only-storage',
      'uniform',
      'read-only-storage',
    ]);
    // bucket_and_sign, partials(rw), params, window_desc, batch_window_base, point_offsets.
    m.xposeCountLayout = lt([
      'read-only-storage',
      'storage',
      'uniform',
      'read-only-storage',
      'uniform',
      'read-only-storage',
    ]);
    m.xposeReduceLayout = lt(['storage', 'storage', 'uniform', 'read-only-storage', 'uniform']);
    m.xposeScanLayout = lt(['storage', 'uniform', 'read-only-storage', 'uniform']);
    // bucket_and_sign, col_ptr, partials, val_idx(rw), params, window_desc, batch_window_base, point_offsets.
    m.xposeScatterLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
      'read-only-storage',
      'uniform',
      'read-only-storage',
    ]);
    m.convActiveLayout = lt(['read-only-storage', 'storage', 'uniform', 'read-only-storage']);
    // row_ptr, active_counts(rw), active_offsets(rw), params, window_desc, batch_window_base, point_offsets.
    m.convMetaLayout = lt([
      'read-only-storage',
      'storage',
      'storage',
      'uniform',
      'read-only-storage',
      'uniform',
      'read-only-storage',
    ]);
    // pp2 two-level preprocess layouts.
    //   digit-count: scalars(ro vec4), digits(rw), bin_counts(rw), params,
    //   window_desc(ro), point_offsets(ro).
    m.pp2DigitCountLayout = lt([
      'read-only-storage',
      'storage',
      'storage',
      'uniform',
      'read-only-storage',
      'read-only-storage',
    ]);
    //   bin-scan: bin_counts(rw, in-place), point_offsets(ro), params.
    m.pp2ScanLayout = lt(['storage', 'read-only-storage', 'uniform']);
    //   bin-scatter: digits(ro), bin_counts(ro), binned(rw), params,
    //   point_offsets(ro).
    m.pp2ScatterLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'uniform', 'read-only-storage']);
    //   bin-sort-emit: binned(ro), bin_counts(ro), l0_out(rw), counts(rw), offsets(rw), params.
    m.pp2SortEmitLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'storage',
      'storage',
      'storage',
      'uniform',
    ]);
    m.reduceLevelLayout = lt(['storage', 'storage', 'storage', 'uniform', 'uniform', 'read-only-storage']);
    // Thread-1 Jacobian reduce-tail layouts. jac_level/jac_finalize add the
    // reduce_sched binding (the per-window base + split-c schedule) so they
    // decode levels identically to the affine kernel.
    m.zInitLayout = lt(['read-only-storage', 'storage', 'uniform']); // is_present, red_z, zparams
    m.jacLevelLayout = lt(['storage', 'storage', 'uniform', 'uniform', 'read-only-storage']); // red_buf, red_z, cparams, lparams, reduce_sched
    m.jacFinalizeLayout = lt(['storage', 'read-only-storage', 'uniform', 'storage', 'read-only-storage']); // red_buf, red_z, cparams, is_present, reduce_sched
    // Step-4 batched convert (flat-slot, no reduce_sched): red_buf(rw), red_z(ro),
    // is_present(rw), conv_scratch(rw = reducePrefScratch), cparams.
    m.jacToAffineLayout = lt(['storage', 'read-only-storage', 'storage', 'storage', 'uniform']);
    // Streaming planner + accumulator layouts
    m.classifyLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'storage',
      'storage',
      'storage',
      'storage',
      'uniform',
      'read-only-storage',
      'uniform',
      'storage', // is_present — dense-bucket marks hoisted from walker_index
    ]);
    m.metaFixupLayout = lt(['storage']);
    m.radixCountLayout = lt(['read-only-storage', 'storage', 'read-only-storage', 'uniform']);
    m.radixScanLayout = lt(['storage', 'read-only-storage', 'uniform']);
    m.radixScatterLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'storage',
      'read-only-storage',
      'uniform',
    ]);
    m.cumsumLayout = lt(['read-only-storage', 'storage', 'storage', 'uniform']);
    m.partitionWgLayout = lt(['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    m.partitionThreadLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
    ]);
    // binding 8 (window_desc) is read-only-storage now (size1 has slot headroom) → no window cap.
    m.size1Layout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'read-only-storage',
      'uniform',
      'storage',
      'read-only-storage',
    ]);
    // Stream-walker layouts (C's KNOB 2 variant).
    //   partition_task: sorted_count_list, cumulative_adds, thread_cuts, planner_meta(rw), task_cuts(rw), params(uniform), wi_idx_args(rw)
    m.partitionTaskLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'storage',
      'uniform',
      'storage',
    ]);
    //   resolve_l0base: sorted_bucket_list, arena_a0 (rw), offsets, window_desc, planner_meta (ro), params, batch_offset (uniform)
    m.resolveL0BaseLayout = lt([
      'read-only-storage',
      'storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'uniform',
      'uniform',
    ]);
    //   stream_walker: sorted_bucket_list, sorted_count_list, offsets, task_cuts, l0_index, point_x, point_y, bucket_sums(rw), partials(rw), partial_dest(rw), params(uniform)
    // sorted_bucket_list, arena_a0 (whole A0 monolith — covers sorted_count_list +
    // l0_index), offsets (standalone), task_cuts, point_x, point_y (ro); red_buf,
    // partials_buf, partial_dest (rw); window_desc (ro storage — no window cap);
    // params, batch_offset, arena_off (uniform). 10 storage = the buffer cap.
    m.streamWalkerLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'storage',
      'storage',
      'read-only-storage',
      'uniform',
      'uniform',
      'uniform',
    ]);
    // === Optimal walker_combine pipeline layouts ===
    //   batched: active_buckets, active_count, partial_count, partial_offset, partial_layout, l0_index, point_x, point_y, partials_buf(rw), bucket_sums(rw), params
    // active_buckets, active_count, arena_a2 (monolith — partial_count +
    // partial_layout), partial_offset, l0_index, point_x, point_y (ro); partials_buf,
    // red_buf (rw); window_desc (ro storage — no cap); params, batch_offset, arena_off.
    m.combineBatchedLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'storage',
      'read-only-storage',
      'uniform',
      'uniform',
      'uniform',
      'uniform',
    ]);
    // === walker_index v2 layouts (WALKER_INDEX_PLAN.md). ===
    //   idx_count: partial_dest, partial_count(rw atomic), planner_meta, params
    m.idxCountLayout = lt(['read-only-storage', 'storage', 'read-only-storage', 'uniform']);
    //   idx_alloc: sorted_bucket_list, partial_count, partial_offset(rw), active_pairs(rw),
    //   active_meta(rw), count_histogram(rw), planner_meta, params
    //   (is_present marking lives in classify — pure planner data.)
    m.idxAllocLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'storage',
      'storage',
      'storage',
      'storage',
      'read-only-storage',
      'uniform',
    ]);
    //   idx_epilogue: count_histogram, active_meta(rw — A0 colour-mate of bin_offsets),
    //   bin_offsets(rw), bin_write_pos(rw), pt args ×3 (rw), wi_idx_args(rw),
    //   partial_offset(rw), planner_meta
    m.idxEpilogueLayout = lt([
      'read-only-storage',
      'storage',
      'storage',
      'storage',
      'storage',
      'storage',
      'storage',
      'storage',
      'storage',
      'read-only-storage',
    ]);
    //   idx_scatter: partial_dest(rw — A1 colour-mate of red_buf; never written),
    //   partial_offset, partial_write_pos(rw atomic), partial_layout(rw),
    //   partials_buf, red_buf(rw), planner_meta, window_desc, params, batch_offset
    m.idxScatterLayout = lt([
      'storage',
      'read-only-storage',
      'storage',
      'storage',
      'read-only-storage',
      'storage',
      'read-only-storage',
      'read-only-storage',
      'uniform',
      'uniform',
    ]);
    //   idx_sort: active_pairs, active_meta, bin_offsets, bin_write_pos(rw atomic),
    //   sorted_active_buckets(rw)
    m.idxSortLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'storage',
    ]);
    //   wi4 probes: partial_dest (A1 ro), pt_scratch (A4 rw), planner_meta, params.
    m.idxProbeLayout = lt(['read-only-storage', 'storage', 'read-only-storage', 'uniform']);
    // === Pair-tree v2 (multi-dispatch). ===
    //   pt-init-scan: sorted_active, bin_offsets, active_count, partial_count, pt_off(rw), pt_count(rw), pt_meta(rw)
    m.ptInitScanLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'storage',
      'storage',
      'uniform',
    ]);
    //   pt-init-copy: sorted_active, bin_offsets, active_count, partial_count, partial_offset, partial_layout, partials_buf, pt_off, pt_buf(rw), params
    m.ptInitCopyLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
    ]);
    //   pt-build: bin_offsets, active_count, pt_off(rw), pt_count(rw), pt_tasks(rw), pt_total_tasks(rw)
    m.ptBuildLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'storage', 'storage', 'storage']);
    //   pt-dispatch-chain: pt_total_tasks(ro), pt_combine_args(rw), pt_build_args(rw), pt_hot_args(ro)
    m.ptDispatchChainLayout = lt(['read-only-storage', 'storage', 'storage', 'read-only-storage']);
    //   pt-combine: pt_tasks, pt_total_tasks, pt_buf(rw), params
    m.ptCombineLayout = lt(['read-only-storage', 'read-only-storage', 'storage', 'uniform']);
    //   pt-finalize: sorted_active, bin_offsets, active_count, pt_off, pt_buf, bucket_sums(rw), params
    // binding 9 (window_desc) is read-only-storage now (pt_finalize has slot headroom) → no window cap.
    m.ptFinalizeLayout = lt([
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'uniform',
      'storage',
      'uniform',
      'read-only-storage',
    ]);
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
    m.decomposeUpperPipe = await compile(
      sm.gen_decompose_scalars_booth_upper_shader(WGI),
      `decompose_upper`,
      m.decomposeUpperLayout,
    );
    // Fixed transpose histogram/cursor capacity (16KB workgroup array), the same
    // for every MSM so the 3 tiled-transpose shaders compile once, not per-(n,c).
    // Size-independent by construction: the kernels' sub-tile loop covers
    // n_cols > XPOSE_TILE and the store is guarded col < n_cols. 4096 is the
    // measured M-series sweet spot — free for the heavy logn15-17 MSMs a prove
    // is made of, and faster than the old min(BW,8192) at logn>=18 where the
    // 32KB array throttled occupancy.
    const XPOSE_TILE = 4096;
    m.xposeScatterUpperPipe = await compile(
      sm.gen_transpose_scatter_tiled_upper_shader(256, XPOSE_TILE),
      `xpose-scatter-upper`,
      m.scatterUpperLayout,
    );
    // Tiled counting-sort transpose: count + scatter dispatch across point-
    // chunks (not just windows) so the GPU stays saturated; reduce folds the
    // per-chunk partials; scan is the unchanged per-window prefix sum. Only
    // on-chip shared atomics — no contended global atomics. XPOSE_TILE is the
    // shared histogram/cursor capacity (4096 entries = 16KB).
    m.xposeCountPipe = await compile(
      sm.gen_transpose_count_tiled_shader(256, XPOSE_TILE),
      `xpose-count`,
      m.xposeCountLayout,
    );
    m.xposeReducePipe = await compile(sm.gen_transpose_reduce_tiled_shader(256), `xpose-reduce`, m.xposeReduceLayout);
    m.xposeScanPipe = await compile(sm.gen_transpose_scan_shader(m.numWindows), `xpose-scan`, m.xposeScanLayout);
    m.xposeScatterPipe = await compile(
      sm.gen_transpose_scatter_tiled_shader(256, XPOSE_TILE),
      `xpose-scatter`,
      m.xposeScatterLayout,
    );
    m.convActivePipe = await compile(
      sm.gen_csr_to_v2_active_sums_shader(WGI, true, true),
      `csr2v2-active`,
      m.convActiveLayout,
    );
    m.convMetaPipe = await compile(sm.gen_csr_to_v2_meta_shader(WGI), `csr2v2-meta`, m.convMetaLayout);
    if (m.pp2Enabled) {
      // K2/K3 sources depend only on (bins_p, bin_shift) — shared across
      // every n of the same c. K1 bakes the window schedule (one compile per c).
      m.pp2DigitCountPipe = await compile(
        sm.gen_pp2_digit_count_shader(256, m.windowCs, m.pp2BinShift, m.pp2BinsP),
        `pp2-digit-count`,
        m.pp2DigitCountLayout,
      );
      m.pp2ScanPipe = await compile(sm.gen_pp2_bin_scan_shader(), `pp2-bin-scan`, m.pp2ScanLayout);
      m.pp2ScatterPipe = await compile(
        sm.gen_pp2_bin_scatter_direct_shader(256, m.pp2BinsP, m.pp2BinShift),
        `pp2-bin-scatter`,
        m.pp2ScatterLayout,
      );
      m.pp2SortEmitPipe = await compile(
        sm.gen_pp2_bin_sort_emit_shader(256, m.pp2BinShift),
        `pp2-bin-sort-emit`,
        m.pp2SortEmitLayout,
      );
    }
    // High-mem A/B ping-pong pair-tree (Thread 2). Compiled only when the mode
    // is on — the planner kernels bake c/BW geometry (per-(n,c) recompile until
    // the size-independence pass), so the default walker path never pays for
    // them. fused/finalize are tiled (params.w = tile_base). coopTail reuses the
    // finalize-accumulate layout (counts/offsets/active/bucket_result/params/touched).
    if (m.highMemPingpong) {
      m.plannerAPipe = await compile(sm.gen_ba_planner_v2_offsets_shader(PLANNER_TPB), `planner-a`, m.plannerALayout);
      m.plannerBPipe = await compile(
        sm.gen_ba_planner_v2_emit_shader(PLANNER_TPB, HIGH_MEM_S, pool.pairCap),
        `planner-b`,
        m.plannerBLayout,
      );
      m.fusedPipe = await compile(
        sm.gen_ba_fused_super_bench_shader(WGI, HIGH_MEM_S, INV_VARIANT, true, false, ADDSUB),
        `fused`,
        m.fusedLayout,
      );
      m.fusedPipeL0 = await compile(
        sm.gen_ba_fused_super_bench_shader(WGI, HIGH_MEM_S, INV_VARIANT, true, true, ADDSUB),
        `fused-l0`,
        m.fusedLayoutL0,
      );
      m.carryPipe = await compile(sm.gen_ba_carry_copy_bench_shader(WGI), `carry`, m.carryLayout);
      m.carryPipeL0 = await compile(sm.gen_ba_carry_copy_bench_shader(WGI, true), `carry-l0`, m.carryLayoutL0);
      m.finalizeAccumPipe = await compile(
        sm.gen_ba_finalize_accumulate_bench_shader(WGI, false),
        `finalize-accum`,
        m.finalizeAccumLayout,
      );
      m.finalizeAccumPipeL0 = await compile(
        sm.gen_ba_finalize_accumulate_bench_shader(WGI, true),
        `finalize-accum-l0`,
        m.finalizeAccumLayoutL0,
      );
      m.coopTailPipe = await compile(
        sm.gen_ba_fused_tail_coop_shader(COOP_TAIL_WG, COOP_TAIL_CAP, INV_VARIANT),
        `fused-tail-coop`,
        m.finalizeAccumLayout,
      );
      m.reduceInitPipe = await compile(sm.gen_ba_reduce_init_bench_shader(WGI), `reduce-init`, m.reduceInitLayout);
    }
    // Phase 5: ONE reduction pipeline drives every schedule level. The
    // `kind` (0 suffix / 1 tree / 2 double) lives in lparams.w — uniform
    // across the workgroup, so the compiler specialises per-dispatch with
    // no SIMT divergence. Replaces the three kind-specialised pipelines.
    m.reduceLevelPipes[0] = await compile(
      sm.gen_ba_reduce_level_bench_shader(REDUCE_WG, INV_VARIANT, ADDSUB),
      `reduce-level`,
      m.reduceLevelLayout,
    );
    // Thread-1 Jacobian reduce-tail pipelines. Same REDUCE_WG / WGI knobs as the
    // affine reduce, so they ride the one-program PipelineCache identically (the
    // strings are size-independent — geometry rides in reduce_sched/cparams).
    m.jacLevelPipe = await compile(sm.gen_ba_reduce_level_jacobian_shader(REDUCE_WG), `reduce-jac`, m.jacLevelLayout);
    m.zInitPipe = await compile(sm.gen_ba_reduce_z_init_shader(WGI), `reduce-z-init`, m.zInitLayout);
    m.jacFinalizePipe = await compile(
      sm.gen_ba_reduce_jac_finalize_shader(WGI, INV_VARIANT),
      `reduce-jac-finalize`,
      m.jacFinalizeLayout,
    );
    m.jacToAffinePipe = await compile(
      sm.gen_ba_reduce_jac_to_affine_shader(WGI, INV_VARIANT),
      `reduce-jac-to-affine`,
      m.jacToAffineLayout,
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
    if (m.groupedReduce) {
      // Fold-tower reduction. Per-level regime from the ENVELOPE tower
      // (window towers are prefixes of it): batch-affine with the largest k
      // keeping threads ≥ foldSat (C = k·(2+ns) adds per inversion), else
      // the inversion-free Jacobian fold — C = 2 batch-affine is never
      // dispatched (a mixed Jacobian add is cheaper).
      const envTower = buildFoldTower(2 ** (m.c - 1), {
        mTower: m.foldMTower,
        tailMax: Math.min(m.foldTailMax ?? 32, 64),
        maxLevels: 3,
        numWindows: m.numWindows,
        satWidth: m.foldSat,
      });
      // foldCoop swaps the kernel of AFFINE-regime levels for the
      // workgroup-cooperative variant (always k = 1: the coop batch already
      // spans the workgroup, so chunks/thread buys nothing). Jacobian-regime
      // levels are unaffected — combine with foldK = 1 to force every level
      // affine and therefore coop.
      m.foldRegimes = envTower.levels.map((lvl, lv) => {
        // M = 2 Jacobian levels (width-adaptive small-N shape) get the lean
        // pair kernel: one add per thread, no walk machinery. Split-c is
        // excluded — window towers can then disagree with the envelope's M
        // at a level, and the pair kernel is specialised to M == 2.
        const pairable = lvl.M === 2 && !m.splitC;
        if (m.foldK) return { jac: false, k: m.foldCoop ? 1 : m.foldK, pair: false };
        const NC = m.numWindows * lvl.G;
        if (m.foldCoop) {
          // Same affine/jac boundary as the per-thread policy below, so an
          // A/B against it swaps only the kernel of the affine levels.
          const affine =
            (NC / 4 >= m.foldSat && lvl.G % 4 === 0) || (NC / 2 >= m.foldSat && lvl.G % 2 === 0);
          return affine ? { jac: false, k: 1, pair: false } : { jac: true, k: 1, pair: pairable };
        }
        if (NC / 4 >= m.foldSat && lvl.G % 4 === 0) return { jac: false, k: 4, pair: false };
        if (NC / 2 >= m.foldSat && lvl.G % 2 === 0) return { jac: false, k: 2, pair: false };
        return { jac: true, k: 1, pair: pairable };
      });
      // The thread-local tower kernel claims affine M = 8 stream-less levels
      // and is one-column-per-thread: pin its k to 1 so the dispatch width
      // covers every column (the regime's k sizes foldLevelNx).
      if (m.foldTlocal && !m.splitC) {
        for (let lv = 0; lv < m.foldRegimes.length; lv++) {
          const r = m.foldRegimes[lv];
          if (!r.jac && lv === 0 && envTower.levels[lv].M === 8) {
            r.k = 1;
            r.tlocal = true;
          }
        }
      }
      // red_buf(rw), is_present(rw), cparams(u), lparams(u), fold_sched(ro).
      m.foldLayout = lt(['storage', 'storage', 'uniform', 'uniform', 'read-only-storage']);
      // red_buf(rw), red_z(rw), is_present(rw), cparams(u), lparams(u), fold_sched(ro).
      m.foldJacLayout = lt(['storage', 'storage', 'storage', 'uniform', 'uniform', 'read-only-storage']);
      m.foldLevelPipes = [];
      for (let lv = 0; lv < m.foldRegimes.length; lv++) {
        const ns = Math.min(lv, 2);
        const r = m.foldRegimes[lv];
        // Outputs of jac, pair, AND a preceding jac-family level carry z in
        // red_z; affine fold outputs are x/y + presence (z implied 1).
        const inputsJac = lv > 0 && (m.foldRegimes[lv - 1].jac || m.foldRegimes[lv - 1].pair);
        const tlocal = r.tlocal === true;
        m.foldLevelPipes[lv] = r.pair
          ? await compile(
              sm.gen_ba_reduce_fold_pair_shader(REDUCE_WG, ns, inputsJac),
              `reduce-fold-pair-${ns}-${inputsJac ? 'jac' : 'aff'}`,
              m.foldJacLayout,
            )
          : r.jac
            ? await compile(sm.gen_ba_reduce_fold_jac_shader(REDUCE_WG, ns), `reduce-fold-jac-${ns}`, m.foldJacLayout)
            : tlocal
              ? await compile(sm.gen_ba_reduce_fold_tlocal_shader(REDUCE_WG), `reduce-fold-tlocal`, m.foldLayout)
              : m.foldCoop
                ? await compile(sm.gen_ba_reduce_fold_coop_shader(REDUCE_WG, ns), `reduce-fold-coop-${ns}`, m.foldLayout)
                : await compile(sm.gen_ba_reduce_fold_shader(REDUCE_WG, ns, r.k), `reduce-fold-${ns}-k${r.k}`, m.foldLayout);
      }
      // red_buf(rw), red_z(rw), is_present(rw), cparams(u), fold_sched(ro).
      m.foldTailLayout = lt(['storage', 'storage', 'storage', 'uniform', 'read-only-storage']);
      m.foldWeightPipe = await compile(
        sm.gen_ba_reduce_fold_weight_shader(REDUCE_WG),
        `reduce-fold-weight`,
        m.foldTailLayout,
      );
      m.foldSumPipe = await compile(sm.gen_ba_reduce_fold_sum_shader(32), `reduce-fold-sum`, m.foldJacLayout!);
    }

    if (m.halvingReduce) {
      if (m.splitC) {
        throw new Error('halvingReduce does not support split-c windows yet');
      }
      m.foldLayout = m.foldLayout ?? lt(['storage', 'storage', 'uniform', 'uniform', 'read-only-storage']);
      m.foldJacLayout =
        m.foldJacLayout ?? lt(['storage', 'storage', 'storage', 'uniform', 'uniform', 'read-only-storage']);
      const strideB = 2 ** (m.c - 1);
      const hsched = buildHalvingSchedule(strideB, m.numWindows, {
        satWidth: m.foldSat,
        finisherCap: m.halveCap,
        ba4Floor: m.halveBa4Floor,
      });
      m.halveSchedule = hsched;
      const hmodes = new Set(hsched.depths.map(x => x.mode));
      // ba kernels run at their own WG: the inversion chain's partial
      // products live in workgroup memory (HALVE_BA_WG × (cpairs-1) × 32B —
      // 14KB at C=8), which bounds the workgroup size.
      if (hmodes.has('ba8')) {
        m.halveBa8Pipe = await compile(sm.gen_ba_halve_shader(HALVE_BA_WG, 8), `halve-ba8`, m.foldLayout);
      }
      if (hmodes.has('ba4')) {
        m.halveBa4Pipe = await compile(sm.gen_ba_halve_shader(HALVE_BA_WG, 4), `halve-ba4`, m.foldLayout);
      }
      if (hmodes.has('jac')) {
        m.halveJacPipe = await compile(sm.gen_jac_halve_shader(REDUCE_WG), `halve-jac`, m.foldJacLayout);
      }
      // F1 carries a 7th binding: the compact staged-partials export the
      // early-exit readback maps (written unconditionally — six stores per
      // workgroup).
      m.halveStageLayout = lt([
        'storage',
        'storage',
        'storage',
        'uniform',
        'uniform',
        'read-only-storage',
        'storage',
      ]);
      m.halveFinishArraysPipe = await compile(
        sm.gen_halve_finish_arrays_shader(strideB, hsched.finisherDepth, hsched.finisherInputsJac),
        `halve-finish-arrays`,
        m.halveStageLayout,
      );
      m.halveFinishRootPipe = await compile(
        sm.gen_halve_finish_root_shader(strideB, hsched.finisherDepth),
        `halve-finish-root`,
        m.foldJacLayout,
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
    m.classifyPipe = await compile(sm.gen_ba_planner_classify_shader(256), `classify`, m.classifyLayout);
    m.metaFixupPipe = await compile(sm.gen_ba_planner_meta_fixup_shader(), `meta-fixup`, m.metaFixupLayout);
    m.radixCountPipe = await compile(
      sm.gen_ba_planner_radix_count_shader(RADIX_TILE),
      `radix-count`,
      m.radixCountLayout,
    );
    m.radixScanPipe = await compile(sm.gen_ba_planner_radix_scan_shader(), `radix-scan`, m.radixScanLayout);
    m.radixScatterPipe = await compile(
      sm.gen_ba_planner_radix_scatter_shader(RADIX_TILE),
      `radix-scatter`,
      m.radixScatterLayout,
    );
    m.cumsumPipe = await compile(
      sm.gen_ba_planner_cumsum_shader(STREAM_T, STREAM_S, 1, MPW, STREAM_PLANNER_TPB),
      `cumsum`,
      m.cumsumLayout,
    );
    m.partitionWgPipe = await compile(
      sm.gen_ba_planner_partition_wg_shader(MAX_STREAM_WORKGROUPS),
      `partition-wg`,
      m.partitionWgLayout,
    );
    m.partitionThreadPipe = await compile(
      sm.gen_ba_planner_partition_thread_shader(STREAM_PLANNER_TPB),
      `partition-thread`,
      m.partitionThreadLayout,
    );
    m.size1Pipe = await compile(sm.gen_ba_size1_shader(m.BW, m.stride, m.redM), `size1`, m.size1Layout);
    // Stream-walker (Plan §6 + C's KNOB 2 variant). STREAM_WALKER_TPB per
    // KNOB 1 (16 KB pref_scratch fits Mali Bifrost at TPB=64). NUM_THREADS =
    // nwg * STREAM_PLANNER_TPB (partition_thread's grain); the walker
    // dispatches ceil(num_active/STREAM_WALKER_TPB) workgroups via
    // planner_meta[15..17] written by partition_task.
    m.partitionTaskPipe = await compile(
      sm.gen_ba_planner_partition_task_shader(STREAM_WALKER_TPB, STREAM_S, STREAM_PLANNER_TPB, WI_IDX_TPB),
      `partition-task`,
      m.partitionTaskLayout,
    );
    m.resolveL0BasePipe = await compile(
      sm.gen_ba_planner_resolve_l0base_shader(),
      `resolve-l0base`,
      m.resolveL0BaseLayout,
    );
    m.streamWalkerPipe = await compile(
      sm.gen_ba_stream_walker_shader(
        STREAM_WALKER_TPB,
        STREAM_S,
        m.BW,
        m.stride,
        m.redM,
        INV_VARIANT,
        m.pk14Inverse,
        m.l0Precompute,
      ),
      `stream-walker`,
      m.streamWalkerLayout,
    );
    m.combineBatchedPipe = await compile(
      sm.gen_ba_walker_combine_batched_shader(STREAM_WALKER_TPB, STREAM_S, m.BW, m.stride, m.redM, INV_VARIANT),
      `combine-batched`,
      m.combineBatchedLayout,
    );
    // === walker_index pipeline (WALKER_INDEX_PLAN.md). ===
    {
      m.idxCountPipe = await compile(
        sm.gen_ba_walker_idx_count_shader(WI_IDX_TPB, STREAM_S, STREAM_PLANNER_TPB),
        `wi-count`,
        m.idxCountLayout,
      );
      m.idxAllocPipe = await compile(sm.gen_ba_walker_idx_alloc_shader(WI_IDX_TPB), `wi-alloc`, m.idxAllocLayout);
      m.idxEpiloguePipe = await compile(
        sm.gen_ba_walker_idx_epilogue_shader(WI_IDX_TPB),
        `wi-epilogue`,
        m.idxEpilogueLayout,
      );
      m.idxScatterPipe = await compile(
        sm.gen_ba_walker_idx_scatter_shader(WI_IDX_TPB, STREAM_S, STREAM_PLANNER_TPB),
        `wi-scatter`,
        m.idxScatterLayout,
      );
      m.idxSortPipe = await compile(sm.gen_ba_walker_idx_sort_shader(WI_IDX_TPB), `wi-sort`, m.idxSortLayout);
      if (m.wiProbe) {
        m.idxP1Pipe = await compile(
          sm.gen_ba_walker_idx_p1_shader(WI_IDX_TPB, STREAM_S, STREAM_PLANNER_TPB),
          `wi-p1`,
          m.idxProbeLayout,
        );
        m.idxP2Pipe = await compile(
          sm.gen_ba_walker_idx_p2_shader(WI_IDX_TPB, STREAM_S, STREAM_PLANNER_TPB),
          `wi-p2`,
          m.idxProbeLayout,
        );
      }
    }
    m.ptInitScanPipe = await compile(sm.gen_ba_walker_pt_init_scan_shader(m.BW), `pt-init-scan`, m.ptInitScanLayout);
    // TPB = 64. With indirect dispatch from sort-scan's NUM_HOT-based args,
    // pt_init_copy/build/finalize launch ceil(NUM_HOT/64) WGs — no idle
    // workgroups. pt_combine launches ceil(total_tasks/S/64) per level.
    m.ptInitCopyPipe = await compile(
      sm.gen_ba_walker_pt_init_copy_shader(64, m.BW),
      `pt-init-copy`,
      m.ptInitCopyLayout,
    );
    m.ptBuildPipe = await compile(sm.gen_ba_walker_pt_build_shader(64), `pt-build`, m.ptBuildLayout);
    m.ptDispatchChainPipe = await compile(
      sm.gen_ba_walker_pt_dispatch_chain_shader(),
      `pt-dispatch-chain`,
      m.ptDispatchChainLayout,
    );
    m.ptCombinePipe = await compile(
      sm.gen_ba_unified_combine_shader(64, STREAM_S, INV_VARIANT),
      `pt-combine`,
      m.ptCombineLayout,
    );
    m.ptFinalizePipe = await compile(
      sm.gen_ba_walker_pt_finalize_shader(64, m.BW, m.stride, m.redM),
      `pt-finalize`,
      m.ptFinalizeLayout,
    );
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
        // Fit the planner to one resident wave before the timed runs: a throwaway
        // probe run measures R, then the cap is refit (see calibrateResidency).
        await m.calibrateResidency(dummy);
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
      throw new Error(
        `prepareBatch: ${numWindows} global windows exceeds the ${WBID_WINDOW_MAX}-window packed-bid field`,
      );
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
      this.windowCs = Array.from(
        { length: this.batchCtx.numWindows },
        (_, w) => this.batchCtx!.windowDescTable[w * 8 + 0],
      );
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
              if (scalars[base + w] !== 0) {
                msb = w * 32 + (31 - Math.clz32(scalars[base + w]));
                break;
              }
            }
            if (msb >= threshold) {
              idx[cnt++] = i;
            }
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
    let levels = 0;
    let wstride1 = 1;
    // High-mem ping-pong: run the host bucket-split walk to size the per-level
    // dispatches (the walker path leaves these as trivial constants). Single
    // point-chunk (all n). Uniform-c only: split-c (single MSM) and mixed-c packs
    // (which need per-window stride in reduce_init) fall back to the walker —
    // `uniformC` is false for both. A union decodes per member (each at its own
    // scalar slice / bit_base / global window base), mirroring the GPU decompose
    // so the histogram matches csr_to_v2_meta. The union must also be uniform-n:
    // different-n members make the GPU's level-0 offsets per-member-strided, which
    // the planner's single host `wstride1` can't address yet (mixed-n falls back —
    // a follow-up). levels === 0 ⇒ walker downstream.
    const uniformC = this.windowCs ? this.windowCs.every(cw => cw === c) : true;
    if (this.highMemPingpong && uniformC) {
      const scalarBytes = new Uint8Array(scalars.buffer, scalars.byteOffset, scalars.byteLength);
      const segments: HistSegment[] = this.batchCtx
        ? this.batchCtx.members.map(mb => ({
            scalarByteBase: mb.scalarBaseBytes,
            n: mb.n,
            c: this.batchCtx!.windowDescTable[mb.schedOff * 8 + 0],
            schedOff: mb.schedOff,
            numWindows: mb.numWindows,
          }))
        : [{ scalarByteBase: 0, n, c, schedOff: 0, numWindows: NUM_WINDOWS }];
      const chunkInit = buildInitCounts(scalarBytes, segments, NUM_WINDOWS, BW);
      const walk = walkChunkPlan(chunkInit, HIGH_MEM_S, NUM_WINDOWS, BW);
      levelPlans.push(...walk.levelPlans);
      levels = walk.levelPlans.length;
      wstride1 = walk.wstride1;
    }

    // --- Lever G: budget-driven window-batch count (ARENA_LAYOUT.md §7).
    const RED_M = this.redM;
    // MAXC / reducePrefBytes don't depend on the batch count; compute them
    // up-front because both the budget model and the fast-path fit-check need MAXC.
    let MAXC = 1;
    for (const p of this.reducePasses) {
      MAXC = Math.max(MAXC, Math.ceil(p.ppw / REDUCE_WG));
    }
    // Step-4: the batched jac→affine convert reuses reducePrefScratch as a
    // per-slot prefix store, one field element per global slot — NUM_WINDOWS·stride
    // entries = NUM_WINDOWS·REDUCE_WG·MAXC, so MAXC must reach ceil(stride/REDUCE_WG).
    // Only bump when a jac→affine flip actually exists (per-level cut; never for
    // the contiguous suffix, which has no mid convert).
    const needsConvert = this.useJac.some((j, i) => i > 0 && !j && this.useJac[i - 1]);
    if (needsConvert) {
      MAXC = Math.max(MAXC, Math.ceil(this.stride / REDUCE_WG));
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
      // pp2 bin-count/cursor matrix (ppvBinCounts): NW·binsP·tiles + sentinel.
      // Counted at the single-batch shape — pp2 only activates at nb == 1, and
      // when nb > 1 the matrix stays at its (stub or prior) size anyway.
      const pp2TilePts = n <= 1 << 17 ? 1024 : n <= 1 << 18 ? 2048 : 4096;
      const pp2BinBytes = this.pp2Enabled ? (NUM_WINDOWS * this.pp2BinsP * Math.ceil(n / pp2TilePts) + 1) * 4 : 0;
      return srsBytes + arenaBytes + countsOffsetsBytes + planMetaBytes + windowDescBytes + pp2BinBytes;
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
      while (numBatches < NUM_WINDOWS && (!wgFits(numBatches) || estimateMem(numBatches) > this.memBudget))
        numBatches++;
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
        throw new Error(
          `prepareBatch: union exceeds the 65k-workgroup dispatch cap (${NUM_WINDOWS} windows × ${n} points). Pack fewer members.`,
        );
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
      // High-mem ping-pong per-level binds are data-dependent (levels +
      // per-level pair/carry counts vary with the scalar histogram); rebuild
      // every prepare. (fastPathRewrite of the ping-pong uniforms is a follow-up.)
      !this.highMemPingpong &&
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

    // pp2 dispatch gate + geometry. Eligibility (uniform schedule, c/n range)
    // was settled at create; this gate checks the per-prepare plan shape:
    // single window-batch, no region split, and the live schedule still
    // matching K1's baked one (a splitC prepare that decided to split rewrites
    // windowCs — fall back). Concatenated unions are covered when every member
    // runs the SAME uniform local schedule (K1's codegen is member-local;
    // dispatch y = member) with even point counts (the u16 digit pairing
    // requires it) and vec4-aligned scalar bases.
    {
      const localNW = Math.ceil(NUMBITS / this.c);
      const schedOk = this.windowCs.every(cw => cw === this.c);
      // Full bin coverage: (binsP << shift) must equal BW so the top Booth
      // digit's bin is in range. Holds because PLANNER_TPB (256) is divisible
      // by 2^shift (shift ≤ 8); checked so a future BW-rounding change
      // degrades to the classic path instead of corrupting the histograms.
      const binsOk = this.pp2BinsP << this.pp2BinShift === this.BW;
      const singleOk = !this.batchCtx && this.windowCs.length === localNW && n % 2 === 0;
      const unionOk =
        !!this.batchCtx &&
        this.windowCs.length === this.batchCtx.members.length * localNW &&
        this.batchCtx.members.every(
          mb => mb.n % 2 === 0 && mb.n <= n && mb.numWindows === localNW && mb.scalarBaseBytes % 16 === 0,
        );
      this.pp2Active =
        this.pp2Enabled && binsOk && !this.regionSplit && numBatches === 1 && schedOk && (singleOk || unionOk);
      if (this.pp2Enabled && !this.pp2Active && !this.pp2FallbackLogged) {
        this.pp2FallbackLogged = true;
        console.log(
          `[MsmV2] pp2 inactive this prepare (regionSplit=${this.regionSplit} batches=${numBatches} union=${!!this.batchCtx}) — classic preprocess fallback (logged once per instance)`,
        );
      }
    }
    const pp2TilePts = n <= 1 << 17 ? 1024 : n <= 1 << 18 ? 2048 : 4096;
    if (this.pp2Active) {
      this.pp2NumTiles = Math.ceil(n / pp2TilePts);
    }
    const ppvBinLen = this.pp2Active ? NUM_WINDOWS * this.pp2BinsP * this.pp2NumTiles + 1 : 0;

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
        // The plan rings + prefScratch hold S entries/block — the ping-pong uses
        // the fixed HIGH_MEM_S (not the walker's pickS(n)), so size them for it.
        S: this.highMemPingpong ? HIGH_MEM_S : S,
        scalarsBytes: scalars.byteLength,
        redM: RED_M,
        reducePrefBytes,
        bTotal: B_TOTAL,
        streamNumThreads: this.streamNumThreads,
        streamS: this.streamS,
        streamQueueEntries: B_TOTAL + this.streamNumThreads * (2 * this.streamS - 1),
        streamRadixTiles: this.numRadixTiles,
        ppvBinLen,
        highMem: this.highMemPingpong,
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
    const l0BaseBuf = scratch.l0BaseBuf;
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
    // L0 self-pad anchor = the seed trio at [l0PadAnchor, +1, +2] (point indices
    // 0,1,2 ⇒ distinct SRS points ⇒ pad pairs have dx≠0, so they don't poison the
    // block's shared batched inversion). For a uniform pack l0PadAnchor==batchSlots;
    // a different-n union makes the partials matrix the larger term, so the anchor
    // sits above batchSlots — using batchSlots here would read stale partials
    // (dx possibly 0 ⇒ corrupts the real slots). The walker reads the same anchor.
    const padParams0Buf = ubuf(new Uint32Array([l0PadAnchor, l0PadAnchor + 1, poolM1 - 1, 0]));
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
      this.msbDecideBind = mkBind(this.msbDecideLayout, [
        msbHistBuf,
        decideWindowDescBuf,
        decideSummaryBuf,
        decideParams,
      ]);
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
      this.msbIdxLargeBind = mkBind(this.msbIdxLargeLayout, [
        msbPerScalarBuf,
        decideSummaryBuf,
        idxLargeBuf,
        idxLargeCountBuf,
        idxLargeParams,
      ]);
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
      mkBind(this.decomposeLayout, [
        scalarsRawBuf,
        bucketAndSignBuf,
        decomposeParams,
        bwb,
        windowDescBuf,
        pointOffsetsBuf,
      ]),
    );
    // The transpose borrows l0IdxBuf as the per-chunk partials matrix. Its
    // [0, batchSlots) region is dormant until convActive (which runs strictly
    // after the transpose, per batch) overwrites it; the level-0 seed trio
    // sits above batchSlots and is never touched by the partials region.
    const partialsBuf = l0IdxBuf;
    this.xposeCountBinds = batchWindowBaseBufs.map(bwb =>
      mkBind(this.xposeCountLayout, [bucketAndSignBuf, partialsBuf, xposeParams, windowDescBuf, bwb, pointOffsetsBuf]),
    );
    this.xposeReduceBinds = batchWindowBaseBufs.map(bwb =>
      mkBind(this.xposeReduceLayout, [partialsBuf, rowPtrBuf, xposeParams, windowDescBuf, bwb]),
    );
    this.xposeScanBinds = batchWindowBaseBufs.map(bwb =>
      mkBind(this.xposeScanLayout, [rowPtrBuf, xposeParams, windowDescBuf, bwb]),
    );
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
      ]),
    );
    // Region-split (Phase 2C-ii): upper-region binds. The upper W_hi windows
    // iterate only n_large compacted points via decompose_upper + count/scatter
    // over input_size=n_large, batch_window_base = W_lo. idx_large is uploaded
    // host-side (stepping stone). Built only when this.regionSplit.
    if (this.regionSplit && idxLargeHost && this.idxLargeBuf) {
      device.queue.writeBuffer(this.idxLargeBuf, 0, idxLargeHost as BufferSource);
      const upperBwb = ubuf(new Uint32Array([this.wLo, 0, 0, 0]));
      const decomposeUpperParams = ubuf(new Uint32Array([this.nLarge, this.wHi, n, 8]));
      const xposeParamsUpper = ubuf(new Uint32Array([transposeNumPointTiles, this.nLarge, n, pointsPerTile]));
      this.decomposeUpperBind = mkBind(this.decomposeUpperLayout, [
        scalarsRawBuf,
        bucketAndSignBuf,
        decomposeUpperParams,
        upperBwb,
        windowDescBuf,
        this.idxLargeBuf,
      ]);
      this.xposeCountUpperBind = mkBind(this.xposeCountLayout, [
        bucketAndSignBuf,
        partialsBuf,
        xposeParamsUpper,
        windowDescBuf,
        upperBwb,
        pointOffsetsBuf,
      ]);
      this.xposeScatterUpperBind = mkBind(this.scatterUpperLayout, [
        bucketAndSignBuf,
        rowPtrBuf,
        partialsBuf,
        valIdxBuf,
        xposeParamsUpper,
        windowDescBuf,
        upperBwb,
        this.idxLargeBuf,
      ]);
    }
    this.convActiveBind = mkBind(this.convActiveLayout, [valIdxBuf, l0IdxBuf, convActiveParams, bucketAndSignBuf]);
    this.convMetaBinds = batchWindowBaseBufs.map(bwb =>
      mkBind(this.convMetaLayout, [
        rowPtrBuf,
        countsBufs[0],
        offsetsBufs[0],
        convMetaParams,
        windowDescBuf,
        bwb,
        pointOffsetsBuf,
      ]),
    );
    // pp2 binds. Digits reuse bucketAndSign, the binned intermediate reuses
    // valIdx, and K3 writes the final l0 entries + bucket meta into the same
    // buffers conv-active/conv-meta would have (so every downstream consumer is
    // untouched). params[1].x (base_offset) starts 0 and is rewritten per
    // prepare alongside the conv-active uniform.
    if (this.pp2Active) {
      const pp2Params = ubuf(
        new Uint32Array([n, this.pp2NumTiles, pp2TilePts, this.pp2BinsP, 0, ppvBinLen - 1, BW, 0]),
      );
      this.pp2ParamsBuf = pp2Params;
      const binCounts = scratch.ppvBinCounts;
      // K1's per-member geometry (first window = member*NW, scalar base from
      // WindowDesc +6, point range from point_offsets) derives in-shader from
      // the tables every preprocess kernel already binds — no member table.
      this.pp2MemberCount = this.batchCtx?.members.length ?? 1;
      this.pp2DigitCountBind = mkBind(this.pp2DigitCountLayout, [
        scalarsRawBuf,
        bucketAndSignBuf,
        binCounts,
        pp2Params,
        windowDescBuf,
        pointOffsetsBuf,
      ]);
      this.pp2ScanBind = mkBind(this.pp2ScanLayout, [binCounts, pointOffsetsBuf, pp2Params]);
      this.pp2ScatterBind = mkBind(this.pp2ScatterLayout, [
        bucketAndSignBuf,
        binCounts,
        valIdxBuf,
        pp2Params,
        pointOffsetsBuf,
      ]);
      this.pp2SortEmitBind = mkBind(this.pp2SortEmitLayout, [
        valIdxBuf,
        binCounts,
        l0IdxBuf,
        countsBufs[0],
        offsetsBufs[0],
        pp2Params,
      ]);
    } else {
      // Fallback prepare: drop the previous pp2 binds too — they reference
      // prepBuffers destroyed at slow-path entry, and while pp2Active=false
      // never dispatches them, keeping dead bind groups around is a trap.
      this.pp2ParamsBuf = undefined;
      this.pp2MemberCount = 1;
      this.pp2DigitCountBind = undefined;
      this.pp2ScanBind = undefined;
      this.pp2ScatterBind = undefined;
      this.pp2SortEmitBind = undefined;
    }
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
    const redZBuf = scratch.redZBuf;
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
    const schedBuf = device.createBuffer({
      size: schedTable.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(schedBuf, 0, schedTable as BufferSource);
    this.prepBuffers.push(schedBuf);
    const cparams = ubuf(new Uint32Array([RED_M, this.capMAXC, maxLevels, 0]));
    // Thread-1: build the Jacobian binds alongside the affine ones when any
    // level runs Jacobian for this instance. jac_level reuses cparams (reads M +
    // max_levels, ignores capMAXC) and lparams (lv), swapping is_present +
    // pref_scratch for red_z; it shares schedBuf for the per-window base/schedule.
    const anyJac = this.useJac.some(Boolean);
    this.reduceJacLevelBinds = [];
    this.reduceLevelBinds = Array.from({ length: maxLevels }, (_, lv) => {
      const lparams = ubuf(new Uint32Array([lv, 0, 0, 0]));
      if (anyJac) {
        this.reduceJacLevelBinds.push(mkBind(this.jacLevelLayout, [redBuf, redZBuf, cparams, lparams, schedBuf]));
      }
      return mkBind(this.reduceLevelLayout, [redBuf, isPresentBuf, reducePrefScratch, cparams, lparams, schedBuf]);
    });
    if (anyJac) {
      const zInitParams = ubuf(new Uint32Array([RED_M, 0, 0, 0]));
      this.reduceZInitBind = mkBind(this.zInitLayout, [isPresentBuf, redZBuf, zInitParams]);
      // cparams = (M, _, max_levels, num_windows) — finalize reads the window
      // root from reduce_sched[row].x, so it needs max_levels + num_windows.
      const jacFinalizeParams = ubuf(new Uint32Array([RED_M, 0, maxLevels, this.numWindows]));
      this.reduceJacFinalizeBind = mkBind(this.jacFinalizeLayout, [
        redBuf,
        redZBuf,
        jacFinalizeParams,
        isPresentBuf,
        schedBuf,
      ]);
      // Step-4 batched convert: cparams = (M, total_slots, chunk_C, nthreads).
      // total_slots = RED_M (flat over all slots); reducePrefScratch (sized ≥ that
      // via the MAXC bump when a flip exists) holds one prefix-product per slot.
      const convTotal = RED_M;
      const convNthreads = Math.ceil(convTotal / this.convChunk);
      const jacToAffineParams = ubuf(new Uint32Array([RED_M, convTotal, this.convChunk, convNthreads]));
      this.reduceJacToAffineBind = mkBind(this.jacToAffineLayout, [
        redBuf,
        redZBuf,
        isPresentBuf,
        reducePrefScratch,
        jacToAffineParams,
      ]);
      this.jacToAffineNx = Math.ceil(convNthreads / WGI);
    } else {
      this.reduceZInitBind = undefined;
      this.reduceJacFinalizeBind = undefined;
      this.reduceJacToAffineBind = undefined;
    }
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
    // Fold-tower reduce (GROUPED_REDUCE_PLAN.md): per-window tower table +
    // per-level binds + tail bind. fold_sched rows mirror reduce_sched's
    // shape: row[0] = (base, B0, n_levels, 0), row[1+lv] = (G, M, B, 0); a
    // window whose tower is shorter than the global max no-ops via G == 0.
    this.foldLevelBinds = [];
    this.foldLevelNx = [];
    this.foldTailBind = undefined;
    this.foldMaxLevels = 0;
    if (this.groupedReduce && this.foldLayout && this.foldTailLayout) {
      // Cooperative tail consumes arrays up to ~512 long at full width, so the
      // tower stops early (usually a single fold level); the sequential tail
      // needs the deep tower to shrink the walk to ~16.
      // The combine kernel is one 64-lane workgroup per window: every tower
      // must end with arrays of ≤ 64 values.
      const tailMax = Math.min(this.foldTailMax ?? 32, 64);
      const towers = Array.from({ length: NUM_WINDOWS }, (_, w) => {
        const cw = w < this.windowCs.length ? this.windowCs[w] : c;
        return buildFoldTower(2 ** (cw - 1), {
          mTower: this.foldMTower,
          tailMax,
          maxLevels: 3,
          numWindows: NUM_WINDOWS,
          satWidth: this.foldSat,
        });
      });
      const maxFL = Math.max(...towers.map(t => t.levels.length));
      if (maxFL > 3) {
        // The sum kernel handles R + up to THREE Λ-descendant streams
        // (4 × 64 values per window); a deeper tower would silently drop a
        // stream (it did once — never again silently).
        throw new Error(`fold tower depth ${maxFL} exceeds the sum kernel's 3-stream capacity`);
      }
      this.foldMaxLevels = maxFL;
      const frow = 1 + maxFL;
      // One zero row of padding: the combine's dead-array scale select still
      // evaluates its fold_sched[row + a] operand for the last window.
      const ftab = new Uint32Array((NUM_WINDOWS + 1) * frow * 4);
      for (let w = 0; w < NUM_WINDOWS; w++) {
        const cw = w < this.windowCs.length ? this.windowCs[w] : c;
        const t = towers[w];
        const o = w * frow * 4;
        ftab[o + 0] = this.reduceOffsets[w];
        ftab[o + 1] = 2 ** (cw - 1);
        ftab[o + 2] = t.levels.length;
        // Combine z-source flag: 1 when this window's LAST fold level ran the
        // Jacobian regime (its outputs carry z in red_z).
        ftab[o + 3] = t.levels.length > 0 && (this.foldRegimes[t.levels.length - 1]?.jac ?? false) ? 1 : 0;
        t.levels.forEach((lv, i) => {
          const e = o + (1 + i) * 4;
          ftab[e + 0] = lv.G;
          ftab[e + 1] = lv.M;
          ftab[e + 2] = lv.B;
        });
      }
      const foldSchedBuf = device.createBuffer({
        size: Math.max(16, ftab.byteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(foldSchedBuf, 0, ftab as BufferSource);
      this.prepBuffers.push(foldSchedBuf);
      const fcparams = ubuf(new Uint32Array([RED_M, 0, maxFL, 0]));
      for (let lv = 0; lv < maxFL; lv++) {
        const r = this.foldRegimes[lv] ?? { jac: true, k: 1, pair: false };
        const inputsJac = lv > 0 && (this.foldRegimes[lv - 1]?.jac ?? false);
        const lp = ubuf(new Uint32Array([lv, inputsJac ? 1 : 0, 0, 0]));
        this.foldLevelBinds.push(
          r.jac
            ? mkBind(this.foldJacLayout!, [redBuf, redZBuf, isPresentBuf, fcparams, lp, foldSchedBuf])
            : mkBind(this.foldLayout, [redBuf, isPresentBuf, fcparams, lp, foldSchedBuf]),
        );
        const maxG = Math.max(...towers.map(t => t.levels[lv]?.G ?? 0));
        this.foldLevelNx.push(Math.ceil(maxG / (r.jac ? 1 : r.k) / this.reduceWg));
      }
      const ftparams = ubuf(new Uint32Array([RED_M, 0, maxFL, NUM_WINDOWS]));
      this.foldTailBind = mkBind(this.foldTailLayout, [redBuf, redZBuf, isPresentBuf, ftparams, foldSchedBuf]);
      const sumP1 = ubuf(new Uint32Array([8, 0, 0, 0])); // S_out=8, full value arrays in
      const sumP2 = ubuf(new Uint32Array([1, 1, 0, 0])); // S_out=1, fan-8 partials in
      this.foldSumBind1 = mkBind(this.foldJacLayout!, [redBuf, redZBuf, isPresentBuf, ftparams, sumP1, foldSchedBuf]);
      this.foldSumBind2 = mkBind(this.foldJacLayout!, [redBuf, redZBuf, isPresentBuf, ftparams, sumP2, foldSchedBuf]);
      const maxVals = Math.max(
        ...towers.map(t => (1 + t.levels.length) * (t.levels.length > 0 ? t.levels[t.levels.length - 1].G : 1)),
        ...towers.map((t, w2) => (t.levels.length === 0 ? 2 ** ((w2 < this.windowCs.length ? this.windowCs[w2] : c) - 1) : 0)),
      );
      this.foldWeightNx = Math.ceil(maxVals / this.reduceWg);
      // The tail leaves the per-window root in Jacobian; the existing
      // jac-finalize normalises it. Build its bind here when the useJac path
      // didn't already (it reads the window base from the legacy schedBuf —
      // same reduceOffsets bases).
      if (!this.reduceJacFinalizeBind) {
        const jacFinalizeParams = ubuf(new Uint32Array([RED_M, 0, maxLevels, NUM_WINDOWS]));
        this.reduceJacFinalizeBind = mkBind(this.jacFinalizeLayout, [
          redBuf,
          redZBuf,
          jacFinalizeParams,
          isPresentBuf,
          schedBuf,
        ]);
      }
    }
    this.halveDepthDispatch = [];
    this.halveFinishBind = undefined;
    this.halveZInitBind = undefined;
    this.halveZInitAt = -1;
    if (this.halvingReduce && this.halveSchedule && this.foldLayout && this.foldJacLayout) {
      const sched = this.halveSchedule;
      const strideB = 2 ** (c - 1);
      const htab = new Uint32Array(NUM_WINDOWS * 4);
      for (let w = 0; w < NUM_WINDOWS; w++) {
        htab[w * 4 + 0] = this.reduceOffsets[w];
        htab[w * 4 + 1] = strideB;
      }
      const hbuf = device.createBuffer({
        size: Math.max(16, htab.byteLength),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(hbuf, 0, htab as BufferSource);
      this.prepBuffers.push(hbuf);
      const hcparams = ubuf(new Uint32Array([RED_M, 0, 0, NUM_WINDOWS]));
      for (const dep of sched.depths) {
        const cpairs = dep.mode === 'ba8' ? 8 : dep.mode === 'ba4' ? 4 : 1;
        const lp = ubuf(new Uint32Array([dep.d, cpairs, 0, 0]));
        const pipe =
          dep.mode === 'ba8' ? this.halveBa8Pipe! : dep.mode === 'ba4' ? this.halveBa4Pipe! : this.halveJacPipe!;
        const bind =
          dep.mode === 'jac'
            ? mkBind(this.foldJacLayout, [redBuf, redZBuf, isPresentBuf, hcparams, lp, hbuf])
            : mkBind(this.foldLayout, [redBuf, isPresentBuf, hcparams, lp, hbuf]);
        const threads = Math.ceil(dep.pairsPerWindow / cpairs);
        const wg = dep.mode === 'jac' ? this.reduceWg : HALVE_BA_WG;
        if (this.halveZInitAt < 0 && dep.mode === 'jac') {
          this.halveZInitAt = this.halveDepthDispatch.length;
        }
        this.halveDepthDispatch.push({ pipe, bind, nx: Math.ceil(threads / wg) });
      }
      // Finisher geometry for F1/F2: (finisher_depth, inputs_jac, log2_B, 0).
      // Uniform-sourced so the rolled loops' barriers sit in uniform control
      // flow and driver unrollers can't expand them.
      const hlp = ubuf(
        new Uint32Array([sched.finisherDepth, sched.finisherInputsJac ? 1 : 0, Math.log2(strideB), 0]),
      );
      this.halveFinishBind = mkBind(this.foldJacLayout, [redBuf, redZBuf, isPresentBuf, hcparams, hlp, hbuf]);
      const partials = sched.finisherDepth + 1;
      this.halveStageBuf = device.createBuffer({
        size: Math.max(16, NUM_WINDOWS * partials * 96),
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      this.prepBuffers.push(this.halveStageBuf);
      this.halveArraysBind = mkBind(this.halveStageLayout!, [
        redBuf,
        redZBuf,
        isPresentBuf,
        hcparams,
        hlp,
        hbuf,
        this.halveStageBuf,
      ]);
      if (this.halveZInitAt >= 0) {
        const zInitParams = ubuf(new Uint32Array([RED_M, 0, 0, 0]));
        this.halveZInitBind = mkBind(this.zInitLayout, [isPresentBuf, redZBuf, zInitParams]);
      }
      if (!this.reduceJacFinalizeBind) {
        const jacFinalizeParams = ubuf(new Uint32Array([RED_M, 0, maxLevels, NUM_WINDOWS]));
        this.reduceJacFinalizeBind = mkBind(this.jacFinalizeLayout, [
          redBuf,
          redZBuf,
          jacFinalizeParams,
          isPresentBuf,
          schedBuf,
        ]);
      }
    }
    this.redBuf = redBuf;

    // --- High-mem A/B ping-pong per-level binds (Thread 2) ---
    // Built only when the mode runs (levels > 0 ⇒ highMemPingpong + uniform-c).
    // The decompose/transpose/convActive/convMeta binds are shared with the
    // walker path; here we add the planner_v2 / fused / carry / finalize-accum
    // per-level binds + the bucket_result→red_buf reduce-init bridge. Single
    // point-chunk (all n); coop-tail disabled for now (every level runs).
    this.pingLevelBinds = [];
    this.pingReduceInitBind = undefined;
    this.pingLevels = 0;
    this.coopTailLevel = -1;
    if (this.highMemPingpong && levels > 0) {
      const bucketResult = scratch.bucketResultBuf;
      const touched = scratch.touchedBuf;
      const pointX = this.pool.poolX;
      const pointY = this.pool.poolY;
      // The planner borrows valIdxBuf as the per-bucket carry-prefix array; it is
      // dead once convActive consumes it (strictly before the planner). Requires
      // B_TOTAL = numWindows·BW ≤ batchSlots (valIdxBuf's length).
      const carryOffBuf = valIdxBuf;
      if (batchSlots < B_TOTAL) {
        throw new Error(`high-mem planner: valIdxBuf (${batchSlots}) too small for carry_off (${B_TOTAL})`);
      }
      const FUSED_TILE = this.fusedTileSize;
      const reduceInitParams = ubuf(new Uint32Array([RED_M, this.stride, BW, B_TOTAL]));
      this.pingReduceInitBind = mkBind(this.reduceInitLayout, [bucketResult, redBuf, isPresentBuf, reduceInitParams]);
      this.pingNReduceInit = Math.ceil(RED_M / WGI);
      this.pingNumWgsFinalize = Math.ceil(batchBuckets / WGI);
      // finalize params per window-batch: [B(=thread count), M(active stride=poolM1),
      // bb_base(=bi·batchBuckets global bucket offset), B_global(=bTotal plane stride)].
      const finalizeParamsBufs: GPUBuffer[] = [];
      for (let bi = 0; bi < numBatches; bi++) {
        finalizeParamsBufs.push(ubuf(new Uint32Array([batchBuckets, poolM1, bi * batchBuckets, B_TOTAL])));
      }
      // One-program geometry uniform for the planner kernels (BW, num_windows;
      // per_thread/num_groups = BW/TPB derived in-shader). Constant per prepare.
      const geomBuf = ubuf(new Uint32Array([BW, NUM_WINDOWS, 0, 0]));
      for (let lv = 0; lv < levels; lv++) {
        const plan = levelPlans[lv];
        const isL0 = lv === 0;
        const inIdx = lv & 1;
        const outIdx = inIdx ^ 1;
        const ring = lv & 1;
        const activeOut = inIdx === 0 ? bufB : bufA;
        const activeIn: GPUBuffer | GPUBufferBinding = isL0 ? l0IdxBuf : inIdx === 0 ? bufA : bufB;
        const plannerParams = ubuf(new Uint32Array([plan.pairBlocksPerWindow, plan.carriesPerWindow, WGI, wstride1]));
        const carryParams = ubuf(new Uint32Array([plan.totalCarries, poolM1, poolM1, 0]));
        const fusedTiles: { bind: GPUBindGroup; nx: number }[] = [];
        for (let tileBase = 0; tileBase < plan.totalPairBlocks; tileBase += FUSED_TILE) {
          const tileThreads = Math.min(FUSED_TILE, plan.totalPairBlocks - tileBase);
          const tileParams = ubuf(new Uint32Array([plan.totalPairBlocks, poolM1, poolM1, tileBase]));
          const fe: (GPUBuffer | GPUBufferBinding)[] = [
            pairBlockPlanRing[ring],
            scatterPlanRing[ring],
            activeIn,
            activeOut,
            tileParams,
            prefScratchBuf,
          ];
          if (isL0) fe.push(pointX, pointY);
          fusedTiles.push({
            bind: mkBind(isL0 ? this.fusedLayoutL0 : this.fusedLayout, fe),
            nx: Math.ceil(tileThreads / WGI),
          });
        }
        const carryEntries: (GPUBuffer | GPUBufferBinding)[] = [carryPlanRing[ring], activeIn, activeOut, carryParams];
        if (isL0) carryEntries.push(pointX, pointY);
        const plannerABind = mkBind(this.plannerALayout, [
          countsBufs[inIdx],
          carryOffBuf,
          countsBufs[outIdx],
          offsetsBufs[outIdx],
          planMeta,
          plannerParams,
          geomBuf,
        ]);
        const plannerBBind = mkBind(this.plannerBLayout, [
          countsBufs[inIdx],
          offsetsBufs[inIdx],
          carryOffBuf,
          offsetsBufs[outIdx],
          planMeta,
          pairBlockPlanRing[ring],
          scatterPlanRing[ring],
          carryPlanRing[ring],
          plannerParams,
          isL0 ? padParams0Buf : padParams1Buf,
          geomBuf,
        ]);
        const carryBind = mkBind(isL0 ? this.carryLayoutL0 : this.carryLayout, carryEntries);
        const finalizeAccumBinds = finalizeParamsBufs.map(fp => {
          const fe: (GPUBuffer | GPUBufferBinding)[] = [
            countsBufs[inIdx],
            offsetsBufs[inIdx],
            activeIn,
            bucketResult,
            fp,
            touched,
          ];
          if (isL0) fe.push(pointX, pointY);
          return mkBind(isL0 ? this.finalizeAccumLayoutL0 : this.finalizeAccumLayout, fe);
        });
        this.pingLevelBinds.push({
          plannerABind,
          plannerBBind,
          fusedTiles,
          carryBind,
          finalizeAccumBinds,
          nCarry: Math.ceil(plan.totalCarries / WGI),
        });
      }
      this.pingLevels = levels;
    }

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
        mkBind(this.classifyLayout, [
          countsBufs[0],
          offsetsBufs[0],
          s1,
          db,
          dc,
          sp,
          classifyParams,
          windowDescBuf,
          bwb,
          scratch.isPresentBuf,
        ]),
      );
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
      const cumsumParams = ubuf(new Uint32Array([this.maxPlannerWorkgroups, 0, 0, 0]));
      this.cumsumBind = mkBind(this.cumsumLayout, [sc, ca, sp, cumsumParams]);
      const pwgParams = ubuf(new Uint32Array([0, 0, 0, 0]));
      this.partitionWgBind = mkBind(this.partitionWgLayout, [sc, ca, sp, wc, pwgParams]);
      const ptParams = ubuf(new Uint32Array([0, 0, 0, 0]));
      this.partitionThreadBind = mkBind(this.partitionThreadLayout, [sc, ca, wc, sp, tc, ptParams]);
      // size1 is per-batch: binding 6 carries batch_offset (= bi·batchWindows) so
      // size-1 buckets land in their global red_buf slice, like the walker/combine.
      this.size1Binds = batchWindowBaseBufs.map(bwb =>
        mkBind(this.size1Layout, [
          s1,
          l0IdxBuf,
          this.pointXBuf,
          this.pointYBuf,
          scratch.redBuf,
          sp,
          bwb,
          scratch.isPresentBuf,
          windowDescBuf,
        ]),
      );
      // Stream-walker bind groups (Plan §6 + C's KNOB 2 variant).
      const taskc = scratch.taskCuts;
      const wp = scratch.walkerPartials;
      const pdest = scratch.walkerPartialDest;
      const ptaskParams = ubuf(new Uint32Array([0, 0, 0, 0]));
      this.partitionTaskBind = mkBind(this.partitionTaskLayout, [sc, ca, tc, sp, taskc, ptaskParams, scratch.wiIdxArgs]);
      // Walker params: (NUM_THREADS, IDLE_ANCHOR, M_buckets, M_partials).
      const M_partials_walker = 2 * this.streamNumThreads * this.streamS;
      const walkerParams = ubuf(new Uint32Array([this.streamNumThreads, l0PadAnchor, B_TOTAL, M_partials_walker]));
      // BW for flat_bid in the storage-only / params-full combine+pair-tree kernels.
      const bwBuf = ubuf(new Uint32Array([this.BW, 0, 0, 0]));
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
      this.walkerArenaOffBuf = walkerArenaOff;
      this.streamWalkerBinds = batchWindowBaseBufs.map(bwb =>
        mkBind(this.streamWalkerLayout, [
          sb,
          a0Buf,
          this.l0Precompute ? l0BaseBuf : offsetsBufs[0],
          taskc,
          this.pointXBuf,
          this.pointYBuf,
          scratch.redBuf,
          wp,
          pdest,
          windowDescBuf,
          walkerParams,
          bwb,
          walkerArenaOff,
        ]),
      );
      // Resolve-l0base bind groups: precompute l0_base into its dedicated buffer.
      // One per batch (batch_offset feeds flat_bid). Writes l0BaseBuf (rw), reads
      // sorted_bucket_list + the final CSR offsets + window_desc.
      const l0bParams = ubuf(new Uint32Array([0, 0, 0, 0]));
      this.resolveL0BaseBinds = batchWindowBaseBufs.map(bwb =>
        mkBind(this.resolveL0BaseLayout, [sb, l0BaseBuf, offsetsBufs[0], windowDescBuf, sp, l0bParams, bwb]),
      );
      // === walker_combine bind groups. ===
      const pcount = scratch.partialCount;
      const poffset = scratch.partialOffset;
      const pwpos = scratch.partialWritePos;
      const playout = scratch.partialLayout;
      const abkts = scratch.activeBuckets;
      const acnt = scratch.activeCount;
      // arena_a2 monolith: partial_count + partial_layout are A2 sub-ranges; bind
      // the whole arena once and address them by offset (shared by both at-cap
      // combine kernels), freeing the slot that lets window_desc be storage (no cap).
      const a2Buf = slotBuf(pcount);
      if (slotBuf(playout) !== a2Buf) {
        throw new Error('combine: partial_count and partial_layout must share arena A2');
      }
      const combineArenaOff = ubuf(new Uint32Array([slotOff(pcount) / 4, slotOff(playout) / 4, 0, 0]));
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
      // === walker_index bind groups (WALKER_INDEX_PLAN.md). ===
      {
        const wiArgs = scratch.wiIdxArgs;
        // idx_count / idx_scatter params: (BW, M_partials, _, _).
        const wiParams = ubuf(new Uint32Array([this.BW, M_partials_walker, 0, 0]));
        this.idxCountBind = mkBind(this.idxCountLayout, [pdest, pcount, scratch.streamPlannerMeta, wiParams]);
        this.idxAllocBind = mkBind(this.idxAllocLayout, [
          sb,
          pcount,
          poffset,
          abkts,
          acnt,
          chist,
          scratch.streamPlannerMeta,
          wiParams,
        ]);
        this.idxEpilogueBind = mkBind(this.idxEpilogueLayout, [
          chist,
          acnt,
          boffs,
          bwpos,
          scratch.ptDispatchArgs,
          scratch.ptPersistentDispatchArgs,
          scratch.cbDispatchArgs,
          wiArgs,
          poffset,
          scratch.streamPlannerMeta,
        ]);
        this.idxScatterBinds = batchWindowBaseBufs.map(bwb =>
          mkBind(this.idxScatterLayout, [
            pdest,
            poffset,
            pwpos,
            playout,
            wp,
            scratch.redBuf,
            scratch.streamPlannerMeta,
            windowDescBuf,
            wiParams,
            bwb,
          ]),
        );
        this.idxSortBind = mkBind(this.idxSortLayout, [abkts, acnt, boffs, bwpos, sabkts]);
        if (this.wiProbe) {
          // Probe scratch regions inside ptScratch (u32 elements): exports at
          // 0, layout-model at 1024, fb-keyed model after 3×M cap (layout +
          // pair appends), all rewritten by the pair-tree phase afterwards.
          const probeParams = ubuf(new Uint32Array([0, 1024, 1024 + 3 * M_partials_walker + 64, this.BW]));
          this.idxP1Bind = mkBind(this.idxProbeLayout, [pdest, scratch.ptScratch, scratch.streamPlannerMeta, probeParams]);
          this.idxP2Bind = mkBind(this.idxProbeLayout, [pdest, scratch.ptScratch, scratch.streamPlannerMeta, probeParams]);
        }
      }
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
      const ptInitCopyParams = ubuf(new Uint32Array([M_partials_walker, M_pt, this.BW, 0]));
      // pt_combine params: (M_pt)
      const ptCombineParams = ubuf(new Uint32Array([M_pt, 0, 0, 0]));
      // pt_finalize params: (M_pt, M_buckets=B_TOTAL)
      const ptFinalizeParams = ubuf(new Uint32Array([M_pt, B_TOTAL, 0, 0]));

      this.ptInitScanBind = mkBind(this.ptInitScanLayout, [
        sabkts,
        boffs,
        acnt,
        pcount,
        ptOffBuf,
        ptCountBuf,
        ptMetaBuf,
        bwBuf,
      ]);
      this.ptInitCopyBind = mkBind(this.ptInitCopyLayout, [
        sabkts,
        boffs,
        acnt,
        pcount,
        poffset,
        playout,
        wp,
        ptOffBuf,
        ptBuf,
        ptInitCopyParams,
      ]);
      this.ptBuildBind = mkBind(this.ptBuildLayout, [boffs, acnt, ptOffBuf, ptCountBuf, ptTasksBuf, ptTotalBuf]);
      // chain dispatch reads previous level's total and the hot_wgs source,
      // writes combine + build args. Build's level-loop indirect dispatch
      // turns into a no-op once total hits zero, so dead late levels cost
      // ~1 µs (dispatch_compute alone) instead of ~150 µs.
      this.ptDispatchChainBind = mkBind(this.ptDispatchChainLayout, [
        ptTotalBuf,
        scratch.ptCombineDispatchArgs,
        scratch.ptBuildLoopArgs,
        scratch.ptDispatchArgs,
      ]);
      this.ptCombineBind = mkBind(this.ptCombineLayout, [ptTasksBuf, ptTotalBuf, ptBuf, ptCombineParams]);
      this.ptFinalizeBinds = batchWindowBaseBufs.map(bwb =>
        mkBind(this.ptFinalizeLayout, [
          sabkts,
          boffs,
          acnt,
          ptOffBuf,
          ptBuf,
          scratch.redBuf,
          ptFinalizeParams,
          scratch.isPresentBuf,
          bwb,
          windowDescBuf,
        ]),
      );
      // combine_batched now reads sorted_active_buckets at binding 0 → zero
      // tail divergence per S=8 thread group.
      this.combineBatchedBinds = batchWindowBaseBufs.map(bwb =>
        mkBind(this.combineBatchedLayout, [
          sabkts,
          acnt,
          a2Buf,
          poffset,
          l0IdxBuf,
          this.pointXBuf,
          this.pointYBuf,
          wp,
          scratch.redBuf,
          windowDescBuf,
          walkerParams,
          bwb,
          combineArenaOff,
          bwBuf,
        ]),
      );
    }

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
      // pp2 runs 4 preprocess dispatches (digit-count, scan, scatter, sort-emit)
      // where the classic path runs 7 (decompose + 4 transpose + convActive +
      // convMeta).
      const prePasses = this.pp2Active ? 4 : 7;
      if (this.highMemPingpong && this.pingLevels > 0) {
        // High-mem ping-pong per batch: preprocess + Σ_levels (plannerA +
        // plannerB + fusedTiles + carry + finalize). The bufA/bufB clears are
        // clearBuffer (no timestamp).
        let pingPerBatch = prePasses;
        for (const lb of this.pingLevelBinds) pingPerBatch += 2 + lb.fusedTiles.length + 1 + 1;
        for (let bi = 0; bi < numBatches; bi++) passes += pingPerBatch;
        passes += 1; // reduce_init bridge (once)
      } else {
        for (let bi = 0; bi < numBatches; bi++) {
          // preprocess + 16 planner + 3 walker (size1+stream_walker+walker_index marker)
          // + 5 combine kernels (count, scan, scatter, filter, batched)
          // + 3 counting-sort prepass kernels (sort_count, sort_scan, sort_scatter)
          // + pair-tree multi-dispatch: 2 (init) + 17 × 3 (build + dispatch + combine) + 1 (finalize) = 54
          passes += prePasses + 16 + 3 + 3 + 3 + (2 + 17 * 3 + 1);
        }
      }
      // Reduce = one dispatch per level (table-driven), a single dispatch for
      // the sparse path, or fold levels + tail + jac-finalize for the fold
      // tower. +1 keeps the historical slack slot.
      passes +=
        1 +
        (this.groupedReduce
          ? this.foldMaxLevels + 4
          : this.sparseReduce
            ? 1
            : this.reduceLevelBinds.length);
      // Thread-1/step-4: each affine↔jac flip in useJac adds one transition
      // dispatch (z-init for affine→jac, batched convert for jac→affine); a
      // trailing Jacobian region adds the per-window finalize.
      {
        let trans = 0;
        let cur = false;
        for (const j of this.useJac) {
          if (j !== cur) {
            trans++;
            cur = j;
          }
        }
        if (cur) trans++;
        passes += trans;
      }
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

    // Window sums + (profile) the resolved timestamps appended, so run()
    // needs ONE mapAsync fence round-trip instead of two. Created HERE,
    // after the profiling block, because the size depends on passCount.
    this.redStaging = device.createBuffer({
      size: this.windowSumsByteLength + (this.profile ? this.passCount * 16 : 0),
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    this.prepBuffers.push(this.redStaging);

    // Write the per-prepare base_offset into the conv-active uniform at
    // params[1]. The other three fields ([total_slots, _, wstride, input_size])
    // were initialized in create() and are MSM-instance-invariant; only the
    // offset varies per call. 4-byte write at offset 4 in the buffer.
    this.device.queue.writeBuffer(this.convActiveParamsBuf, 4, new Uint32Array([srsOffset]));
    if (this.pp2ParamsBuf) {
      this.device.queue.writeBuffer(this.pp2ParamsBuf, 16, new Uint32Array([srsOffset]));
    }

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
      if (this.pp2ParamsBuf) {
        device.queue.writeBuffer(this.pp2ParamsBuf, 16, new Uint32Array([srsOffset]));
      }
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
    if (this.earlyExitMode) {
      return this.numWindows * this.halvePartialsPerWindow * 96;
    }
    return this.numWindows * 64;
  }

  /** Staged partials per window in early-exit mode (1 + finisher depth). */
  get halvePartialsPerWindow(): number {
    return (this.halveSchedule?.finisherDepth ?? 0) + 1;
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
    // Profiling-batch knobs (defaults = single-run behaviour). `passBase` starts
    // the timestamp-query write index (and keeps passPhases accumulating — reset
    // only when passBase===0); `resolveTs=false` skips the internal queryset
    // resolve so a caller can encode N runs into one encoder and resolve once.
    passBase: number = 0,
    resolveTs: boolean = true,
  ): void {
    if (this.preparedFor === null) throw new Error('MsmV2.encodeIntoBatch: call prepare() first');
    const { wgi: WGI } = this;
    let passIdx = passBase;
    const splitDiag = this.splitSubmitDiag;
    const device = this.device;
    if (splitDiag) this.splitCmdBuffers = [];
    let pendingPhase = 'init';
    // ?split_submit=1: finish the current encoder at each phase boundary and
    // COLLECT its command buffer (do not submit yet). run() submits them
    // SEQUENTIALLY (submit → await GPU completion → next), idling the GPU
    // between phases to reset the Adreno ~2s watchdog, and letting device.lost
    // name the phase in flight.
    const flushIfSplit = (): void => {
      if (!splitDiag) return;
      this.splitCmdBuffers.push([pendingPhase, enc.finish()]);
      enc = device.createCommandEncoder();
    };
    const profEnabled = this.profile && this.querySet && !splitDiag;
    if (profEnabled && passBase === 0) this.passPhases = [];
    let curPhase = 'misc';
    const setPhase = (p: string) => {
      flushIfSplit();
      pendingPhase = p;
      curPhase = p;
    };
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
      // Native GPU-timeline label: with content_shell launched under
      // --enable-dawn-features=use_user_defined_labels_in_backend, Dawn emits
      // this as vkCmdBeginDebugUtilsLabelEXT, so AGI/Perfetto render-stage slices
      // carry the kernel name. No-op (negligible CPU, zero GPU) otherwise.
      pass.pushDebugGroup(curPhase);
      pass.setPipeline(pipe);
      pass.setBindGroup(0, bind);
      pass.dispatchWorkgroups(Math.max(1, nx), Math.max(1, ny), 1);
      pass.popDebugGroup();
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
    // High-mem ping-pong: bucket_result + touched accumulate across window-
    // batches (and, later, point-chunks) so they are cleared once per encode.
    // An empty bucket never gets finalized, so its all-zero bucket_result is
    // what reduce_init reads as "not present".
    if (this.highMemPingpong && this.pingLevels > 0) {
      enc.clearBuffer(this.pool.scratch!.bucketResultBuf);
      enc.clearBuffer(this.pool.scratch!.touchedBuf);
    }
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
      // pp2 two-level preprocess: 4 dispatches replace the 7-dispatch classic
      // pipeline below — K1 fused decompose+coarse-bin count, K1.5 cursor scan,
      // K2 direct bin scatter, K3 per-bin counting sort emitting the
      // final l0 entries (base_offset folded) + bucket counts/offsets directly.
      // No buffer clears needed: every output cell is written each run.
      if (this.pp2Active) {
        dispatch(this.pp2DigitCountPipe!, this.pp2DigitCountBind!, this.pp2NumTiles, this.pp2MemberCount);
        dispatch(this.pp2ScanPipe!, this.pp2ScanBind!, tbw, 1);
        dispatch(this.pp2ScatterPipe!, this.pp2ScatterBind!, this.pp2NumTiles, tbw);
        dispatch(this.pp2SortEmitPipe!, this.pp2SortEmitBind!, this.pp2BinsP, tbw);
      } else
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
      // pp2's K3 already emitted the final l0 entries + bucket meta.
      if (!this.pp2Active) {
        dispatch(this.convActivePipe, this.convActiveBind, Math.ceil(tSlots / WGI), 1);
        dispatch(this.convMetaPipe, this.convMetaBinds[bi], Math.ceil(this.BW / this.wgi), this.batchWindows);
      }
      // === High-mem A/B ping-pong pair-tree (Thread 2) ===
      // Replaces the walker planner + stream_walker + walker_combine + pair-tree
      // -V2. convActive/convMeta (above) produced this batch's l0_index + level-0
      // counts/offsets; the planner_v2 + fused/carry/finalize-accumulate loop
      // collapses every bucket to a single sum in bucket_result[bb_base + b].
      // reduce_init (after the batch loop) repacks bucket_result → red_buf.
      if (this.highMemPingpong && this.pingLevels > 0) {
        setPhase('pingpong');
        const sc = this.pool.scratch!;
        // Clear bufA/bufB non-pad regions for this batch (the lever-E pad-trio at
        // each plane's tail [padXOffset, planeBytes) is seeded once and survives).
        enc.clearBuffer(sc.bufA, 0, sc.padXOffset);
        enc.clearBuffer(sc.bufA, sc.planeBytes, sc.padXOffset);
        enc.clearBuffer(sc.bufB, 0, sc.padXOffset);
        enc.clearBuffer(sc.bufB, sc.planeBytes, sc.padXOffset);
        for (let lv = 0; lv < this.pingLevels; lv++) {
          const lb = this.pingLevelBinds[lv];
          const fpipe = lv === 0 ? this.fusedPipeL0 : this.fusedPipe;
          const cpipe = lv === 0 ? this.carryPipeL0 : this.carryPipe;
          const flpipe = lv === 0 ? this.finalizeAccumPipeL0 : this.finalizeAccumPipe;
          dispatch(this.plannerAPipe, lb.plannerABind, this.batchWindows, 1);
          dispatch(this.plannerBPipe, lb.plannerBBind, Math.ceil(this.BW / 256), this.batchWindows);
          for (const tile of lb.fusedTiles) dispatch(fpipe, tile.bind, tile.nx, 1);
          dispatch(cpipe, lb.carryBind, lb.nCarry, 1);
          dispatch(flpipe, lb.finalizeAccumBinds[bi], this.pingNumWgsFinalize, 1);
        }
        continue;
      }
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
      // walkerPartialDest needs no per-batch clear: the index kernels bound
      // their reads by the walker's true range (2*S*num_active_threads from
      // planner_meta[3]) and the walker initialises every slot in that range.
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
      // Resolve per-sorted-bucket l0_base so the walker reads a coalesced base
      // (kills the cold dependent-gather: init ramp + small-bucket transition drain).
      if (this.l0Precompute) {
        dispatch(this.resolveL0BasePipe, this.resolveL0BaseBinds[bi], Math.ceil(this.bTotal / 256), 1);
      }
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
        pass.pushDebugGroup(curPhase); // native kernel label (see dispatch())
        pass.setPipeline(pipe);
        pass.setBindGroup(0, bind);
        pass.dispatchWorkgroupsIndirect(buf, off);
        pass.popDebugGroup();
        pass.end();
      };
      setPhase('size1');
      indirectDispatch(this.size1Pipe, this.size1Binds[bi], spMeta, 8 * 4);
      // Stream-walker replaces stream_accum + partial_sum + emit + emit_fixup.
      // partition_task wrote the walker's indirect args to planner_meta[15..17]
      // (= byte offset 60 = 15 * 4).
      setPhase('stream_walker');
      indirectDispatch(this.streamWalkerPipe, this.streamWalkerBinds[bi], spMeta, 15 * 4);
      // === walker_index: cross-bucket partials index (WALKER_INDEX_PLAN.md). ===
      // 5 exact-width dispatches, one wi_* label per dispatch so traces and
      // the per-phase breakdown attribute each sub-kernel individually:
      // count, fused alloc+filter+histogram, bins/args epilogue, scatter
      // (+inline singles copy), aggregated counting-sort scatter. Widths come
      // from wiIdxArgs (partition_task wrote [0..5]; the epilogue writes [6..8]).
      {
        const wiArgs = this.pool.scratch!.wiIdxArgs;
        if (this.wiProbe) {
          // Cost probes (one workgroup per 4096-slot block =
          // planner_meta[12..14], the cumsum-emitted (nwg,1,1)).
          setPhase('wi_p1');
          indirectDispatch(this.idxP1Pipe, this.idxP1Bind, spMeta, 12 * 4);
          setPhase('wi_p2');
          indirectDispatch(this.idxP2Pipe, this.idxP2Bind, spMeta, 12 * 4);
        }
        setPhase('wi_count');
        indirectDispatch(this.idxCountPipe, this.idxCountBind, wiArgs, 0);
        setPhase('wi_alloc');
        indirectDispatch(this.idxAllocPipe, this.idxAllocBind, wiArgs, 12);
        setPhase('wi_epilogue');
        dispatch(this.idxEpiloguePipe, this.idxEpilogueBind, 1, 1);
        setPhase('wi_scatter');
        indirectDispatch(this.idxScatterPipe, this.idxScatterBinds[bi], wiArgs, 0);
        setPhase('wi_sort');
        indirectDispatch(this.idxSortPipe, this.idxSortBind, wiArgs, 24);
      }
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
    // High-mem ping-pong bridge: repack bucket_result (BW cols/window) into the
    // reduce's STRIDE-col red_buf + seed is_present, the same red_buf the walker
    // path writes directly via pt_finalize. The shared reduce then runs unchanged.
    if (this.highMemPingpong && this.pingReduceInitBind) {
      setPhase('reduce_init');
      dispatch(this.reduceInitPipe, this.pingReduceInitBind, this.pingNReduceInit, 1);
    }
    setPhase('reduce');
    // Phase 2: reduce_init is gone — walker kernels write red_buf + is_present
    // directly via the bid → red_slot mapping. See UNIFIED_COMBINE_PLAN.md.
    // Phase 5: ONE pipeline drives every level (kind branched at runtime
    // off lparams.w). reduceLevelKinds is no longer consulted.
    if (
      this.halvingReduce &&
      this.halveFinishArraysPipe &&
      this.halveFinishRootPipe &&
      this.halveFinishBind &&
      this.reduceJacFinalizeBind
    ) {
      // Halving reduction (Mitschabaude): one dispatch per wide depth —
      // batch-affine 8/4 pairs per thread while saturated, Jacobian pairs
      // once thin (z-plane seeded just before the first Jacobian depth) —
      // then the per-window finisher and the shared jac-finalize.
      for (let i = 0; i < this.halveDepthDispatch.length; i++) {
        if (i === this.halveZInitAt && this.halveZInitBind) {
          setPhase('reduce_zinit');
          dispatch(this.zInitPipe, this.halveZInitBind, Math.ceil(this.redM / WGI), 1);
          setPhase('reduce');
        }
        const dd = this.halveDepthDispatch[i];
        dispatch(dd.pipe, dd.bind, dd.nx, this.numWindows);
      }
      dispatch(
        this.halveFinishArraysPipe,
        this.halveArraysBind!,
        (this.halveSchedule?.finisherDepth ?? 0) + 1,
        this.numWindows,
      );
      if (!this.earlyExitMode) {
        setPhase('reduce_jacfinal');
        dispatch(this.halveFinishRootPipe, this.halveFinishBind, 1, this.numWindows);
      }
    } else if (this.groupedReduce && this.foldWeightPipe && this.foldSumPipe && this.foldSumBind1 && this.reduceJacFinalizeBind) {
      // Fold tower (GROUPED_REDUCE_PLAN.md): one dispatch per fold level —
      // grid (chunks, windows), level lv's pipeline is specialised for
      // streamsIn = lv — then the 64-lane-per-window weighted sum and the
      // shared jac-finalize to normalise the roots.
      for (let lv = 0; lv < this.foldMaxLevels; lv++) {
        dispatch(this.foldLevelPipes[lv], this.foldLevelBinds[lv], this.foldLevelNx[lv], this.numWindows);
      }
      dispatch(this.foldWeightPipe!, this.foldTailBind, this.foldWeightNx, this.numWindows);
      dispatch(this.foldSumPipe, this.foldSumBind1!, 1, this.numWindows);
      dispatch(this.foldSumPipe, this.foldSumBind2!, 1, this.numWindows);
      setPhase('reduce_jacfinal');
      dispatch(this.jacFinalizePipe, this.reduceJacFinalizeBind, Math.ceil(this.numWindows / WGI), 1);
    } else if (this.sparseReduce && this.reduceSparsePipe && this.reduceSparseBind) {
      // Sparse path: one dispatch, one workgroup per window; the kernel walks
      // only the active buckets (gap-aware), skipping empties. Byte-identical to
      // the dense tree.
      dispatch(this.reduceSparsePipe, this.reduceSparseBind, this.numWindows, 1);
    } else if (
      this.useJac.some(Boolean) &&
      this.reduceZInitBind &&
      this.reduceJacFinalizeBind &&
      this.reduceJacToAffineBind
    ) {
      // Mask-driven Jacobian reduce. useJac[lv] picks the coordinate system per
      // level. At each flip we bridge representations: affine→jac seeds the Z
      // plane (z-init), jac→affine normalises every live slot back to affine
      // (batched convert, which also restores is_present). A trailing Jacobian
      // region is closed by the per-window finalize. The contiguous-suffix
      // (Thread-1) path is the special case with one z-init and no mid convert.
      // Math-identical to the affine reduce — only the representation differs.
      const reducePipe = this.reduceLevelPipes[0];
      let curJac = false;
      for (let lv = 0; lv < this.reduceLevelBinds.length; lv++) {
        const wantJac = this.useJac[lv];
        if (wantJac && !curJac) {
          setPhase('reduce_zinit');
          dispatch(this.zInitPipe, this.reduceZInitBind, Math.ceil(this.redM / WGI), 1);
          curJac = true;
        } else if (!wantJac && curJac) {
          setPhase('reduce_jac2aff');
          dispatch(this.jacToAffinePipe, this.reduceJacToAffineBind, this.jacToAffineNx, 1);
          curJac = false;
        }
        if (wantJac) {
          dispatch(this.jacLevelPipe, this.reduceJacLevelBinds[lv], this.numWindows, 1);
        } else {
          dispatch(reducePipe, this.reduceLevelBinds[lv], this.numWindows, 1);
        }
      }
      if (curJac) {
        setPhase('reduce_jacfinal');
        dispatch(this.jacFinalizePipe, this.reduceJacFinalizeBind, Math.ceil(this.numWindows / WGI), 1);
      }
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
    if (this.earlyExitMode && this.halveStageBuf) {
      // Early exit: ship the staged partials as standard-form LE integers
      // (the staging kernel converts out of Montgomery on export) — the
      // native finish_and_combine_windows re-wraps them in its own radix.
      enc.copyBufferToBuffer(this.halveStageBuf, 0, dstStaging, dstByteOff, this.windowSumsByteLength);
    } else {
      const yPlane = 32 * this.redM;
      for (let w = 0; w < this.numWindows; w++) {
        const g = 32 * this.reduceOffsets[w];
        enc.copyBufferToBuffer(slotBuf(this.redBuf), slotOff(this.redBuf) + g, dstStaging, dstByteOff + w * 64, 32);
        enc.copyBufferToBuffer(
          slotBuf(this.redBuf),
          slotOff(this.redBuf) + yPlane + g,
          dstStaging,
          dstByteOff + w * 64 + 32,
          32,
        );
      }
    }
    if (this.profile && this.querySet && this.tsResolveBuf && this.tsStagingBuf && !splitDiag && resolveTs) {
      enc.resolveQuerySet(this.querySet, 0, this.passCount * 2, this.tsResolveBuf, 0);
      enc.copyBufferToBuffer(this.tsResolveBuf, 0, this.tsStagingBuf, 0, this.passCount * 16);
    }
    // Final per-phase flush: submit the last phase (reduce + result gather).
    flushIfSplit();
  }

  /**
   * Capture `reps` back-to-back WARM MSM runs in ONE submit + ONE mapAsync and
   * return their per-pass GPU timeline (`reps × passCount` `[phase, beginNs,
   * endNs]` tuples). Encoding every run into a single command encoder removes the
   * per-run host readback — whose mapAsync polling latency is the dominant, and
   * occasionally multi-second, per-MSM cost — so there is exactly one readback
   * for the whole capture. The runs execute sequentially on the GPU (WebGPU
   * hazard barriers serialise reuse of the scratch buffers). Call after
   * `prepare()` + a warm-up `run()`. No-op unless profile mode is on.
   */
  async captureWarmRuns(reps: number): Promise<Array<[string, string, string]>> {
    if (!this.profile || this.preparedFor === null || this.passCount === 0) return [];
    const device = this.device;
    const passes = this.passCount;
    const total = reps * passes;
    // Timestamp resources sized for ALL reps (the per-prepare querySet only holds
    // one run); resolved and mapped exactly once.
    const qs = device.createQuerySet({ type: 'timestamp', count: total * 2 });
    const resolveBuf = device.createBuffer({
      size: total * 16,
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    const staging = device.createBuffer({ size: total * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const savedQs = this.querySet;
    this.querySet = qs; // encodeIntoBatch writes timestampWrites into this.querySet
    try {
      const enc = device.createCommandEncoder();
      for (let r = 0; r < reps; r++) {
        // passBase keeps query indices + passPhases continuous across runs;
        // resolveTs=false defers to the single resolve below.
        this.encodeIntoBatch(enc, this.redStaging, 0, undefined, 0, r * passes, false);
      }
      enc.resolveQuerySet(qs, 0, total * 2, resolveBuf, 0);
      enc.copyBufferToBuffer(resolveBuf, 0, staging, 0, total * 16);
      device.queue.submit([enc.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      const ts = new BigUint64Array(staging.getMappedRange().slice(0));
      staging.unmap();
      const out: Array<[string, string, string]> = new Array(total);
      for (let p = 0; p < total; p++) {
        out[p] = [this.passPhases[p] ?? 'misc', ts[2 * p].toString(), ts[2 * p + 1].toString()];
      }
      return out;
    } finally {
      this.querySet = savedQs;
      qs.destroy();
      resolveBuf.destroy();
      staging.destroy();
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
   * Phase-0 validation for the sorted-runs CSR design (WALKER_INDEX_PLAN.md):
   * read back partial_dest + sorted_bucket_list after a run and verify, on
   * the CPU, the claims the wi4 kernels would rely on:
   *   (1) live entries are monotone in dense-bucket order;
   *   (2) within-bucket hole runs are <= 1 slot;
   *   (3) the planned two-kernel head rule (per-4096-slot-block exports +
   *       exact in-block previous-live) reproduces ground-truth segment
   *       heads with zero mismatches, and head-to-head rank differences
   *       reproduce ground-truth per-bucket counts;
   *   (4) segment count == active_count (every cut bucket has >= 2 partials).
   * Returns counterexample positions on any violation. Multi-batch runs
   * verify the LAST batch (the scratch buffers are per-batch).
   */
  async debugWalkerIndexMonotonicity(blockSlots = 4096): Promise<{
    mActual: number;
    live: number;
    segments: number;
    activeCount: number;
    monotonicityViolations: number;
    firstMonotonicityViolation: number;
    unknownBids: number;
    maxIntraBucketHoleRun: number;
    interBucketHoleRunsGe2: number;
    headRuleMismatches: number;
    firstHeadMismatch: number;
    countMismatches: number;
    zeroBidsInRange: number;
  }> {
    if (this.preparedFor === null) throw new Error('MsmV2.debugWalkerIndexMonotonicity: call prepare() first');
    const sc = this.pool.scratch!;
    const NO_BUCKET = 0xffffffff;
    const readSlot = async (slot: ScratchSlot, bytes: number): Promise<Uint32Array> => {
      const staging = this.device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const enc = this.device.createCommandEncoder();
      enc.copyBufferToBuffer(slotBuf(slot), slotOff(slot), staging, 0, bytes);
      this.device.queue.submit([enc.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      const out = new Uint32Array(staging.getMappedRange().slice(0));
      staging.unmap();
      staging.destroy();
      return out;
    };
    const meta = await readSlot(sc.streamPlannerMeta, 20 * 4);
    const numDense = meta[1];
    const nat = meta[3] * STREAM_PLANNER_TPB;
    const mActual = 2 * this.streamS * nat;
    const dest = await readSlot(sc.walkerPartialDest, mActual * 4);
    const sbl = await readSlot(sc.sortedBucketList, Math.max(numDense, 1) * 4);
    const active = await readSlot(sc.activeCount, 4);
    const bidToD = new Map<number, number>();
    for (let d = 0; d < numDense; d++) bidToD.set(sbl[d], d);

    // Ground truth walk.
    let live = 0;
    let segments = 0;
    let monotonicityViolations = 0;
    let firstMonotonicityViolation = -1;
    let unknownBids = 0;
    let zeroBidsInRange = 0;
    let maxIntraBucketHoleRun = 0;
    let interBucketHoleRunsGe2 = 0;
    let prevD = -1;
    let prevLiveBid = -1;
    let holeRun = 0;
    const truthHead = new Uint8Array(mActual);
    const truthCount = new Map<number, number>();
    for (let i = 0; i < mActual; i++) {
      const bid = dest[i];
      if (bid === 0) zeroBidsInRange++;
      const isLive = bid !== 0 && bid !== NO_BUCKET;
      if (!isLive) {
        holeRun++;
        continue;
      }
      const d = bidToD.get(bid);
      if (d === undefined) {
        unknownBids++;
        holeRun = 0;
        continue;
      }
      if (d < prevD && firstMonotonicityViolation < 0) firstMonotonicityViolation = i;
      if (d < prevD) monotonicityViolations++;
      if (d === prevD) {
        maxIntraBucketHoleRun = Math.max(maxIntraBucketHoleRun, holeRun);
      } else {
        if (holeRun >= 2) interBucketHoleRunsGe2++;
        segments++;
        truthHead[i] = 1;
      }
      truthCount.set(d, (truthCount.get(d) ?? 0) + 1);
      live++;
      prevD = d;
      prevLiveBid = bid;
      holeRun = 0;
    }
    void prevLiveBid;

    // Simulate the planned kernels EXACTLY.
    // K1 per block: live_total, last_live_bid (or -1 if the block has no live).
    const nBlocks = Math.ceil(mActual / blockSlots);
    const blockLastLive = new Int32Array(nBlocks).fill(-1);
    const blockLiveTotal = new Uint32Array(nBlocks);
    for (let b = 0; b < nBlocks; b++) {
      for (let i = b * blockSlots; i < Math.min((b + 1) * blockSlots, mActual); i++) {
        const bid = dest[i];
        if (bid !== 0 && bid !== NO_BUCKET) {
          blockLiveTotal[b]++;
          blockLastLive[b] = bid;
        }
      }
    }
    // K2 per block: carried last-live bid from exports, exact in-block prev-live.
    let headRuleMismatches = 0;
    let firstHeadMismatch = -1;
    const simHeadRank = new Map<number, number>(); // head slot -> global live rank
    let globalRank = 0;
    for (let b = 0; b < nBlocks; b++) {
      let carry = -1;
      for (let pb = b - 1; pb >= 0; pb--) {
        if (blockLastLive[pb] !== -1) {
          carry = blockLastLive[pb];
          break;
        }
      }
      let prevLive = carry; // bid of previous live entry (exact within block)
      for (let i = b * blockSlots; i < Math.min((b + 1) * blockSlots, mActual); i++) {
        const bid = dest[i];
        const isLive = bid !== 0 && bid !== NO_BUCKET && bidToD.has(bid);
        if (!isLive) continue;
        const simHead = prevLive === -1 || prevLive !== bid;
        if (simHead !== (truthHead[i] === 1)) {
          headRuleMismatches++;
          if (firstHeadMismatch < 0) firstHeadMismatch = i;
        }
        if (simHead) simHeadRank.set(i, globalRank);
        globalRank++;
        prevLive = bid;
      }
    }
    // Counts via head-to-head rank differences (the wi4 count rule).
    let countMismatches = 0;
    const headSlots = [...simHeadRank.keys()].sort((a, b) => a - b);
    for (let h = 0; h < headSlots.length; h++) {
      const slot = headSlots[h];
      const nextRank = h + 1 < headSlots.length ? simHeadRank.get(headSlots[h + 1])! : live;
      const simCount = nextRank - simHeadRank.get(slot)!;
      const d = bidToD.get(dest[slot])!;
      if (simCount !== (truthCount.get(d) ?? 0)) countMismatches++;
    }

    return {
      mActual,
      live,
      segments,
      activeCount: active[0],
      monotonicityViolations,
      firstMonotonicityViolation,
      unknownBids,
      maxIntraBucketHoleRun,
      interBucketHoleRunsGe2,
      headRuleMismatches,
      firstHeadMismatch,
      countMismatches,
      zeroBidsInRange,
    };
  }

  /**
   * Read back the walker_index phase's workload after a run(): how many dense
   * buckets, how many partials the walker emitted, how they distribute over
   * per-bucket counts (N), and how many active (N>=2) buckets the combine
   * stage sees. Multi-batch runs report the LAST batch only (the scratch
   * buffers are per-batch).
   */
  async debugWalkerIndexStats(): Promise<{
    c: number;
    numWindows: number;
    bTotal: number;
    streamNumThreads: number;
    mPartialSlots: number;
    walkerNwg: number;
    numSize1: number;
    numDense: number;
    totalPartials: number;
    singles: number;
    activeCount: number;
    nHistogram: number[];
    gpuCountHistogram: number[];
  }> {
    if (this.preparedFor === null) throw new Error('MsmV2.debugWalkerIndexStats: call prepare() first');
    const sc = this.pool.scratch!;
    const readSlot = async (slot: ScratchSlot, bytes: number): Promise<Uint32Array> => {
      const staging = this.device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const enc = this.device.createCommandEncoder();
      enc.copyBufferToBuffer(slotBuf(slot), slotOff(slot), staging, 0, bytes);
      this.device.queue.submit([enc.finish()]);
      await staging.mapAsync(GPUMapMode.READ);
      const out = new Uint32Array(staging.getMappedRange().slice(0));
      staging.unmap();
      staging.destroy();
      return out;
    };
    const meta = await readSlot(sc.streamPlannerMeta, 20 * 4);
    const partialCount = await readSlot(sc.partialCount, this.bTotal * 4);
    const active = await readSlot(sc.activeCount, 4);
    const gpuHist = await readSlot(sc.countHistogram, 64 * 4);
    const nHistogram = new Array<number>(65).fill(0);
    let totalPartials = 0;
    let singles = 0;
    for (let i = 0; i < partialCount.length; i++) {
      const n = partialCount[i];
      if (n === 0) continue;
      totalPartials += n;
      if (n === 1) singles++;
      nHistogram[Math.min(n, 64)]++;
    }
    return {
      c: this.c,
      numWindows: this.numWindows,
      bTotal: this.bTotal,
      streamNumThreads: this.streamNumThreads,
      mPartialSlots: 2 * this.streamNumThreads * this.streamS,
      walkerNwg: meta[15],
      numSize1: meta[0],
      numDense: meta[1],
      totalPartials,
      singles,
      activeCount: active[0],
      nHistogram,
      gpuCountHistogram: Array.from(gpuHist),
    };
  }

  /**
   * Run histogram + decide kernels and read back the GPU-built WindowDesc + the
   * 16-u32 schedule summary (split-c Phase 2A validation). Requires `splitC` + a
   * prior `prepare()`. Compare against {@link buildWindowDescReference}.
   */
  async debugDecideWindowSplit(): Promise<{ windowDesc: Uint32Array; summary: Uint32Array }> {
    if (this.preparedFor === null) throw new Error('MsmV2.debugDecideWindowSplit: call prepare() first');
    if (
      !this.msbHistBind ||
      !this.msbHistBuf ||
      !this.msbDecideBind ||
      !this.decideWindowDescBuf ||
      !this.decideSummaryBuf
    ) {
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
    if (
      !this.msbHistBind ||
      !this.msbHistBuf ||
      !this.msbDecideBind ||
      !this.msbIdxLargeBind ||
      !this.idxLargeBuf ||
      !this.idxLargeCountBuf ||
      !this.decideSummaryBuf
    ) {
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

  /** Byte offset of the 2 residency-counter u32 (live, peak) overlaid on the tail
   *  of `partial_dest`, just past its `M_partials = 2·sT·sS` partial-id slots. */
  private occCounterOffset(): { buffer: GPUBuffer; offset: number } {
    const pd = this.pool.scratch!.walkerPartialDest;
    return { buffer: pd.buffer, offset: (pd.offset ?? 0) + 2 * this.streamNumThreads * this.streamS * 4 };
  }

  /** Enable/disable the residency probe (the walker's arena_off.z gate). Enabled
   *  only for the throwaway calibration dispatch — a real run keeps it 0 so the
   *  RMW counter never executes and the partial path is byte-identical. */
  private setResidencyMeasure(on: boolean): void {
    this.device.queue.writeBuffer(this.walkerArenaOffBuf, 8, new Uint32Array([on ? 1 : 0]));
  }

  /** Zero the live/peak residency counters before a calibrating walker run. */
  resetOcc(): void {
    const { buffer, offset } = this.occCounterOffset();
    this.device.queue.writeBuffer(buffer, offset, new Uint32Array([0, 0]));
  }

  /** Read back the peak resident walker workgroups (R) measured by the kernel's
   *  atomic counter — a hardware-independent residency probe overlaid on the tail
   *  of `partial_dest`, no extra binding (within the 10-storage-buffer cap). */
  async readOccPeak(): Promise<number> {
    const { buffer, offset } = this.occCounterOffset();
    const staging = this.device.createBuffer({ size: 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(buffer, offset, staging, 0, 8);
    this.device.queue.submit([enc.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const peak = new Uint32Array(staging.getMappedRange().slice(0))[1];
    staging.unmap();
    staging.destroy();
    return peak;
  }

  /**
   * After a calibrating walker run, read the residency R the kernel measured and —
   * if it implies a smaller planner cap than the one in force — refit to a single
   * resident wave and rebuild the bind groups so every later run is tail-free.
   *
   * Cheap and one-shot: the refit only rebuilds bind groups + uniforms (no shader
   * recompile — pipelines are cap-agnostic), the grow-only arena is untouched when
   * the cap shrinks (so no realloc and no memory regression), and the measured R
   * is cached process-wide so subsequent create()s fit from the first prepare and
   * never reach this path. No-op when the cap is config-pinned or already fits.
   */
  async calibrateResidency(scalarsBuf: Uint8Array, srsOffset = 0): Promise<void> {
    if (this.mpwPinned) return;
    let peak = this.residentWgOverride;
    if (peak <= 0) {
      // One throwaway run with the residency probe enabled (arena_off.z = 1). The
      // RMW counter races with the partial path, so this run's MSM output may be
      // wrong — but it is discarded, and R = peak resident workgroups is exact
      // (independent of the partial data). The probe is then disabled so every
      // real run does no RMW and is byte-identical to the non-atomic buffer.
      this.setResidencyMeasure(true);
      this.resetOcc();
      try {
        await this.run();
      } catch {
        // A corrupted calibration run can throw in the host combine; ignore — the
        // workgroup counter was written before any combine work.
      }
      this.setResidencyMeasure(false);
      peak = await this.readOccPeak();
    }
    if (peak <= 0) return;
    cachedResidentWalkerWg = peak;
    const fit = residencyFitMpw(this.budgetMpw);
    if (fit >= this.maxPlannerWorkgroups) return; // already one wave
    this.maxPlannerWorkgroups = fit;
    this.streamNumThreads = fit * STREAM_PLANNER_TPB;
    this.preparedFor = null; // force the bind-group rebuild to pick up the new cap
    this.prepare(scalarsBuf, srsOffset);
  }

  async run(): Promise<{
    x: bigint;
    y: bigint;
    profile: ProfileBreakdown | null;
    windowSums: Pt[];
    c: number;
    stagedPartials: Uint8Array | null;
    partialsPerWindow: number;
  }> {
    if (this.preparedFor === null) throw new Error('MsmV2.run: call prepare() first');
    const device = this.device;
    const wallT0 = performance.now();
    const enc = device.createCommandEncoder();
    this.encodeIntoBatch(enc, this.redStaging, 0);
    const tEncoded = performance.now();
    if (!this.splitSubmitDiag) {
      if (this.profile && this.querySet && this.tsResolveBuf) {
        enc.resolveQuerySet(this.querySet, 0, this.passCount * 2, this.tsResolveBuf, 0);
        // Land the timestamps in redStaging's tail: one mapAsync serves both
        // the window sums and the profile, saving a second fence round-trip.
        enc.copyBufferToBuffer(this.tsResolveBuf, 0, this.redStaging, this.windowSumsByteLength, this.passCount * 16);
      }
      device.queue.submit([enc.finish()]);
    } else {
      // Sequential per-phase submit + GPU sync. Awaiting onSubmittedWorkDone
      // idles the GPU between phases (watchdog reset). device.lost resolves once
      // the driver resets; we surface the in-flight phase in the thrown error so
      // it lands in the posted page log (Adreno device-loss localisation).
      let lostInfo: { message: string } | null = null;
      void this.device.lost.then(i => {
        lostInfo = i as unknown as { message: string };
      });
      for (const [ph, cmd] of this.splitCmdBuffers) {
        device.queue.submit([cmd]);
        await device.queue.onSubmittedWorkDone();
        await Promise.resolve();
        if (lostInfo) throw new Error(`[split] DEVICE_LOST at phase=${ph}: ${lostInfo.message}`);
        // eslint-disable-next-line no-console
        if (typeof console !== 'undefined') console.log(`[split] phase=${ph} ok`);
      }
    }
    // walker_combine runs the split-bucket reduce on the GPU within the
    // same encoder, so there's no host fixup to interleave any more.
    const tSubmitted = performance.now();
    await this.redStaging.mapAsync(GPUMapMode.READ);
    const tMapped = performance.now();
    const mapped = this.redStaging.getMappedRange();
    const stagingBytes = new Uint8Array(mapped);
    const L = this.earlyExitMode ? [] : this.decodeWindowSumsFromBytes(stagingBytes, 0);
    // Early exit: detach the raw staged-partials bytes for the single native
    // finish_and_combine_windows call (the caller owns shipping them).
    const staged = this.earlyExitMode
      ? new Uint8Array(mapped.slice(0, this.windowSumsByteLength))
      : null;
    // Detach the timestamp tail before unmap (profile decode happens later).
    const tsBytes = this.profile
      ? mapped.slice(this.windowSumsByteLength, this.windowSumsByteLength + this.passCount * 16)
      : null;
    this.redStaging.unmap();
    this.windowSums = L;
    const tDecoded = performance.now();
    // The bridge ships these per-window sums to the C++ hook for a native
    // bb::g1 combine; the benchmark harness (combineOnHost) does it here.
    const result = this.combineOnHost ? hostWindowCombine(L, this.windowCs) : { x: 0n, y: 0n };
    // Host-stage wall breakdown (profile mode): encode, submit→map-resolved
    // (GPU execution + readback latency), decode, and the dev-bench-only JS
    // combine. Ring-bounded; the dev page's trace driver reads it per rep.
    if (this.profile && typeof window !== 'undefined') {
      const g = window as unknown as { __hostBreakdowns?: Record<string, number>[] };
      g.__hostBreakdowns ??= [];
      if (g.__hostBreakdowns.length > 64) g.__hostBreakdowns.shift();
      g.__hostBreakdowns.push({
        encode: tEncoded - wallT0,
        submit: tSubmitted - tEncoded,
        gpuAndMapWait: tMapped - tSubmitted,
        decode: tDecoded - tMapped,
        combine: performance.now() - tDecoded,
      });
    }
    const tCombined = performance.now();

    // Per-pass GPU timestamps were tracked here pre-refactor; the new
    // encodeIntoBatch path doesn't capture category labels (the dev page's
    // profile-mode breakdown is no longer reconstructed from this code path
    // — use the dev sweep page directly for that). Wall time still works.
    let profile: ProfileBreakdown | null = null;
    if (this.profile && tsBytes) {
      const phaseNs: Record<string, bigint> = {};
      let totalNs = 0n;
      try {
        const tsArr = new BigUint64Array(tsBytes);
        const passTimes: Array<[string, string, string]> = [];
        for (let p = 0; p < this.passCount; p++) {
          const dur = tsArr[2 * p + 1] - tsArr[2 * p];
          totalNs += dur;
          const phase = this.passPhases[p] ?? 'misc';
          phaseNs[phase] = (phaseNs[phase] ?? 0n) + dur;
          // Absolute GPU-timestamp pair (CLOCK_MONOTONIC_RAW ns) — the same clock
          // the AGI/Perfetto gpu.counters use, so these align directly on the
          // counter timeline (join_passtimes.py). The pass label IS the kernel.
          passTimes.push([phase, tsArr[2 * p].toString(), tsArr[2 * p + 1].toString()]);
        }
        if (typeof window !== 'undefined') {
          // Accumulate across the warm-up + measured run() calls within one rep
          // (runWebGpuOnce resets this before the warm-up) so the aligned trace
          // labels BOTH GPU MSMs and leaves no unlabeled compute in the gaps.
          const w = window as unknown as { __lastPassTimes?: Array<[string, string, string]> };
          (w.__lastPassTimes ??= []).push(...passTimes);
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
    // Close the host-stage books: everything after the combine is the profile
    // machinery itself (second mapAsync on the timestamp staging + decoding
    // passCount BigInt pairs into passTimes strings).
    if (this.profile && typeof window !== 'undefined') {
      const g = window as unknown as { __hostBreakdowns?: Record<string, number>[] };
      const last = g.__hostBreakdowns?.[g.__hostBreakdowns.length - 1];
      if (last) last.tsReadback = performance.now() - tCombined;
    }
    return {
      x: result.x,
      y: result.y,
      profile,
      windowSums: L,
      c: this.c,
      stagedPartials: staged,
      partialsPerWindow: this.earlyExitMode ? this.halvePartialsPerWindow : 0,
    };
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
   * Profiling-only kernel isolation. After a normal run() has populated every
   * data-dependent buffer + indirect-arg buffer, re-dispatch ONE kernel in a
   * tight loop for ~durationMs. It reads the same valid inputs each iteration,
   * so the GPU does only that kernel's representative work — an external GPU
   * counter capture (AGI/Perfetto over the window) then attributes ALU/SFU/
   * occupancy to exactly this kernel with zero timestamp reconstruction (the
   * WebGPU timestamp-query is quantized + coalesced and useless here; the
   * counters are not). The output is meaningless; the counters measured over the
   * window are the result. Returns dispatch count.
   *
   * Arena pipeline names (the V2 source's switch was keyed on the old V2 names):
   *   size1 | stream_walker | combine_batched | pt_combine | reduce.
   * The walker (bucket-accumulate) is the multiply peak; see the
   * `msm-webgpu-*-gpu-profiling` memory notes + PROFILING_RUNBOOK.md.
   */
  async profileKernel(name: string, durationMs = 5000, perSubmit = 16): Promise<number> {
    if (this.preparedFor === null) throw new Error('profileKernel: call prepare()+run() first');
    const device = this.device;
    const sc = this.pool.scratch!;
    const spMeta = sc.streamPlannerMeta;
    const one = (enc: GPUCommandEncoder): void => {
      const pass = enc.beginComputePass();
      switch (name) {
        case 'size1':
          pass.setPipeline(this.size1Pipe);
          pass.setBindGroup(0, this.size1Binds[0]);
          pass.dispatchWorkgroupsIndirect(spMeta, 8 * 4);
          break;
        case 'stream_walker':
          pass.setPipeline(this.streamWalkerPipe);
          pass.setBindGroup(0, this.streamWalkerBinds[0]);
          pass.dispatchWorkgroupsIndirect(spMeta, 15 * 4);
          break;
        case 'combine_batched':
          pass.setPipeline(this.combineBatchedPipe);
          pass.setBindGroup(0, this.combineBatchedBinds[0]);
          pass.dispatchWorkgroupsIndirect(sc.cbDispatchArgs, 0);
          break;
        case 'pt_combine':
          pass.setPipeline(this.ptCombinePipe);
          pass.setBindGroup(0, this.ptCombineBind);
          pass.dispatchWorkgroupsIndirect(sc.ptCombineDispatchArgs, 0);
          break;
        case 'reduce':
          pass.setPipeline(this.reduceLevelPipes[0]);
          pass.setBindGroup(0, this.reduceLevelBinds[0]);
          pass.dispatchWorkgroups(this.numWindows, 1, 1);
          break;
        default:
          pass.end();
          throw new Error('profileKernel: unknown kernel ' + name);
      }
      pass.end();
    };
    const t0 = performance.now();
    let iters = 0;
    while (performance.now() - t0 < durationMs) {
      const enc = device.createCommandEncoder();
      for (let i = 0; i < perSubmit; i++) one(enc);
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      iters += perSubmit;
    }
    return iters;
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
