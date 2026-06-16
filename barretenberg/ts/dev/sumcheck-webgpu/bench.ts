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
  runResidentGpuSumcheck, encodeColumnsToBytes, makeFoldRunner, makeReduceRunner,
  type FoldRunner, type ReduceRunner,
} from './gpu_pipeline.js';
import { runSingleSubmitSumcheck, makeBatchRunner, makeTranscriptRunner } from './single_submit.js';
import { cpuReferenceUnivariates } from './cpu_reference.js';
import { ALL_RELATIONS } from './descriptors.js';
import { type PipelineCache, type Logger, WG, makeRng, packParams } from './harness.js';
import { sumcheckRoundChallenge, SUMCHECK_TRANSCRIPT_SEED } from '../../src/msm_webgpu/cuzk/poseidon2_cpu.js';
import { Barretenberg } from '../../src/barretenberg/index.js';

// Above this size the independent CPU reference (O(n) bigint host work) is skipped;
// the two GPU engines + the CPU Fiat-Shamir re-derivation still cross-check.
const CPU_REF_MAX_LOGN = 12;

// The bb.js async API once initialized; null if the WASM backend is unavailable.
type WasmApi = Awaited<ReturnType<typeof Barretenberg.new>>;

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

// Build the per-relation inputs for one size: random columns + fixed relation_parameters,
// in BOTH the resident Montgomery-byte form (for the GPU) and the canonical bigint form
// (for the CPU reference) — from the same draws, so the two are provably identical data.
// Deterministic per (size, relation).
function buildInputsFull(n: number): FullInputs {
  const initColBytes: Uint8Array[] = [];
  const relParamBytes: (Uint8Array | undefined)[] = [];
  const initCols: bigint[][][] = [];
  const paramsByRel: bigint[][] = [];
  for (const desc of ALL_RELATIONS) {
    const r = desc.relationIndex;
    const rng = makeRng((desc.seed ^ 0x5151_5151_5151n) + BigInt(n));
    const params = desc.makeParams ? desc.makeParams(rng) : [];
    paramsByRel[r] = params;
    relParamBytes[r] = desc.makeParams ? packParams(params) : undefined;
    const cols = Array.from({ length: desc.numEdges }, () => Array.from({ length: n }, () => rng()));
    initCols[r] = cols;
    initColBytes[r] = encodeColumnsToBytes(cols, n);
  }
  return { initColBytes, relParamBytes, initCols, paramsByRel };
}

// GPU-only inputs (bytes). The bigint columns are materialized transiently and dropped,
// so large sizes pay no bigint-retention cost.
function buildInputs(n: number): { initColBytes: Uint8Array[]; relParamBytes: (Uint8Array | undefined)[] } {
  const { initColBytes, relParamBytes } = buildInputsFull(n);
  return { initColBytes, relParamBytes };
}

/**
 * Initialize the bb.js WASM-threads backend for the benchmark. Needs cross-origin
 * isolation (SharedArrayBuffer) — open the page with `?coi=1`. Returns null (and
 * logs why) if COI is off or init fails, so the WASM column degrades gracefully.
 * SRS init is skipped: SumcheckBench computes no commitments.
 */
export async function initWasm(log: Logger): Promise<WasmApi | null> {
  if (!globalThis.crossOriginIsolated) {
    log('warn', '  WASM column needs cross-origin isolation — reload with ?coi=1 (threads/SharedArrayBuffer).');
    return null;
  }
  try {
    return await Barretenberg.new({
      wasmPath: '/dev/sumcheck-webgpu/barretenberg.wasm.gz', // fetchCode rewrites to -threads
      skipSrsInit: true,
      threads: globalThis.navigator?.hardwareConcurrency ?? 8,
    });
  } catch (e) {
    log('warn', `  WASM backend init failed: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Run the WASM sumcheck baseline for a given log size via the bb.js bbapi
 * `SumcheckBench` command. Returns the prover-reported ms, or null if the backend
 * is unavailable.
 */
export async function runWasmSumcheck(api: WasmApi | null, logN: number): Promise<number | null> {
  if (!api) return null;
  try {
    const { microseconds } = await api.sumcheckBench({ logN });
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
  await wasm?.destroy();
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
  await wasm?.destroy();
  return rows;
}

/**
 * Per-kernel GPU profile of round 0 at one size, to confirm where GPU time goes
 * (the ceiling argument rests on accumulate dominating reduce + fold). Needs
 * timestamp-query (Chrome/Metal has it; logs a warning and exits if absent).
 */
export async function runProfile(device: GPUDevice, logN: number, log: Logger): Promise<void> {
  const alpha = makeRng(0xb0_07_5eedn)();
  const cache: PipelineCache = new Map();
  const shared = { cache, foldRunner: await makeFoldRunner(device), reduceRunner: await makeReduceRunner(device) };
  const n = 1 << logN;
  const betas = Array.from({ length: logN }, (_, i) => makeRng(0xbe7a_77n + BigInt(i))());
  const challenges = Array.from({ length: logN }, (_, i) => makeRng(0xc4a1_77n + BigInt(i))());
  const { initColBytes, relParamBytes } = buildInputs(n);
  await runResidentGpuSumcheck(device, n, alpha, betas, challenges, relParamBytes, initColBytes, shared, WG); // warmup/compile
  const r = await runResidentGpuSumcheck(device, n, alpha, betas, challenges, relParamBytes, initColBytes, shared, WG, true);

  log('info', `  per-kernel GPU profile · round 0 · 2^${logN} (edges = ${n >> 1})`);
  if (!r.profile) { log('warn', '  timestamp-query unavailable — no per-kernel timing on this device.'); return; }
  const sum = (pfx: string) => r.profile!.filter(e => e.label.startsWith(pfx)).reduce((s, e) => s + e.ms, 0);
  const acc = sum('acc:'), r1 = sum('r1:'), r2 = sum('r2:'), fold = sum('fold:');
  const tot = acc + r1 + r2 + fold;
  const pct = (x: number) => (tot ? (100 * x / tot).toFixed(1) : '0') + '%';
  log('ok', `  accumulate ${acc.toFixed(2)} ms (${pct(acc)}) · reduce ${(r1 + r2).toFixed(2)} ms (${pct(r1 + r2)}) · fold ${fold.toFixed(2)} ms (${pct(fold)})  [round-0 GPU passes]`);
  const accByRel = r.profile.filter(e => e.label.startsWith('acc:')).sort((a, b) => b.ms - a.ms);
  for (const e of accByRel.slice(0, 6)) log('info', `    ${e.label.padEnd(18)} ${e.ms.toFixed(3)} ms`);
  log('info', `  host: decode ${r.decodeMs.toFixed(1)} ms · scaling ${r.scalingMs.toFixed(1)} ms · wall ${r.totalMs.toFixed(1)} ms · gpuMs ${r.gpuMs.toFixed(1)} ms`);
}

/**
 * Per-kernel GPU profile of the SINGLE-SUBMISSION engine across ALL rounds, to find
 * where its time goes vs the multi-round engine. Sums each kernel type's dispatch
 * durations and reports the `encoder_all` span (full GPU wall incl. inter-pass
 * barriers); span minus summed compute is the "bubble" — GPU idle draining the
 * dependent chain (notably the single-threaded Poseidon2 transcript, once per round).
 * Needs timestamp-query (Chrome/Metal has it; logs a warning and exits if absent).
 */
export async function runSingleSubmitProfile(device: GPUDevice, logN: number, log: Logger): Promise<void> {
  const alpha = makeRng(0xb0_07_5eedn)();
  const ssShared = {
    cache: new Map() as PipelineCache,
    foldRunner: await makeFoldRunner(device),
    reduceRunner: await makeReduceRunner(device),
    batch: await makeBatchRunner(device),
    transcript: await makeTranscriptRunner(device),
  };
  const n = 1 << logN;
  const betas = Array.from({ length: logN }, (_, i) => makeRng(0xbe7a_77n + BigInt(i))());
  const { initColBytes, relParamBytes } = buildInputs(n);
  await runSingleSubmitSumcheck(device, n, alpha, betas, relParamBytes, initColBytes, ssShared); // warmup/compile
  const r = await runSingleSubmitSumcheck(device, n, alpha, betas, relParamBytes, initColBytes, ssShared, WG, true);

  log('info', `  single-submit per-kernel GPU profile · all ${logN} rounds · 2^${logN}`);
  if (!r.profile) { log('warn', '  timestamp-query unavailable — no per-kernel timing on this device.'); return; }
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
    `  transcript = ${logN} rounds @ ${(transcript / logN).toFixed(2)} ms/round · ` +
      `wall ${r.totalMs.toFixed(1)} ms · gpuMs ${r.gpuMs.toFixed(1)} ms · setup ${r.setupMs.toFixed(1)} ms`,
  );
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
