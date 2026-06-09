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
import { type PipelineCache, type Logger, makeRng, packParams } from './harness.js';
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
    log('ok', `  2^${logN}: WebGPU ${gpu.totalMs.toFixed(1)} ms (GPU ${gpu.gpuMs.toFixed(1)} ms) · WASM ${wasmMs === null ? '—' : wasmMs.toFixed(1) + ' ms'}${row.speedup ? `  →  ${row.speedup.toFixed(2)}× ` : ''}`);
  }
  await wasm?.destroy();
  return rows;
}
