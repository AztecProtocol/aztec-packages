// Benchmark: full multi-round MegaFlavor sumcheck, WebGPU vs WASM, across sizes.
//
// The WebGPU column runs the resident-byte GPU engine (gpu_pipeline.ts) and reports
// both the GPU dispatch time and the end-to-end wall time (which also includes the
// CPU tail + the per-round decode/reduce — the known JS-side overhead). The WASM
// column calls a barretenberg bbapi `SumcheckBench` command via bb.js; until the
// wasm is rebuilt with that command, it returns null and the table shows "rebuild
// wasm". Both run in the same browser, so the GPU is whatever drives the page.

import {
  runResidentGpuSumcheck, encodeColumnsToBytes, makeFoldRunner, makeReduceRunner,
  type FoldRunner, type ReduceRunner,
} from './gpu_pipeline.js';
import { ALL_RELATIONS } from './descriptors.js';
import { type PipelineCache, type Logger, WG, makeRng, packParams } from './harness.js';
import { Barretenberg } from '../../src/barretenberg/index.js';

// The bb.js async API once initialized; null if the WASM backend is unavailable.
type WasmApi = Awaited<ReturnType<typeof Barretenberg.new>>;

export interface BenchRow {
  logN: number;
  n: number;
  webgpuGpuMs: number; // GPU dispatch + readback only
  webgpuWallMs: number; // end-to-end (incl. CPU tail + decode/reduce)
  wasmMs: number | null; // null => bb.js SumcheckBench not available (rebuild wasm)
  speedup: number | null; // wasmMs / webgpuWallMs
}

// Build the per-relation inputs for one size: random columns (encoded to resident
// Montgomery bytes) + fixed relation_parameters. Deterministic per (size, relation).
function buildInputs(n: number): { initColBytes: Uint8Array[]; relParamBytes: (Uint8Array | undefined)[] } {
  const initColBytes: Uint8Array[] = [];
  const relParamBytes: (Uint8Array | undefined)[] = [];
  for (const desc of ALL_RELATIONS) {
    const rng = makeRng((desc.seed ^ 0x5151_5151_5151n) + BigInt(n));
    relParamBytes[desc.relationIndex] = desc.makeParams ? packParams(desc.makeParams(rng)) : undefined;
    const cols = Array.from({ length: desc.numEdges }, () => Array.from({ length: n }, () => rng()));
    initColBytes[desc.relationIndex] = encodeColumnsToBytes(cols, n);
  }
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
 * Sweep `logNs` (e.g. [10,12,14,16]). For each size, time the WebGPU engine and the
 * WASM baseline, logging a row as it completes. Pipelines compile once (shared
 * cache + a warmup) so per-size GPU timing excludes shader compilation.
 */
export async function runBenchmark(device: GPUDevice, logNs: number[], log: Logger, onRow?: (row: BenchRow) => void): Promise<BenchRow[]> {
  const alpha = makeRng(0xb0_07_5eedn)();
  const cache: PipelineCache = new Map();
  const foldRunner: FoldRunner = await makeFoldRunner(device);
  const reduceRunner: ReduceRunner = await makeReduceRunner(device);
  const shared = { cache, foldRunner, reduceRunner };
  const wasm = await initWasm(log);
  if (wasm) log('info', `  WASM backend ready (bb.js threads)`);

  // Warmup at the smallest size to trigger all shader compiles into the cache.
  {
    const wn = 1 << Math.min(...logNs);
    const warm = buildInputs(wn);
    const wb = Array.from({ length: Math.round(Math.log2(wn)) }, (_, i) => makeRng(0x1234n + BigInt(i))());
    const wc = Array.from({ length: wb.length }, (_, i) => makeRng(0x9999n + BigInt(i))());
    await runResidentGpuSumcheck(device, wn, alpha, wb, wc, warm.relParamBytes, warm.initColBytes, shared);
  }

  const rows: BenchRow[] = [];
  for (const logN of logNs) {
    const n = 1 << logN;
    const betas = Array.from({ length: logN }, (_, i) => makeRng(0xbe7a_77n + BigInt(i))());
    const challenges = Array.from({ length: logN }, (_, i) => makeRng(0xc4a1_77n + BigInt(i))());
    const { initColBytes, relParamBytes } = buildInputs(n);

    const gpu = await runResidentGpuSumcheck(device, n, alpha, betas, challenges, relParamBytes, initColBytes, shared);
    const wasmMs = await runWasmSumcheck(wasm, logN);

    const row: BenchRow = {
      logN, n,
      webgpuGpuMs: gpu.gpuMs,
      webgpuWallMs: gpu.totalMs,
      wasmMs,
      speedup: wasmMs === null ? null : wasmMs / gpu.totalMs,
    };
    rows.push(row);
    onRow?.(row);
    log('ok', `  2^${logN}: WebGPU ${gpu.totalMs.toFixed(1)} ms (GPU ${gpu.gpuMs.toFixed(1)} ms · host: decode ${gpu.decodeMs.toFixed(0)}, scaling ${gpu.scalingMs.toFixed(0)}) · WASM ${wasmMs === null ? '—' : wasmMs.toFixed(1) + ' ms'}${row.speedup ? `  →  ${row.speedup.toFixed(2)}× ` : ''}`);
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
