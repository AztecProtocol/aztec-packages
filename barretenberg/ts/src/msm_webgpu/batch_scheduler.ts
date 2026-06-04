// Multi-MSM batch scheduler — the host-side pack model (MULTI_MSM_PLAN.md
// rollout step 1).
//
// A batch of K MSMs is treated as one "super-MSM" over the concatenation of every
// MSM's windows (the plan's core reframing). This module is the host source of
// truth for that concatenation:
//   - per-MSM geometry (a pure function of the point count n + optional overrides),
//   - the concatenated WindowDesc table (one row per GLOBAL window) tagged with the
//     only genuinely-new per-MSM facts (msm_idx, srsOffset, n, scalar_base),
//   - the concatenated buffer offsets (scalars / window-sums / red_buf / windows),
//   - the ragged point-tile work-list covering the union, and
//   - a budget bin-packer that decides how many MSMs fit one pass (points shared,
//     scalars + per-MSM bucket/red summed).
//
// It is **pure** (no GPU/WebGPU dependency) so it unit-tests offline and so the
// later rollout steps (global-window bid, table-driven kernels, bridge wiring)
// build on a validated host model. The defining invariant — checked in the test
// and the runtime harness — is **batch-of-1 ≡ single-MSM byte-identical**: at K=1
// the concatenation is a no-op, so every offset is 0, every WindowDesc row matches
// `msm_v2` prepare()'s uniform fill, and the footprint equals the single-MSM
// budget gate's `estimateMem(1)`.
//
// Geometry/footprint primitives (`pickC`, `pickReduceWg`, `arenaColourSizes`) are
// imported from `msm_v2.ts` — the same single-source-of-truth discipline that keeps
// `ensureScratch`'s carve and the budget gate from drifting now also binds the pack
// footprint to the real allocation.

import { pickC, pickReduceWg, arenaColourSizes } from './msm_v2.js';

const NUMBITS = 254; // BN254 scalar field bit length (msm_v2 NUMBITS)
const PLANNER_TPB = 256; // bucket-column alignment (msm_v2 PLANNER_TPB)
const WD_STRIDE = 8; // WindowDesc row stride in u32 (6 used + 2 reserved)

/** Default walker thread count `sT = MAX_STREAM_WORKGROUPS · STREAM_PLANNER_TPB`
 *  (32 · 256). A pack shares one walker thread pool, so `sT` is a pack-level
 *  constant, not summed per MSM. The bin-packer may lower it (the `chooseBudgetMpw`
 *  lever) the same way the single-MSM path does. */
export const DEFAULT_ST = 8192;
/** Default stream-S (pairs batched per walker thread); `STREAM_S`. Pack-shared. */
export const DEFAULT_SS = 8;
/** Default ragged point-tile width for the work-list. Tiles cover the union with
 *  no padded threads; the value only affects the tile count, not correctness. */
export const DEFAULT_POINT_TILE = 1 << 16;

/** Per-window-geometry override for one MSM. Mirrors the `MsmConfig` subset the
 *  geometry derivation reads; `windowCs` carries a split-c schedule when present. */
export interface GeomConfig {
  c?: number;
  windowCs?: number[];
  reduceWg?: number;
}

/** Window/bucket geometry for one MSM — a pure function of `n` + {@link GeomConfig},
 *  identical to `msm_v2` create()'s inline derivation (cross-checked in the test
 *  against the ARENA_LAYOUT.md §3 traced-to-source table). */
export interface MsmGeom {
  n: number;
  /** Envelope window width (max of `windowCs`); `pickC(n)` by default. */
  c: number;
  numWindows: number;
  /** Per-window widths; uniform schedule fills `numWindows` copies of `c`. */
  windowCs: number[];
  /** Envelope CSR columns per window: `⌈(2^(c-1)+1)/256⌉·256`. */
  BW: number;
  /** `numWindows · BW` (the planner/sort bucket-column space). */
  bTotal: number;
  /** `2^(c-1)` — red_buf slots per window. */
  stride: number;
  /** `numWindows · stride` — this MSM's red_buf slot count. */
  redM: number;
  reduceWg: number;
  /** `32 · n` — scalar bytes (the IN zone, summed across a pack). */
  scalarBytes: number;
  /** `numWindows · 64` — per-window-sum bytes in the readback staging buffer. */
  windowSumBytes: number;
}

/** One MSM's placement within a pack (ARENA_LAYOUT.md §4 `MsmDesc`). All offsets
 *  are bases into the pack's concatenated regions; at K=1 every base is 0. */
export interface MsmDesc {
  msmIdx: number;
  n: number;
  /** Point-index offset into the shared SRS pool (the per-MSM point source). */
  srsOffset: number;
  /** Byte base of this MSM's scalars in the concatenated IN region (`Σ_{j<k} 32·n_j`). */
  scalarBase: number;
  /** Byte base of this MSM's window-sums in the readback region (`Σ_{j<k} NW_j·64`). */
  outBase: number;
  /** Index of this MSM's first window in the concatenated window space (`Σ_{j<k} NW_j`). */
  schedOff: number;
  /** Slot base of this MSM's buckets in the concatenated red_buf (`Σ_{j<k} redM_j`).
   *  Already folded into each window's GLOBAL `reduceOff`; kept for diagnostics. */
  redBase: number;
  numWindows: number;
  /** Split-c upper-region scalar count; `= n` when there is no split. */
  nLarge: number;
  geom: MsmGeom;
}

/** One row of the concatenated per-global-window table. `windowBits`/`bitBase`/
 *  `numBuckets`/`numColumns` are per-window geometry (`bitBase` MSM-local — each
 *  MSM decodes its scalar from bit 0); `workOff` and `reduceOff` are GLOBAL
 *  prefixes into the concatenated CSR / red_buf, so the union dispatch indexes
 *  them directly (no per-MSM base to add). `srsOffset`/`n`/`scalarBase` are the
 *  per-MSM source tags. At K=1 every base is 0 ⇒ byte-identical to today's table. */
export interface GlobalWindow {
  globalWindow: number;
  msmIdx: number;
  localWindow: number;
  windowBits: number;
  bitBase: number;
  numBuckets: number;
  workOff: number;
  reduceOff: number;
  numColumns: number;
  srsOffset: number;
  n: number;
  scalarBase: number;
}

/** A unit of ragged point-iteration for the EASY/MODERATE stages: a contiguous
 *  slice of one MSM's points. Tiles tile the union tightly (no padded threads). */
export interface PointTile {
  msmIdx: number;
  pointStart: number;
  pointCount: number;
}

/** The complete host plan for one pack — everything the dispatch layer (steps 3–5)
 *  needs to drive the concatenated super-MSM. */
export interface BatchLayout {
  descs: MsmDesc[];
  windows: GlobalWindow[];
  /** Concatenated WindowDesc rows (`totalWindows · 8` u32), kernel-upload-ready.
   *  MSM-local geometry; byte-identical to the single-MSM table at K=1. */
  windowDescTable: Uint32Array;
  /** GLOBAL reduce_off (red_buf slot base) per global window — already includes
   *  each MSM's `redBase`, so the reduce/gather index red_buf directly. */
  reduceOffsets: number[];
  totalScalarBytes: number;
  totalWindowSumBytes: number;
  totalWindows: number;
  /** Concatenated red_buf slot count (`Σ redM_k`). */
  totalRedM: number;
  pointTiles: PointTile[];
  /** Pack-shared walker geometry used for the footprint (not summed). */
  sT: number;
  sS: number;
  /** Full GPU footprint of the pack (arena + standalone + SRS), bytes. */
  footprintBytes: number;
}

/** The host input describing one MSM to pack. Scalars/results live in the
 *  caller's concatenated buffers; the scheduler computes the byte bases. */
export interface MsmPackInput {
  n: number;
  srsOffset?: number;
  geomConfig?: GeomConfig;
}

/** Compute one MSM's geometry. Pure; identical to `msm_v2` create()
 *  (msm_v2.ts ~1913-1921). With no `windowCs` override this is the uniform
 *  Pippenger schedule of `⌈254/c⌉` windows of width `c = pickC(n)`. */
export function computeGeom(n: number, config: GeomConfig = {}): MsmGeom {
  const c = config.c ?? pickC(n);
  const windowCs = config.windowCs ? config.windowCs.slice() : new Array(Math.ceil(NUMBITS / c)).fill(c);
  const numWindows = windowCs.length;
  const BW = Math.ceil((2 ** (c - 1) + 1) / PLANNER_TPB) * PLANNER_TPB;
  const stride = 2 ** (c - 1);
  return {
    n,
    c,
    numWindows,
    windowCs,
    BW,
    bTotal: numWindows * BW,
    stride,
    redM: numWindows * stride,
    reduceWg: config.reduceWg ?? pickReduceWg(c),
    scalarBytes: 32 * n,
    windowSumBytes: numWindows * 64,
  };
}

/** Base offsets that place one MSM's WindowDesc rows in the concatenated pack
 *  (all default 0 ⇒ a standalone single-MSM table, byte-identical to `msm_v2`
 *  prepare()'s uniform fill). `bit_base` is NOT offset — it stays MSM-local
 *  (each MSM decodes its own scalar from bit 0). */
export interface WindowDescBases {
  /** Global CSR-column prefix of all prior MSMs (`Σ_{j<k} bTotal_j`). */
  workOffBase?: number;
  /** Global red_buf-slot prefix of all prior MSMs (`Σ_{j<k} redM_j` = `redBase`). */
  redBase?: number;
  /** This MSM's scalar base in u32 words (`scalarBaseBytes / 4`); written at +6
   *  so `decompose` pulls each global window's bits from its own MSM region. */
  scalarBaseWords?: number;
}

/** Build the uniform (no region-split) WindowDesc rows and reduce offsets for one
 *  MSM, placed at the given pack bases (byte-identical to `msm_v2` prepare()'s
 *  uniform fill at bases 0 — msm_v2.ts ~2738-2756). `work_off`/`reduce_off` are
 *  emitted as GLOBAL prefixes (base + the MSM-local prefix) so the concatenated
 *  CSR/red_buf index directly; `reduce_off = redBase + w·stride` (envelope
 *  spacing — for uniform `windowCs` this coincides with the tight prefix
 *  `Σ 2^(c_k-1)`). Returned `reduceOffsets` are likewise global. */
export function buildUniformWindowDesc(
  geom: MsmGeom,
  bases: WindowDescBases = {},
): { rows: Uint32Array; reduceOffsets: number[] } {
  const { windowCs, stride } = geom;
  const workOffBase = bases.workOffBase ?? 0;
  const redBase = bases.redBase ?? 0;
  const scalarBaseWords = bases.scalarBaseWords ?? 0;
  const rows = new Uint32Array(windowCs.length * WD_STRIDE);
  const reduceOffsets: number[] = [];
  let bitBase = 0; // prefix of window widths — MSM-local (resets per MSM)
  let workOff = workOffBase; // global prefix of num_columns (packed CSR base)
  for (let w = 0; w < windowCs.length; w++) {
    const cw = windowCs[w];
    const strideW = 2 ** (cw - 1);
    const numCols = Math.ceil((2 ** (cw - 1) + 1) / PLANNER_TPB) * PLANNER_TPB;
    const reduceOff = redBase + w * stride;
    const o = w * WD_STRIDE;
    rows[o + 0] = cw; // window_bits
    rows[o + 1] = bitBase; // bit_base (MSM-local)
    rows[o + 2] = strideW; // num_buckets (red slots)
    rows[o + 3] = workOff; // work_off (GLOBAL CSR column base)
    rows[o + 4] = reduceOff; // reduce_off (GLOBAL red_buf slot base)
    rows[o + 5] = numCols; // num_columns
    rows[o + 6] = scalarBaseWords; // scalar_base (u32 words, MSM-constant)
    reduceOffsets.push(reduceOff);
    bitBase += cw;
    workOff += numCols;
  }
  return { rows, reduceOffsets };
}

/** Reduction-prefix-scratch bytes for one MSM, matching `chooseBudgetMpw`'s
 *  closed form `NW · reduceWg · ⌈⌈stride/2⌉/reduceWg⌉ · 2 · 16` (the max
 *  per-window `ppw` is `stride/2`, the `mm=1` reduce pass). */
function reducePrefBytesFor(g: MsmGeom): number {
  const maxc = Math.ceil(Math.ceil(g.stride / 2) / g.reduceWg);
  return g.numWindows * g.reduceWg * maxc * 2 * 16;
}

/** Full GPU footprint of a pack of MSMs, in bytes — the bin-packer's fit metric.
 *
 *  Per-MSM terms SUM across the pack (the concatenated super-MSM occupies the
 *  union of every MSM's scatter/CSR/buckets); pack-shared terms (`sT`/`sS` walker
 *  threads, the SRS point pool) are counted ONCE. This is exactly the single-MSM
 *  budget gate (`estimateMem`, msm_v2.ts ~2469) with the per-MSM dimensions summed,
 *  so `batchFootprintBytes([g], …) === estimateMem(1)` for that MSM (verified in
 *  the test). Each packed member is assumed unstaged (`nb=1`, `bw=NW`) — small
 *  MSMs pack freely; one too large to fit even alone is staged solo by the packer. */
export function batchFootprintBytes(geoms: MsmGeom[], opts: { sT?: number; sS?: number; srsBytes?: number }): number {
  const sT = opts.sT ?? DEFAULT_ST;
  const sS = opts.sS ?? DEFAULT_SS;
  const srsBytes = opts.srsBytes ?? 0;
  let sBTotal = 0;
  let batchSlots = 0; // Σ NW_k·n_k (scatter working set at nb=1)
  let redM = 0;
  let rowPtrLen = 0;
  let reducePrefBytes = 0;
  let scalarsBytes = 0;
  let l0Slots = 0;
  let countsOffsetsBytes = 0;
  let planMetaBytes = 0;
  let totalWindows = 0;
  for (const g of geoms) {
    sBTotal += g.bTotal;
    batchSlots += g.numWindows * g.n;
    redM += g.redM;
    rowPtrLen += g.numWindows * (g.BW + 1);
    reducePrefBytes += reducePrefBytesFor(g);
    scalarsBytes += g.scalarBytes;
    l0Slots += g.numWindows * g.n;
    countsOffsetsBytes += 4 * (g.numWindows * g.BW) * 4; // countsBufs[2] + offsetsBufs[2]
    planMetaBytes += (3 * g.numWindows + 6) * 4;
    totalWindows += g.numWindows;
  }
  // windowDescBuf is one pack-level table of Σ NW rows (≥128) × 8 u32 — mirrors
  // `msm_v2` estimateMem so host packing and the runtime budget gate agree.
  const windowDescBytes = Math.max(totalWindows, 128) * 8 * 4;
  const arenaBytes = arenaColourSizes({
    sT,
    sS,
    sBTotal,
    sRadixTiles: Math.ceil(sBTotal / 2048),
    batchSlots,
    redM,
    rowPtrLen,
    reducePrefBytes,
    scalarsBytes,
    l0Slots: l0Slots + 3, // single +3 guard for the transpose-partials matrix
  }).reduce((acc, b) => acc + b, 0);
  return srsBytes + arenaBytes + countsOffsetsBytes + planMetaBytes + windowDescBytes;
}

/** Union-dispatch footprint — what the **runtime** budget gate actually charges
 *  for a heterogeneous pack run as ONE dispatch (`msm_v2.ts` `estimateMem(1)` on
 *  the `batchCtx` branch). It differs from {@link batchFootprintBytes} only when
 *  the pack is heterogeneous: the union instance is created at the pack's **max n**,
 *  so the dispatch-grid-sized terms (the `l0`/partials matrix, the envelope CSR
 *  columns, the per-window prefix scratch, the radix tiles) are sized from the
 *  envelope `(maxN, BW(maxN))` × the total window count — NOT summed per member.
 *  The tight terms (scatter working set `Σ NW_k·n_k`, red_buf `Σ stride_w`,
 *  scalars `Σ 32·n_k`) match the per-member sum. At a homogeneous pack (and at
 *  K=1) every envelope term equals its per-member sum, so this coincides with
 *  `batchFootprintBytes` (asserted in the test).
 *
 *  `batchFootprintBytes` **under-counts** a heterogeneous pack (its `l0` uses
 *  `Σ NW_k·n_k`, not `(Σ NW)·maxN`), so packing by it can pick a pack the runtime
 *  then rejects. Pack by THIS so the choice always passes the runtime gate. */
export function unionFootprintBytes(geoms: MsmGeom[], opts: { sT?: number; sS?: number; srsBytes?: number }): number {
  const srsBytes = opts.srsBytes ?? 0;
  if (geoms.length === 0) return srsBytes;
  const sT = opts.sT ?? DEFAULT_ST;
  const sS = opts.sS ?? DEFAULT_SS;
  // The runtime creates the union instance at the pack's max n with default c, so
  // its baked envelope (BW/stride/reduceWg) is `computeGeom(maxN)` — pickC is
  // monotone, so this dominates every member's geometry.
  const maxN = Math.max(...geoms.map((g) => g.n));
  const env = computeGeom(maxN);
  const totalWindows = geoms.reduce((a, g) => a + g.numWindows, 0); // Σ NW_k (this.numWindows)
  const totalPoints = geoms.reduce((a, g) => a + g.numWindows * g.n, 0); // Σ NW_k·n_k (scatter set)
  const redM = geoms.reduce((a, g) => a + g.redM, 0); // tight Σ stride_w (this.redM)
  const scalarsBytes = geoms.reduce((a, g) => a + g.scalarBytes, 0); // Σ 32·n_k
  // Envelope-sized terms (runtime sizes these from the maxN instance × total windows).
  const sBTotal = totalWindows * env.BW; // this.bTotal
  const rowPtrLen = totalWindows * (env.BW + 1);
  const reducePrefBytes = totalWindows * env.reduceWg * Math.ceil(Math.ceil(env.stride / 2) / env.reduceWg) * 2 * 16;
  const l0Slots = totalWindows * maxN + 3; // partials matrix dispatch-sized from maxN
  const countsOffsetsBytes = 4 * (totalWindows * env.BW) * 4; // countsBufs[2] + offsetsBufs[2]
  const planMetaBytes = (3 * totalWindows + 6) * 4; // runtime counts +6 ONCE, not per member
  const windowDescBytes = Math.max(totalWindows, 128) * 8 * 4;
  const arenaBytes = arenaColourSizes({
    sT,
    sS,
    sBTotal,
    sRadixTiles: Math.ceil(sBTotal / 2048),
    batchSlots: totalPoints,
    redM,
    rowPtrLen,
    reducePrefBytes,
    scalarsBytes,
    l0Slots,
  }).reduce((acc, b) => acc + b, 0);
  return srsBytes + arenaBytes + countsOffsetsBytes + planMetaBytes + windowDescBytes;
}

/** Build the complete {@link BatchLayout} for one pack of MSMs.
 *
 *  Concatenates each MSM's WindowDesc rows (MSM-local geometry) into the global
 *  table, threads the running bases (`scalarBase`/`outBase`/`schedOff`/`redBase`),
 *  tags every global window with its source MSM, and tiles the union of points.
 *  At K=1 the bases are all 0 and the table equals the single-MSM table. */
export function planBatch(
  inputs: MsmPackInput[],
  opts: { sT?: number; sS?: number; srsBytes?: number; pointTile?: number } = {},
): BatchLayout {
  const sT = opts.sT ?? DEFAULT_ST;
  const sS = opts.sS ?? DEFAULT_SS;
  const pointTile = opts.pointTile ?? DEFAULT_POINT_TILE;

  const descs: MsmDesc[] = [];
  const windows: GlobalWindow[] = [];
  const reduceOffsets: number[] = [];
  const pointTiles: PointTile[] = [];
  const wdChunks: Uint32Array[] = [];

  let scalarBase = 0;
  let outBase = 0;
  let schedOff = 0;
  let redBase = 0;
  let workOffBase = 0; // global Σ bTotal_j prefix — the concatenated CSR base

  inputs.forEach((input, msmIdx) => {
    const geom = computeGeom(input.n, input.geomConfig);
    const srsOffset = input.srsOffset ?? 0;
    const { rows, reduceOffsets: globalReduceOffsets } = buildUniformWindowDesc(geom, {
      workOffBase,
      redBase,
      scalarBaseWords: scalarBase / 4, // scalarBase is bytes; decompose reads u32 words
    });

    const desc: MsmDesc = {
      msmIdx,
      n: geom.n,
      srsOffset,
      scalarBase,
      outBase,
      schedOff,
      redBase,
      numWindows: geom.numWindows,
      nLarge: geom.n,
      geom,
    };
    descs.push(desc);
    wdChunks.push(rows);

    for (let w = 0; w < geom.numWindows; w++) {
      const o = w * WD_STRIDE;
      windows.push({
        globalWindow: schedOff + w,
        msmIdx,
        localWindow: w,
        windowBits: rows[o + 0],
        bitBase: rows[o + 1],
        numBuckets: rows[o + 2],
        workOff: rows[o + 3],
        reduceOff: rows[o + 4],
        numColumns: rows[o + 5],
        srsOffset,
        n: geom.n,
        scalarBase,
      });
      reduceOffsets.push(globalReduceOffsets[w]);
    }

    for (let start = 0; start < geom.n; start += pointTile) {
      pointTiles.push({ msmIdx, pointStart: start, pointCount: Math.min(pointTile, geom.n - start) });
    }

    scalarBase += geom.scalarBytes;
    outBase += geom.windowSumBytes;
    schedOff += geom.numWindows;
    redBase += geom.redM;
    workOffBase += geom.bTotal;
  });

  // Concatenate the per-MSM WindowDesc chunks into one upload-ready table.
  const windowDescTable = new Uint32Array(schedOff * WD_STRIDE);
  let off = 0;
  for (const chunk of wdChunks) {
    windowDescTable.set(chunk, off);
    off += chunk.length;
  }

  return {
    descs,
    windows,
    windowDescTable,
    reduceOffsets,
    totalScalarBytes: scalarBase,
    totalWindowSumBytes: outBase,
    totalWindows: schedOff,
    totalRedM: redBase,
    pointTiles,
    sT,
    sS,
    footprintBytes: batchFootprintBytes(
      descs.map((d) => d.geom),
      { sT, sS, srsBytes: opts.srsBytes ?? 0 },
    ),
  };
}

/** Greedy budget bin-packer (MULTI_MSM_PLAN.md §"Budget bin-packer"). Walks the
 *  candidate MSMs in order, growing the current pack while it fits the budget;
 *  when the next candidate would overflow, the current pack is flushed and the
 *  candidate starts a new one. A candidate too large to fit even alone is emitted
 *  as its own solo pack (the single-MSM path then window-stages it). Points are
 *  shared (one SRS pool), so `srsBytes` is charged once per pack, never per MSM —
 *  this is what lets a pack of small MSMs hold many more than a naive K× model. */
export function packByBudget(
  candidates: MsmPackInput[],
  opts: {
    budgetBytes: number;
    srsBytes?: number;
    sT?: number;
    sS?: number;
    pointTile?: number;
    /** Footprint model the packer fits against. Defaults to {@link batchFootprintBytes}
     *  (the per-member sum). The bridge passes {@link unionFootprintBytes} so the pack
     *  it picks always passes the runtime union budget gate (which sizes the dispatch
     *  grid from the pack's max n, not the per-member sum). */
    estimator?: (geoms: MsmGeom[], o: { sT?: number; sS?: number; srsBytes?: number }) => number;
  },
): BatchLayout[] {
  const sT = opts.sT ?? DEFAULT_ST;
  const sS = opts.sS ?? DEFAULT_SS;
  const srsBytes = opts.srsBytes ?? 0;
  const footprint = opts.estimator ?? batchFootprintBytes;
  const planOpts = { sT, sS, srsBytes, pointTile: opts.pointTile };

  const packs: BatchLayout[] = [];
  let current: MsmPackInput[] = [];
  let currentGeoms: MsmGeom[] = [];

  const flush = () => {
    if (current.length) {
      packs.push(planBatch(current, planOpts));
      current = [];
      currentGeoms = [];
    }
  };

  for (const cand of candidates) {
    const g = computeGeom(cand.n, cand.geomConfig);
    const trial = footprint([...currentGeoms, g], { sT, sS, srsBytes });
    if (trial <= opts.budgetBytes) {
      current.push(cand);
      currentGeoms.push(g);
      continue;
    }
    // Doesn't fit the current pack — flush it, then start fresh with this candidate.
    flush();
    if (footprint([g], { sT, sS, srsBytes }) <= opts.budgetBytes) {
      current = [cand];
      currentGeoms = [g];
    } else {
      // Too large to fit even alone: emit solo (single-MSM path stages it).
      packs.push(planBatch([cand], planOpts));
    }
  }
  flush();
  return packs;
}
