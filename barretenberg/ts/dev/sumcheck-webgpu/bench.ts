// Benchmark: full multi-round MegaFlavor sumcheck across sizes, comparing three
// provers — two WebGPU engines and WASM.
//
// The two WebGPU columns share the same resident-byte kernels but differ in how
// Fiat-Shamir is sequenced: the "multi-round" engine (gpu_pipeline.ts) reads each
// round's univariate back to the CPU to draw the challenge, while the "single-
// submit" engine (single_submit.ts) derives the challenge on the GPU (Poseidon2
// transcript) and encodes the whole d-round protocol into ONE command buffer, read
// back once. Both report GPU dispatch time and end-to-end wall (which adds the CPU
// tail + decode). The WASM column calls a barretenberg bbapi `SumcheckBench` command
// via bb.js; until the wasm is rebuilt with that command it returns null and the
// table shows "rebuild wasm". All three run in the same browser, so the GPU is
// whatever drives the page.

import {
  runResidentGpuSumcheck, makeFoldRunner, makeReduceRunner,
  type FoldRunner, type ReduceRunner, type FineRoundProfile,
} from './gpu_pipeline.js';
import { runSingleSubmitSumcheck, makeBatchRunner, makeTranscriptRunner, buildSharedColumns } from './single_submit.js';
import { cpuReferenceUnivariates } from './cpu_reference.js';
import { ALL_RELATIONS } from './descriptors.js';
import {
  type CircuitProfile, DENSE_PROFILE, buildInstance, usedRows, activeRowsByRel, compactionPlan, bandByRel, profileIsSparse, densitiesBp,
} from './sparsity.js';
import { NUM_RELATIONS } from '../../src/msm_webgpu/accumulator.js';
import { type PipelineCache, type Logger, WG, makeRng } from './harness.js';
import { sumcheckRoundChallenge, SUMCHECK_TRANSCRIPT_SEED } from '../../src/msm_webgpu/cuzk/poseidon2_cpu.js';
import { BufferTracker, type BufferAllocStats } from '../../src/msm_webgpu/cuzk/gpu.js';

// Above this size the independent CPU reference (O(n) bigint host work) is skipped;
// the two GPU engines + the CPU Fiat-Shamir re-derivation still cross-check.
const CPU_REF_MAX_LOGN = 12;

// The bb.js async API once initialized; null if the WASM backend is unavailable. bb.js
// is dynamically imported (initWasm) so its module graph stays off the page-load path —
// `typeof import` gives the type without pulling the module in at load time.
type BbModule = typeof import('../../src/barretenberg/index.js');
type WasmApi = Awaited<ReturnType<BbModule['Barretenberg']['new']>>;

export interface BenchRow {
  logN: number;
  n: number;
  webgpuGpuMs: number; // multi-round GPU dispatch + per-round readback
  webgpuWallMs: number; // multi-round end-to-end (incl. CPU tail + decode/reduce)
  ssGpuMs: number; // single-submit GPU: submit + the single final readback
  ssWallMs: number; // single-submit end-to-end (encode + submit + readback + decode)
  wasmMs: number | null; // null => bb.js SumcheckBench not available (rebuild wasm)
  speedup: number | null; // wasmMs / webgpuWallMs (multi-round vs WASM)
  ssSpeedup: number | null; // wasmMs / ssWallMs (single-submit vs WASM)
  // Correctness cross-checks on this size's round univariates:
  outputsMatch: boolean; // all available checks below agree
  fiatShamirOk: boolean; // single-submit's GPU challenges == independent CPU Poseidon2 re-derivation
  multiVsSingle: boolean; // multi-round univariates == single-submit univariates (bit-for-bit)
  cpuRefMatch: boolean | null; // multi-round univariates == independent CPU reference (null => skipped, n too large)
}

/**
 * First (round, eval) at which two round-univariate sequences disagree, or null if
 * they are bit-for-bit identical. Used to cross-check the two WebGPU engines, which
 * must produce the same univariates when fed the same challenges.
 */
function firstUnivariateMismatch(
  a: bigint[][],
  b: bigint[][],
): { round: number; k: number; a: bigint; b: bigint } | null {
  const rounds = Math.min(a.length, b.length);
  for (let i = 0; i < rounds; i++) {
    const len = Math.min(a[i].length, b[i].length);
    for (let k = 0; k < len; k++) {
      if (a[i][k] !== b[i][k]) return { round: i, k, a: a[i][k], b: b[i][k] };
    }
  }
  return a.length === b.length ? null : { round: rounds, k: 0, a: 0n, b: 0n };
}

interface FullInputs {
  initColBytes: Uint8Array[];
  relParamBytes: (Uint8Array | undefined)[];
  initCols: bigint[][][]; // bigint columns indexed by relationIndex (for the CPU reference)
  paramsByRel: bigint[][];
}

// Build the per-relation inputs for one size under `profile` (default dense): random
// columns + fixed relation_parameters, in BOTH the resident Montgomery-byte form (for
// the GPU) and the canonical bigint form (for the CPU reference) — from the same draws,
// so the two are provably identical data. The dense profile reproduces the original
// fully-dense instance exactly; a sparse profile zeroes every inactive row's columns
// (see sparsity.ts). Deterministic per (size, relation).
function buildInputsFull(n: number, profile: CircuitProfile = DENSE_PROFILE): FullInputs {
  const inst = buildInstance(n, profile, true);
  return { initColBytes: inst.initColBytes, relParamBytes: inst.relParamBytes, initCols: inst.initCols, paramsByRel: inst.paramsByRel };
}

// GPU-only inputs (bytes). The bigint columns are materialized transiently and dropped,
// so large sizes pay no bigint-retention cost.
function buildInputs(n: number, profile: CircuitProfile = DENSE_PROFILE): { initColBytes: Uint8Array[]; relParamBytes: (Uint8Array | undefined)[] } {
  const inst = buildInstance(n, profile, false);
  return { initColBytes: inst.initColBytes, relParamBytes: inst.relParamBytes };
}

// On-wire sparsity descriptor for the WASM SumcheckBench command. usedRows == n and all
// densities 10000 (basis points) mean "dense" — the C++ side then runs exactly as before.
export interface WasmSparsity { usedRows: number; structure: number; densities: number[] }

function wasmSparsityFor(profile: CircuitProfile, logN: number): WasmSparsity {
  const n = 1 << logN;
  return {
    usedRows: usedRows(profile, n),
    structure: profile.structure === 'scattered' ? 1 : 0,
    densities: densitiesBp(profile),
  };
}

// Self-documenting annotation of the active sparsity profile, so a benchmark's rows are
// interpretable (which instance produced these numbers). Emitted by the bench itself.
function logProfile(log: Logger, profile: CircuitProfile, skip: boolean): void {
  if (!skip) {
    log('info', '  instance: dense (every relation active on every row) — skipping OFF');
    return;
  }
  log(
    'warn',
    `  instance: ${profile.name}${profile.synthetic ? ' (SYNTHETIC)' : ''} — skipping ON · ` +
      `used ${(profile.usedFraction * 100).toFixed(0)}% of rows · ${profile.structure}`,
  );
  log('info', `    per-relation density: ${ALL_RELATIONS.map(d => `${d.id} ${(profile.density[d.relationIndex] * 100).toFixed(0)}%`).join(', ')}`);
}

/**
 * Initialize the bb.js WASM-threads backend for the benchmark. Needs cross-origin
 * isolation (SharedArrayBuffer) — open the page with `?coi=1`. Returns null (and
 * logs why) if COI is off or init fails, so the WASM column degrades gracefully.
 * SRS init is skipped: SumcheckBench computes no commitments.
 */
let wasmPromise: Promise<WasmApi | null> | undefined;
export function initWasm(log: Logger): Promise<WasmApi | null> {
  if (!globalThis.crossOriginIsolated) {
    log('warn', '  WASM column needs cross-origin isolation — reload with ?coi=1 (threads/SharedArrayBuffer).');
    return Promise.resolve(null);
  }
  // Memoized: the bb.js threads backend (3 MB wasm + a worker per core) is spun up once
  // and reused across every bench run, not init/destroy'd per run. bb.js is imported
  // here (dynamically) so its module graph never reaches the page-load critical path.
  if (!wasmPromise) {
    wasmPromise = (async () => {
      try {
        const { Barretenberg } = await import('../../src/barretenberg/index.js');
        return await Barretenberg.new({
          wasmPath: '/dev/sumcheck-webgpu/barretenberg.wasm.gz', // fetchCode rewrites to -threads
          skipSrsInit: true,
          threads: globalThis.navigator?.hardwareConcurrency ?? 8,
        });
      } catch (e) {
        log('warn', `  WASM backend init failed: ${(e as Error).message}`);
        wasmPromise = undefined; // allow a later call to retry the init
        return null;
      }
    })();
  }
  return wasmPromise;
}

/**
 * Run the WASM sumcheck baseline for a given log size via the bb.js bbapi
 * `SumcheckBench` command. Returns the prover-reported ms, or null if the backend
 * is unavailable.
 */
export async function runWasmSumcheck(
  api: WasmApi | null,
  logN: number,
  sparsity?: WasmSparsity,
): Promise<number | null> {
  if (!api) return null;
  // Always send the sparsity fields (the bbapi command requires them); default to a
  // dense descriptor so the C++ side runs the original fully-dense instance unchanged.
  const s = sparsity ?? { usedRows: 1 << logN, structure: 0, densities: new Array(NUM_RELATIONS).fill(10000) };
  try {
    const { microseconds } = await api.sumcheckBench({
      logN, usedRows: s.usedRows, structure: s.structure, densities: s.densities,
    });
    return microseconds / 1000;
  } catch {
    return null;
  }
}

/**
 * Sweep `logNs` (e.g. [10,12,14,16]). For each size, time both WebGPU engines
 * (multi-round + single-submit) and the WASM baseline, logging a row as it
 * completes. Pipelines compile once (shared caches + a warmup) so per-size GPU
 * timing excludes shader compilation. The two GPU engines share the fold/reduce
 * runners; the single-submit engine additionally compiles the batch + Poseidon2
 * transcript pipelines.
 */
export async function runBenchmark(device: GPUDevice, logNs: number[], log: Logger, onRow?: (row: BenchRow) => void): Promise<BenchRow[]> {
  const alpha = makeRng(0xb0_07_5eedn)();
  const cache: PipelineCache = new Map();
  const foldRunner: FoldRunner = await makeFoldRunner(device);
  const reduceRunner: ReduceRunner = await makeReduceRunner(device);
  const shared = { cache, foldRunner, reduceRunner };
  const ssShared = {
    cache: new Map() as PipelineCache,
    foldRunner,
    reduceRunner,
    batch: await makeBatchRunner(device),
    transcript: await makeTranscriptRunner(device),
  };
  const wasm = await initWasm(log);
  if (wasm) log('info', `  WASM backend ready (bb.js threads)`);

  // Warmup at the smallest size to trigger all shader compiles into the caches.
  {
    const wn = 1 << Math.min(...logNs);
    const warm = buildInputs(wn);
    const wb = Array.from({ length: Math.round(Math.log2(wn)) }, (_, i) => makeRng(0x1234n + BigInt(i))());
    const wc = Array.from({ length: wb.length }, (_, i) => makeRng(0x9999n + BigInt(i))());
    await runResidentGpuSumcheck(device, wn, alpha, wb, wc, warm.relParamBytes, warm.initColBytes, shared);
    await runSingleSubmitSumcheck(device, wn, alpha, wb, warm.relParamBytes, warm.initColBytes, ssShared);
  }

  const rows: BenchRow[] = [];
  for (const logN of logNs) {
    const n = 1 << logN;
    const betas = Array.from({ length: logN }, (_, i) => makeRng(0xbe7a_77n + BigInt(i))());
    const runCpuRef = logN <= CPU_REF_MAX_LOGN;
    const full = runCpuRef ? buildInputsFull(n) : null;
    const { initColBytes, relParamBytes } = full ?? buildInputs(n);

    // Single-submit derives the Fiat-Shamir challenges on the GPU.
    const ss = await runSingleSubmitSumcheck(device, n, alpha, betas, relParamBytes, initColBytes, ssShared);

    // (1) Independently re-derive the challenge chain on the CPU (Poseidon2 mirror)
    //     from single-submit's univariates, and verify it equals the GPU-derived
    //     challenges — confirms the on-GPU Fiat-Shamir at every size (just d hashes).
    const cpuChallenges: bigint[] = [];
    let running = SUMCHECK_TRANSCRIPT_SEED;
    let fiatShamirOk = true;
    for (let i = 0; i < ss.univariates.length; i++) {
      const { challenge, nextRunning } = sumcheckRoundChallenge(running, ss.univariates[i]);
      if (challenge !== ss.challenges[i]) fiatShamirOk = false;
      cpuChallenges.push(challenge);
      running = nextRunning;
    }

    // (2) Multi-round engine on that verified chain; its univariates must equal
    //     single-submit's bit-for-bit (independent kernels + command-buffer shape).
    const gpu = await runResidentGpuSumcheck(device, n, alpha, betas, cpuChallenges, relParamBytes, initColBytes, shared);
    const multiVsSingle = firstUnivariateMismatch(gpu.univariates, ss.univariates) === null;

    // (3) Fully independent CPU reference (gated to small n: O(n) bigint host work).
    let cpuRefMatch: boolean | null = null;
    if (full) {
      const cpuUni = await cpuReferenceUnivariates(full.initCols, full.paramsByRel, betas, alpha, cpuChallenges);
      cpuRefMatch = firstUnivariateMismatch(ss.univariates, cpuUni) === null;
    }

    const wasmMs = await runWasmSumcheck(wasm, logN);
    const outputsMatch = fiatShamirOk && multiVsSingle && (cpuRefMatch ?? true);
    const row: BenchRow = {
      logN, n,
      webgpuGpuMs: gpu.gpuMs,
      webgpuWallMs: gpu.totalMs,
      ssGpuMs: ss.gpuMs,
      ssWallMs: ss.totalMs,
      wasmMs,
      speedup: wasmMs === null ? null : wasmMs / gpu.totalMs,
      ssSpeedup: wasmMs === null ? null : wasmMs / ss.totalMs,
      outputsMatch,
      fiatShamirOk,
      multiVsSingle,
      cpuRefMatch,
    };
    rows.push(row);
    onRow?.(row);
    const tail =
      wasmMs === null ? '' : `  →  multi ${row.speedup!.toFixed(2)}× · single-submit ${row.ssSpeedup!.toFixed(2)}×`;
    const cpuTag = cpuRefMatch === null ? 'cpu —' : `cpu ${cpuRefMatch ? '✓' : '✗'}`;
    log(
      'ok',
      `  2^${logN}: multi ${gpu.totalMs.toFixed(1)} ms (GPU ${gpu.gpuMs.toFixed(1)}) · ` +
        `single-submit ${ss.totalMs.toFixed(1)} ms (GPU ${ss.gpuMs.toFixed(1)}) · ` +
        `WASM ${wasmMs === null ? '—' : wasmMs.toFixed(1) + ' ms'}${tail}` +
        `  · outputs ${outputsMatch ? '✓' : '✗'} (fs ${fiatShamirOk ? '✓' : '✗'}, multi≡single ${multiVsSingle ? '✓' : '✗'}, ${cpuTag})`,
    );
    if (!outputsMatch) {
      const m = firstUnivariateMismatch(gpu.univariates, ss.univariates);
      log(
        'err',
        `  2^${logN}: correctness FAIL — fs=${fiatShamirOk} multi≡single=${multiVsSingle} cpuRef=${cpuRefMatch}` +
          (m ? ` · first multi/single diff at round ${m.round} eval ${m.k}: ${m.a} vs ${m.b}` : ''),
      );
    }
  }
  return rows;
}

export interface HybridRow {
  logN: number; // d = total sumcheck rounds
  gpuRounds: number; // k rounds run on WebGPU (the heavy front)
  gpuRoundsMs: number; // wall for the first k GPU rounds (rounds only)
  handoffMs: number; // readback of the folded columns at the GPU->WASM handoff
  wasmTailMs: number | null; // WASM time for the remaining d-k rounds (SumcheckBench(d-k))
  hybridMs: number | null; // gpuRoundsMs + handoffMs + wasmTailMs
  fullWasmMs: number | null; // WASM time for all d rounds
  fullGpuMs: number; // WebGPU wall for all d rounds
  vsWasm: number | null; // fullWasmMs / hybridMs  (>1 => hybrid beats full WASM)
  vsGpu: number | null; // fullGpuMs / hybridMs   (>1 => hybrid beats full GPU)
}

/**
 * Hybrid GPU/WASM sumcheck sweep: run the first `k` rounds on the WebGPU engine
 * (the heavy front — round 0 alone is ~half the field work, and each round halves
 * what remains), hand the folded columns off, and let the WASM prover finish the
 * `d-k`-round tail.
 *
 * Because sumcheck is recursive, the tail (rounds k..d-1 of a d-round instance) has
 * exactly the per-round cost profile of a fresh (d-k)-round sumcheck, so the WASM
 * tail is timed with the existing `SumcheckBench(logN = d-k)` — no resume command
 * or wasm rebuild needed. The cross-runtime memcpy of the folded bytes into wasm
 * memory is not modelled (it would be a small fraction of the tail); the GPU-side
 * handoff readback is, and is reported separately so the split is transparent.
 *
 * For each size we also time the two pure baselines (full WASM, full GPU) so the
 * table shows whether the split actually wins.
 */
export async function runHybridBenchmark(
  device: GPUDevice,
  logNs: number[],
  splits: number[],
  log: Logger,
  onRow?: (row: HybridRow) => void,
): Promise<HybridRow[]> {
  const alpha = makeRng(0xb0_07_5eedn)();
  const cache: PipelineCache = new Map();
  const foldRunner: FoldRunner = await makeFoldRunner(device);
  const reduceRunner: ReduceRunner = await makeReduceRunner(device);
  const shared = { cache, foldRunner, reduceRunner };
  const wasm = await initWasm(log);
  if (wasm) log('info', `  WASM backend ready (bb.js threads)`);

  // Warmup at the smallest size to compile all shaders into the shared cache.
  {
    const wn = 1 << Math.min(...logNs);
    const warm = buildInputs(wn);
    const wb = Array.from({ length: Math.round(Math.log2(wn)) }, (_, i) => makeRng(0x1234n + BigInt(i))());
    const wc = Array.from({ length: wb.length }, (_, i) => makeRng(0x9999n + BigInt(i))());
    await runResidentGpuSumcheck(device, wn, alpha, wb, wc, warm.relParamBytes, warm.initColBytes, shared);
  }

  const rows: HybridRow[] = [];
  for (const logN of logNs) {
    const n = 1 << logN;
    const betas = Array.from({ length: logN }, (_, i) => makeRng(0xbe7a_77n + BigInt(i))());
    const challenges = Array.from({ length: logN }, (_, i) => makeRng(0xc4a1_77n + BigInt(i))());
    const { initColBytes, relParamBytes } = buildInputs(n);

    // Pure baselines for this size, measured once.
    const full = await runResidentGpuSumcheck(device, n, alpha, betas, challenges, relParamBytes, initColBytes, shared);
    const fullGpuMs = full.totalMs;
    const fullWasmMs = await runWasmSumcheck(wasm, logN);

    for (const k of splits) {
      if (k >= logN) continue; // need at least one round left for the WASM tail
      const part = await runResidentGpuSumcheck(
        device, n, alpha, betas, challenges, relParamBytes, initColBytes, shared, WG, false, k,
      );
      const wasmTailMs = await runWasmSumcheck(wasm, logN - k);
      const hybridMs = wasmTailMs === null ? null : part.totalMs + part.finalReadbackMs + wasmTailMs;
      const row: HybridRow = {
        logN,
        gpuRounds: k,
        gpuRoundsMs: part.totalMs,
        handoffMs: part.finalReadbackMs,
        wasmTailMs,
        hybridMs,
        fullWasmMs,
        fullGpuMs,
        vsWasm: hybridMs !== null && fullWasmMs !== null ? fullWasmMs / hybridMs : null,
        vsGpu: hybridMs !== null ? fullGpuMs / hybridMs : null,
      };
      rows.push(row);
      onRow?.(row);
      log(
        'ok',
        `  2^${logN} · GPU ${k}r + WASM ${logN - k}r: ` +
          `GPU ${part.totalMs.toFixed(1)} + handoff ${part.finalReadbackMs.toFixed(1)} + ` +
          `WASM ${wasmTailMs === null ? '—' : wasmTailMs.toFixed(1)} = ${hybridMs === null ? '—' : hybridMs.toFixed(1)} ms` +
          ` · full WASM ${fullWasmMs === null ? '—' : fullWasmMs.toFixed(1)} · full GPU ${fullGpuMs.toFixed(1)}` +
          `${row.vsWasm ? `  →  ${row.vsWasm.toFixed(2)}× vs WASM` : ''}`,
      );
    }
  }
  return rows;
}

export interface MultiPassRow {
  logN: number; // d = total sumcheck rounds
  n: number;
  threshold: number; // T: sizes with d <= T run pure WASM; for d > T the WASM tail is the final (d-k)=T rounds
  gpuRounds: number; // k = max(0, d - T): rounds run on the WebGPU front
  gpuMs: number; // wall for the k GPU front rounds (0 when pure WASM)
  handoffMs: number; // readback of the folded columns at the GPU->WASM handoff (0 when pure WASM)
  wasmTailMs: number | null; // WASM time for the (d-k)-round tail (== full WASM when pure WASM)
  multipassMs: number | null; // gpuMs + handoffMs + wasmTailMs (== fullWasmMs when pure WASM)
  fullWasmMs: number | null; // baseline: full d-round WASM
  speedup: number | null; // fullWasmMs / multipassMs  (>1 => the split beats full WASM)
}

/**
 * The single sumcheck benchmark: a configurable WASM-fallback threshold `T` splits
 * each size between the WebGPU front and the WASM prover.
 *
 *   - d <= T: the whole sumcheck runs on WASM (no GPU). The reported multi-pass time
 *     IS the full-WASM time, so the speedup is 1.00x by construction.
 *   - d  > T: the first k = d - T rounds run on the WebGPU engine (the heavy front —
 *     round 0 alone is ~half the field work, and each later round halves the rest),
 *     folding every column down to length 2^T; those folded columns are read back
 *     (the handoff) and the WASM prover finishes the remaining T rounds. Sumcheck is
 *     recursive, so the tail has the per-round cost of a fresh T-round sumcheck and is
 *     timed with `SumcheckBench(d - k = T)` — no resume command or wasm rebuild needed.
 *
 * Every size also times full WASM as the baseline, so the table shows whether the
 * split actually wins. Timing-only: correctness is covered by the Testing tab's round
 * suite, which runs the same GPU engine against a CPU reference.
 */
export async function runMultiPassBenchmark(
  device: GPUDevice,
  logNs: number[],
  threshold: number,
  log: Logger,
  onRow?: (row: MultiPassRow) => void,
  profile: CircuitProfile = DENSE_PROFILE,
): Promise<MultiPassRow[]> {
  const alpha = makeRng(0xb0_07_5eedn)();
  const cache: PipelineCache = new Map();
  const foldRunner: FoldRunner = await makeFoldRunner(device);
  const reduceRunner: ReduceRunner = await makeReduceRunner(device);
  const shared = { cache, foldRunner, reduceRunner };
  const skip = profileIsSparse(profile);
  logProfile(log, profile, skip);
  const wasm = await initWasm(log);
  if (wasm) log('info', '  WASM backend ready (bb.js threads)');

  // Warmup the GPU pipelines (compile every shader into the shared cache) at the
  // smallest size that actually uses the GPU, so per-size timing excludes compilation.
  // Warm the SAME (skip vs non-skip) pipeline variant the timed runs use.
  const gpuSizes = logNs.filter(d => d > threshold);
  if (gpuSizes.length) {
    const wn = 1 << Math.min(...gpuSizes);
    const wd = Math.round(Math.log2(wn));
    const warm = buildInputs(wn, profile);
    const wb = Array.from({ length: wd }, (_, i) => makeRng(0x1234n + BigInt(i))());
    const wc = Array.from({ length: wd }, (_, i) => makeRng(0x9999n + BigInt(i))());
    await runResidentGpuSumcheck(device, wn, alpha, wb, wc, warm.relParamBytes, warm.initColBytes, shared, WG, false, undefined, skip, usedRows(profile, wn), activeRowsByRel(profile, wn), compactionPlan(profile, wn), bandByRel(profile, wn));
  }

  const rows: MultiPassRow[] = [];
  for (const logN of logNs) {
    const n = 1 << logN;
    const k = Math.max(0, logN - threshold);
    const fullWasmMs = await runWasmSumcheck(wasm, logN, wasmSparsityFor(profile, logN));

    let gpuMs = 0;
    let handoffMs = 0;
    let wasmTailMs: number | null;
    let multipassMs: number | null;
    if (k === 0) {
      // Pure WASM: the multi-pass run is the full-WASM run, so reuse the baseline.
      wasmTailMs = fullWasmMs;
      multipassMs = fullWasmMs;
    } else {
      const betas = Array.from({ length: logN }, (_, i) => makeRng(0xbe7a_77n + BigInt(i))());
      const challenges = Array.from({ length: logN }, (_, i) => makeRng(0xc4a1_77n + BigInt(i))());
      const { initColBytes, relParamBytes } = buildInputs(n, profile);
      const part = await runResidentGpuSumcheck(
        device, n, alpha, betas, challenges, relParamBytes, initColBytes, shared, WG, false, k, skip, usedRows(profile, n), activeRowsByRel(profile, n), compactionPlan(profile, n), bandByRel(profile, n),
      );
      gpuMs = part.totalMs;
      handoffMs = part.finalReadbackMs;
      wasmTailMs = await runWasmSumcheck(wasm, logN - k, wasmSparsityFor(profile, logN - k));
      multipassMs = wasmTailMs === null ? null : gpuMs + handoffMs + wasmTailMs;
    }
    const speedup =
      multipassMs !== null && multipassMs > 0 && fullWasmMs !== null ? fullWasmMs / multipassMs : null;
    const row: MultiPassRow = {
      logN, n, threshold, gpuRounds: k, gpuMs, handoffMs, wasmTailMs, multipassMs, fullWasmMs, speedup,
    };
    rows.push(row);
    onRow?.(row);
    const split = k === 0 ? 'WASM only' : `${k} GPU + ${logN - k} WASM`;
    log(
      'ok',
      k === 0
        ? `  2^${logN} · ${split}: WASM ${fullWasmMs === null ? '—' : fullWasmMs.toFixed(1) + ' ms'}`
        : `  2^${logN} · ${split}: GPU ${gpuMs.toFixed(1)} + handoff ${handoffMs.toFixed(1)} + ` +
            `WASM ${wasmTailMs === null ? '—' : wasmTailMs.toFixed(1)} = ${multipassMs === null ? '—' : multipassMs.toFixed(1)} ms` +
            ` · full WASM ${fullWasmMs === null ? '—' : fullWasmMs.toFixed(1)} ms` +
            `${speedup === null ? '' : `  →  ${speedup.toFixed(2)}× vs WASM`}`,
    );
  }
  return rows;
}

export interface SsHybridRow {
  logN: number; // d = total sumcheck rounds
  threshold: number; // T: sizes with d <= T run pure WASM; otherwise the last T rounds are the WASM tail
  gpuRounds: number; // k = max(0, d - T): rounds run on the single-submission WebGPU front
  setupMs: number; // one-time front setup (column upload + GPU beta_products scan + constants); 0 when pure WASM
  gpuFrontMs: number; // wall for the k single-submission GPU rounds (excludes setup); 0 when pure WASM
  handoffMs: number; // readback of the folded columns at the GPU->WASM handoff (length 2^T); 0 when pure WASM
  wasmTailMs: number | null; // WASM time for the T-round tail (== full WASM when pure WASM)
  hybridMs: number | null; // gpuFrontMs + handoffMs + wasmTailMs (setup excluded, like the multi-pass bench); == fullWasm when pure WASM
  fullWasmMs: number | null; // baseline: full d-round WASM
  speedup: number | null; // fullWasmMs / hybridMs (>1 => the split beats full WASM)
}

/**
 * Single-submission threshold hybrid sweep — the SINGLE-SUBMISSION analogue of
 * `runMultiPassBenchmark`. A WASM-fallback threshold `T` splits each size:
 *
 *   - d <= T: the whole sumcheck runs on WASM (no GPU); reported time IS full WASM,
 *     so the speedup is 1.00x by construction.
 *   - d  > T: the first k = d - T rounds run on the SINGLE-SUBMISSION WebGPU engine —
 *     the whole k-round front (accumulate -> reduce -> batch -> on-GPU Poseidon2
 *     Fiat-Shamir -> fold) in ONE command buffer with no per-round CPU<->GPU
 *     round-trip — folding every column down to a 2^T hypercube; those folded columns
 *     are read back (the handoff) and the WASM prover finishes the last T rounds.
 *
 * Sumcheck is recursive, so the T-round tail has the per-round cost of a fresh
 * T-round sumcheck and is timed with `SumcheckBench(d - k = T)` — no resume command or
 * wasm rebuild. The GPU->WASM column handoff readback is timed and reported. As in the
 * multi-pass bench, the hybrid total EXCLUDES the one-time column upload (`setupMs`),
 * which is reported separately, so a row is directly comparable to the multi-pass
 * benchmark at the same threshold (same split, different GPU engine). Every size also
 * times full WASM as the baseline. Timing-only: correctness of the GPU front is
 * covered by the Testing tab's single-submission suite (GPU vs CPU reference).
 */
export async function runSingleSubmitHybridBenchmark(
  device: GPUDevice,
  logNs: number[],
  threshold: number,
  log: Logger,
  onRow?: (row: SsHybridRow) => void,
  profile: CircuitProfile = DENSE_PROFILE,
): Promise<SsHybridRow[]> {
  const alpha = makeRng(0xb0_07_5eedn)();
  const foldRunner: FoldRunner = await makeFoldRunner(device);
  const reduceRunner: ReduceRunner = await makeReduceRunner(device);
  const ssShared = {
    cache: new Map() as PipelineCache,
    foldRunner,
    reduceRunner,
    batch: await makeBatchRunner(device),
    transcript: await makeTranscriptRunner(device),
  };
  const skip = profileIsSparse(profile);
  logProfile(log, profile, skip);
  const wasm = await initWasm(log);
  if (wasm) log('info', '  WASM backend ready (bb.js threads)');

  // Warmup the FULL pipeline at the smallest GPU-using size (d > threshold) so every
  // shader (accumulate, reduce, batch, transcript, gate-separator scan/gather, fold)
  // compiles into the cache and per-size timing excludes compilation. Warm the SAME
  // (skip vs non-skip) pipeline variant the timed runs use.
  const gpuSizes = logNs.filter(d => d > threshold);
  if (gpuSizes.length) {
    const wn = 1 << Math.min(...gpuSizes);
    const warm = buildInputs(wn, profile);
    const wb = Array.from({ length: Math.round(Math.log2(wn)) }, (_, i) => makeRng(0x1234n + BigInt(i))());
    await runSingleSubmitSumcheck(device, wn, alpha, wb, warm.relParamBytes, warm.initColBytes, ssShared, WG, false, undefined, skip, usedRows(profile, wn), activeRowsByRel(profile, wn), bandByRel(profile, wn));
  }

  const rows: SsHybridRow[] = [];
  for (const logN of logNs) {
    const n = 1 << logN;
    const k = Math.max(0, logN - threshold);
    const fullWasmMs = await runWasmSumcheck(wasm, logN, wasmSparsityFor(profile, logN));

    let setupMs = 0, gpuFrontMs = 0, handoffMs = 0;
    let wasmTailMs: number | null;
    let hybridMs: number | null;
    if (k === 0) {
      // Pure WASM: the split run IS the full-WASM run, so reuse the baseline.
      wasmTailMs = fullWasmMs;
      hybridMs = fullWasmMs;
    } else {
      const betas = Array.from({ length: logN }, (_, i) => makeRng(0xbe7a_77n + BigInt(i))());
      const { initColBytes, relParamBytes } = buildInputs(n, profile);
      const front = await runSingleSubmitSumcheck(
        device, n, alpha, betas, relParamBytes, initColBytes, ssShared, WG, false, k, skip, usedRows(profile, n), activeRowsByRel(profile, n), bandByRel(profile, n),
      );
      setupMs = front.setupMs;
      gpuFrontMs = front.totalMs;
      handoffMs = front.finalReadbackMs;
      wasmTailMs = await runWasmSumcheck(wasm, logN - k, wasmSparsityFor(profile, logN - k));
      hybridMs = wasmTailMs === null ? null : gpuFrontMs + handoffMs + wasmTailMs;
    }
    const speedup =
      hybridMs !== null && hybridMs > 0 && fullWasmMs !== null ? fullWasmMs / hybridMs : null;
    const row: SsHybridRow = {
      logN, threshold, gpuRounds: k, setupMs, gpuFrontMs, handoffMs, wasmTailMs, hybridMs, fullWasmMs, speedup,
    };
    rows.push(row);
    onRow?.(row);
    const split = k === 0 ? 'WASM only' : `SS-GPU ${k}r + WASM ${logN - k}r`;
    log(
      'ok',
      k === 0
        ? `  2^${logN} · ${split}: WASM ${fullWasmMs === null ? '—' : fullWasmMs.toFixed(1) + ' ms'}`
        : `  2^${logN} · ${split}: setup ${setupMs.toFixed(1)} + GPU ${gpuFrontMs.toFixed(1)} + handoff ${handoffMs.toFixed(1)} + ` +
            `WASM ${wasmTailMs === null ? '—' : wasmTailMs.toFixed(1)} = ${hybridMs === null ? '—' : hybridMs.toFixed(1)} ms` +
            ` · full WASM ${fullWasmMs === null ? '—' : fullWasmMs.toFixed(1)} ms` +
            `${speedup === null ? '' : `  →  ${speedup.toFixed(2)}× vs WASM`}`,
    );
  }
  return rows;
}

export interface MultiProfileData {
  logN: number;
  accumulateMs: number;
  reduceMs: number;
  foldMs: number;
  /** Accumulate split: permutation (dense, irreducible) vs all gate relations. */
  permAccMs: number;
  gateAccMs: number;
  topRelations: { label: string; ms: number }[];
}

/** Per-round-0 GPU breakdown from a profiled run's per-kernel labels. */
function profileBreakdown(prof: { label: string; ms: number }[], logN: number): MultiProfileData {
  const sum = (pred: (l: string) => boolean) => prof.filter(e => pred(e.label)).reduce((s, e) => s + e.ms, 0);
  const acc = sum(l => l.startsWith('acc:'));
  const permAcc = sum(l => l === 'acc:perm');
  const accByRel = prof.filter(e => e.label.startsWith('acc:')).sort((a, b) => b.ms - a.ms);
  return {
    logN, accumulateMs: acc, reduceMs: sum(l => l.startsWith('r1:') || l.startsWith('r2:')),
    foldMs: sum(l => l.startsWith('fold:')), permAccMs: permAcc, gateAccMs: acc - permAcc,
    topRelations: accByRel.slice(0, 6).map(e => ({ label: e.label, ms: e.ms })),
  };
}

function logBreakdown(log: Logger, tag: string, b: MultiProfileData, top: { label: string; ms: number }[]): void {
  const tot = b.accumulateMs + b.reduceMs + b.foldMs;
  const pct = (x: number) => (tot ? (100 * x / tot).toFixed(1) : '0') + '%';
  log('ok', `  [${tag}] accumulate ${b.accumulateMs.toFixed(2)} ms (${pct(b.accumulateMs)}) · reduce ${b.reduceMs.toFixed(2)} ms (${pct(b.reduceMs)}) · fold ${b.foldMs.toFixed(2)} ms (${pct(b.foldMs)})`);
  log('info', `    accumulate split: perm ${b.permAccMs.toFixed(2)} ms (irreducible) · gates ${b.gateAccMs.toFixed(2)} ms`);
  for (const e of top.slice(0, 6)) log('info', `    ${e.label.padEnd(18)} ${e.ms.toFixed(3)} ms`);
}

/**
 * Per-kernel GPU profile of round 0 at one size, to confirm where GPU time goes
 * (the ceiling argument rests on accumulate dominating reduce + fold). Needs
 * timestamp-query (Chrome/Metal has it; logs a warning and returns null if absent).
 *
 * On a `band` profile this also runs the fused-gate "uber" dispatch back-to-back with
 * the per-relation path and reports the decisive gate-stream A/B: the gate-accumulate
 * ms under each mode (perm is irreducible and identical under both). The returned
 * MultiProfileData is the per-relation run, for the baked profilereport.
 */
export async function runProfile(device: GPUDevice, logN: number, log: Logger, profile: CircuitProfile = DENSE_PROFILE): Promise<MultiProfileData | null> {
  const alpha = makeRng(0xb0_07_5eedn)();
  const cache: PipelineCache = new Map();
  const shared = { cache, foldRunner: await makeFoldRunner(device), reduceRunner: await makeReduceRunner(device) };
  const n = 1 << logN;
  const skip = profileIsSparse(profile);
  const usedLen = usedRows(profile, n);
  logProfile(log, profile, skip);
  const betas = Array.from({ length: logN }, (_, i) => makeRng(0xbe7a_77n + BigInt(i))());
  const challenges = Array.from({ length: logN }, (_, i) => makeRng(0xc4a1_77n + BigInt(i))());
  const { initColBytes, relParamBytes } = buildInputs(n, profile);
  const usedLensByRel = activeRowsByRel(profile, n);
  const comp = compactionPlan(profile, n);
  const bnd = bandByRel(profile, n);
  const runMode = async (gateMode: 'perRelation' | 'uber', prof: boolean) =>
    runResidentGpuSumcheck(device, n, alpha, betas, challenges, relParamBytes, initColBytes, shared, WG, prof, undefined, skip, usedLen, usedLensByRel, comp, bnd, gateMode);

  await runMode('perRelation', false); // warmup/compile
  const r = await runMode('perRelation', true);

  log('info', `  per-kernel GPU profile · round 0 · 2^${logN} (edges = ${n >> 1})`);
  if (!r.profile) { log('warn', '  timestamp-query unavailable — no per-kernel timing on this device.'); return null; }
  const base = profileBreakdown(r.profile, logN);
  logBreakdown(log, 'per-relation', base, base.topRelations);
  log('info', `  host: decode ${r.decodeMs.toFixed(1)} ms · scaling ${r.scalingMs.toFixed(1)} ms · wall ${r.totalMs.toFixed(1)} ms · gpuMs ${r.gpuMs.toFixed(1)} ms`);

  // Fused-gate uber A/B (band profile only): same perm cost, fewer gate dispatches.
  if (bnd) {
    // Direct col_buf binding (zero copy) needs N+6 storage buffers per group; otherwise
    // the group falls back to a per-round concat copy. Surface which path will run.
    const maxStorage = device.limits.maxStorageBuffersPerShaderStage ?? 8;
    log('info', `  uber binding: maxStorageBuffersPerShaderStage=${maxStorage} → light(9 gates) ${15 <= maxStorage ? 'DIRECT (zero-copy)' : 'concat-copy'}, heavy(3 gates) ${9 <= maxStorage ? 'DIRECT (zero-copy)' : 'concat-copy'}`);
    await runMode('uber', false); // warmup/compile the uber pipeline
    const u = await runMode('uber', true);
    if (u.profile) {
      const ub = profileBreakdown(u.profile, logN);
      logBreakdown(log, 'uber', ub, ub.topRelations);
      const delta = base.gateAccMs - ub.gateAccMs;
      const speedup = ub.gateAccMs > 0 ? base.gateAccMs / ub.gateAccMs : 0;
      log(delta > 0 ? 'ok' : 'warn',
        `  gate-stream A/B (round-0 accumulate): per-relation ${base.gateAccMs.toFixed(2)} ms → uber ${ub.gateAccMs.toFixed(2)} ms  (${delta >= 0 ? '−' : '+'}${Math.abs(delta).toFixed(2)} ms, ${speedup.toFixed(2)}×)`);
      log('info', `    full-run GPU time (all ${logN} rounds): per-relation ${r.gpuMs.toFixed(1)} ms → uber ${u.gpuMs.toFixed(1)} ms · wall ${r.totalMs.toFixed(1)} → ${u.totalMs.toFixed(1)} ms`);
    }
  }
  return base;
}

/**
 * Fine per-round attribution of the MULTI-PASS engine at one size — the engine the
 * headline bench uses. Splits each round's wall into host phases (encode-acc /
 * decode / univariate sub-steps scale·extend·batch / encode-fold) and, when the
 * device has timestamp-query, the accumulate encoder's GPU-active span — so the
 * blocking gpu-wait is split into real GPU compute vs idle/transfer bubble. Prints a
 * per-round table, totals, a host-vs-GPU verdict, and the round-0 per-relation
 * accumulate cost. Runs the perRelation gate mode (what the bench runs), all d rounds.
 */
export async function runFineProfile(
  device: GPUDevice, logN: number, log: Logger, profile: CircuitProfile = DENSE_PROFILE,
): Promise<FineRoundProfile[] | null> {
  const alpha = makeRng(0xb0_07_5eedn)();
  const shared = {
    cache: new Map() as PipelineCache,
    foldRunner: await makeFoldRunner(device),
    reduceRunner: await makeReduceRunner(device),
  };
  const n = 1 << logN;
  const skip = profileIsSparse(profile);
  logProfile(log, profile, skip);
  const betas = Array.from({ length: logN }, (_, i) => makeRng(0xbe7a_77n + BigInt(i))());
  const challenges = Array.from({ length: logN }, (_, i) => makeRng(0xc4a1_77n + BigInt(i))());
  const { initColBytes, relParamBytes } = buildInputs(n, profile);
  const usedLen = usedRows(profile, n);
  const usedLensByRel = activeRowsByRel(profile, n);
  const comp = compactionPlan(profile, n);
  const bnd = bandByRel(profile, n);
  const run = (fine: boolean) =>
    runResidentGpuSumcheck(
      device, n, alpha, betas, challenges, relParamBytes, initColBytes, shared, WG, false, undefined,
      skip, usedLen, usedLensByRel, comp, bnd, 'perRelation', fine,
    );

  await run(false); // warmup/compile (no fine timers, so compilation is excluded)
  const r = await run(true);
  const fine = r.fine;
  if (!fine || fine.length === 0) {
    log('warn', '  fine profile produced no rounds.');
    return null;
  }

  const hasGpu = fine.some(f => f.gpuActiveMs !== null);
  log('info', `  fine per-round profile · multi-pass · 2^${logN} · ${profile.name} (perRelation)${hasGpu ? '' : ' · no timestamp-query (gpu-active n/a)'}`);
  const f1 = (x: number) => x.toFixed(1);
  const pad = (s: string | number, w: number) => String(s).padStart(w);
  // wOvhd (per round) = gpuWait - accGPU = the part of the blocking wait NOT acc compute:
  // submit/transfer/map sync PLUS the prior round's un-fenced, un-timestamped fold GPU
  // drain (fold lands here, not in gpuAct). It is NOT pure idle — do not read it as such.
  log(
    'info',
    `  ${pad('rnd', 3)} ${pad('gEdges', 8)} ${pad('encAcc', 7)} ${pad('gpuWait', 8)} ${pad('accGPU', 7)} ${pad('wOvhd', 7)} ${pad('decode', 7)} ${pad('univ', 6)} ${pad('sc/ext/bat', 13)} ${pad('#inv', 6)} ${pad('encFold', 7)}`,
  );
  let tEnc = 0, tWait = 0, tAct = 0, tOvhd = 0, tDec = 0, tUniv = 0, tExt = 0, tFold = 0, tInv = 0;
  let gpuKnown = true;
  for (const f of fine) {
    const univ = f.scaleMs + f.extendMs + f.batchMs;
    const act = f.gpuActiveMs;
    const ovhd = act === null ? null : Math.max(0, f.gpuWaitMs - act);
    tEnc += f.encodeAccMs; tWait += f.gpuWaitMs; tDec += f.decodeMs; tUniv += univ; tExt += f.extendMs; tFold += f.encodeFoldMs; tInv += f.invCount;
    if (act === null) gpuKnown = false; else { tAct += act; tOvhd += ovhd ?? 0; }
    log(
      'info',
      `  ${pad(f.round, 3)} ${pad(f.edges, 8)} ${pad(f1(f.encodeAccMs), 7)} ${pad(f1(f.gpuWaitMs), 8)} ${pad(act === null ? 'n/a' : f1(act), 7)} ${pad(ovhd === null ? 'n/a' : f1(ovhd), 7)} ${pad(f1(f.decodeMs), 7)} ${pad(f1(univ), 6)} ${pad(`${f1(f.scaleMs)}/${f1(f.extendMs)}/${f1(f.batchMs)}`, 13)} ${pad(f.invCount, 6)} ${pad(f1(f.encodeFoldMs), 7)}`,
    );
  }
  const host = tEnc + tDec + tUniv + tFold;
  const wall = r.totalMs;
  // Closed accounting: wall = host + gpu-wait + other. "other" = assembleAccumulator,
  // the per-round timestamp readback (fine-mode only), Profiler alloc, gs.partiallyEvaluate,
  // the un-fenced fold submit, and driver/loop gaps — none on the host or gpu-wait spans.
  const other = wall - host - tWait;
  const pct = (x: number) => `${((100 * x) / wall).toFixed(0)}%`;
  log(
    'ok',
    `  TOTAL wall ${f1(wall)} ms = host ${f1(host)} (${pct(host)}) + gpu-wait ${f1(tWait)} (${pct(tWait)}) + other ${f1(other)} (${pct(other)})  ` +
      `[host: encAcc ${f1(tEnc)} · decode ${f1(tDec)} · univ ${f1(tUniv)} (extend/inv ${f1(tExt)}) · encFold ${f1(tFold)}]`,
  );
  // Verdict on the BLOCKING critical path: gpu-wait is all GPU time the host waits on
  // (acc compute + fold drain + transfer/sync); host is the CPU tail that runs while the
  // GPU is idle. Comparing these two is honest even though fold GPU time is not separately
  // timestamped (it is inside gpu-wait, just not inside accGPU).
  const verdict = tWait > host ? 'GPU-bound (blocking GPU wait > host tail)' : 'HOST-bound (host tail > blocking GPU wait)';
  const extShare = host > 0 ? ((100 * tExt) / host).toFixed(0) : '0';
  log('ok', `  verdict: ${verdict} · host tail ${pct(host)} of wall; extend/inversions = ${extShare}% of host (${tInv} inv/run; data-independent → memoizable)`);
  if (gpuKnown) {
    const accShare = tWait > 0 ? ((100 * tAct) / tWait).toFixed(0) : '0';
    log('ok', `  gpu-wait ${f1(tWait)} ms: measured accumulate-compute ${f1(tAct)} (${accShare}%) + wOvhd ${f1(tOvhd)} (transfer/sync + un-timestamped fold drain)`);
  } else {
    log('warn', `  accGPU unavailable (no timestamp-query); gpu-wait ${f1(tWait)} ms not split (acc-compute vs transfer/fold)`);
  }
  const rel0 = fine[0]?.perRelAccMs;
  if (rel0 && rel0.length) {
    const top = [...rel0].sort((a, b) => b.ms - a.ms);
    log('info', `  per-relation accumulate (round 0, GPU-active, desc): ${top.map(e => `${e.id} ${f1(e.ms)}`).join('  ')}`);
  }
  return fine;
}

/**
 * Per-kernel GPU profile of the SINGLE-SUBMISSION engine, to find where its time
 * goes vs the multi-round engine. Sums each kernel type's dispatch durations and
 * reports the `encoder_all` span (full GPU wall incl. inter-pass barriers); span
 * minus summed compute is the "bubble" — GPU idle draining the dependent chain
 * (notably the single-threaded Poseidon2 transcript, once per round).
 *
 * `tailRounds` (default 0 = all rounds on the GPU) profiles the hybrid split: the
 * first (logN − tailRounds) rounds run on the single-submission GPU engine and are
 * profiled per-kernel here, while the trailing `tailRounds` are handed to the WASM
 * prover so the report also shows the handoff readback + measured WASM tail + total.
 * Needs timestamp-query (Chrome/Metal has it; logs a warning and exits if absent).
 */
export interface SsProfileData {
  logN: number;
  gpuRounds: number;
  accumulateMs: number;
  reduceMs: number;
  batchMs: number;
  transcriptMs: number;
  foldMs: number;
  bubbleMs: number;
  wasmTailMs: number | null;
}

export async function runSingleSubmitProfile(
  device: GPUDevice, logN: number, log: Logger, tailRounds = 0, profile: CircuitProfile = DENSE_PROFILE,
): Promise<SsProfileData | null> {
  const alpha = makeRng(0xb0_07_5eedn)();
  const ssShared = {
    cache: new Map() as PipelineCache,
    foldRunner: await makeFoldRunner(device),
    reduceRunner: await makeReduceRunner(device),
    batch: await makeBatchRunner(device),
    transcript: await makeTranscriptRunner(device),
  };
  const n = 1 << logN;
  // GPU front rounds: all of them when tailRounds == 0, else the leading rounds with
  // the last `tailRounds` reserved for the WASM tail (at least one round on the GPU).
  const gpuRounds = tailRounds > 0 ? Math.max(1, logN - tailRounds) : logN;
  const tail = logN - gpuRounds;
  const skip = profileIsSparse(profile);
  const usedLen = usedRows(profile, n);
  logProfile(log, profile, skip);
  const betas = Array.from({ length: logN }, (_, i) => makeRng(0xbe7a_77n + BigInt(i))());
  const { initColBytes, relParamBytes } = buildInputs(n, profile);
  const usedLensByRel = activeRowsByRel(profile, n);
  const bnd = bandByRel(profile, n);
  const runMode = (gateMode: 'perRelation' | 'uber', prof: boolean) =>
    runSingleSubmitSumcheck(device, n, alpha, betas, relParamBytes, initColBytes, ssShared, WG, prof, gpuRounds, skip, usedLen, usedLensByRel, bnd, gateMode);
  await runMode('perRelation', false); // warmup/compile
  const r = await runMode('perRelation', true);

  const scope = tail > 0 ? `${gpuRounds} GPU rounds + ${tail} WASM tail` : `all ${logN} rounds`;
  log('info', `  single-submit per-kernel GPU profile · ${scope} · 2^${logN}`);
  if (!r.profile) { log('warn', '  timestamp-query unavailable — no per-kernel timing on this device.'); return null; }
  const sum = (label: string) => r.profile!.filter(e => e.label === label).reduce((s, e) => s + e.ms, 0);
  const accumulate = sum('accumulate'), reduce = sum('reduce'), batch = sum('batch');
  const transcript = sum('transcript'), fold = sum('fold');
  const compute = accumulate + reduce + batch + transcript + fold;
  const span = r.profile.find(e => e.label === 'encoder_all')?.ms ?? compute;
  const bubble = Math.max(0, span - compute);
  const pct = (x: number) => (span ? (100 * x / span).toFixed(1) : '0') + '%';
  log(
    'ok',
    `  accumulate ${accumulate.toFixed(2)} ms (${pct(accumulate)}) · reduce ${reduce.toFixed(2)} (${pct(reduce)}) · ` +
      `batch ${batch.toFixed(2)} (${pct(batch)}) · transcript ${transcript.toFixed(2)} (${pct(transcript)}) · fold ${fold.toFixed(2)} (${pct(fold)})`,
  );
  log(
    'ok',
    `  Σcompute ${compute.toFixed(2)} ms · bubble (barriers/idle) ${bubble.toFixed(2)} ms (${pct(bubble)}) · encoder span ${span.toFixed(2)} ms`,
  );
  log(
    'info',
    `  transcript = ${gpuRounds} rounds @ ${(transcript / gpuRounds).toFixed(2)} ms/round · ` +
      `wall ${r.totalMs.toFixed(1)} ms · gpuMs ${r.gpuMs.toFixed(1)} ms · setup ${r.setupMs.toFixed(1)} ms`,
  );

  // Fused-gate uber A/B (band profile, all-GPU run): the single-submission engine has
  // no per-round readback, so the fused accumulate should translate to wall time here.
  if (bnd && tail === 0) {
    const maxStorage = device.limits.maxStorageBuffersPerShaderStage ?? 8;
    log('info', `  uber binding: maxStorageBuffersPerShaderStage=${maxStorage} → light(9) ${15 <= maxStorage ? 'DIRECT (zero-copy)' : 'concat-copy'}, heavy(3) ${9 <= maxStorage ? 'DIRECT' : 'concat-copy'}`);
    await runMode('uber', false); // warmup/compile the uber pipelines
    const u = await runMode('uber', true);
    if (u.profile) {
      const usum = (label: string) => u.profile!.filter(e => e.label === label).reduce((s, e) => s + e.ms, 0);
      const uAcc = usum('accumulate');
      const aSpeedup = uAcc > 0 ? accumulate / uAcc : 0;
      log(aSpeedup >= 1 ? 'ok' : 'warn',
        `  uber A/B: accumulate ${accumulate.toFixed(2)} → ${uAcc.toFixed(2)} ms (${aSpeedup.toFixed(2)}×) · ` +
        `gpuMs ${r.gpuMs.toFixed(1)} → ${u.gpuMs.toFixed(1)} · wall ${r.totalMs.toFixed(1)} → ${u.totalMs.toFixed(1)} ms`);
    }
  }

  // Hybrid split: time the WASM tail at the handed-off size and report the end-to-end
  // hybrid cost (GPU front wall + handoff readback + WASM tail) against full WASM.
  let wasmTailMs: number | null = null;
  if (tail > 0) {
    const wasm = await initWasm(log);
    wasmTailMs = await runWasmSumcheck(wasm, tail, wasmSparsityFor(profile, tail));
    const fullWasmMs = await runWasmSumcheck(wasm, logN, wasmSparsityFor(profile, logN));
    const hybridMs = wasmTailMs === null ? null : r.totalMs + r.finalReadbackMs + wasmTailMs;
    const speedup = hybridMs !== null && hybridMs > 0 && fullWasmMs !== null ? fullWasmMs / hybridMs : null;
    log(
      'ok',
      `  hybrid: GPU front ${r.totalMs.toFixed(1)} + handoff ${r.finalReadbackMs.toFixed(1)} + ` +
        `WASM tail ${wasmTailMs === null ? '—' : wasmTailMs.toFixed(1)} = ${hybridMs === null ? '—' : hybridMs.toFixed(1)} ms` +
        ` · full WASM ${fullWasmMs === null ? '—' : fullWasmMs.toFixed(1)} ms` +
        `${speedup === null ? '' : `  →  ${speedup.toFixed(2)}× vs WASM`}`,
    );
  }

  return {
    logN, gpuRounds, accumulateMs: accumulate, reduceMs: reduce, batchMs: batch,
    transcriptMs: transcript, foldMs: fold, bubbleMs: bubble, wasmTailMs,
  };
}

/**
 * End-to-end WALL-CLOCK timeline for the hybrid split of both engines at one size,
 * decomposing the whole sumcheck into the stages the per-kernel profilers miss:
 * one-time host setup (column/param uploads + the GPU beta_products scan), the GPU
 * front rounds (split into the GPU-bound submit/readback wait vs the host
 * encode/decode that frames it), the GPU->WASM column handoff readback, and the
 * WASM tail. `tailRounds = T` (>= 1) sets the split: k = d - T GPU front rounds +
 * the T-round WASM tail, matching the bench tabs. The full WASM run is timed as the
 * baseline. (There is always a WASM tail — the full-GPU pipeline is not a profiled
 * mode here, since the deployment only ever runs the hybrid.)
 */
export interface EngineE2E {
  setupMs: number; // upload + beta scan (one-time host precompute)
  gpuRoundsMs: number; // wall of the GPU front rounds (totalMs)
  gpuBoundMs: number; // of gpuRoundsMs, the GPU-bound submit/readback wait (gpuMs)
  scalingMs: number; // host gate-separator gather framing (multi-pass only; 0 for SS)
  decodeMs: number; // host univariate decode (multi-pass only; 0 for SS)
  handoffMs: number; // GPU->WASM column readback (finalReadbackMs)
  wasmTailMs: number | null; // T-round WASM tail (null if bb.js unavailable)
  totalMs: number; // setupMs + gpuRoundsMs + handoffMs + wasmTailMs
}
export interface E2EProfileData {
  logN: number;
  gpuRounds: number; // k = d - tailRounds
  tailRounds: number;
  ss: EngineE2E;
  multi: EngineE2E;
  fullWasmMs: number | null;
}

export async function runE2EProfile(
  device: GPUDevice,
  logN: number,
  tailRounds: number,
  log: Logger,
  profile: CircuitProfile = DENSE_PROFILE,
): Promise<E2EProfileData> {
  const alpha = makeRng(0xb0_07_5eedn)();
  const n = 1 << logN;
  const d = logN;
  // Always at least one WASM tail round — this profiles the hybrid split only.
  const T = Math.max(1, Math.min(tailRounds, d - 1));
  const k = d - T; // GPU front rounds (>= 1)
  const skip = profileIsSparse(profile);
  const usedLen = usedRows(profile, n);
  const betas = Array.from({ length: logN }, (_, i) => makeRng(0xbe7a_77n + BigInt(i))());
  const challenges = Array.from({ length: logN }, (_, i) => makeRng(0xc4a1_77n + BigInt(i))());
  const { initColBytes, relParamBytes } = buildInputs(n, profile);

  const mpShared = {
    cache: new Map() as PipelineCache,
    foldRunner: await makeFoldRunner(device),
    reduceRunner: await makeReduceRunner(device),
  };
  const ssShared = {
    cache: new Map() as PipelineCache,
    foldRunner: mpShared.foldRunner,
    reduceRunner: mpShared.reduceRunner,
    batch: await makeBatchRunner(device),
    transcript: await makeTranscriptRunner(device),
  };
  const wasm = await initWasm(log);
  if (wasm) log('info', '  WASM backend ready (bb.js threads)');
  logProfile(log, profile, skip);

  // Warmup each engine at this size so per-stage timing excludes shader compilation.
  const usedLensByRel = activeRowsByRel(profile, n);
  const comp = compactionPlan(profile, n);
  const bnd = bandByRel(profile, n);
  await runResidentGpuSumcheck(device, n, alpha, betas, challenges, relParamBytes, initColBytes, mpShared, WG, false, k, skip, usedLen, usedLensByRel, comp, bnd);
  await runSingleSubmitSumcheck(device, n, alpha, betas, relParamBytes, initColBytes, ssShared, WG, false, k, skip, usedLen, usedLensByRel, bnd);

  const ssRun = await runSingleSubmitSumcheck(device, n, alpha, betas, relParamBytes, initColBytes, ssShared, WG, false, k, skip, usedLen, usedLensByRel, bnd);
  const mpRun = await runResidentGpuSumcheck(device, n, alpha, betas, challenges, relParamBytes, initColBytes, mpShared, WG, false, k, skip, usedLen, usedLensByRel, comp, bnd);
  const wasmTailMs = await runWasmSumcheck(wasm, T, wasmSparsityFor(profile, T));
  const fullWasmMs = await runWasmSumcheck(wasm, logN, wasmSparsityFor(profile, logN));

  const ss: EngineE2E = {
    setupMs: ssRun.setupMs,
    gpuRoundsMs: ssRun.totalMs,
    gpuBoundMs: ssRun.gpuMs,
    scalingMs: 0,
    decodeMs: 0,
    handoffMs: ssRun.finalReadbackMs,
    wasmTailMs,
    totalMs: ssRun.setupMs + ssRun.totalMs + ssRun.finalReadbackMs + (wasmTailMs ?? 0),
  };
  const multi: EngineE2E = {
    setupMs: mpRun.setupMs,
    gpuRoundsMs: mpRun.totalMs,
    gpuBoundMs: mpRun.gpuMs,
    scalingMs: mpRun.scalingMs,
    decodeMs: mpRun.decodeMs,
    handoffMs: mpRun.finalReadbackMs,
    wasmTailMs,
    totalMs: mpRun.setupMs + mpRun.totalMs + mpRun.finalReadbackMs + (wasmTailMs ?? 0),
  };

  log('info', `  end-to-end wall timeline · 2^${logN} · hybrid · ${k} GPU + ${T} WASM`);
  const pct = (x: number, tot: number) => (tot ? (100 * x / tot).toFixed(1) : '0') + '%';
  const line = (name: string, e: EngineE2E) => {
    const tail = e.wasmTailMs ? ` · WASM tail ${e.wasmTailMs.toFixed(1)} (${pct(e.wasmTailMs, e.totalMs)})` : '';
    log(
      'ok',
      `  ${name.padEnd(10)} total ${e.totalMs.toFixed(1)} ms = setup ${e.setupMs.toFixed(1)} (${pct(e.setupMs, e.totalMs)}) · ` +
        `GPU rounds ${e.gpuRoundsMs.toFixed(1)} (${pct(e.gpuRoundsMs, e.totalMs)}) · handoff ${e.handoffMs.toFixed(1)} (${pct(e.handoffMs, e.totalMs)})${tail}`,
    );
    log(
      'info',
      `             └ of GPU rounds: GPU-bound ${e.gpuBoundMs.toFixed(1)} ms · host ${(e.gpuRoundsMs - e.gpuBoundMs).toFixed(1)} ms` +
        (e.scalingMs || e.decodeMs ? ` (scaling ${e.scalingMs.toFixed(1)} · decode ${e.decodeMs.toFixed(1)})` : ''),
    );
  };
  line('SS-hybrid', ss);
  line('multi-pass', multi);
  log('info', `  full WASM baseline: ${fullWasmMs === null ? '—' : fullWasmMs.toFixed(1) + ' ms'}`);

  return { logN, gpuRounds: k, tailRounds: T, ss, multi, fullWasmMs };
}

/**
 * GPU buffer-allocation accounting for both engines at one size. Each engine runs
 * once with a `BufferTracker` patched onto the device, which attributes every
 * allocation to a category (resident columns, scratch, accumulators, gate-separator
 * beta table, transcript state, constants, per-dispatch uniforms, readback staging)
 * and tracks the destroy-aware peak live bytes. Neither engine calls `destroy()` on
 * its per-round buffers (it drops them for GC to reclaim), so peak live equals the
 * total allocated — i.e. the high-water VRAM if GC has not yet run. The meaningful
 * contrast is the per-category allocation COUNT: the single-submission engine
 * ping-pongs two reused column sets (≈2·NUM_RELATIONS column allocs), while the
 * multi-pass engine allocates a fresh folded-column set every round
 * (≈NUM_RELATIONS·(d+1)), and both allocate per-dispatch uniforms each round.
 */
export interface MemoryProfileData {
  logN: number;
  ss: BufferAllocStats;
  multi: BufferAllocStats;
  // SS-hybrid with Idea 1 (shared 67-entity column set): same engine, sharedColumns on.
  ssShared: BufferAllocStats;
}

export async function runMemoryProfile(device: GPUDevice, logN: number, log: Logger): Promise<MemoryProfileData> {
  const alpha = makeRng(0xb0_07_5eedn)();
  const n = 1 << logN;
  const betas = Array.from({ length: logN }, (_, i) => makeRng(0xbe7a_77n + BigInt(i))());
  const challenges = Array.from({ length: logN }, (_, i) => makeRng(0xc4a1_77n + BigInt(i))());
  const { initColBytes, relParamBytes } = buildInputs(n);

  const mpShared = {
    cache: new Map() as PipelineCache,
    foldRunner: await makeFoldRunner(device),
    reduceRunner: await makeReduceRunner(device),
  };
  const ssShared = {
    cache: new Map() as PipelineCache,
    foldRunner: mpShared.foldRunner,
    reduceRunner: mpShared.reduceRunner,
    batch: await makeBatchRunner(device),
    transcript: await makeTranscriptRunner(device),
  };

  const ssTracker = new BufferTracker(device);
  ssTracker.start();
  await runSingleSubmitSumcheck(device, n, alpha, betas, relParamBytes, initColBytes, ssShared);
  const ss = ssTracker.stop();

  // Idea 1: same SS engine, shared 67-entity column set (185 -> 67 columns). Reuses the
  // compiled runners/cache; the shared accumulate pipelines compile under a distinct key.
  const { sharedColBytes } = buildSharedColumns(n, 0x5ba7ed_c01c01n);
  const ssSharedTracker = new BufferTracker(device);
  ssSharedTracker.start();
  await runSingleSubmitSumcheck(device, n, alpha, betas, relParamBytes, initColBytes, { ...ssShared, sharedColumns: true, sharedColBytes });
  const ssShared2 = ssSharedTracker.stop();

  const mpTracker = new BufferTracker(device);
  mpTracker.start();
  await runResidentGpuSumcheck(device, n, alpha, betas, challenges, relParamBytes, initColBytes, mpShared);
  const multi = mpTracker.stop();

  const mb = (b: number) => (b / (1 << 20)).toFixed(2);
  const report = (name: string, s: BufferAllocStats) => {
    log('ok', `  ${name}: peak live ${mb(s.peakLiveBytes)} MB across ${s.totalCount} buffers (no destroy — GC-reclaimed)`);
    const cats = Object.entries(s.byCategory).sort((a, b) => b[1].bytes - a[1].bytes);
    for (const [cat, st] of cats) {
      log('info', `    ${cat.padEnd(11)} ${mb(st.bytes).padStart(8)} MB  · ${String(st.count).padStart(5)} allocs`);
    }
  };
  log('info', `  GPU buffer memory · 2^${logN} (edges = ${n >> 1})`);
  report('SS-hybrid ', ss);
  report('SS-shared ', ssShared2);
  report('multi-pass', multi);
  const colAllocs = (s: BufferAllocStats) => s.byCategory['columns']?.count ?? 0;
  const colMb = (s: BufferAllocStats) => mb(s.byCategory['columns']?.bytes ?? 0);
  log(
    'info',
    `  column allocs: SS ${colAllocs(ss)} (2 reused ping-pong sets) vs multi-pass ${colAllocs(multi)} ` +
      `(fresh fold output every round) · peak live: SS ${mb(ss.peakLiveBytes)} MB vs multi-pass ${mb(multi.peakLiveBytes)} MB`,
  );
  log(
    'ok',
    `  Idea 1 (shared 67-entity columns): SS columns ${colMb(ss)} -> ${colMb(ssShared2)} MB ` +
      `(${colAllocs(ss)} -> ${colAllocs(ssShared2)} allocs) · peak live ${mb(ss.peakLiveBytes)} -> ${mb(ssShared2.peakLiveBytes)} MB`,
  );
  return { logN, ss, multi, ssShared: ssShared2 };
}

/**
 * One-click profiling-report aggregator: runs all five data-collection passes at
 * the fixed sizes the analysis wants, then emits a single ready-to-paste
 * `PROFILE_DATA = { … }` JS literal (logged to #log and the console). Sizes are
 * baked in (size sweep 2^10..2^18, multi/ss/wg profiles at 2^16, hybrid at 2^18)
 * so there is nothing to configure — one button, one copy.
 */
export async function runProfileReport(device: GPUDevice, log: Logger): Promise<void> {
  const n1 = (x: number | null): string => (x === null ? 'null' : x.toFixed(1));
  const n2 = (x: number | null): string => (x === null ? 'null' : x.toFixed(2));
  const pad = (s: string, w: number): string => s.padStart(w);

  log('info', '═══ profiling report · this runs all five passes (~1–3 min), then prints PROFILE_DATA ═══');

  // [1/5] size sweep — suppress runBenchmark's long per-size line; print a clean
  // aligned table via onRow as each size completes.
  log('info', '[1/5] size sweep 2^10..2^18 — wall ms:');
  log('info', `      ${pad('size', 4)} │ ${pad('multi', 7)} │ ${pad('single', 7)} │ ${pad('WASM', 7)} │ ok`);
  const quiet: Logger = (lvl, msg) => { if (!/^\s*2\^\d+: multi/.test(msg)) log(lvl, msg); };
  const sweep = await runBenchmark(device, Array.from({ length: 9 }, (_, i) => 10 + i), quiet, r => {
    log('ok', `      ${pad('2^' + r.logN, 4)} │ ${pad(n1(r.webgpuWallMs), 7)} │ ${pad(n1(r.ssWallMs), 7)} │ ${pad(n1(r.wasmMs), 7)} │ ${r.outputsMatch ? '✓' : '✗'}`);
  });

  log('info', '[2/5] multi-round round-0 per-kernel profile · 2^16…');
  const mp = await runProfile(device, 16, log);

  log('info', '[3/5] single-submit per-kernel profile · 2^16…');
  const sp = await runSingleSubmitProfile(device, 16, log);

  log('info', '[4/7] accumulate workgroup-size sweep · 2^16…');
  const wg = await runWgSweep(device, 16, [32, 64, 96, 128, 192, 256], log);

  log('info', '[5/7] hybrid GPU-front + WASM-tail · 2^18 · splits {1,2,3,4,6}…');
  const hy = await runHybridBenchmark(device, [18], [1, 2, 3, 4, 6], log);

  log('info', '[6/7] end-to-end wall timeline · 2^16 · hybrid 7 GPU + 9 WASM…');
  const e2e = await runE2EProfile(device, 16, 9, log);

  log('info', '[7/7] GPU buffer memory accounting · 2^16…');
  const mem = await runMemoryProfile(device, 16, log);

  const sweepLits = sweep
    .map(r => `    { logN: ${pad(String(r.logN), 2)}, multiWallMs: ${pad(n1(r.webgpuWallMs), 6)}, ssWallMs: ${pad(n1(r.ssWallMs), 6)}, wasmMs: ${pad(n1(r.wasmMs), 6)} },`)
    .join('\n');
  const mpLit = mp
    ? `{ logN: ${mp.logN}, accumulateMs: ${n2(mp.accumulateMs)}, reduceMs: ${n2(mp.reduceMs)}, foldMs: ${n2(mp.foldMs)}, ` +
      `topRelations: [${mp.topRelations.map(t => `{ label: "${t.label}", ms: ${t.ms.toFixed(3)} }`).join(', ')}] }`
    : 'null';
  const spLit = sp
    ? `{ logN: ${sp.logN}, accumulateMs: ${n2(sp.accumulateMs)}, reduceMs: ${n2(sp.reduceMs)}, batchMs: ${n2(sp.batchMs)}, ` +
      `transcriptMs: ${n2(sp.transcriptMs)}, foldMs: ${n2(sp.foldMs)}, bubbleMs: ${n2(sp.bubbleMs)} }`
    : 'null';
  const wgLit = wg.map(w => `{ wg: ${pad(String(w.wg), 3)}, gpuMs: ${pad(n1(w.gpuMs), 6)} }`).join(', ');
  const hyPoints = hy.map(h => `{ k: ${h.gpuRounds}, hybridMs: ${pad(n1(h.hybridMs), 7)} }`).join(', ');
  const hyLit = `{ logN: 18, fullWasmMs: ${n1(hy[0]?.fullWasmMs ?? null)}, fullGpuMs: ${n1(hy[0]?.fullGpuMs ?? null)}, points: [${hyPoints}] }`;
  const e2eEng = (e: EngineE2E): string =>
    `{ totalMs: ${n1(e.totalMs)}, setupMs: ${n1(e.setupMs)}, gpuRoundsMs: ${n1(e.gpuRoundsMs)}, ` +
    `gpuBoundMs: ${n1(e.gpuBoundMs)}, scalingMs: ${n1(e.scalingMs)}, decodeMs: ${n1(e.decodeMs)}, handoffMs: ${n1(e.handoffMs)} }`;
  const e2eLit = `{ logN: ${e2e.logN}, gpuRounds: ${e2e.gpuRounds}, ss: ${e2eEng(e2e.ss)}, multi: ${e2eEng(e2e.multi)}, fullWasmMs: ${n1(e2e.fullWasmMs)} }`;
  const memEng = (s: BufferAllocStats): string => {
    const mb = (b: number) => (b / (1 << 20)).toFixed(2);
    const cats = Object.entries(s.byCategory).sort((a, b) => b[1].bytes - a[1].bytes)
      .map(([c, st]) => `${c}: ${mb(st.bytes)}`).join(', ');
    return `{ peakLiveMB: ${mb(s.peakLiveBytes)}, totalMB: ${mb(s.totalBytes)}, allocs: ${s.totalCount}, byCategoryMB: { ${cats} } }`;
  };
  const memLit = `{ logN: ${mem.logN}, ss: ${memEng(mem.ss)}, ssShared: ${memEng(mem.ssShared)}, multi: ${memEng(mem.multi)} }`;

  const literal =
    `const PROFILE_DATA = {\n` +
    `  sizeSweep: [\n${sweepLits}\n  ],\n` +
    `  multiProfile: ${mpLit},\n` +
    `  ssProfile: ${spLit},\n` +
    `  wgSweep: [${wgLit}],\n` +
    `  hybrid: ${hyLit},\n` +
    `  e2e: ${e2eLit},\n` +
    `  memory: ${memLit},\n` +
    `};`;

  log('ok', '═══ PROFILE_DATA (copy everything below) ═══');
  log('info', literal);
  // eslint-disable-next-line no-console
  console.log(literal);
}

export interface WgSweepRow {
  wg: number;
  gpuMs: number;
  wallMs: number;
}

/**
 * Sweep the accumulate-kernel workgroup size at a fixed size. The relation
 * accumulate kernels are register-heavy (many live Mono/Lag values), so their
 * occupancy — how many edges run concurrently per SM — is sensitive to the
 * workgroup size; this finds the sweet spot on the actual device. Only the
 * accumulate kernel's WG varies (fold/reduce are fixed), isolating occupancy.
 * Each WG gets a fresh pipeline cache and a warmup run so timing excludes
 * shader compilation.
 */
export async function runWgSweep(
  device: GPUDevice,
  logN: number,
  wgs: number[],
  log: Logger,
  onRow?: (row: WgSweepRow) => void,
): Promise<WgSweepRow[]> {
  const alpha = makeRng(0xb0_07_5eedn)();
  const foldRunner: FoldRunner = await makeFoldRunner(device);
  const reduceRunner: ReduceRunner = await makeReduceRunner(device);
  const n = 1 << logN;
  const betas = Array.from({ length: logN }, (_, i) => makeRng(0xbe7a_77n + BigInt(i))());
  const challenges = Array.from({ length: logN }, (_, i) => makeRng(0xc4a1_77n + BigInt(i))());
  const { initColBytes, relParamBytes } = buildInputs(n);

  const rows: WgSweepRow[] = [];
  for (const wg of wgs) {
    const cache: PipelineCache = new Map();
    const shared = { cache, foldRunner, reduceRunner };
    await runResidentGpuSumcheck(device, n, alpha, betas, challenges, relParamBytes, initColBytes, shared, wg); // warmup/compile
    const r = await runResidentGpuSumcheck(device, n, alpha, betas, challenges, relParamBytes, initColBytes, shared, wg);
    const row: WgSweepRow = { wg, gpuMs: r.gpuMs, wallMs: r.totalMs };
    rows.push(row);
    onRow?.(row);
    log('ok', `  WG ${String(wg).padStart(3)}: GPU ${r.gpuMs.toFixed(1)} ms · wall ${r.totalMs.toFixed(1)} ms`);
  }
  if (rows.length) {
    const best = rows.reduce((a, b) => (b.gpuMs < a.gpuMs ? b : a));
    log('info', `  best: WG ${best.wg} @ GPU ${best.gpuMs.toFixed(1)} ms (baseline WG 64: ${(rows.find(r => r.wg === 64)?.gpuMs ?? NaN).toFixed(1)} ms)`);
  }
  return rows;
}
