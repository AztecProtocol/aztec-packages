/* eslint-disable no-console */
// M8 precursor — empirical study of the per-(level, window) (pairs, carries,
// strideCnt) triples produced by the dynamic level-plan walk.
//
// Why this is host-only (no WebGPU). The GPU `bucket_histogram` and
// `level_plan` kernels each have a host JS reference implementation in
// msm_v2.ts — `buildInitCounts` and the inner loop of `hostLevelWalk`. The
// reference is byte-identical to the GPU output by construction; running
// the study against the reference reproduces what the GPU would emit while
// staying portable, single-machine, deterministic-given-seed, and ~100×
// faster than driving a browser harness.
//
// Run from `barretenberg/ts/`:
//   npx tsx src/msm_webgpu/integration/m8_static_plan_study.ts
// Outputs:
//   - human tables on stdout
//   - JSON dump at integration/m8_static_plan_study.json (raw stats per cell)
//
// Sampler: 32 random bytes per scalar, top 2 bits cleared so every scalar
// is < 2^254. The BN254 scalar field order r ≈ 0.756 · 2^254, so this is a
// superset of canonical Fr. The Booth recoder operates bit-wise and is
// blind to canonicality; the histogram distribution differs from Fr-uniform
// only in the very top window where ~24% of values would have been
// rejected. That tail is captured in the per-window stats below — readers
// can see it directly and judge.

import { randomFillSync } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PLANNER_TPB = 256;
const LEVEL_PLAN_MAX_LEVELS = 64;
const NUMBITS = 254;

// pickC and pickS live in msm_v2.ts but are entangled with the WebGPU module
// graph. Inline them here verbatim so this harness has no runtime
// dependency on the GPU stack (Node-only, no `mustache`, no WebGPU types).
// Keep these tables in sync with msm_v2.ts:501 (pickC) and msm_v2.ts:525
// (pickS).
function pickC(n: number): number {
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
function pickS(n: number): number {
  const logN = Math.round(Math.log2(n));
  return logN <= 11 ? 2 : logN <= 13 ? 4 : 8;
}

// --- Booth-decoded level-0 histogram. Verbatim transcription of
// `buildInitCounts` in msm_v2.ts; kept here so the harness has no runtime
// dependency on internals beyond the public `pickC` export.
function buildInitCounts(scalarsBuf: Uint8Array, n: number, c: number, numWindows: number, BW: number): Uint32Array {
  const initCounts = new Uint32Array(numWindows * BW);
  const cMask = (1 << c) - 1;
  for (let i = 0; i < n; i++) {
    const off = i * 32;
    let lookback = 0;
    for (let w = 0; w < numWindows; w++) {
      const lo = w * c;
      const inOff = lo >>> 3;
      const byteOff = off + inOff;
      const bitShift = lo & 7;
      const b0 = scalarsBuf[byteOff];
      const b1 = inOff + 1 < 32 ? scalarsBuf[byteOff + 1] : 0;
      const b2 = inOff + 2 < 32 ? scalarsBuf[byteOff + 2] : 0;
      const b3 = inOff + 3 < 32 ? scalarsBuf[byteOff + 3] : 0;
      const v = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
      const winBits = (v >>> bitShift) & cMask;
      const raw = (winBits << 1) | lookback;
      const neg = (raw >>> c) & 1;
      const negMask = neg ? 0xffffffff : 0;
      const encode = (raw + 1) >>> 1;
      const bucket = (((encode - neg) >>> 0) ^ negMask) & cMask;
      initCounts[w * BW + bucket]++;
      lookback = (v >>> (bitShift + c - 1)) & 1;
    }
  }
  return initCounts;
}

// Per (level, window) raw triples — the same numbers the GPU
// `level_plan` shader writes into the stats buffer, before the host max-
// reduction across windows. Shape: LEVEL_PLAN_MAX_LEVELS × numWindows × 3
// (pairs, carries, strideCnt), level-major then window-major.
//
// Returns two depth measures:
//   - `levelsActive`: number of levels with nonzero INPUT counts. Mirrors
//     hostLevelWalk in msm_v2.ts (the host JS fallback used by
//     `useHostHistogram` and `useHostLevelWalk`). The last included level
//     here is a "retirement" level where input has only cnt=1 buckets and
//     the walk produces all-zero output.
//   - `levelsDynamic`: number of levels with nonzero OUTPUT strideCnt.
//     Mirrors the GPU+readback default path which breaks on
//     `totalStride === 0` AFTER reading the level_plan stats — the
//     retirement level is skipped because its output is all-zero. This is
//     the depth the production dynamic plan actually uses.
//
// The two differ by exactly 1 for the canonical (n, pickC(n)) configs we
// measured. Static plan should target `levelsDynamic` to match the
// default GPU path; matching `levelsActive` over-provisions by one
// trailing empty-output dispatch per batch (~10 ms on `fused` at n=2²⁰).
function rawLevelWalk(
  initCounts: Uint32Array,
  numWindows: number,
  BW: number,
): { triples: Uint32Array; levelsActive: number; levelsDynamic: number } {
  const triples = new Uint32Array(LEVEL_PLAN_MAX_LEVELS * numWindows * 3);
  const bTotal = numWindows * BW;
  let countsCur: Uint32Array = initCounts;
  const countsAlt = new Uint32Array(bTotal);
  const countsPing = new Uint32Array(bTotal);
  let countsNext: Uint32Array = countsAlt;
  const swap = (): void => {
    const tmp = countsCur;
    countsCur = countsNext;
    countsNext = tmp === initCounts ? countsPing : tmp;
  };
  let levelsActive = 0;
  let levelsDynamic = 0;
  for (let lv = 0; lv < LEVEL_PLAN_MAX_LEVELS; lv++) {
    let anyActive = false;
    let totalStrideThisLevel = 0;
    for (let w = 0; w < numWindows; w++) {
      let pairs = 0;
      let carries = 0;
      let strideCnt = 0;
      const base = w * BW;
      for (let bl = 0; bl < BW; bl++) {
        const g = base + bl;
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
      const idx = lv * numWindows * 3 + w * 3;
      triples[idx + 0] = pairs;
      triples[idx + 1] = carries;
      triples[idx + 2] = strideCnt;
      totalStrideThisLevel += strideCnt;
    }
    if (!anyActive) break;
    levelsActive = lv + 1;
    if (totalStrideThisLevel > 0) levelsDynamic = lv + 1;
    swap();
  }
  return { triples, levelsActive, levelsDynamic };
}

// 32-byte little-endian scalars with top 2 bits cleared — see file header.
// Reuses one buffer per call to avoid GC churn at n=2^20.
function fillRandomScalars(buf: Uint8Array, n: number): void {
  randomFillSync(buf, 0, n * 32);
  for (let i = 0; i < n; i++) {
    buf[i * 32 + 31] &= 0x3f;
  }
}

interface CellStats {
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  min: number;
  stddev: number;
}

function summarize(samples: number[]): CellStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const k = sorted.length;
  const mean = samples.reduce((s, x) => s + x, 0) / k;
  let variance = 0;
  for (const x of samples) variance += (x - mean) * (x - mean);
  variance /= k;
  const at = (p: number): number => {
    if (k === 0) return 0;
    const idx = Math.min(k - 1, Math.floor(p * k));
    return sorted[idx];
  };
  return {
    mean,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted[k - 1] ?? 0,
    min: sorted[0] ?? 0,
    stddev: Math.sqrt(variance),
  };
}

interface SizeResult {
  n: number;
  c: number;
  s: number;
  numWindows: number;
  BW: number;
  runs: number;
  // Pair-tree depth — `depth` is the dynamic-plan equivalent (last level
  // with nonzero output strideCnt), which is what the production GPU+
  // readback path uses. `depthHostWalk` is the depth `hostLevelWalk` in
  // msm_v2.ts would report (one more than `depth` when the last active
  // level is a cnt=1 retirement that emits zero output) — kept for
  // diagnostics only.
  depth: CellStats;
  depthHostWalk: CellStats;
  // For every (level, window) cell and every metric, the across-runs stats.
  // Shape parallel to the GPU stats buffer: [level][window][{pairs,carries,strideCnt}].
  cells: CellStats[][][];
  // Per-level totals (sum over windows), useful for the 2/3 recurrence check.
  perLevelTotals: { pairs: CellStats; carries: CellStats; strideCnt: CellStats }[];
  // Per-window-batched stats (max over windows per run, per level) — these
  // are the inputs to `pairBlocksPerWindow` / `carriesPerWindow` in the
  // current host walk, so an upper bound on them is the static-plan target.
  perLevelMaxOverWindows: { pairs: CellStats; carries: CellStats; strideCnt: CellStats }[];
  // Global `wstride1` per run (max strideCnt across all (level, window)).
  wstride1: CellStats;
}

// Mirror of `computeStaticPlan` in msm_v2.ts — must stay in sync with that
// function. Both derive bounds from the per-bucket recurrence
// `nc = ⌈cnt/2⌉ for cnt > 1, else 0`, iterated to per-window sums.
function computeStaticPlanLocal(
  n: number,
  c: number,
  S: number,
): { perLevel: { pairBlocksPerWindow: number; carriesPerWindow: number }[]; wstride1: number } {
  const activeBuckets = Math.min(2 ** (c - 1), Math.max(1, n));
  // Mirror EMPIRICAL_DEPTHS from msm_v2.ts:computeStaticPlan — keep in sync.
  // Input-based (levelsActive) depths: the number of levels the c918 host
  // walk dispatches (`if (!anyActive) break`), including the final
  // retirement/finalize level. The static plan must match this (NOT the
  // output-based count, which drops the finalize level — the f2cc bug).
  const logN = Math.round(Math.log2(Math.max(2, n)));
  const EMPIRICAL_DEPTHS: Record<number, number> = {
    10: 8,
    11: 7,
    12: 8,
    13: 9,
    14: 10,
    15: 13,
    16: 11,
    17: 12,
    18: 7,
    19: 9,
    20: 8,
  };
  const empiricalDepth = EMPIRICAL_DEPTHS[logN];
  const depthBound = Math.min(
    LEVEL_PLAN_MAX_LEVELS,
    empiricalDepth !== undefined ? empiricalDepth : Math.max(2, Math.ceil(Math.log2(Math.max(2, n))) + 2),
  );
  const pairsAdditive = Math.max(16, Math.ceil(3 * Math.sqrt(activeBuckets)));
  const carriesCap = Math.ceil(activeBuckets * 0.55) + Math.ceil(4 * Math.sqrt(activeBuckets));
  const perLevel: { pairBlocksPerWindow: number; carriesPerWindow: number }[] = [];
  let wstride1 = 1;
  for (let lv = 0; lv < depthBound; lv++) {
    const div = Math.pow(2, lv + 1);
    const pairsBound = Math.ceil(n / div) + pairsAdditive;
    const carriesBound = Math.min(carriesCap, Math.ceil(n / div));
    const strideCntBound = pairsBound + carriesBound;
    const pairBlocksPerWindow = Math.max(1, Math.ceil(pairsBound / S));
    const carriesPerWindow = Math.max(1, carriesBound);
    perLevel.push({ pairBlocksPerWindow, carriesPerWindow });
    if (strideCntBound > wstride1) wstride1 = strideCntBound;
  }
  return { perLevel, wstride1 };
}

function validateAgainstEmpirical(res: SizeResult): void {
  const sp = computeStaticPlanLocal(res.n, res.c, res.s);
  console.log(`\n  Static plan vs empirical max (per level):`);
  console.log(`  lv  | static.blocks  emp.blocks    ratio | static.carries emp.carries   ratio`);
  console.log(`  ----+----------------------------------------+--------------------------------`);
  const depthMax = Math.ceil(res.depth.max);
  let anyUnder = false;
  for (let lv = 0; lv < depthMax; lv++) {
    const empPairsMax = res.perLevelMaxOverWindows[lv].pairs.max;
    const empCarriesMax = res.perLevelMaxOverWindows[lv].carries.max;
    const empBlocksMax = Math.ceil(empPairsMax / res.s);
    const stat = sp.perLevel[lv] ?? { pairBlocksPerWindow: 0, carriesPerWindow: 0 };
    const ratioB = empBlocksMax > 0 ? stat.pairBlocksPerWindow / empBlocksMax : Infinity;
    const ratioC = empCarriesMax > 0 ? stat.carriesPerWindow / empCarriesMax : Infinity;
    if (stat.pairBlocksPerWindow < empBlocksMax || stat.carriesPerWindow < empCarriesMax) {
      anyUnder = true;
    }
    console.log(
      `  ${String(lv).padStart(2)}  |  ${String(stat.pairBlocksPerWindow).padStart(9)}    ${String(empBlocksMax).padStart(9)}   ${ratioB.toFixed(3).padStart(5)}x |  ${String(stat.carriesPerWindow).padStart(9)}    ${String(empCarriesMax).padStart(9)}   ${ratioC.toFixed(3).padStart(5)}x`,
    );
  }
  const ratioW = res.wstride1.max > 0 ? sp.wstride1 / res.wstride1.max : Infinity;
  console.log(`  wstride1: static=${sp.wstride1}  empirical_max=${res.wstride1.max}  ratio=${ratioW.toFixed(3)}x`);
  console.log(`  static plan depth = ${sp.perLevel.length}, empirical depth = ${depthMax}`);
  if (sp.wstride1 < res.wstride1.max) anyUnder = true;
  if (sp.perLevel.length < depthMax) anyUnder = true;
  console.log(
    `  result: ${anyUnder ? 'FAIL — static plan under-provisioned somewhere' : 'PASS — static plan covers every observed cell'}`,
  );
}

function studyOneN(n: number, runs: number): SizeResult {
  const c = pickC(n);
  const s = pickS(n);
  const numWindows = Math.ceil(NUMBITS / c);
  const BW = Math.ceil((2 ** (c - 1) + 1) / PLANNER_TPB) * PLANNER_TPB;

  const scalarBuf = new Uint8Array(n * 32);

  const cellArr: number[][][][] = []; // cellArr[lv][w][field] = number[runs]
  for (let lv = 0; lv < LEVEL_PLAN_MAX_LEVELS; lv++) {
    const row: number[][][] = [];
    for (let w = 0; w < numWindows; w++) row.push([[], [], []]);
    cellArr.push(row);
  }
  const perLevelTotals: number[][][] = []; // perLevelTotals[lv][field][run]
  const perLevelMax: number[][][] = []; // same shape, max-across-windows
  for (let lv = 0; lv < LEVEL_PLAN_MAX_LEVELS; lv++) {
    perLevelTotals.push([[], [], []]);
    perLevelMax.push([[], [], []]);
  }
  const depths: number[] = [];
  const depthsHostWalk: number[] = [];
  const wstride1s: number[] = [];

  const startMs = Date.now();
  for (let r = 0; r < runs; r++) {
    fillRandomScalars(scalarBuf, n);
    const init = buildInitCounts(scalarBuf, n, c, numWindows, BW);
    const { triples, levelsActive, levelsDynamic } = rawLevelWalk(init, numWindows, BW);
    // `depth` = input-based (levelsActive) — what the c918 host walk
    // dispatches and what the static plan must cover. `depthHostWalk`
    // here repurposed to hold the output-based count (f2cc semantic) for
    // diagnostic comparison only.
    depths.push(levelsActive);
    depthsHostWalk.push(levelsDynamic);
    let maxStride = 0;
    for (let lv = 0; lv < LEVEL_PLAN_MAX_LEVELS; lv++) {
      let levelPairsTotal = 0;
      let levelCarriesTotal = 0;
      let levelStrideTotal = 0;
      let levelPairsMax = 0;
      let levelCarriesMax = 0;
      let levelStrideMax = 0;
      for (let w = 0; w < numWindows; w++) {
        const base = lv * numWindows * 3 + w * 3;
        const pairs = triples[base + 0];
        const carries = triples[base + 1];
        const strideCnt = triples[base + 2];
        cellArr[lv][w][0].push(pairs);
        cellArr[lv][w][1].push(carries);
        cellArr[lv][w][2].push(strideCnt);
        levelPairsTotal += pairs;
        levelCarriesTotal += carries;
        levelStrideTotal += strideCnt;
        if (pairs > levelPairsMax) levelPairsMax = pairs;
        if (carries > levelCarriesMax) levelCarriesMax = carries;
        if (strideCnt > levelStrideMax) levelStrideMax = strideCnt;
        if (strideCnt > maxStride) maxStride = strideCnt;
      }
      perLevelTotals[lv][0].push(levelPairsTotal);
      perLevelTotals[lv][1].push(levelCarriesTotal);
      perLevelTotals[lv][2].push(levelStrideTotal);
      perLevelMax[lv][0].push(levelPairsMax);
      perLevelMax[lv][1].push(levelCarriesMax);
      perLevelMax[lv][2].push(levelStrideMax);
    }
    wstride1s.push(Math.max(1, maxStride));
    if ((r + 1) % 10 === 0) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      process.stdout.write(`    n=2^${Math.log2(n)} run ${r + 1}/${runs} (${elapsed}s)\n`);
    }
  }

  const cells: CellStats[][][] = [];
  for (let lv = 0; lv < LEVEL_PLAN_MAX_LEVELS; lv++) {
    const row: CellStats[][] = [];
    for (let w = 0; w < numWindows; w++) {
      row.push([summarize(cellArr[lv][w][0]), summarize(cellArr[lv][w][1]), summarize(cellArr[lv][w][2])]);
    }
    cells.push(row);
  }
  const perLevelTotalsStats = perLevelTotals.map(([p, c2, st]) => ({
    pairs: summarize(p),
    carries: summarize(c2),
    strideCnt: summarize(st),
  }));
  const perLevelMaxStats = perLevelMax.map(([p, c2, st]) => ({
    pairs: summarize(p),
    carries: summarize(c2),
    strideCnt: summarize(st),
  }));

  return {
    n,
    c,
    s,
    numWindows,
    BW,
    runs,
    depth: summarize(depths),
    depthHostWalk: summarize(depthsHostWalk),
    cells,
    perLevelTotals: perLevelTotalsStats,
    perLevelMaxOverWindows: perLevelMaxStats,
    wstride1: summarize(wstride1s),
  };
}

function fmt(x: number, width = 8): string {
  if (!Number.isFinite(x)) return 'NaN'.padStart(width);
  if (Math.abs(x) >= 1_000_000) return x.toExponential(2).padStart(width);
  if (Math.abs(x) >= 1 || x === 0) return x.toFixed(x >= 100 ? 0 : 1).padStart(width);
  return x.toFixed(3).padStart(width);
}

function printPerLevelMaxTable(res: SizeResult, field: 'pairs' | 'carries' | 'strideCnt'): void {
  const depthMax = Math.ceil(res.depth.max);
  console.log(`\n  [${field}] per-level max-across-windows, ${res.runs} runs`);
  console.log(`  lv  |    mean       p50       p95       p99       max     stddev   max/p99`);
  console.log(`  ----+-------------------------------------------------------------------`);
  for (let lv = 0; lv < depthMax; lv++) {
    const s = res.perLevelMaxOverWindows[lv][field];
    const ratio = s.p99 > 0 ? s.max / s.p99 : 0;
    console.log(
      `  ${String(lv).padStart(2)}  | ${fmt(s.mean)} ${fmt(s.p50)} ${fmt(s.p95)} ${fmt(s.p99)} ${fmt(s.max)} ${fmt(s.stddev)}  ${fmt(ratio, 6)}`,
    );
  }
}

function printPerWindowCV(res: SizeResult, lv: number, field: 'pairs' | 'carries' | 'strideCnt'): void {
  console.log(`\n  [${field}] per-window distribution at level ${lv}, ${res.runs} runs`);
  console.log(`  w  |    mean       p50       p95       max     stddev    CV       max/p99`);
  console.log(`  ---+----------------------------------------------------------------------`);
  for (let w = 0; w < res.numWindows; w++) {
    const s = res.cells[lv][w][field === 'pairs' ? 0 : field === 'carries' ? 1 : 2];
    const cv = s.mean > 0 ? s.stddev / s.mean : 0;
    const ratio = s.p99 > 0 ? s.max / s.p99 : 0;
    console.log(
      `  ${String(w).padStart(2)} | ${fmt(s.mean)} ${fmt(s.p50)} ${fmt(s.p95)} ${fmt(s.max)} ${fmt(s.stddev)} ${fmt(cv)}  ${fmt(ratio, 6)}`,
    );
  }
}

function printDepthAndDecay(res: SizeResult): void {
  console.log(
    `\n  depth (active levels per run): mean=${res.depth.mean.toFixed(2)} p50=${res.depth.p50} p95=${res.depth.p95} p99=${res.depth.p99} max=${res.depth.max} min=${res.depth.min}`,
  );
  console.log(
    `  wstride1 (global max strideCnt across run): mean=${res.wstride1.mean.toFixed(1)} p50=${res.wstride1.p50} p95=${res.wstride1.p95} p99=${res.wstride1.p99} max=${res.wstride1.max}`,
  );
  console.log(`\n  per-level pairs-total decay (sum-over-windows mean), check against 2/3 recurrence:`);
  console.log(`  lv  |  pairs_mean   ratio_to_prev   theo (2/3)`);
  console.log(`  ----+------------------------------------------`);
  const depthMax = Math.ceil(res.depth.max);
  for (let lv = 0; lv < depthMax; lv++) {
    const cur = res.perLevelTotals[lv].pairs.mean;
    const prev = lv > 0 ? res.perLevelTotals[lv - 1].pairs.mean : 0;
    const ratio = prev > 0 ? cur / prev : 1;
    const theo = 2 / 3;
    console.log(
      `  ${String(lv).padStart(2)}  | ${fmt(cur, 10)}   ${ratio.toFixed(3).padStart(10)}     ${theo.toFixed(3).padStart(8)}`,
    );
  }
}

function main(): void {
  const runs = parseInt(process.env.RUNS ?? '100', 10);
  const logNs = (process.env.LOG_NS ?? '12,16,20').split(',').map(s => parseInt(s, 10));
  console.log(`M8 static-plan precursor — runs=${runs}, log₂(n)=${logNs.join(',')}`);

  const results: SizeResult[] = [];
  for (const logN of logNs) {
    const n = 1 << logN;
    console.log(`\n[n=2^${logN} = ${n}] c=${pickC(n)} s=${pickS(n)}`);
    const t0 = Date.now();
    const res = studyOneN(n, runs);
    console.log(`  walked ${runs} runs in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    results.push(res);

    printDepthAndDecay(res);
    printPerLevelMaxTable(res, 'pairs');
    printPerLevelMaxTable(res, 'carries');
    printPerLevelMaxTable(res, 'strideCnt');
    // Per-window CV at level 0 (worst case for variance and the most
    // important cell for sizing — every higher level inherits its bound from
    // this one).
    printPerWindowCV(res, 0, 'pairs');
    printPerWindowCV(res, 0, 'carries');
    printPerWindowCV(res, 0, 'strideCnt');
    validateAgainstEmpirical(res);
  }

  const outDir = __dirname;
  mkdirSync(outDir, { recursive: true });
  const outPath = `${outDir}/m8_static_plan_study.json`;
  // Summary only — the full per-(level, window) `cells` array runs to
  // multiple MB and is regenerable on demand, so it's intentionally
  // excluded from the committed JSON. Re-run with the cells dump locally
  // if you need the raw grid.
  writeFileSync(
    outPath,
    JSON.stringify(
      results.map(r => ({
        n: r.n,
        c: r.c,
        s: r.s,
        numWindows: r.numWindows,
        BW: r.BW,
        runs: r.runs,
        depth: r.depth,
        depthHostWalk: r.depthHostWalk,
        wstride1: r.wstride1,
        perLevelTotals: r.perLevelTotals,
        perLevelMaxOverWindows: r.perLevelMaxOverWindows,
      })),
      null,
      2,
    ),
  );
  console.log(`\nWrote ${outPath}`);
}

main();
