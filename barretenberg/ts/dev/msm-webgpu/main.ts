// In-browser MSM comparison harness for the BN254 WebGPU port.
//   Compares, for sizes 2^10..2^20 over a real prefix of the public SRS:
//     - WebGPU MSM via the v2 pair-tree pipeline (`MsmV2`, msm_v2.ts —
//       the memory-bounded carry-free-Booth / pair-tree / fused-reduction
//       port; runs on the warm path with a persistent GPUDevice, an MsmV2
//       rebuilt per logN, and one warm-up dispatch before timed runs)
//     - Barretenberg WASM Pippenger, multi-threaded (numThreads = hw)
//   The WASM path uses `bb_native_pippenger_bn254_load` (decode + upload
//   inputs, untimed) followed by `bb_native_pippenger_bn254_run` (the
//   timed `batch_multi_scalar_mul_native` compute) — direct WASM exports that
//   skip the BBERG_WEBGPU_MSM_HOOK delegation, since calling the regular batch
//   entry point from a hooked WASM would recurse back into the WebGPU
//   bridge. Splitting load from run keeps input-structure population out
//   of the measured window.
//
//   Noble correctness check runs only at log₂(n) = 16. At larger sizes
//   noble's bigint Pippenger is too slow to be a useful in-loop check.
//
// Layout assumptions (matches webgpu_msm_marshalling.hpp:marshal_points):
//   - `pointsBuf` is `n × 64` LE bytes: `[x_0[32] || y_0[32] || x_1[32] || y_1[32] || ...]`,
//     non-Montgomery, interleaved per point.
//   - `scalarsBuf` is `n × 32` LE bytes, non-Montgomery Fr.

import { bn254 } from '@noble/curves/bn254';

import { get_device } from '../../src/msm_webgpu/cuzk/gpu.js';
import { runMicrobench } from './microbench.js';
import { MsmV2, MsmV2Pool, type MsmConfig, pickC, MEM_BUDGET } from '../../src/msm_webgpu/msm_v2.js';
import { planBatch, computeGeom } from '../../src/msm_webgpu/batch_scheduler.js';
import { runUnionPacks, type BridgeDescriptor } from '../../src/msm_webgpu/bridge/union_runner.js';
import { WebGpuMsmHost } from '../../src/msm_webgpu/bridge/main.js';
import {
  createControlBuffer,
  OP_BATCH_MSM,
  OP_PUBLISH_SRS,
  SLOT_BATCH_LABELS_PTR,
  SLOT_BATCH_META_PTR,
  SLOT_N,
  SLOT_OPCODE,
  SLOT_POINTS_PTR,
  SLOT_RESULT_PTR,
  SLOT_SCALARS_PTR,
  SLOT_STATE,
  STATE_DONE,
} from '../../src/msm_webgpu/bridge/protocol.js';
import {
  computeMsbHistogram,
  chooseVarWindowSplit,
  buildVarWindowSchedule,
  effectiveNumBits,
  buildWindowDescReference,
} from '../../src/msm_webgpu/var_window_split.js';
import { createWasmPippenger, parseAffineLE, type WasmPippengerHandle } from './pippenger_wasm.js';
import { loadSrsPoints, type SrsEvent } from './srs.js';
import { makeResultsClient } from './results_post.js';

type LogLevel = 'info' | 'ok' | 'err' | 'warn';

// Per-rep profiling capture consumed by the sweep aggregator. `runWebGpuOnce`
// only ever produces `{ profile: null }` (MsmV2's own ProfileBreakdown is a
// different, flat shape), so the breakdown table renders empty GPU rows — this
// type just keeps the aggregation code compiling.
type ProfileCapture = {
  profile: { label: string; kind: string; ms: number }[] | null;
  cpu_phases?: { phases: { label: string; ms: number }[]; total_wall_ms: number };
  gpu_readback?: {
    gpu_compute_wall: number;
    profiled_passes_sum: number;
    untimestamped: number;
    readback_total?: number;
    mapasync_overhead?: number;
  };
};

const $log = document.getElementById('log') as HTMLDivElement;
const $progress = document.getElementById('srs-progress') as HTMLDivElement;
const $status = document.getElementById('status') as HTMLSpanElement;
const $run = document.getElementById('run') as HTMLButtonElement;
const $runBench = document.getElementById('run-bench') as HTMLButtonElement;
const $runSweep = document.getElementById('run-sweep') as HTMLButtonElement;
const $runSanity = document.getElementById('run-sanity') as HTMLButtonElement;
const $stop = document.getElementById('stop') as HTMLButtonElement;
const $logn = document.getElementById('logn') as HTMLInputElement;
const $nDisplay = document.getElementById('n-display') as HTMLSpanElement;
const $mtThreads = document.getElementById('mt-threads') as HTMLInputElement;
const $hwThreads = document.getElementById('hw-threads') as HTMLSpanElement;
const $noble = document.getElementById('noble') as HTMLInputElement;
const $results = document.getElementById('results') as HTMLDivElement;

// The sweep spans 2^10..2^20 — small sizes show where the GPU pipeline
// overtakes the WASM Pippenger; the v2 pipeline has no size floor.
const LOGN_MIN = 7;
const LOGN_MAX = 20;
const SRS_NUM_POINTS = 1 << LOGN_MAX;

const SWEEP_LOGN: number[] = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const NOBLE_REFERENCE_LOGN = 16;
const SWEEP_REPS = 5;

// GPU pipeline knobs from the URL — forwarded to every MsmV2 (unset = defaults).
// Lets index.html A/B-test a knob against the WASM Pippenger, e.g. ?s=4&wgi=128.
const gpuKnobs: MsmConfig = (() => {
  const q = new URLSearchParams(window.location.search);
  const optInt = (k: string): number | undefined => {
    const raw = q.get(k);
    if (raw === null) return undefined;
    const v = Number(raw);
    return Number.isInteger(v) && v > 0 ? v : undefined;
  };
  const optNum = (k: string): number | undefined => {
    const raw = q.get(k);
    if (raw === null) return undefined;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : undefined;
  };
  return {
    c: optInt('c'),
    s: optInt('s'),
    wgi: optInt('wgi'),
    reduceWg: optInt('reducewg'),
    l0Log: optInt('l0log'),
    invVariant: q.get('inv') === 'loop' ? 'loop' : q.get('inv') === 'pk' ? 'pk' : undefined,
    pk14Inverse: q.get('pk14') === '1' || undefined,
    montmul:
      q.get('montmul') === 'cios_unrolled' ? 'cios_unrolled' : q.get('montmul') === 'karat' ? 'karat' : undefined,
    jacobianCrossover: (() => {
      const raw = q.get('jaccross');
      if (raw === null) return undefined;
      const v = Number(raw);
      return Number.isInteger(v) ? v : undefined;
    })(),
    perLevelJac: q.get('perlevel') === '1' || undefined,
    highMemPingpong: q.get('himem') === '1' || undefined,
    pingpongBelow: optInt('ppbelow'),
    reduceSatThreshold: optInt('redsat'),
    convChunk: optInt('convc'),
    convertBound: optInt('convbound'),
    maxPlannerWorkgroups: optInt('mpw'),
    numBatchesOverride: optInt('nb'),
    budgetMiB: optInt('budgetmib'),
    varSched: q.get('varsched') === '1' || undefined,
    splitC: q.get('split') === '1' || q.get('autorun') === 'msm-msbhist' || undefined,
    sparseReduce: q.get('sparse_reduce') === '1' || undefined,
    reduceCostWeight: optNum('reduce_cost_weight'),
    maxCLo: optInt('max_clo'),
    forceSplit: (() => {
      const f = q.get('forcesplit');
      if (!f) return undefined;
      const parts = f.split(',').map(x => parseInt(x, 10));
      return parts.length === 3 && parts.every(x => x > 0) ? (parts as [number, number, number]) : undefined;
    })(),
    profile: q.get('profile') === '1' || q.get('autorun') === 'msm-bench' || q.get('autorun') === 'msm-trace' || undefined,
  };
})();

// Default to the machine's reported logical thread count, capped at
// MT_THREADS_MAX. Falls back to 4 if `navigator.hardwareConcurrency`
// is undefined.
const MT_THREADS_MAX = 32;
const MT_THREADS_DEFAULT = Math.min(MT_THREADS_MAX, navigator.hardwareConcurrency ?? 4);

// WASM heap maximum. A log₂(n)=20 MSM keeps ~96 MiB of decoded points +
// scalars resident (the load/run split holds them between calls), and on top
// of that the in-tree multithreaded Pippenger needs its working set while
// _load needs a transient ~96 MiB upload buffer — a sweep drives all of this
// through one worker. 256 MiB is not enough: log₂(n)=20 traps with
// `unreachable` mid-_load. 1 GiB is ample headroom. `maximum` only reserves
// shared-memory address space (cheap on 64-bit hosts) — physical pages are
// committed lazily as the heap grows. The wasm itself permits 4 GiB.
const WASM_MEM_INITIAL_PAGES = 256; //  16 MiB
const WASM_MEM_MAX_PAGES = 16384; // 1 GiB

// The dev page runs in two modes:
//   - Default (no `?coi=1`)        — no COOP/COEP set by the dev server.
//                                    WebGPU works. SharedArrayBuffer is
//                                    unavailable, so the threaded WASM
//                                    Pippenger path can't run.
//   - `?coi=1` in the URL          — Vite dev server emits COOP/COEP.
//                                    SharedArrayBuffer is available;
//                                    the WASM MT path comes online.
// We default to no-COI because adding COOP/COEP unconditionally was
// observed to break the WebGPU MSM in this dev page (see the original
// vite.config.ts comment); they're also unrelated to the WebGPU path.
const COI_REQUESTED = /[?&]coi=1\b/.test(window.location.search);
const COI_ACTIVE = (self as any).crossOriginIsolated === true;
const WASM_AVAILABLE = COI_ACTIVE;

let srsBuf: Uint8Array | null = null;
// One bb.js WASM worker hosts the multi-threaded Pippenger. It's lazy —
// created on the first action that needs it, torn down on Stop. bb's
// `parallel_for` pool is a function-static `ThreadPool(get_num_cpus() -
// 1)` sized on the first call and then locked, so the worker's thread
// count is fixed at boot. If you change the MT threads input
// mid-session, hit Stop first so the next click reboots at the new
// value.
let wasmMtPippenger: WasmPippengerHandle | null = null;
let wasmMtBootInFlight: Promise<WasmPippengerHandle> | null = null;
// Persistent WebGPU state. One GPUDevice is reused across every dispatch
// on the page; one MsmV2 (the v2 pair-tree pipeline — buffers, pipelines,
// the Montgomery-form SRS for the current logN) is held alongside it and
// rebuilt when logN changes. Without this, every dispatch would re-acquire
// a device and recompile every pipeline. MsmV2.create runs one warm-up
// dispatch so the first timed run doesn't pay shader JIT.
let gpuDevice: GPUDevice | null = null;
let msmV2: MsmV2 | null = null;
let msmV2Pool: MsmV2Pool | null = null;
let msmV2LogN: number | null = null;
// Cooperative cancellation flag for in-flight sweeps. The actual MSM
// call inside the WASM worker can't be preempted from JS, but we check
// this between reps / sizes so Stop becomes effective at the next yield.
let abortRequested = false;

function readLogN(): number {
  const raw = parseInt($logn.value, 10);
  if (!Number.isFinite(raw)) return 16;
  return Math.max(LOGN_MIN, Math.min(LOGN_MAX, raw));
}

function readMtThreads(): number {
  const raw = parseInt($mtThreads.value, 10);
  if (!Number.isFinite(raw)) return MT_THREADS_DEFAULT;
  return Math.max(1, Math.min(MT_THREADS_MAX, raw));
}

function updateNDisplay(): void {
  const logN = readLogN();
  const n = 1 << logN;
  $nDisplay.textContent = `(n = ${n.toLocaleString()})`;
}

$logn.addEventListener('input', updateNDisplay);
updateNDisplay();
$hwThreads.textContent = String(navigator.hardwareConcurrency ?? '?');
$mtThreads.value = String(MT_THREADS_DEFAULT);

function log(level: LogLevel, msg: string): void {
  const span = document.createElement('span');
  if (level !== 'info') span.className = level;
  span.textContent = msg + '\n';
  $log.appendChild(span);
  $log.scrollTop = $log.scrollHeight;
}

/**
 * Yield to the browser between steps. Lets the renderer paint pending
 * log lines, lets click handlers (Stop!) fire, lets the OS swap. We
 * keep individual steps short enough that 0 ms is enough; bumping to
 * 16 ms (one frame) when we expect a long pause coming up.
 */
async function yieldToBrowser(ms: number = 0): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, ms));
}

/** Log a memory-pressure snapshot if the browser exposes it (Chrome-only). */
function logMemSnapshot(label: string): void {
  // @ts-expect-error performance.memory is non-standard Chrome
  const mem = performance.memory as
    | { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
    | undefined;
  if (!mem) return;
  const mib = (b: number) => (b / 1024 / 1024).toFixed(0);
  log(
    'info',
    `[mem] ${label}: used=${mib(mem.usedJSHeapSize)} MiB, ` +
      `total=${mib(mem.totalJSHeapSize)} MiB, ` +
      `limit=${mib(mem.jsHeapSizeLimit)} MiB`,
  );
}

function setBusy(busy: boolean, text = ''): void {
  // SRS load gates everything (we slice from it). WASM boot is lazy —
  // buttons are enabled even before WASM exists; the first click triggers
  // the boot via ensureWasmBooted().
  const ready = srsBuf !== null;
  $runSanity.disabled = busy || !ready;
  // Sweep / Run / Run × 5 exercise the WASM paths in addition to WebGPU
  // — disable them when COI is off (the threaded WASM can't load without
  // SharedArrayBuffer). The user can still hit Quick Sanity Check to run
  // WebGPU on its own.
  $run.disabled = busy || !ready || !WASM_AVAILABLE;
  $runBench.disabled = busy || !ready || !WASM_AVAILABLE;
  $runSweep.disabled = busy || !ready || !WASM_AVAILABLE;
  // Stop is only meaningful while something is in flight, WASM is booted,
  // or a GPU context is alive (so the user can free GPU memory on demand).
  $stop.disabled = !busy && wasmMtPippenger === null && gpuDevice === null;
  $status.textContent = text;
}

/**
 * Boots the bb.js WASM worker lazily on first use. Subsequent calls
 * reuse the handle; concurrent callers await the same in-flight boot.
 * The worker is booted with the user-chosen multi-threaded count.
 */
async function ensureWasmBooted(): Promise<WasmPippengerHandle> {
  if (!WASM_AVAILABLE) {
    throw new Error(
      'WASM paths are disabled: page is not cross-origin isolated. ' +
        "Click 'Enable WASM (reload with COI)' to reload with COOP/COEP headers.",
    );
  }
  if (wasmMtPippenger !== null) return wasmMtPippenger;
  if (wasmMtBootInFlight !== null) return wasmMtBootInFlight;
  const threads = readMtThreads();
  // The thread count is captured at boot time; lock the input until the
  // handle is torn down so the displayed value matches what's live in
  // the worker.
  $mtThreads.disabled = true;
  log('info', `[wasm-boot] starting (threads=${threads}, ` + `max-mem=${(WASM_MEM_MAX_PAGES * 64) / 1024} MiB)`);
  logMemSnapshot('pre-wasm-boot');
  const t0 = performance.now();
  const boot = createWasmPippenger(threads, m => log('info', `[wasm-boot] ${m}`), {
    initialPages: WASM_MEM_INITIAL_PAGES,
    maxPages: WASM_MEM_MAX_PAGES,
  })
    .then(handle => {
      wasmMtPippenger = handle;
      log('ok', `[wasm-boot] ready (${handle.threads} threads, ` + `${(performance.now() - t0).toFixed(0)} ms)`);
      logMemSnapshot('post-wasm-boot');
      return handle;
    })
    .catch(err => {
      log('err', `[wasm-boot] failed: ${err instanceof Error ? err.message : String(err)}`);
      $mtThreads.disabled = false;
      throw err;
    })
    .finally(() => {
      wasmMtBootInFlight = null;
    });
  wasmMtBootInFlight = boot;
  return boot;
}

/**
 * Tear down the bb.js WASM (terminates the main bb worker and all
 * pthread sub-workers). Also flips the cooperative abort flag so any
 * in-flight sweep stops at its next yield point. Safe to call from a
 * click handler while runs are in flight.
 */
async function stopAndDestroyWasm(reason: string): Promise<void> {
  abortRequested = true;
  $status.textContent = `${reason}; stopping…`;
  const handle = wasmMtPippenger;
  wasmMtPippenger = null;
  if (handle !== null) {
    try {
      await handle.destroy();
    } catch (err) {
      log('warn', `[stop] destroy threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  $mtThreads.disabled = false;
  log('info', `[stop] WASM workers terminated`);
  // Tear down persistent WebGPU state too. Destroying the device
  // invalidates every buffer / pipeline it owns (MsmV2's included —
  // `msmV2.destroy()` on top is belt-and-braces). Next run lazily
  // re-creates everything via ensureWebGpuWarmed.
  if (msmV2 !== null || gpuDevice !== null) {
    try {
      msmV2?.destroy();
    } catch (err) {
      log('warn', `[stop/gpu] msmV2.destroy threw: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      gpuDevice?.destroy();
    } catch (err) {
      log('warn', `[stop/gpu] device.destroy threw: ${err instanceof Error ? err.message : String(err)}`);
    }
    msmV2 = null;
    msmV2LogN = null;
    gpuDevice = null;
    log('info', `[stop] GPU device destroyed`);
  }
}

$stop.addEventListener('click', async () => {
  $stop.disabled = true;
  await stopAndDestroyWasm('user clicked Stop');
  setBusy(false);
});

// Toggle between COI-on / COI-off by reloading with a different URL.
// Implemented as a reload because the COOP/COEP headers are only
// honoured by the browser at the moment the document is fetched.
const $toggleCoi = document.getElementById('toggle-coi') as HTMLButtonElement;
$toggleCoi.textContent = COI_ACTIVE ? 'Disable WASM (reload without COI)' : 'Enable WASM (reload with COI)';
$toggleCoi.addEventListener('click', () => {
  const url = new URL(window.location.href);
  if (COI_ACTIVE) {
    url.searchParams.delete('coi');
  } else {
    url.searchParams.set('coi', '1');
  }
  window.location.href = url.toString();
});

function throwIfAborted(): void {
  if (abortRequested) {
    throw new Error('aborted by Stop');
  }
}

// Bigint → 32 LE bytes. Throws on out-of-range to catch coordinate-pack
// bugs early (silent truncation would look like a GPU bug).
function biToLe32(v: bigint, label: string): Uint8Array {
  if (v < 0n || v >= 1n << 256n) {
    throw new Error(`${label} out of range for 32-byte LE: ${v}`);
  }
  const out = new Uint8Array(32);
  let x = v;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

const FR_ORDER = bn254.fields.Fr.ORDER;
// Deterministic-seed PRNG for cross-run reproducibility (debug only).
// Set via `?scalar_seed=N` URL param. When unset, falls back to crypto.
let scalarPrngState: number | null = null;
function maybeInitScalarPrng(): void {
  if (scalarPrngState !== null) return;
  const s = new URLSearchParams(window.location.search).get('scalar_seed');
  if (s === null) return;
  scalarPrngState = parseInt(s, 10) >>> 0 || 1;
  log('info', `[gen] using deterministic scalar PRNG with seed=${scalarPrngState}`);
}
function nextScalarPrngBytes(out: Uint8Array): void {
  let s = scalarPrngState as number;
  for (let i = 0; i < out.length; i += 4) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = s & 0xff;
    out[i + 1] = (s >>> 8) & 0xff;
    out[i + 2] = (s >>> 16) & 0xff;
    out[i + 3] = (s >>> 24) & 0xff;
  }
  scalarPrngState = s;
}
function randomFr(): bigint {
  maybeInitScalarPrng();
  for (;;) {
    const bytes = new Uint8Array(32);
    if (scalarPrngState !== null) {
      nextScalarPrngBytes(bytes);
    } else {
      crypto.getRandomValues(bytes);
    }
    bytes[31] &= 0x3f;
    let v = 0n;
    for (let i = 31; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
    if (v < FR_ORDER) return v;
  }
}

interface TestInputs {
  n: number;
  points: { x: bigint; y: bigint }[] | null;
  scalars: bigint[] | null;
  pointsBuf: Uint8Array;
  scalarsBuf: Uint8Array;
}

function readSrsPointAt(buf: Uint8Array, i: number): { x: bigint; y: bigint } {
  const off = i * 64;
  let x = 0n;
  for (let k = 31; k >= 0; k--) x = (x << 8n) | BigInt(buf[off + k]);
  let y = 0n;
  for (let k = 31; k >= 0; k--) y = (y << 8n) | BigInt(buf[off + 32 + k]);
  return { x, y };
}

// Takes log₂(n), not n. This was a footgun in the previous shape that
// took `n` directly — callers always have a `logN` variable in scope and
// it's easy to forget the `1 << logN` conversion, producing a tiny
// logN-point MSM instead of a 2^logN-point one.
async function generateInputs(logN: number, mirrorForNoble: boolean): Promise<TestInputs> {
  if (srsBuf === null) {
    throw new Error('[gen] SRS not loaded yet — wait for the [srs] ready line');
  }
  // ?msm_dump=<name> — load real production scalars dumped from bb prove (header
  // u64 n, then n×32 LE canonical Fr — already the GPU's non-Montgomery format).
  // Points come from the SRS; arbitrary (non-power-of-2) n. Used to bench/cross-
  // check the GPU on the actual Chonk wire-commit distributions.
  const dumpName = new URLSearchParams(window.location.search).get('msm_dump');
  if (dumpName) {
    const resp = await fetch(`/dev/msm-webgpu/dumps/${dumpName}.bin`);
    if (!resp.ok) throw new Error(`[gen] dump '${dumpName}' not found (${resp.status})`);
    const ab = await resp.arrayBuffer();
    const dn = Number(new DataView(ab).getBigUint64(0, true));
    if (dn * 64 > srsBuf.length) throw new Error(`[gen] dump n=${dn} exceeds SRS (${srsBuf.length / 64} pts)`);
    const scalarsBuf = new Uint8Array(ab.slice(8, 8 + dn * 32));
    const pointsBuf = new Uint8Array(srsBuf.buffer, srsBuf.byteOffset, dn * 64);
    log('info', `[gen] loaded MSM dump '${dumpName}': n=${dn.toLocaleString()}`);
    return { n: dn, points: null, scalars: null, pointsBuf, scalarsBuf };
  }
  if (logN < LOGN_MIN || logN > LOGN_MAX) {
    throw new Error(`[gen] logN=${logN} outside the supported [${LOGN_MIN}, ${LOGN_MAX}] range`);
  }
  const n = 1 << logN;
  if (n * 64 > srsBuf.length) {
    throw new Error(`[gen] requested ${n} points but SRS only has ${srsBuf.length / 64}; bump LOGN_MAX`);
  }

  log('info', `[gen] preparing ${n} SRS points + ${n} random scalars…`);
  const t0 = performance.now();

  const pointsBuf = new Uint8Array(srsBuf.buffer, srsBuf.byteOffset, n * 64);

  const points = mirrorForNoble ? new Array<{ x: bigint; y: bigint }>(n) : null;
  const scalars = mirrorForNoble ? new Array<bigint>(n) : null;
  if (mirrorForNoble) {
    for (let i = 0; i < n; i++) points![i] = readSrsPointAt(srsBuf, i);
  }

  // Scalar distribution modes:
  //   ?scalar_dist=uniform                  (default) — random Fr per input
  //   ?scalar_dist=clustered&num_distinct=K — K distinct values, sampled
  //                                          across n inputs (stresses high-N)
  //   ?scalar_dist=profile&profile=[A-E]    — canonical msm_v2_ptr_bench
  //                                          profiles A/B/C/D/E from
  //                                          aztec-packages/.../msm_v2_ptr_bench.ts:
  //     A: 100% random
  //     B: 30% small (< 2^14) + 70% random
  //     C: 80% small + 20% random
  //     D: 50% random + 50% in {0,1,2,3}
  //     E: 100% in [0, 16)
  const distMode = new URLSearchParams(window.location.search).get('scalar_dist') ?? 'uniform';
  const scalarBytes = new Uint8Array(n * 32);
  const smallScalar = (maxExclusive: number): bigint => BigInt(Math.floor(Math.random() * maxExclusive));
  if (distMode === 'clustered') {
    const Kparam = new URLSearchParams(window.location.search).get('num_distinct');
    const K = Math.max(1, Math.min(n, parseInt(Kparam ?? String(Math.max(1, n >> 8)), 10) || n >> 8));
    log('info', `[gen] clustered scalars: ${K} distinct values sampled across ${n} inputs`);
    const pool = new Array<bigint>(K);
    for (let j = 0; j < K; j++) pool[j] = randomFr();
    for (let i = 0; i < n; i++) {
      const j = Math.floor(Math.random() * K);
      const s = pool[j];
      if (mirrorForNoble) scalars![i] = s;
      scalarBytes.set(biToLe32(s, `scalar[${i}]`), i * 32);
    }
  } else if (distMode === 'profile') {
    const profile = (new URLSearchParams(window.location.search).get('profile') ?? 'A').toUpperCase();
    log('info', `[gen] profile=${profile}`);
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      let s: bigint;
      if (profile === 'A') {
        s = randomFr();
      } else if (profile === 'B') {
        s = r < 0.3 ? smallScalar(1 << 14) : randomFr();
      } else if (profile === 'C') {
        s = r < 0.8 ? smallScalar(1 << 14) : randomFr();
      } else if (profile === 'D') {
        s = r < 0.5 ? smallScalar(4) : randomFr();
      } else {
        s = smallScalar(16);
      }
      if (mirrorForNoble) scalars![i] = s;
      scalarBytes.set(biToLe32(s, `scalar[${i}]`), i * 32);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const s = randomFr();
      if (mirrorForNoble) scalars![i] = s;
      scalarBytes.set(biToLe32(s, `scalar[${i}]`), i * 32);
    }
  }

  log('info', `[gen] done in ${(performance.now() - t0).toFixed(0)} ms`);
  return { n, points, scalars, pointsBuf, scalarsBuf: scalarBytes };
}

function referenceMsm(points: { x: bigint; y: bigint }[], scalars: bigint[]): { x: bigint; y: bigint } {
  log('info', `[noble] computing reference MSM on CPU (noble pippenger)…`);
  const t0 = performance.now();
  const projPoints = points.map(p => bn254.G1.ProjectivePoint.fromAffine(p));
  const result = bn254.G1.ProjectivePoint.msm(projPoints, scalars);
  const aff = result.toAffine();
  log('info', `[noble] done in ${(performance.now() - t0).toFixed(0)} ms`);
  return aff;
}

function pointsEqual(a: { x: bigint; y: bigint }, b: { x: bigint; y: bigint }): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Lazily bring the WebGPU side to a warmed-up `MsmV2` for `inputs.n`:
 *   1. Acquire a `GPUDevice` on first call (reused across every dispatch).
 *   2. When n changes, build an `MsmV2Pool` (upload the SRS slice + GPU-convert
 *      it to Montgomery form) and an `MsmV2` bound to it — compiles the v2
 *      pair-tree pipelines and runs warm-up dispatches so the next run pays
 *      no JIT.
 */
async function ensureWebGpuWarmed(inputs: TestInputs): Promise<MsmV2> {
  const logN = Math.log2(inputs.n);
  if (gpuDevice === null) {
    log('info', '[gpu-warm] acquiring GPUDevice (one-time)');
    const t0 = performance.now();
    gpuDevice = await get_device();
    log('ok', `[gpu-warm] device ready in ${(performance.now() - t0).toFixed(0)} ms`);
  }
  if (msmV2 === null || msmV2LogN !== logN) {
    if (msmV2 !== null) {
      log('info', `[gpu-warm] logN changed (${msmV2LogN} → ${logN}); rebuilding MsmV2`);
      msmV2.destroy();
      msmV2Pool?.destroy();
      msmV2 = null;
      msmV2Pool = null;
      msmV2LogN = null;
    }
    const knobStr = Object.entries(gpuKnobs)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    log('info', `[gpu-warm] building MsmV2 for ${inputs.n.toLocaleString()} points${knobStr ? ` [${knobStr}]` : ''}`);
    const t0 = performance.now();
    msmV2Pool = await MsmV2Pool.create(gpuDevice, inputs.pointsBuf);
    msmV2 = await MsmV2.create(gpuDevice, inputs.n, msmV2Pool, gpuKnobs);
    msmV2LogN = logN;
    log('ok', `[gpu-warm] MsmV2 ready in ${(performance.now() - t0).toFixed(0)} ms`);
  }
  return msmV2;
}

// Measured GPU<->CPU clock calibration (NOT fitted to counters). Bracket each tiny GPU dispatch
// between two CPU timestamps (REALTIME ns, convertible to the AGI counter clock MONOTONIC_RAW via
// the trace's clock snapshot): the dispatch's own GPU begin/end timestamps must fall inside that
// CPU bracket, so across many samples the brackets pin Dawn's GPU->CPU calibration offset directly.
// Returns [cpu_before_ns, gpu_begin, gpu_end, cpu_after_ns] per sample.
async function calibrateClock(device: GPUDevice, N = 96): Promise<Array<[string, string, string, string]>> {
  const mod = device.createShaderModule({ code: '@compute @workgroup_size(1) fn main() {}' });
  const pipe = await device.createComputePipelineAsync({
    layout: 'auto',
    compute: { module: mod, entryPoint: 'main' },
  });
  const qs = device.createQuerySet({ type: 'timestamp', count: 2 });
  const resolve = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
  const out: Array<[string, string, string, string]> = [];
  for (let i = 0; i < N; i++) {
    const stage = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass({
      timestampWrites: { querySet: qs, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 },
    });
    pass.setPipeline(pipe);
    pass.dispatchWorkgroups(1);
    pass.end();
    enc.resolveQuerySet(qs, 0, 2, resolve, 0);
    enc.copyBufferToBuffer(resolve, 0, stage, 0, 16);
    const tBefore = (performance.timeOrigin + performance.now()) * 1e6; // REALTIME ns
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
    const tAfter = (performance.timeOrigin + performance.now()) * 1e6;
    await stage.mapAsync(GPUMapMode.READ);
    const ts = new BigUint64Array(stage.getMappedRange().slice(0));
    stage.unmap();
    stage.destroy();
    out.push([Math.round(tBefore).toString(), ts[0].toString(), ts[1].toString(), Math.round(tAfter).toString()]);
  }
  qs.destroy();
  resolve.destroy();
  return out;
}

async function runWebGpuOnce(
  inputs: TestInputs,
): Promise<{ ms: number; xy: { x: bigint; y: bigint }; capture: ProfileCapture }> {
  if (!('gpu' in navigator)) {
    throw new Error('navigator.gpu is undefined — no WebGPU in this browser');
  }
  const msm = await ensureWebGpuWarmed(inputs);
  log('info', `[gpu] dispatch n=${inputs.n.toLocaleString()}`);
  // Plan the level tree for these scalars + (re)build the data-dependent
  // buffers — untimed setup, outside the `t0` window.
  msm.prepare(inputs.scalarsBuf);
  // prepare() reallocates every data-dependent buffer; the first run() on
  // those fresh buffers pays a one-time first-use cost (driver lazy
  // zero-init / first-touch). Warm it out of the timed window so the
  // measurement is steady-state GPU, matching the bench's reused buffers.
  // Reset the per-pass timestamp accumulator so this rep's aligned-trace
  // slices cover BOTH the warm-up and measured run() (run() appends).
  (window as unknown as { __lastPassTimes?: Array<[string, string, string]> }).__lastPassTimes = [];
  await msm.run();
  const t0 = performance.now();
  const gpu = await msm.run();
  const ms = performance.now() - t0;
  log('info', `[gpu] returned in ${ms.toFixed(1)} ms`);
  // MsmV2 does not emit a per-pass GPU profile; the breakdown table skips
  // a null-profile capture, so the GPU column there simply renders empty.
  return { ms, xy: gpu, capture: { profile: null } };
}

/**
 * Multi-MSM batch-check (MULTI_MSM_PLAN.md step 4, runtime side): run K MSMs both
 * solo and as ONE concatenated super-MSM through `MsmV2.prepareBatch`, and assert
 * each member's per-window GPU output is byte-identical between the two. This is
 * the real multi-MSM path — a SINGLE dispatch over the union of all members'
 * windows (global-window bid + table-driven kernels), not K coexisting `MsmV2`
 * instances (which tripped Dawn's submit-while-destroyed lifecycle). At K=1 it is
 * the batch-of-1 ≡ single-MSM invariant; at K>1 it is batch-of-K ≡ K-separate.
 * The union packs one size class, so members must be homogeneous (same n) — drive
 * K>1 with a repeated logN, e.g. `?logns=16,16`.
 */
interface PackMeasurement {
  ok: boolean;
  detail: string;
  ns: number[];
  totalWindows: number;
  footprintMiB: number;
  heterogeneous: boolean;
  reps: number;
  soloWallMs: number; // Σ_k median(member_k run wall)
  soloGpuMs: number; // Σ_k median(member_k GPU-compute)
  unionWallMs: number; // median(union run wall)
  unionGpuMs: number; // median(union GPU-compute)
  soloPhaseMs: Record<string, number>; // Σ_k median(member_k per-stage GPU)
  unionPhaseMs: Record<string, number>; // median(union per-stage GPU)
}

// Canonical pipeline-stage order for the per-stage attribution table (the coarse
// phase labels `MsmV2.run()` writes to `window.__lastPhaseMs` via `setPhase` in
// encodeIntoBatch — distinct from the finer `profiler.stage` STAGE_ORDER above,
// which the encodeIntoBatch refactor no longer populates).
const BATCH_STAGE_ORDER = [
  'preprocess',
  'planner',
  'accumulate',
  'size1',
  'stream_walker',
  'walker_index',
  'combine_batched',
  'pt_init',
  'pt_loop',
  'pt_finalize',
  'reduce',
  'misc',
];

// The per-stage GPU ms of the LAST run() (timestamp-query, summed per phase). run()
// writes this global when profile mode is on; Σ over phases == readProfileGpuMs().
function readLastPhaseMs(): Record<string, number> {
  return { ...((window as unknown as { __lastPhaseMs?: Record<string, number> }).__lastPhaseMs ?? {}) };
}

// Reduce `reps` per-stage records to the median total GPU ms and the median ms per
// stage. Median is taken independently per stage and on the summed total, so the
// reported total may differ slightly from Σ(stage medians) — that's intended (each
// is the robust central estimate of its own quantity).
function reducePhaseReps(repsRecs: Record<string, number>[]): { totalMs: number; phaseMs: Record<string, number> } {
  const phases = new Set<string>();
  for (const r of repsRecs) for (const k of Object.keys(r)) phases.add(k);
  const phaseMs: Record<string, number> = {};
  for (const ph of phases) phaseMs[ph] = median(repsRecs.map(r => r[ph] ?? 0));
  const totalMs = median(repsRecs.map(r => Object.values(r).reduce((a, b) => a + b, 0)));
  return { totalMs, phaseMs };
}

// Measure one pack of K MSMs (given as a list of logN) two ways: each member run
// SOLO on its own isolated instance (Σ = the K-separate cost), and as the
// concatenated UNION (one MsmV2 over Σ NW windows, a single dispatch). Returns the
// median-over-`reps` wall AND GPU-compute time for both, plus the byte-identical
// union≡solo verdict. GPU-compute time (timestamp-query) isolates the saturation /
// throughput win from the launch+mapAsync amortisation that wall time also folds in:
// the GPU runs K-separate (or one batched-encoder's) passes sequentially, so Σ solo
// GPU ≈ the current bridge's GPU cost — union GPU vs Σ solo GPU is the genuine win.
async function measurePack(device: GPUDevice, logNs: number[], reps: number): Promise<PackMeasurement> {
  // Force GPU timestamps on regardless of the URL `?profile=` (overloaded for the
  // scalar-distribution A–E selector); the bench always wants per-pass GPU ms.
  const cfg: MsmConfig = { ...gpuKnobs, profile: true };

  const ns: number[] = [];
  const scalars: Uint8Array[] = [];
  let poolPoints: Uint8Array | null = null;
  let poolPointsN = -1;
  const soloWS: { x: bigint; y: bigint }[][] = [];
  let soloWallMs = 0;
  let soloGpuMs = 0;
  const soloPhaseMs: Record<string, number> = {};

  // ── Solo baselines on ISOLATED pools (one pool+instance per MSM, fully
  // independent), each timed over `reps` runs after a warm-up. prepare()'s slow
  // path destroys+recreates the instance's own prepBuffers, so an isolated pool
  // per member avoids the shared-pool lifecycle entirely for the reference.
  for (const logN of logNs) {
    const inp = await generateInputs(logN, false);
    ns.push(inp.n);
    scalars.push(inp.scalarsBuf);
    if (inp.n > poolPointsN) {
      poolPoints = inp.pointsBuf;
      poolPointsN = inp.n;
    }
    const soloPool = await MsmV2Pool.create(device, inp.pointsBuf);
    const soloInst = await MsmV2.create(device, inp.n, soloPool, cfg);
    try {
      soloInst.prepare(inp.scalarsBuf);
      await soloInst.run(); // warm-up: first-touch zero-init out of the timed window
      const walls: number[] = [];
      const phaseRecs: Record<string, number>[] = [];
      let ws: { x: bigint; y: bigint }[] = [];
      for (let r = 0; r < reps; r++) {
        const t0 = performance.now();
        ws = (await soloInst.run()).windowSums;
        walls.push(performance.now() - t0);
        phaseRecs.push(readLastPhaseMs());
      }
      const { totalMs, phaseMs } = reducePhaseReps(phaseRecs);
      soloWallMs += median(walls);
      soloGpuMs += totalMs;
      for (const ph of Object.keys(phaseMs)) soloPhaseMs[ph] = (soloPhaseMs[ph] ?? 0) + phaseMs[ph];
      soloWS.push(ws);
    } finally {
      soloInst.destroy();
      soloPool.destroy();
    }
  }

  // ── Union pass: ONE MsmV2 over the concatenated super-MSM, one dispatch over
  // Σ NW windows. Members of arbitrary n/c pack with no padding (point_offsets +
  // per-window table). The instance is created at the pack's max n so its baked
  // BW/stride/c are the envelope maxima. Shared SRS prefix (srsOffset 0).
  const maxN = Math.max(...ns);
  const heterogeneous = !ns.every(x => x === maxN);
  const pool = await MsmV2Pool.create(device, poolPoints!);
  const inst = await MsmV2.create(device, maxN, pool, cfg);
  try {
    const plan = planBatch(ns.map(n => ({ n, srsOffset: 0 })));
    const concat = new Uint8Array(plan.totalScalarBytes);
    for (let k = 0; k < scalars.length; k++) concat.set(scalars[k], plan.descs[k].scalarBase);
    const members = plan.descs.map(d => ({
      n: d.n,
      scalarBaseBytes: d.scalarBase,
      schedOff: d.schedOff,
      numWindows: d.numWindows,
    }));
    inst.prepareBatch(members, concat, plan.windowDescTable, plan.reduceOffsets);
    await inst.run(); // warm-up
    const walls: number[] = [];
    const phaseRecs: Record<string, number>[] = [];
    let union: { x: bigint; y: bigint }[] = [];
    for (let r = 0; r < reps; r++) {
      const t0 = performance.now();
      union = (await inst.run()).windowSums; // Σ NW windows; member k at schedOff_k
      walls.push(performance.now() - t0);
      phaseRecs.push(readLastPhaseMs());
    }
    const { totalMs: unionGpuMs, phaseMs: unionPhaseMs } = reducePhaseReps(phaseRecs);

    const diffs: string[] = [];
    for (let k = 0; k < plan.descs.length; k++) {
      const off = plan.descs[k].schedOff;
      const solo = soloWS[k];
      for (let w = 0; w < solo.length; w++) {
        const u = union[off + w];
        if (!u || u.x !== solo[w].x || u.y !== solo[w].y) {
          diffs.push(
            `msm${k} n=${ns[k]} window ${w}: union.x=${(u?.x ?? 0n).toString(16).slice(0, 12)} != solo.x=${solo[w].x.toString(16).slice(0, 12)}`,
          );
          break;
        }
      }
    }
    // The per-member union≡solo check only exercises scalarBase if the members
    // actually have distinct scalars — otherwise member k reading member 0's
    // region would pass vacuously. Assert distinctness so the validation is real.
    const distinct =
      plan.descs.length < 2 || soloWS.some(ws => ws[0].x !== soloWS[0][0].x || ws[0].y !== soloWS[0][0].y);
    const ok = distinct && diffs.length === 0;
    const detail = !distinct
      ? `members had identical scalars — scalarBase NOT exercised (re-run without a fixed scalar_seed)`
      : ok
        ? `all ${plan.descs.length} members byte-identical union≡solo (windows=${plan.totalWindows}, distinct scalars)`
        : diffs.slice(0, 5).join(' | ');

    return {
      ok,
      detail,
      ns,
      totalWindows: plan.totalWindows,
      footprintMiB: plan.footprintBytes / (1 << 20),
      heterogeneous,
      reps,
      soloWallMs,
      soloGpuMs,
      unionWallMs: median(walls),
      unionGpuMs,
      soloPhaseMs,
      unionPhaseMs,
    };
  } finally {
    inst.destroy();
    pool.destroy();
  }
}

async function runBatchCheck(logNs: number[]): Promise<{ ok: boolean; detail: string }> {
  if (gpuDevice === null) gpuDevice = await get_device();
  const device = gpuDevice;
  const reps = Math.max(1, parseInt(new URLSearchParams(window.location.search).get('reps') ?? '5', 10));
  const m = await measurePack(device, logNs, reps);
  log(
    'info',
    `[batch-check] ${logNs.length} MSMs n=[${m.ns.join(', ')}] totalWindows=${m.totalWindows} ` +
      `footprint=${m.footprintMiB.toFixed(1)}MiB reps=${reps}${m.heterogeneous ? ' (heterogeneous, no padding)' : ''}`,
  );
  log(
    'info',
    `[batch-check] perf: union wall=${m.unionWallMs.toFixed(2)}ms gpu=${m.unionGpuMs.toFixed(2)}ms vs ` +
      `${logNs.length}× solo wall=${m.soloWallMs.toFixed(2)}ms gpu=${m.soloGpuMs.toFixed(2)}ms | ` +
      `wall-speedup=${(m.soloWallMs / m.unionWallMs).toFixed(2)}× gpu-throughput=${(m.soloGpuMs / m.unionGpuMs).toFixed(2)}×`,
  );
  // Per-stage attribution: which pipeline stages saturate under packing. `×` is the
  // per-stage throughput (Σ-soloGPU/unionGPU); `%` is the stage's share of the union
  // GPU total (where the packed pipeline now spends its time).
  log('info', `[batch-check] per-stage GPU ms (Σ-solo → union | throughput× | union-share%):`);
  const extraPhases = Object.keys(m.unionPhaseMs).filter(p => !BATCH_STAGE_ORDER.includes(p));
  for (const ph of [...BATCH_STAGE_ORDER, ...extraPhases]) {
    const s = m.soloPhaseMs[ph] ?? 0;
    const u = m.unionPhaseMs[ph] ?? 0;
    if (s < 0.005 && u < 0.005) continue;
    const sp = u > 0 ? s / u : 0;
    const share = m.unionGpuMs > 0 ? (100 * u) / m.unionGpuMs : 0;
    log(
      'info',
      `    ${ph.padEnd(15)} ${s.toFixed(2).padStart(7)} → ${u.toFixed(2).padStart(6)} | ` +
        `${sp.toFixed(2).padStart(5)}× | ${share.toFixed(0).padStart(3)}%`,
    );
  }
  return { ok: m.ok, detail: m.detail };
}

// Validate the BRIDGE's union plumbing (descriptor decode → candidate split →
// pack → scalars-reorder → prepareBatch → per-member scatter) end-to-end against
// the production `runUnionPacks` core — the SAME function `bridge/main.ts` calls.
// The union MATH is already byte-identical (`runBatchCheck`); this exercises the
// NEW plumbing risk the bridge adds, deterministically:
//   • a global scalars region laid out in REVERSE descriptor order, so each
//     descriptor's `scalarsOff` ≠ planBatch's per-pack `scalarBase` — a runner
//     that wrongly assumed contiguity reads the wrong member's scalars and fails;
//   • a trailing `srsOffset≠0` member, which MUST be excluded from packs and
//     surface in `fallback` (the per-MSM path owns it);
//   • every packable member's scattered per-window sums asserted byte-identical
//     to its isolated solo run (transitively oracle-validated).
async function runBridgeCheck(logNs: number[]): Promise<{ ok: boolean; detail: string }> {
  if (gpuDevice === null) gpuDevice = await get_device();
  const device = gpuDevice;
  const qp = new URLSearchParams(window.location.search);
  const budgetMiB = parseInt(qp.get('bridge_budget_mib') ?? '', 10);
  const budgetBytes = Number.isFinite(budgetMiB) && budgetMiB > 0 ? budgetMiB * (1 << 20) : MEM_BUDGET;
  const cfg: MsmConfig = { ...gpuKnobs, combineOnHost: false, profile: false, warmupRuns: 0 };

  // ── Members (mixed n). pointsBuf is the SRS prefix [0,n) — the same points a
  // solo run sees, so union-vs-solo is byte-comparable.
  const members: { n: number; scalars: Uint8Array; pointsBuf: Uint8Array }[] = [];
  let maxN = 0;
  let poolPoints: Uint8Array | null = null;
  for (const logN of logNs) {
    const inp = await generateInputs(logN, false);
    members.push({ n: inp.n, scalars: inp.scalarsBuf, pointsBuf: inp.pointsBuf });
    if (inp.n > maxN) {
      maxN = inp.n;
      poolPoints = inp.pointsBuf;
    }
  }

  // ── Solo baselines on isolated pools (the reference each member must match).
  const soloWS: { x: bigint; y: bigint }[][] = [];
  for (const m of members) {
    const soloPool = await MsmV2Pool.create(device, m.pointsBuf);
    const soloInst = await MsmV2.create(device, m.n, soloPool, cfg);
    try {
      soloInst.prepare(m.scalars);
      soloWS.push((await soloInst.run()).windowSums);
    } finally {
      soloInst.destroy();
      soloPool.destroy();
    }
  }

  // ── Descriptors: the K members (srsOffset=0, packable) + one trailing excluded
  // member (reserved≠0, off-SRS, must fall back — the only exclusion now that the
  // union handles srsOffset by grouping). Scalars are placed in the global region in
  // REVERSE descriptor order so scalarsOff ≠ planBatch scalarBase.
  const excludedIdx = members.length;
  const descMeta: { n: number; srsOffset: number; reserved: number; scalars: Uint8Array }[] = [
    ...members.map(m => ({ n: m.n, srsOffset: 0, reserved: 0, scalars: m.scalars })),
    { n: members[0].n, srsOffset: 0, reserved: 1, scalars: members[0].scalars },
  ];
  const lens = descMeta.map(d => d.n * 32);
  const totalScalarBytes = lens.reduce((a, b) => a + b, 0);
  // Reverse layout: descriptor i lives after every LATER descriptor's bytes.
  const scalarsOffOf = (i: number): number => lens.slice(i + 1).reduce((a, b) => a + b, 0);
  const globalScalars = new Uint8Array(totalScalarBytes);
  const descriptors: BridgeDescriptor[] = descMeta.map((d, i) => {
    const off = scalarsOffOf(i);
    globalScalars.set(d.scalars, off);
    return { n: d.n, srsOffset: d.srsOffset, scalarsOff: off, resultOff: i * 64, reserved: d.reserved };
  });
  const readScalars = (off: number, byteLen: number): Uint8Array => globalScalars.subarray(off, off + byteLen);

  // ── Union path via the production core. One cached instance per pack max-n,
  // bound to the shared srsN-sized pool (so srsBytes is real — the srsBytes trap).
  const pool = await MsmV2Pool.create(device, poolPoints!);
  const srsBytes = pool.srsBudgetBytes();
  const unionCache = new Map<number, MsmV2>();
  const getUnionMsm = async (m: number): Promise<MsmV2> => {
    const hit = unionCache.get(m);
    if (hit) return hit;
    const inst = await MsmV2.create(device, m, pool, cfg);
    unionCache.set(m, inst);
    return inst;
  };

  try {
    const out = await runUnionPacks(getUnionMsm, descriptors, readScalars, { srsBytes, budgetBytes });

    const diffs: string[] = [];
    // The excluded member must be the (only) fallback.
    if (out.fallback.length !== 1 || out.fallback[0] !== excludedIdx) {
      diffs.push(`fallback expected [${excludedIdx}] got [${out.fallback.join(',')}]`);
    }
    // Every packable member's result must be byte-identical to its solo run.
    const seen = new Set<number>();
    for (const r of out.results) {
      seen.add(r.descIdx);
      const solo = soloWS[r.descIdx];
      if (r.windows.length !== solo.length) {
        diffs.push(`msm${r.descIdx}: ${r.windows.length} windows vs solo ${solo.length}`);
        continue;
      }
      for (let w = 0; w < solo.length; w++) {
        if (r.windows[w].x !== solo[w].x || r.windows[w].y !== solo[w].y) {
          diffs.push(
            `msm${r.descIdx} n=${members[r.descIdx].n} window ${w}: ` +
              `union.x=${r.windows[w].x.toString(16).slice(0, 12)} != solo.x=${solo[w].x.toString(16).slice(0, 12)}`,
          );
          break;
        }
      }
    }
    for (let k = 0; k < members.length; k++) {
      if (!seen.has(k)) diffs.push(`msm${k} missing from union results`);
    }
    // Distinct-scalars guard so the reverse-layout scalarBase isn't validated vacuously.
    const distinct = members.length < 2 || soloWS.some(ws => ws[0].x !== soloWS[0][0].x || ws[0].y !== soloWS[0][0].y);
    if (!distinct) diffs.push('members had identical scalars — scalarBase NOT exercised (drop the scalar_seed)');

    const ok = diffs.length === 0;
    const detail = ok
      ? `${out.results.length} members byte-identical union≡solo across ${out.packCount} pack(s) ` +
        `(${out.totalUnionWindows} union windows, ${excludedIdx} excluded→fallback, reverse-layout reorder, budget=${(budgetBytes / (1 << 20)).toFixed(0)}MiB)`
      : diffs.slice(0, 6).join(' | ');
    return { ok, detail };
  } finally {
    for (const inst of unionCache.values()) inst.destroy();
    pool.destroy();
  }
}

// End-to-end BRIDGE acceptance: drive the REAL `WebGpuMsmHost.runBatchMsm` (the
// production class wired into Chonk via setup.ts) over a synthetic WASM memory +
// control SAB, and assert the union path writes the result + meta regions
// BYTE-IDENTICALLY to the legacy per-MSM path. The proof is a pure function of
// those regions, so byte-identical here ⇒ identical proof — the acceptance gate,
// isolated to the bridge (no full C++ prove needed). Exercises the real descriptor
// decode from WASM, the real scalars-region reads, the candidate split + fallback
// (a trailing srsOffset≠0 member), and the per-member scatter back to WASM.
async function runBridgeE2E(logNs: number[]): Promise<{ ok: boolean; detail: string }> {
  if (srsBuf === null) throw new Error('[bridge-e2e] SRS not loaded yet');
  const align4 = (x: number): number => (x + 3) & ~3;

  // Descriptors: a srsOffset=0 group + a MULTI-member srsOffset=1 group (the real
  // Chonk shape — shifted-wire commitments cluster at srsOffset=1) + a singleton
  // srsOffset=2. The union groups by srsOffset and folds each group's offset into the
  // point-fetch base; points are the published SRS prefix [srsOffset, +n).
  const memberNs = logNs.map(l => 1 << l);
  const maxN = Math.max(...memberNs);
  const srsN = maxN;
  if (srsN * 64 > srsBuf.length) throw new Error(`[bridge-e2e] srsN=${srsN} exceeds loaded SRS`);
  const fit = (n: number, off: number): number => Math.max(1, Math.min(n, srsN - off));
  const descs: { n: number; srsOffset: number }[] = [
    ...memberNs.map(n => ({ n, srsOffset: 0 })),
    ...memberNs.map(n => ({ n: fit(n, 1), srsOffset: 1 })), // multi-member srsOffset=1 group
    { n: fit(1 << 10, 2), srsOffset: 2 },
  ];
  const batchCount = descs.length;
  const nws = descs.map(d => computeGeom(d.n).numWindows);

  // Random scalars per descriptor (high byte zeroed ⇒ < r). Same bytes feed both
  // runs (one shared memory), so this validates the union vs legacy contract, not
  // an oracle — legacy is the trusted, oracle-validated production path.
  const scalarsPer = descs.map(d => {
    const b = new Uint8Array(d.n * 32);
    for (let off = 0; off < b.length; off += 65536)
      crypto.getRandomValues(b.subarray(off, Math.min(off + 65536, b.length)));
    for (let i = 0; i < d.n; i++) b[i * 32 + 31] = 0;
    return b;
  });

  // ── WASM-memory layout: SRS | scalars | results | meta | descriptors.
  const srsBytes = srsN * 64;
  const scalarOffs: number[] = [];
  let sAcc = 0;
  for (const d of descs) {
    scalarOffs.push(sAcc);
    sAcc += d.n * 32;
  }
  const resultOffs: number[] = [];
  let rAcc = 0;
  for (const nw of nws) {
    resultOffs.push(rAcc);
    rAcc += nw * 64;
  }
  const srsPtr = 0;
  const scalarsBase = align4(srsPtr + srsBytes);
  const resultsBase = align4(scalarsBase + sAcc);
  const metaBase = align4(resultsBase + rAcc);
  const descPtr = align4(metaBase + batchCount * 8);
  const endByte = descPtr + batchCount * 20;
  const memory = new WebAssembly.Memory({ initial: Math.ceil(endByte / 65536) + 4 });
  const mem = new Uint8Array(memory.buffer);

  mem.set(srsBuf.subarray(0, srsBytes), srsPtr);
  for (let k = 0; k < batchCount; k++) mem.set(scalarsPer[k], scalarsBase + scalarOffs[k]);
  const descView = new DataView(memory.buffer, descPtr, batchCount * 20);
  for (let k = 0; k < batchCount; k++) {
    const o = k * 20;
    descView.setUint32(o + 0, descs[k].n, true);
    descView.setUint32(o + 4, descs[k].srsOffset, true);
    descView.setUint32(o + 8, scalarOffs[k], true);
    descView.setUint32(o + 12, resultOffs[k], true);
    descView.setUint32(o + 16, 0, true); // reserved
  }

  // ── Solo oracle: each member's window sums on an isolated pool of its OWN points
  // (SRS prefix [srsOffset, srsOffset+n)), serialized into the result-region layout.
  // This is exactly the per-window sum the bridge ships to the C++ Horner combine.
  if (gpuDevice === null) gpuDevice = await get_device();
  const oracleDevice = gpuDevice;
  const writeLE32 = (out: Uint8Array, off: number, v: bigint): void => {
    let cur = v;
    for (let i = 0; i < 32; i++) {
      out[off + i] = Number(cur & 0xffn);
      cur >>= 8n;
    }
  };
  const oracle = new Uint8Array(rAcc);
  for (let k = 0; k < batchCount; k++) {
    const d = descs[k];
    const ptBytes = srsBuf.subarray(d.srsOffset * 64, (d.srsOffset + d.n) * 64);
    const soloPool = await MsmV2Pool.create(oracleDevice, ptBytes);
    const soloInst = await MsmV2.create(oracleDevice, d.n, soloPool, {
      ...gpuKnobs,
      combineOnHost: false,
      profile: false,
      warmupRuns: 0,
    });
    try {
      soloInst.prepare(scalarsPer[k]);
      const ws = (await soloInst.run()).windowSums;
      for (let w = 0; w < ws.length; w++) {
        writeLE32(oracle, resultOffs[k] + w * 64, ws[w].x);
        writeLE32(oracle, resultOffs[k] + w * 64 + 32, ws[w].y);
      }
    } finally {
      soloInst.destroy();
      soloPool.destroy();
    }
  }

  // ── Drive each path on its OWN fresh host so neither contaminates the other's
  // shared pool scratch (in production the union path is the default — legacy never
  // runs alongside it, so a one-host union-then-legacy sequence is not a real case).
  const runPathFreshHost = async (unionOn: boolean): Promise<Uint8Array> => {
    (globalThis as { __msm_union_bridge?: boolean }).__msm_union_bridge = unionOn;
    const ctrlSab = createControlBuffer();
    const ctrl = new Int32Array(ctrlSab);
    const host = new WebGpuMsmHost(ctrlSab);
    host.setWasmMemory(memory);
    const drive = async (): Promise<void> => {
      await host.handleMessage('msm_request');
      if (Atomics.load(ctrl, SLOT_STATE) !== STATE_DONE) {
        throw new Error(`[bridge-e2e] host error: ${host.getLastErrorMessage() ?? 'unknown'}`);
      }
    };
    try {
      Atomics.store(ctrl, SLOT_OPCODE, OP_PUBLISH_SRS);
      Atomics.store(ctrl, SLOT_N, srsN);
      Atomics.store(ctrl, SLOT_POINTS_PTR, srsPtr);
      await drive();
      mem.fill(0, resultsBase, metaBase + batchCount * 8); // clear results + meta
      Atomics.store(ctrl, SLOT_OPCODE, OP_BATCH_MSM);
      Atomics.store(ctrl, SLOT_N, batchCount);
      Atomics.store(ctrl, SLOT_POINTS_PTR, descPtr);
      Atomics.store(ctrl, SLOT_SCALARS_PTR, scalarsBase);
      Atomics.store(ctrl, SLOT_RESULT_PTR, resultsBase);
      Atomics.store(ctrl, SLOT_BATCH_META_PTR, metaBase);
      Atomics.store(ctrl, SLOT_BATCH_LABELS_PTR, 0);
      await drive();
      return mem.slice(resultsBase, metaBase + batchCount * 8); // results + meta
    } finally {
      await host.destroy();
      (globalThis as { __msm_union_bridge?: boolean }).__msm_union_bridge = undefined;
    }
  };

  const unionOut = await runPathFreshHost(true);
  const legacyOut = await runPathFreshHost(false);

  const firstDiffVs = (snap: Uint8Array): number => {
    for (let i = 0; i < oracle.length; i++) if (snap[i] !== oracle[i]) return i;
    return -1;
  };
  const unionDiff = firstDiffVs(unionOut);
  const legacyDiff = firstDiffVs(legacyOut);
  let mutual = -1;
  for (let i = 0; i < unionOut.length; i++) {
    if (unionOut[i] !== legacyOut[i]) {
      mutual = i;
      break;
    }
  }
  const nonTrivial = oracle.some(b => b !== 0);
  // ACCEPTANCE: the union path (the new production default) must be byte-identical
  // to the solo oracle — that IS the per-window sum the C++ Horner combine consumes,
  // so identical ⇒ identical proof. The legacy comparison is ADVISORY: the legacy
  // single-encoder path runs every member in one command buffer over shared pool
  // scratch, a multi-member concurrency path the union replaces; it can diverge on a
  // synthetic many-large-member batch independently of the union wiring.
  const ok = unionDiff === -1 && nonTrivial;
  const legacyNote =
    legacyDiff === -1
      ? 'legacy≡oracle too'
      : `legacy≠oracle@${legacyDiff} (legacy single-encoder path; advisory, union replaces it)`;
  const detail = !nonTrivial
    ? 'oracle result region all zero — test setup bug'
    : ok
      ? `union ≡ solo-oracle byte-identical via the REAL host: ${batchCount} MSMs ` +
        `(srsOffset groups {0,1,2}, all unioned), ${rAcc} result + ${batchCount * 8} meta bytes; ${legacyNote}`
      : `UNION-vs-oracle@${unionDiff} (union[${unionDiff}]=${unionOut[unionDiff]} oracle=${oracle[unionDiff]}); ${legacyNote}`;
  return { ok, detail };
}

// Decode + upload the inputs into the WASM worker's native point/scalar
// vectors. UNTIMED — kept out of runWasmOnce's measured window so the
// benchmark reports Pippenger compute, not input-structure population.
async function loadWasmInputs(inputs: TestInputs): Promise<void> {
  const handle = await ensureWasmBooted();
  throwIfAborted();
  log(
    'info',
    `[wasm] load n=${inputs.n.toLocaleString()} ` +
      `(${((inputs.pointsBuf.length + inputs.scalarsBuf.length) / 1024 / 1024).toFixed(1)} MiB in)`,
  );
  await handle.loadMsm(inputs.pointsBuf, inputs.scalarsBuf);
}

// Time one batch_multi_scalar_mul_native run over the inputs from the last
// loadWasmInputs. The buffer copy + native-vector decode are NOT in the
// timed window — only the Pippenger compute is measured.
async function runWasmOnce(): Promise<{ ms: number; xy: { x: bigint; y: bigint } }> {
  const handle = await ensureWasmBooted();
  // If Stop destroyed the handle while ensureWasmBooted was already
  // resolved (e.g. for the previous rep), the next call would crash
  // inside comlink with a confusing "channel closed" message.
  throwIfAborted();
  // Pass num_threads explicitly so bb's static parallel_for pool
  // gets sized to match the pthread count this worker was actually
  // booted with. The override is read on the main WASM thread on
  // the FIRST call (before the static `ThreadPool(get_num_cpus()-1)`
  // initialiser runs); after that the pool size is locked. We use
  // `handle.threads` rather than re-reading the UI input because the
  // user may have changed it since boot.
  const numThreads = handle.threads;
  const t0 = performance.now();
  const resultBytes = await handle.runMsm(numThreads);
  const ms = performance.now() - t0;
  log('info', `[wasm] returned in ${ms.toFixed(1)} ms`);
  return { ms, xy: parseAffineLE(resultBytes) };
}

interface BackendSample {
  ms: number;
  // Tracked once per (logN, backend) pair — we cross-check the first
  // result of each backend against noble (at NOBLE_REFERENCE_LOGN) and
  // against the WebGPU result (at all sizes, so a regression in any one
  // backend is visible without paying for noble).
  xy: { x: bigint; y: bigint };
  // Populated only for the WebGPU backend — the library writes per-pass
  // GPU times, CPU phase totals, and a readback decomposition into this
  // out-param when `profile_capture` is passed. Used to render the
  // per-stage breakdown table.
  capture?: ProfileCapture;
}

interface SweepRow {
  logN: number;
  webgpu: BackendSample[];
  wasmMt: BackendSample[];
  nobleOk: boolean | null;
  crossOk: boolean | null; // WASM-MT matches WebGPU?
}

function median(samples: number[]): number {
  if (samples.length === 0) return NaN;
  const sorted = samples.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function fmtMs(samples: BackendSample[]): string {
  if (samples.length === 0) return '—';
  return median(samples.map(s => s.ms)).toFixed(1);
}

function fmtSamples(samples: BackendSample[]): string {
  if (samples.length === 0) return '—';
  return `[${samples.map(s => s.ms.toFixed(0)).join(', ')}]`;
}

function fmtSpeedup(ms: number, baseline: number): string {
  if (!Number.isFinite(ms) || !Number.isFinite(baseline) || baseline === 0) return '—';
  const ratio = baseline / ms;
  return ratio >= 1 ? `${ratio.toFixed(2)}× faster` : `${(1 / ratio).toFixed(2)}× slower`;
}

function fmtCheck(v: boolean | null): string {
  if (v === null) return '—';
  return v ? '<span class="ok">pass</span>' : '<span class="err">FAIL</span>';
}

// Pipeline-execution order so breakdown rows read top-to-bottom along
// the dataflow. Stages not in this list (future labels, fallbacks) are
// appended at the end. Labels match the `profiler.stage(...)` calls in
// msm.ts and batch_affine.ts after `[…]` rollup (subtasks/rounds are
// summed within a rep, then medianised across reps).
const STAGE_ORDER = [
  'decompose_scalars_only',
  'convert_points',
  'transpose_count',
  'transpose_scan',
  'transpose_scatter',
  'transpose',
  'ba_init',
  'ba_schedule',
  'ba_inverse',
  'ba_apply',
  'ba_finalize_collect',
  'ba_finalize_inverse',
  'ba_finalize_apply',
  'smvp',
  'bpr_1',
  'bpr_2',
  'subtask_reduce',
];

function rollupLabel(label: string): string {
  const idx = label.indexOf('[');
  return idx >= 0 ? label.substring(0, idx) : label;
}

interface AggregatedProfile {
  perStage: Map<string, number>;
  perRegion: Map<string, number>;
  gpuWallMs: number | null;
  profiledSumMs: number | null;
  untimestampedMs: number | null;
  readbackMs: number | null;
  mapasyncMs: number | null;
  cpuTotalWallMs: number | null;
  cpuPhases: Map<string, number>;
}

function aggregateCaptures(captures: ProfileCapture[]): AggregatedProfile | null {
  if (captures.length === 0) return null;
  // Per-rep stage sums (rolled up across subtasks/rounds), medianised
  // across reps. Region entries are tracked separately — they overlap
  // their inner stages and would distort the per-stage totals.
  const perRepByStage = new Map<string, number[]>();
  const perRepByRegion = new Map<string, number[]>();
  for (const c of captures) {
    if (!c.profile) continue;
    const repStageTotals = new Map<string, number>();
    const repRegionTotals = new Map<string, number>();
    for (const e of c.profile) {
      const k = rollupLabel(e.label);
      if (e.kind === 'region') {
        repRegionTotals.set(k, (repRegionTotals.get(k) ?? 0) + e.ms);
      } else {
        repStageTotals.set(k, (repStageTotals.get(k) ?? 0) + e.ms);
      }
    }
    for (const [k, v] of repStageTotals) {
      if (!perRepByStage.has(k)) perRepByStage.set(k, []);
      perRepByStage.get(k)!.push(v);
    }
    for (const [k, v] of repRegionTotals) {
      if (!perRepByRegion.has(k)) perRepByRegion.set(k, []);
      perRepByRegion.get(k)!.push(v);
    }
  }
  const perStage = new Map<string, number>();
  for (const [k, samples] of perRepByStage) perStage.set(k, median(samples));
  const perRegion = new Map<string, number>();
  for (const [k, samples] of perRepByRegion) perRegion.set(k, median(samples));

  const fld = (pick: (c: ProfileCapture) => number | undefined): number | null => {
    const xs: number[] = [];
    for (const c of captures) {
      const v = pick(c);
      if (v !== undefined && Number.isFinite(v)) xs.push(v);
    }
    return xs.length ? median(xs) : null;
  };

  const cpuByPhase = new Map<string, number[]>();
  for (const c of captures) {
    if (!c.cpu_phases) continue;
    for (const { label, ms } of c.cpu_phases.phases) {
      if (!cpuByPhase.has(label)) cpuByPhase.set(label, []);
      cpuByPhase.get(label)!.push(ms);
    }
  }
  const cpuPhases = new Map<string, number>();
  for (const [k, samples] of cpuByPhase) cpuPhases.set(k, median(samples));

  return {
    perStage,
    perRegion,
    gpuWallMs: fld(c => c.gpu_readback?.gpu_compute_wall),
    profiledSumMs: fld(c => c.gpu_readback?.profiled_passes_sum),
    untimestampedMs: fld(c => c.gpu_readback?.untimestamped),
    readbackMs: fld(c => c.gpu_readback?.readback_total),
    mapasyncMs: fld(c => c.gpu_readback?.mapasync_overhead),
    cpuTotalWallMs: fld(c => c.cpu_phases?.total_wall_ms),
    cpuPhases,
  };
}

function fmtCell(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(1);
}

function fmtPctCell(v: number | null | undefined, total: number | null): string {
  if (v === null || v === undefined || total === null || !total) return fmtCell(v);
  if (!Number.isFinite(v) || !Number.isFinite(total)) return fmtCell(v);
  return `${fmtCell(v)}<span class="samples"> (${((100 * v) / total).toFixed(0)}%)</span>`;
}

function renderBreakdownTable(entries: { logN: number; captures: ProfileCapture[] }[]): string {
  const aggregates = entries.map(e => ({
    logN: e.logN,
    agg: aggregateCaptures(e.captures),
  }));
  if (aggregates.every(({ agg }) => agg === null)) return '';

  const seenStages = new Set<string>();
  const seenRegions = new Set<string>();
  const seenCpuPhases = new Set<string>();
  for (const { agg } of aggregates) {
    if (!agg) continue;
    for (const k of agg.perStage.keys()) seenStages.add(k);
    for (const k of agg.perRegion.keys()) seenRegions.add(k);
    for (const k of agg.cpuPhases.keys()) seenCpuPhases.add(k);
  }
  const orderedStages: string[] = [
    ...STAGE_ORDER.filter(k => seenStages.has(k)),
    ...Array.from(seenStages).filter(k => !STAGE_ORDER.includes(k)),
  ];

  const headCells = aggregates
    .map(({ logN }) => `<th>2^${logN}<br/><span class="samples">n=${(1 << logN).toLocaleString()}</span></th>`)
    .join('');

  const stageRows = orderedStages
    .map(stage => {
      const cells = aggregates
        .map(({ agg }) => {
          if (!agg) return `<td>—</td>`;
          return `<td>${fmtPctCell(agg.perStage.get(stage), agg.gpuWallMs)}</td>`;
        })
        .join('');
      return `<tr><td>${stage}</td>${cells}</tr>`;
    })
    .join('');

  const sumRow = (label: string, pick: (a: AggregatedProfile) => number | null, withPct = false): string => {
    const cells = aggregates
      .map(({ agg }) => {
        if (!agg) return `<td>—</td>`;
        const v = pick(agg);
        return `<td>${withPct ? fmtPctCell(v, agg.gpuWallMs) : fmtCell(v)}</td>`;
      })
      .join('');
    return `<tr><td><b>${label}</b></td>${cells}</tr>`;
  };

  const cpuRows = Array.from(seenCpuPhases)
    .map(phase => {
      const cells = aggregates
        .map(({ agg }) => {
          if (!agg) return `<td>—</td>`;
          return `<td>${fmtCell(agg.cpuPhases.get(phase))}</td>`;
        })
        .join('');
      return `<tr><td>${phase}</td>${cells}</tr>`;
    })
    .join('');

  const regionRows = Array.from(seenRegions)
    .map(region => {
      const cells = aggregates
        .map(({ agg }) => {
          if (!agg) return `<td>—</td>`;
          return `<td>${fmtPctCell(agg.perRegion.get(region), agg.gpuWallMs)}</td>`;
        })
        .join('');
      return `<tr><td>[region] ${region}</td>${cells}</tr>`;
    })
    .join('');

  // `inter_pass_overhead` = encoder_all − Σ(inner stages). This is the
  // Dawn-side barrier/state-change cost between consecutive compute
  // passes — invisible to `timestampWrites`, only inferable from the
  // outer-region delta.
  const interPassRow = (() => {
    const cells = aggregates
      .map(({ agg }) => {
        if (!agg) return `<td>—</td>`;
        const region = agg.perRegion.get('encoder_all');
        const stagesSum = agg.profiledSumMs;
        if (region === undefined || stagesSum === null) return `<td>—</td>`;
        const v = Math.max(0, region - stagesSum);
        return `<td>${fmtPctCell(v, agg.gpuWallMs)}</td>`;
      })
      .join('');
    return `<tr><td><b>inter_pass_overhead</b><br/><span class="samples">encoder_all − Σ stages</span></td>${cells}</tr>`;
  })();

  // `post_encoder_tail` = gpu_compute_wall − encoder_all. The work
  // that runs in the same encoder *after* the outer region closes:
  // `profiler.resolve()` (resolveQuerySet + 12.8 KB copy) plus the
  // staging copies inside `read_from_gpu`.
  const postTailRow = (() => {
    const cells = aggregates
      .map(({ agg }) => {
        if (!agg) return `<td>—</td>`;
        const region = agg.perRegion.get('encoder_all');
        const wall = agg.gpuWallMs;
        if (region === undefined || wall === null) return `<td>—</td>`;
        const v = Math.max(0, wall - region);
        return `<td>${fmtPctCell(v, wall)}</td>`;
      })
      .join('');
    return `<tr><td><b>post_encoder_tail</b><br/><span class="samples">wall − encoder_all</span></td>${cells}</tr>`;
  })();

  return `
  <h3>GPU per-pass breakdown (median ms; subtasks/rounds summed within each rep)</h3>
  <table>
    <tr><th>Stage</th>${headCells}</tr>
    ${stageRows}
    ${sumRow('profiled passes (Σ)', a => a.profiledSumMs, true)}
    ${sumRow('untimestamped', a => a.untimestampedMs, true)}
    ${sumRow('GPU compute wall', a => a.gpuWallMs)}
    ${regionRows}
    ${interPassRow}
    ${postTailRow}
    ${sumRow('readback_total', a => a.readbackMs)}
    ${sumRow('mapasync_overhead', a => a.mapasyncMs)}
  </table>
  <h3>CPU host phases (median ms)</h3>
  <table>
    <tr><th>Phase</th>${headCells}</tr>
    ${cpuRows}
    ${sumRow('total wall (CPU)', a => a.cpuTotalWallMs)}
  </table>`;
}

function captureEntriesFromRows(rows: SweepRow[]): { logN: number; captures: ProfileCapture[] }[] {
  return rows.map(r => ({
    logN: r.logN,
    captures: r.webgpu.map(s => s.capture).filter((c): c is ProfileCapture => c !== undefined),
  }));
}

function renderSweepTable(rows: SweepRow[]): void {
  // Two tables: a consistency check at log₂n = NOBLE_REFERENCE_LOGN
  // (cross-checks WebGPU / WASM-MT / Noble pairwise), and a perf
  // comparison of WebGPU vs WASM MT across every sweep size. Noble
  // lives in the consistency table only because it's too slow to run
  // at larger n. Followed by a per-pass GPU/CPU breakdown built from
  // the `profile_capture` out-params collected on every WebGPU rep.
  const refRow = rows.find(r => r.logN === NOBLE_REFERENCE_LOGN);
  $results.innerHTML =
    renderConsistencyTable(refRow) + renderPerfTable(rows) + renderBreakdownTable(captureEntriesFromRows(rows));
  $results.classList.add('visible');
}

function renderConsistencyTable(row: SweepRow | undefined): string {
  // Re-derive pairwise outcomes from the first rep's stored xy values
  // so each cell can be FAIL-pinpointed individually. Cells stay as
  // "—" until the reference row has run at least one rep.
  const gpu = row?.webgpu[0]?.xy;
  const mt = row?.wasmMt[0]?.xy;
  const eq = (a: { x: bigint; y: bigint } | undefined, b: { x: bigint; y: bigint } | undefined): boolean | null =>
    !a || !b ? null : pointsEqual(a, b);
  return `
  <h3>Consistency (log₂n = ${NOBLE_REFERENCE_LOGN}, n = ${(1 << NOBLE_REFERENCE_LOGN).toLocaleString()})</h3>
  <table>
    <tr>
      <th>WebGPU vs WASM MT</th>
      <th>Noble vs WebGPU</th>
    </tr>
    <tr>
      <td>${fmtCheck(eq(gpu, mt))}</td>
      <td>${fmtCheck(row?.nobleOk ?? null)}</td>
    </tr>
  </table>`;
}

// Per-row correctness badge for the perf table: WebGPU output xy vs
// WASM MT output xy at the same logN. Returns "" until both backends
// have a stored result. The check is symmetric, so we render the same
// badge on both the WebGPU and WASM MT cells — each cell advertises
// that its MSM output has been cross-verified.
function fmtMatchBadge(match: boolean | null): string {
  if (match === null) return '';
  return match
    ? ' <span class="ok" title="WebGPU output matches WASM MT">✓</span>'
    : ' <span class="err" title="WebGPU output disagrees with WASM MT">✗</span>';
}

function renderPerfTable(rows: SweepRow[]): string {
  const head = `
    <tr>
      <th>log₂(n)</th>
      <th>n</th>
      <th>WebGPU<br/>median ms</th>
      <th>WASM MT (${readMtThreads()}t)<br/>median ms</th>
      <th>WebGPU vs<br/>WASM MT</th>
    </tr>`;
  const body = rows
    .map(r => {
      const webgpuMs = median(r.webgpu.map(s => s.ms));
      const mtMs = median(r.wasmMt.map(s => s.ms));
      const gpuXy = r.webgpu[0]?.xy;
      const mtXy = r.wasmMt[0]?.xy;
      const match: boolean | null = gpuXy && mtXy ? pointsEqual(gpuXy, mtXy) : null;
      const badge = fmtMatchBadge(match);
      return `
    <tr>
      <td>${r.logN}</td>
      <td>${(1 << r.logN).toLocaleString()}</td>
      <td>${fmtMs(r.webgpu)}${badge}<br/><span class="samples">${fmtSamples(r.webgpu)}</span></td>
      <td>${fmtMs(r.wasmMt)}${badge}<br/><span class="samples">${fmtSamples(r.wasmMt)}</span></td>
      <td>${fmtSpeedup(webgpuMs, mtMs)}</td>
    </tr>`;
    })
    .join('');
  return `
  <h3>Performance — WebGPU vs Barretenberg WASM MT</h3>
  <table>${head}${body}</table>`;
}

$run.addEventListener('click', async () => {
  $log.innerHTML = '';
  abortRequested = false;
  setBusy(true, 'running…');
  try {
    const logN = readLogN();
    const checkNoble = $noble.checked && logN === NOBLE_REFERENCE_LOGN;
    const inputs = await generateInputs(logN, checkNoble);
    await yieldToBrowser();

    const gpu = await runWebGpuOnce(inputs);
    log('info', `[gpu] x=0x${gpu.xy.x.toString(16).slice(0, 16)}…`);
    await yieldToBrowser();

    throwIfAborted();
    await loadWasmInputs(inputs);
    const mt = await runWasmOnce();
    await yieldToBrowser();

    const cross = pointsEqual(gpu.xy, mt.xy);
    if (cross) {
      log('ok', `[cross-check] WebGPU and WASM MT agree`);
    } else {
      log('err', `[cross-check] disagreement: gpu=${gpu.xy.x}, mt=${mt.xy.x}`);
    }
    if (checkNoble && inputs.points && inputs.scalars) {
      const noble = referenceMsm(inputs.points, inputs.scalars);
      const nobleOk = pointsEqual(noble, gpu.xy);
      if (nobleOk) {
        log('ok', `[noble] matches GPU at log₂(n) = ${logN}`);
      } else {
        log('err', `[noble] mismatch: noble.x=${noble.x}, gpu.x=${gpu.xy.x}`);
      }
    }
  } catch (err) {
    log(abortRequested ? 'warn' : 'err', `[run] ${err instanceof Error ? err.message : String(err)}`);
    if (!abortRequested && err instanceof Error && err.stack) log('err', err.stack);
  } finally {
    setBusy(false);
  }
});

$runBench.addEventListener('click', async () => {
  $log.innerHTML = '';
  $results.classList.remove('visible');
  abortRequested = false;
  setBusy(true, 'benchmarking…');
  try {
    const logN = readLogN();
    const inputs = await generateInputs(logN, false);
    const gpuSamples: number[] = [];
    const mtSamples: number[] = [];
    const gpuCaptures: ProfileCapture[] = [];
    // Load the WASM inputs once — the byte copy + native-vector decode
    // are not part of the timed Pippenger window.
    await loadWasmInputs(inputs);
    for (let i = 0; i < SWEEP_REPS; i++) {
      throwIfAborted();
      log('info', `[bench] iter ${i + 1}/${SWEEP_REPS}`);
      const gpu = await runWebGpuOnce(inputs);
      throwIfAborted();
      const mt = await runWasmOnce();
      gpuSamples.push(gpu.ms);
      gpuCaptures.push(gpu.capture);
      mtSamples.push(mt.ms);
      log('info', `  gpu=${gpu.ms.toFixed(1)}, mt=${mt.ms.toFixed(1)}`);
    }
    log('ok', `[bench] medians: gpu=${median(gpuSamples).toFixed(1)}, mt=${median(mtSamples).toFixed(1)} ms`);
    // Surface the per-pass GPU/CPU breakdown for the single logN
    // benched. Same renderer the sweep uses, just with one column.
    $results.innerHTML = renderBreakdownTable([{ logN, captures: gpuCaptures }]);
    $results.classList.add('visible');
  } catch (err) {
    log(abortRequested ? 'warn' : 'err', `[bench] ${err instanceof Error ? err.message : String(err)}`);
    if (!abortRequested && err instanceof Error && err.stack) log('err', err.stack);
  } finally {
    setBusy(false);
  }
});

$runSweep.addEventListener('click', async () => {
  $log.innerHTML = '';
  $results.classList.remove('visible');
  abortRequested = false;
  setBusy(true, 'sweeping…');

  const mtThreads = readMtThreads();
  const nobleEnabled = $noble.checked;
  log('info', `[sweep] start: mt-threads=${mtThreads}, noble=${nobleEnabled ? 'on' : 'off'}`);
  logMemSnapshot('sweep-start');

  const rows: SweepRow[] = SWEEP_LOGN.map(logN => ({
    logN,
    webgpu: [],
    wasmMt: [],
    nobleOk: null,
    crossOk: null,
  }));
  renderSweepTable(rows);

  try {
    for (const row of rows) {
      throwIfAborted();
      const checkNoble = nobleEnabled && row.logN === NOBLE_REFERENCE_LOGN;
      log('info', '');
      log('info', `[sweep] === log₂(n) = ${row.logN} (n = ${(1 << row.logN).toLocaleString()}) ===`);

      log('info', `[sweep] step 1/4: generateInputs (mirrorForNoble=${checkNoble})`);
      await yieldToBrowser();
      const tGen = performance.now();
      const inputs = await generateInputs(row.logN, checkNoble);
      log('info', `[sweep] step 1/4 done in ${(performance.now() - tGen).toFixed(0)} ms`);
      logMemSnapshot(`after generateInputs(${row.logN})`);
      await yieldToBrowser();

      let noble: { x: bigint; y: bigint } | null = null;
      if (checkNoble && inputs.points && inputs.scalars) {
        log('info', `[sweep] step 2/4: noble reference (blocking ~10s)`);
        await yieldToBrowser(16); // let the warning render before we block
        const tNoble = performance.now();
        noble = referenceMsm(inputs.points, inputs.scalars);
        log('info', `[sweep] step 2/4 done in ${(performance.now() - tNoble).toFixed(0)} ms`);
        await yieldToBrowser();
      } else {
        log('info', `[sweep] step 2/4: noble skipped`);
      }

      log('info', `[sweep] step 3/4: ensure the WASM worker is booted, then load this size's inputs`);
      // Pre-warm the WASM boot before the timed reps so we don't fold
      // the spawn time into the first rep's wall clock. Also if Stop
      // hits during boot we abort here cleanly rather than mid-MSM.
      await ensureWasmBooted();
      throwIfAborted();
      // Decode + upload the WASM inputs once per size — untimed, kept
      // out of every rep's measured window.
      await loadWasmInputs(inputs);
      throwIfAborted();
      await yieldToBrowser();
      log('info', `[sweep] step 3/4 done`);

      log('info', `[sweep] step 4/4: ${SWEEP_REPS} reps × {gpu, wasm-mt}`);
      for (let i = 0; i < SWEEP_REPS; i++) {
        throwIfAborted();
        setBusy(true, `sweeping log₂(n)=${row.logN} (rep ${i + 1}/${SWEEP_REPS})…`);
        log('info', `[sweep]   rep ${i + 1}/${SWEEP_REPS}`);

        const gpu = await runWebGpuOnce(inputs);
        await yieldToBrowser();
        throwIfAborted();

        const mt = await runWasmOnce();
        await yieldToBrowser();

        row.webgpu.push(gpu);
        row.wasmMt.push(mt);
        if (i === 0) {
          row.crossOk = pointsEqual(gpu.xy, mt.xy);
          if (noble !== null) row.nobleOk = pointsEqual(noble, gpu.xy);
          if (!row.crossOk) {
            log('err', `[sweep]   cross-check FAILED at log₂(n)=${row.logN}`);
            log('err', `         gpu.x=${gpu.xy.x.toString(16)}`);
            log('err', `         mt.x =${mt.xy.x.toString(16)}`);
          }
        }
        renderSweepTable(rows);
      }
      log(
        'info',
        `[sweep]   medians: gpu=${median(row.webgpu.map(s => s.ms)).toFixed(1)}, ` +
          `mt=${median(row.wasmMt.map(s => s.ms)).toFixed(1)} ms`,
      );
      logMemSnapshot(`after log₂(n)=${row.logN}`);
    }
    log('ok', `[sweep] done — see comparison table above.`);
  } catch (err) {
    log(abortRequested ? 'warn' : 'err', `[sweep] ${err instanceof Error ? err.message : String(err)}`);
    if (!abortRequested && err instanceof Error && err.stack) log('err', err.stack);
  } finally {
    setBusy(false);
  }
});

/**
 * Tiniest possible WebGPU touch — request adapter, request device,
 * read out adapter info, destroy device. Allocates no compute pipelines,
 * no big buffers, no shaders. If this hangs or crashes, the GPU driver
 * itself is in a bad state and the rest of the page can't help. After
 * a Sanity Check crash, restart the browser (or reboot if necessary)
 * before retrying — the macOS Metal driver has been observed to hold
 * a wedged state across page reloads.
 */
const $probeGpu = document.getElementById('probe-gpu') as HTMLButtonElement;
$probeGpu?.addEventListener('click', async () => {
  $log.innerHTML = '';
  setBusy(true, 'probing GPU…');
  try {
    log('info', '[probe] navigator.gpu in?: ' + ('gpu' in navigator));
    if (!('gpu' in navigator)) {
      log('err', '[probe] no WebGPU available — stop here');
      return;
    }
    await yieldToBrowser();
    log('info', '[probe] requesting adapter…');
    const t0 = performance.now();
    const adapter = await navigator.gpu.requestAdapter();
    log('info', `[probe] requestAdapter returned in ${(performance.now() - t0).toFixed(0)} ms`);
    if (adapter === null) {
      log('err', '[probe] adapter is null — GPU not usable from this page');
      return;
    }
    // @ts-expect-error adapter.info is non-standard but widely available
    const info = adapter.info ?? (await adapter.requestAdapterInfo?.()) ?? {};
    log(
      'info',
      `[probe] adapter: vendor=${info.vendor ?? '?'} arch=${info.architecture ?? '?'} ` +
        `device=${info.device ?? '?'} description=${info.description ?? '?'}`,
    );
    log('info', '[probe] requesting device…');
    const t1 = performance.now();
    const device = await adapter.requestDevice();
    log('info', `[probe] requestDevice returned in ${(performance.now() - t1).toFixed(0)} ms`);
    log('info', '[probe] destroying device immediately…');
    device.destroy();
    log('ok', '[probe] PASS — basic WebGPU access is healthy');
  } catch (err) {
    log('err', `[probe] FAIL: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) log('err', err.stack);
  } finally {
    setBusy(false);
  }
});

/**
 * Lightweight smoke test for the page. Runs ONE WebGPU MSM at log₂(n)=16
 * — no noble, no WASM, no worker spawns, no thread storms. If this hangs
 * or crashes, the problem is in the WebGPU path itself (or the SRS), not
 * the threaded WASM. Always the first thing to try after a fresh reload.
 *
 * The pre-flight logs every input invariant we depend on (n, byte
 * counts, byte offsets) before touching the GPU, so a crash inside the
 * WebGPU pipeline leaves an audit trail. Several recent crashes have
 * been "right after `[gpu] dispatch`" with no further detail — checking
 * the input shape here separates "we sent garbage" from "GPU went
 * sideways on a valid input". On the warm path, the sanity check also
 * exercises `get_device` and `MsmV2.create` — a hang during device
 * acquisition or pipeline compile shows up in the `[gpu-warm]` lines.
 */
$runSanity.addEventListener('click', async () => {
  $log.innerHTML = '';
  abortRequested = false;
  (window as unknown as { __sanity?: unknown }).__sanity = { state: 'running' };
  setBusy(true, 'sanity check…');
  try {
    log('info', '[sanity] WebGPU-only smoke test, log₂(n)=16, no WASM, no noble');
    logMemSnapshot('sanity-start');

    log('info', '[sanity] step 1/3: generateInputs (no noble mirror)');
    await yieldToBrowser();
    const tGen = performance.now();
    const inputs = await generateInputs(16, false);
    log('info', `[sanity] step 1/3 done in ${(performance.now() - tGen).toFixed(0)} ms`);
    logMemSnapshot('after generateInputs');
    await yieldToBrowser();

    log('info', '[sanity] step 2/3: input invariant checks (pre-GPU)');
    const expectedPointBytes = inputs.n * 64;
    const expectedScalarBytes = inputs.n * 32;
    log('info', `[sanity]   inputs.n = ${inputs.n} (must be ≥ ${1 << LOGN_MIN})`);
    log(
      'info',
      `[sanity]   pointsBuf:  length=${inputs.pointsBuf.byteLength} (expected ${expectedPointBytes}), ` +
        `offset=${inputs.pointsBuf.byteOffset}, buffer.byteLength=${inputs.pointsBuf.buffer.byteLength}`,
    );
    log(
      'info',
      `[sanity]   scalarsBuf: length=${inputs.scalarsBuf.byteLength} (expected ${expectedScalarBytes}), ` +
        `offset=${inputs.scalarsBuf.byteOffset}, buffer.byteLength=${inputs.scalarsBuf.buffer.byteLength}`,
    );
    if (inputs.n < 1 << LOGN_MIN) {
      throw new Error(`[sanity] n=${inputs.n} is below LOGN_MIN (WebGPU MSM is known to crash below 2^16)`);
    }
    if (inputs.pointsBuf.byteLength !== expectedPointBytes) {
      throw new Error(`[sanity] pointsBuf has ${inputs.pointsBuf.byteLength} bytes, expected ${expectedPointBytes}`);
    }
    if (inputs.scalarsBuf.byteLength !== expectedScalarBytes) {
      throw new Error(`[sanity] scalarsBuf has ${inputs.scalarsBuf.byteLength} bytes, expected ${expectedScalarBytes}`);
    }
    // Spot-check the first point's bytes aren't all-zero (would indicate
    // an uninitialised slice). The SRS first point is the BN254 generator
    // (1, 2) in non-Montgomery LE — x[0] = 1.
    const firstByte = inputs.pointsBuf[0];
    log(
      'info',
      `[sanity]   pointsBuf[0..3] = ${Array.from(inputs.pointsBuf.subarray(0, 4)).join(',')} ` +
        `(should be "1,0,0,0" for the SRS generator)`,
    );
    if (firstByte === 0) {
      log('warn', `[sanity]   first SRS byte is 0 — SRS may be uninitialised`);
    }
    log('ok', `[sanity] step 2/3 input invariants OK`);
    await yieldToBrowser();

    log('info', '[sanity] step 3/3: WebGPU MSM (here we go)');
    throwIfAborted();
    const gpu = await runWebGpuOnce(inputs);
    log('info', `[sanity] gpu.x=0x${gpu.xy.x.toString(16).slice(0, 16)}…`);
    logMemSnapshot('sanity-end');
    log('ok', `[sanity] PASS in ${gpu.ms.toFixed(0)} ms`);
    // Single-capture breakdown — same renderer the sweep / bench use,
    // with one column. Useful as a one-click "where is my time going"
    // view after a fresh page reload.
    $results.innerHTML = renderBreakdownTable([{ logN: 16, captures: [gpu.capture] }]);
    $results.classList.add('visible');
    // Expose the raw capture so Playwright-driven profile scripts can
    // pull per-stage GPU times without scraping the rendered table.
    // Cleared at the start of every click, so a stale value from a
    // previous run never bleeds into the next read.
    (window as unknown as { __sanity?: unknown }).__sanity = {
      state: 'done',
      logN: 16,
      ms: gpu.ms,
      capture: JSON.parse(JSON.stringify(gpu.capture)),
    };
  } catch (err) {
    log(abortRequested ? 'warn' : 'err', `[sanity] ${err instanceof Error ? err.message : String(err)}`);
    if (!abortRequested && err instanceof Error && err.stack) log('err', err.stack);
    (window as unknown as { __sanity?: unknown }).__sanity = {
      state: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    setBusy(false);
  }
});

// Boot-time diagnostics so we have context for any crash report.
log('info', `Boot diagnostics:`);
log('info', `  webgpu: ${'gpu' in navigator ? 'available' : 'MISSING'}`);
log('info', `  COI requested: ${COI_REQUESTED ? 'yes (?coi=1)' : 'no'}`);
log('info', `  crossOriginIsolated: ${COI_ACTIVE ? 'yes' : 'no — WASM paths disabled'}`);
log('info', `  hardwareConcurrency: ${navigator.hardwareConcurrency ?? '?'}`);
log('info', `  user-agent: ${navigator.userAgent}`);
log('info', `  SharedArrayBuffer: ${typeof SharedArrayBuffer !== 'undefined' ? 'yes' : 'NO'}`);
logMemSnapshot('page-load');

if (COI_REQUESTED && !COI_ACTIVE) {
  log(
    'warn',
    `[boot] ?coi=1 was requested but crossOriginIsolated is still false. ` +
      `Restart the dev server or hard-reload (Cmd+Shift+R) so the new ` +
      `COOP/COEP headers take effect.`,
  );
}
// NOTE: no automatic GPU adapter probe at boot. Calling
// `navigator.gpu.requestAdapter()` proactively has been observed to
// wedge the GPU driver on macOS when the GPU is already in a degraded
// state from a previous crash. The "Probe GPU" button below does this
// on demand instead — and only after the user has clicked it.

// tqdm-style fixed-width progress bar renderer. Updates the
// #srs-progress element in place — no log spam, no scroll churn.
const BAR_WIDTH = 30;
function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}
function formatDuration(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '--:--';
  const s = Math.round(secs);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
function renderProgress(event: SrsEvent): void {
  if (event.kind !== 'phase') return;
  const { phase, current, total, elapsedMs } = event;
  const frac = total > 0 ? Math.min(1, current / total) : 0;
  const filledCells = Math.round(frac * BAR_WIDTH);
  const emptyCells = BAR_WIDTH - filledCells;
  const pct = (frac * 100).toFixed(1).padStart(5);
  const elapsedSec = elapsedMs / 1000;
  const rate = elapsedSec > 0 ? current / elapsedSec : 0;
  const remaining = rate > 0 ? (total - current) / rate : Infinity;
  const fmt = event.unit === 'B' ? formatBytes : formatCount;
  const rateStr = event.unit === 'B' ? `${formatBytes(rate)}/s` : `${formatCount(rate)} pt/s`;

  $progress.classList.add('visible');
  $progress.innerHTML = '';
  const phaseLabel = phase.padEnd(11);
  const head = document.createTextNode(`${phaseLabel} ${pct}% [`);
  const filled = document.createElement('span');
  filled.className = 'bar-fill';
  filled.textContent = '█'.repeat(filledCells);
  const empty = document.createElement('span');
  empty.className = 'bar-empty';
  empty.textContent = '░'.repeat(emptyCells);
  const tail = document.createTextNode(
    `] ${fmt(current)}/${fmt(total)} [${formatDuration(elapsedSec)}<${formatDuration(remaining)}, ${rateStr}]`,
  );
  $progress.appendChild(head);
  $progress.appendChild(filled);
  $progress.appendChild(empty);
  $progress.appendChild(tail);
}
function hideProgress(): void {
  $progress.classList.remove('visible');
}

// Page-load boot: load the SRS only. The barretenberg WASM (which forks
// `mt-threads` workers) stays cold until the user clicks Run / Run × 5 /
// Sweep — ensureWasmBooted() takes care of the first-click boot. The SRS
// fetch is a download + mandatory GPU decompression (no native workers),
// so it's safe to run unconditionally at page load.
(async () => {
  setBusy(true, 'loading SRS…');
  try {
    srsBuf = await loadSrsPoints(SRS_NUM_POINTS, event => {
      if (event.kind === 'info') {
        log('info', event.msg);
      } else if (event.kind === 'phase') {
        renderProgress(event);
      } else if (event.kind === 'done') {
        hideProgress();
      }
    });
    log('ok', `SRS loaded: ${SRS_NUM_POINTS.toLocaleString()} points available.`);
    log(
      'info',
      `WASM not booted yet (lazy). Click Run / Sweep — it'll spin up ` +
        `${readMtThreads()} pthread workers. Stop tears them down.`,
    );
  } catch (err) {
    log('err', `[boot] ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) log('err', err.stack);
    hideProgress();
  } finally {
    setBusy(false);
  }

  // Autorun support for BrowserStack-driven integration testing.
  // URL params:
  //   ?autorun=msm-cross-check    Click Run, capture gpu/mt result pair
  //   ?logn=N                     logN to test (default keeps page default)
  //   ?use_tree_reduce=1          Route SMVP through tree-reduce pipeline
  // Results posted via the standard /results endpoint so the BS harness
  // can pick them up from JSONL.
  const qp = new URLSearchParams(window.location.search);
  const autorun = qp.get('autorun');
  if (autorun === 'msm-trace') {
    // Perfetto trace capture: leave exactly `reps` WARM MSM runs in
    // window.__lastPassTimes (consumed by the webgpu-gpu-trace-mac skill /
    // join_passtimes.py). One discarded warm-up run reaches steady-state GPU,
    // then the accumulator is reset and `reps` measured runs append their
    // per-pass timings. GPU-only (no WASM/noble). Emits `[bench] DONE`.
    const traceLogN = parseInt(qp.get('logn') ?? '17', 10);
    const traceReps = Math.max(1, parseInt(qp.get('reps') ?? '5', 10));
    void (async () => {
      try {
        // generateInputs needs the SRS (srsBuf); wait for it (no WASM needed).
        for (let i = 0; i < 1200 && srsBuf === null; i++) await new Promise(r => setTimeout(r, 500));
        log('info', `[trace] msm-trace logN=${traceLogN} reps=${traceReps} (warm runs)`);
        const inputs = await generateInputs(traceLogN, false);
        const msm = await ensureWebGpuWarmed(inputs);
        msm.prepare(inputs.scalarsBuf);
        await msm.run(); // warm-up to steady state (discarded)
        const W = window as unknown as { __lastPassTimes?: Array<[string, string, string]> };
        W.__lastPassTimes = []; // capture only the warm runs below
        for (let i = 0; i < traceReps; i++) {
          await msm.run(); // each run() appends its per-pass GPU timings
        }
        log('ok', `[bench] DONE — ${traceReps} warm runs`);
      } catch (e) {
        log('err', `[trace] ${e instanceof Error ? e.message : String(e)}`);
        log('err', 'state=error');
      }
    })();
    return;
  }
  if (autorun === 'msm-bench' && qp.get('no_wasm') === '1') {
    // FAST GPU-ONLY BENCH (fastbench harness).
    // ONE page load → generateInputs once → `reps` timed GPU runs via
    // runWebGpuOnce directly. No WASM boot, no cross-check, no per-rep
    // page reload. Per-rep wall-time is read straight from runWebGpuOnce's
    // return value (the same `[gpu] returned in N ms` number), so the
    // capture is reliable — no log-scraping race. Gates on SRS only
    // (srsBuf !== null), so it runs without COI/SharedArrayBuffer.
    // Fully additive: leaves the existing msm-bench (cross-check) path
    // and the msm-cross-check path untouched.
    const autorunLogN = Math.min(17, parseInt(qp.get('logn') ?? '17', 10) || 17);
    const reps = parseInt(qp.get('reps') ?? '5', 10);
    const client = makeResultsClient({ page: 'msm-bench' });
    log('info', `[bench] GPU-ONLY (no_wasm=1) logN=${autorunLogN} reps=${reps}`);
    try {
      // Wait for SRS ready (no WASM/COI dependency).
      for (let i = 0; i < 1200; i++) {
        if (srsBuf !== null) break;
        await new Promise(r => setTimeout(r, 500));
      }
      if (srsBuf === null) throw new Error('SRS never became ready');
      $logn.value = String(autorunLogN);
      $logn.dispatchEvent(new Event('input'));
      // Generate inputs ONCE (honours ?scalar_dist / ?profile).
      const inputs = await generateInputs(autorunLogN, false);
      // One warm-up run (builds + warms MsmV2 — outside the timed loop).
      log('info', `[bench] warmup run`);
      await runWebGpuOnce(inputs);

      // Kernel-isolation profiling: ?iso=<kernel> loops ONE kernel ~13 s so an
      // external GPU-counter capture attributes ALU/SFU/occupancy to exactly that
      // kernel (timestamp-free — the WebGPU timestamp-query is quantized/coalesced
      // and useless on-device). Kernels: size1 | stream_walker | combine_batched |
      // pt_combine | reduce. See PROFILING_RUNBOOK.md.
      const isoK = qp.get('iso');
      if (isoK) {
        const msm = await ensureWebGpuWarmed(inputs);
        log('info', `[iso] looping ${isoK} for 13s (hold the counter capture over this)...`);
        const iters = await msm.profileKernel(isoK, 13000);
        log('ok', `[iso] DONE ${isoK}: ${iters} dispatches`);
        log('ok', `[iso] state=done`);
        const isoLines: string[] = [];
        for (let i = 0; i < $log.children.length; i++) isoLines.push($log.children[i].textContent ?? '');
        await client.postResults({
          state: 'done',
          params: { iso: isoK, logN: autorunLogN, page: 'iso' },
          results: { iters },
          log: isoLines.slice(-60),
          userAgent: navigator.userAgent,
          hardwareConcurrency: navigator.hardwareConcurrency,
        });
        return;
      }

      // Clean per-dispatch trace: ?trace=1 runs ONE MSM per rep, with a 60ms idle
      // gap so each rep's compute burst is a distinct plateau in the Perfetto
      // capture. prepare()+warm-up happen ONCE here (outside the capture), so each
      // recorded run is a single steady-state MSM. The app's own passTimes (Dawn
      // timestamp queries, CLOCK_MONOTONIC_RAW — same clock as the counters) ARE
      // the labeled timeline; calibrateClock pins the GPU<->CPU offset for the
      // join. See PROFILING_RUNBOOK.md + join_passtimes.py.
      if (qp.get('trace') === '1') {
        const msm = await ensureWebGpuWarmed(inputs);
        msm.prepare(inputs.scalarsBuf);
        log('info', '[trace] warming buffers (prepare + 3 runs, outside capture)');
        await msm.run();
        await msm.run();
        await msm.run();
        await new Promise(res => setTimeout(res, 250)); // clear gap so warm-up can't blur into rep 1
        const W = window as unknown as { __lastPassTimes?: Array<[string, string, string]> };
        const traceSamples: {
          wallMs: number;
          gpuMs: number;
          phases: Record<string, number>;
          passTimes?: Array<[string, string, string]>;
        }[] = [];
        log('info', `[trace] ${reps} single MSM runs, 60ms idle between — hold the counter capture over this`);
        for (let r = 0; r < reps; r++) {
          W.__lastPassTimes = [];
          const t0 = performance.now();
          await msm.run();
          const wallMs = performance.now() - t0;
          const pt = W.__lastPassTimes ?? [];
          traceSamples.push({ wallMs, gpuMs: 0, phases: {}, passTimes: pt });
          log('info', `[trace] rep ${r + 1}/${reps}: wall=${wallMs.toFixed(1)}ms passes=${pt.length}`);
          await new Promise(res => setTimeout(res, 60));
        }
        let traceCalib: Array<[string, string, string, string]> = [];
        try {
          traceCalib = gpuDevice ? await calibrateClock(gpuDevice) : [];
        } catch {
          /* ignore */
        }
        (window as unknown as { __benchSamples?: typeof traceSamples }).__benchSamples = traceSamples;
        const traceLog: string[] = [];
        for (let i = 0; i < $log.children.length; i++) traceLog.push($log.children[i].textContent ?? '');
        await client.postResults({
          state: 'done',
          params: { logN: autorunLogN, reps, page: 'msm-bench' },
          results: { samples: traceSamples, calib: traceCalib },
          log: traceLog.slice(-60),
          userAgent: navigator.userAgent,
          hardwareConcurrency: navigator.hardwareConcurrency,
        });
        log('ok', `[bench] DONE (trace) ${reps} single runs posted`);
        return;
      }
      const samples: { wallMs: number; gpuMs: number; phases: Record<string, number> }[] = [];
      for (let r = 0; r < reps; r++) {
        const gpu = await runWebGpuOnce(inputs);
        const wallMs = gpu.ms;
        samples.push({ wallMs, gpuMs: 0, phases: {} });
        log('info', `[bench] rep ${r + 1}/${reps}: wall=${wallMs.toFixed(1)}ms`);
      }
      const walls = samples.map(s => s.wallMs);
      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const med = (arr: number[]) => {
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.floor(s.length / 2)];
      };
      const avgWall = avg(walls);
      const medWall = med(walls);
      (window as unknown as { __benchSamples?: typeof samples }).__benchSamples = samples;
      log(
        'ok',
        `[bench] DONE logN=${autorunLogN} reps=${reps}: ` +
          `wall median=${medWall.toFixed(1)}ms avg=${avgWall.toFixed(1)}ms ` +
          `samples=[${walls.map(w => w.toFixed(1)).join(', ')}]`,
      );
      const allLines: string[] = [];
      for (let i = 0; i < $log.children.length; i++) allLines.push($log.children[i].textContent ?? '');
      await client.postResults({
        state: 'done',
        params: { logN: autorunLogN, reps, page: 'msm-bench', no_wasm: true },
        results: { samples, averages: { wallMs: avgWall, gpuMs: 0 }, medianWallMs: medWall },
        error: null,
        log: allLines.slice(-100),
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
      log('ok', `[bench] state=done`);
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      log('err', `[bench] FATAL: ${msg}`);
      const allLines: string[] = [];
      for (let i = 0; i < $log.children.length; i++) allLines.push($log.children[i].textContent ?? '');
      await client.postResults({
        state: 'error',
        params: { logN: autorunLogN, reps, page: 'msm-bench', no_wasm: true },
        results: null,
        error: msg,
        log: allLines.slice(-100),
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
    }
  } else if (autorun === 'msm-bench') {
    const autorunLogN = parseInt(qp.get('logn') ?? '17', 10);
    const reps = parseInt(qp.get('reps') ?? '5', 10);
    const client = makeResultsClient({ page: 'msm-bench' });
    log('info', `[bench] logN=${autorunLogN} reps=${reps}`);
    try {
      // Wait for SRS + WASM ready (Run button enables)
      for (let i = 0; i < 1200; i++) {
        if (!$run.disabled) break;
        await new Promise(r => setTimeout(r, 500));
      }
      $logn.value = String(autorunLogN);
      $logn.dispatchEvent(new Event('input'));
      // Use the existing globals path — click Run once for warmup
      $run.click();
      for (let i = 0; i < 60; i++) {
        if ($run.disabled) break;
        await new Promise(r => setTimeout(r, 100));
      }
      for (let i = 0; i < 1200; i++) {
        if (!$run.disabled) break;
        await new Promise(r => setTimeout(r, 500));
      }
      // After warmup: msmV2 is built and ready. Run N timed iterations
      // by clicking Run for each rep and collecting __lastPhaseMs.
      const samples: { wallMs: number; gpuMs: number; phases: Record<string, number> }[] = [];
      const initLogLen = $log.children.length;
      for (let r = 0; r < reps; r++) {
        // Snapshot log length
        const startLen = $log.children.length;
        $run.click();
        for (let i = 0; i < 60; i++) {
          if ($run.disabled) break;
          await new Promise(r => setTimeout(r, 100));
        }
        for (let i = 0; i < 1200; i++) {
          if (!$run.disabled) break;
          await new Promise(r => setTimeout(r, 500));
        }
        // Parse the [gpu] returned in X ms line
        const newLines: string[] = [];
        for (let i = startLen; i < $log.children.length; i++) {
          newLines.push($log.children[i].textContent ?? '');
        }
        const gpuLine = newLines.find(l => /\[gpu\] returned in/.test(l));
        const wallMs = gpuLine ? parseFloat(gpuLine.match(/in\s+([\d.]+)\s+ms/)?.[1] ?? '0') : 0;
        const phases = (window as unknown as { __lastPhaseMs?: Record<string, number> }).__lastPhaseMs ?? {};
        const gpuMs = Object.values(phases).reduce((a, b) => a + (b ?? 0), 0);
        samples.push({ wallMs, gpuMs, phases });
        const phaseStr = Object.entries(phases)
          .map(([k, v]) => `${k}=${v.toFixed(1)}`)
          .join(' ');
        log('info', `[bench] rep ${r + 1}/${reps}: wall=${wallMs.toFixed(1)}ms gpu=${gpuMs.toFixed(1)}ms ${phaseStr}`);
      }
      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const avgWall = avg(samples.map(s => s.wallMs));
      const avgGpu = avg(samples.map(s => s.gpuMs));
      const allPhaseKeys = Array.from(new Set(samples.flatMap(s => Object.keys(s.phases))));
      const avgPhases: Record<string, number> = {};
      for (const key of allPhaseKeys) avgPhases[key] = avg(samples.map(s => s.phases[key] ?? 0));
      const avgPhaseStr = Object.entries(avgPhases)
        .map(([k, v]) => `${k}=${v.toFixed(1)}`)
        .join(' ');
      (window as unknown as { __benchSamples?: typeof samples }).__benchSamples = samples;
      log(
        'ok',
        `[bench] DONE logN=${autorunLogN} reps=${reps}: ` +
          `wall=${avgWall.toFixed(1)}ms gpu=${avgGpu.toFixed(1)}ms ${avgPhaseStr}`,
      );
      const allLines: string[] = [];
      for (let i = 0; i < $log.children.length; i++) allLines.push($log.children[i].textContent ?? '');
      await client.postResults({
        state: 'done',
        params: { logN: autorunLogN, reps, page: 'msm-bench' },
        results: { samples, averages: { wallMs: avgWall, gpuMs: avgGpu, ...avgPhases } },
        error: null,
        log: allLines.slice(-100),
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
      log('ok', `[bench] state=done`);
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      log('err', `[bench] FATAL: ${msg}`);
      const allLines: string[] = [];
      for (let i = 0; i < $log.children.length; i++) allLines.push($log.children[i].textContent ?? '');
      await client.postResults({
        state: 'error',
        params: { logN: autorunLogN, reps, page: 'msm-bench' },
        results: null,
        error: msg,
        log: allLines.slice(-100),
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
    }
  } else if (autorun === 'msm-msbhist') {
    // split-c Phase 1: validate the GPU MSB histogram against the host oracle.
    const autorunLogN = parseInt(qp.get('logn') ?? '17', 10);
    log('info', `[msbhist] logN=${autorunLogN} — GPU histogram vs host oracle`);
    const waitForRun = async (): Promise<void> => {
      for (let i = 0; i < 1200; i++) {
        if (!$run.disabled) return;
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('Run button never enabled within 10 minutes');
    };
    try {
      await waitForRun();
      const inputs = await generateInputs(autorunLogN, false);
      const msm = await ensureWebGpuWarmed(inputs);
      msm.prepare(inputs.scalarsBuf);
      const { hist, msbPerScalar } = await msm.debugMsbHistogram();
      const scalarsU32 = new Uint32Array(inputs.scalarsBuf.buffer, inputs.scalarsBuf.byteOffset, inputs.n * 8);
      const hostHist = computeMsbHistogram(scalarsU32, inputs.n);
      let mismatches = 0;
      let firstBad = -1;
      for (let bin = 0; bin < 256; bin++) {
        if (hist[bin] !== hostHist[bin]) {
          mismatches++;
          if (firstBad < 0) firstBad = bin;
        }
      }
      const gpuSum = hist.reduce((a, b) => a + b, 0);
      // Spot-check msb_per_scalar against a host recompute for the first few scalars.
      let mpsBad = 0;
      for (let i = 0; i < Math.min(inputs.n, 4096); i++) {
        const base = i * 8;
        let msb = -1;
        for (let w = 7; w >= 0; w--) {
          if (scalarsU32[base + w] !== 0) {
            msb = w * 32 + (31 - Math.clz32(scalarsU32[base + w]));
            break;
          }
        }
        const expect = msb < 0 ? 255 : msb;
        if (msbPerScalar[i] !== expect) mpsBad++;
      }
      if (mismatches === 0 && gpuSum === inputs.n && mpsBad === 0) {
        log('ok', `[msbhist] PASS — 256 bins match host, sum=${gpuSum}=n, msb_per_scalar OK (4096 spot-checked)`);
      } else {
        log(
          'error',
          `[msbhist] FAIL — ${mismatches} bin mismatches (first bin ${firstBad}), gpuSum=${gpuSum} n=${inputs.n}, mpsBad=${mpsBad}`,
        );
      }
      // Diagnostic: run the natural decision on the GPU histogram and log the
      // schedule it would choose (consumption is Phase 2; this validates the
      // decision end-to-end on the real distribution).
      const enb = effectiveNumBits(hist);
      const dec = chooseVarWindowSplit(hist, inputs.n, enb, pickC);
      if (dec.isSplit) {
        const widths = buildVarWindowSchedule(dec, enb);
        log(
          'info',
          `[msbhist] decision: SPLIT b*=${dec.bStar} cLo=${dec.cLo} cHi=${dec.cHi} → ${widths.length} windows (effNumBits=${enb})`,
        );
      } else {
        log('info', `[msbhist] decision: NO_SPLIT (effNumBits=${enb}, c=${pickC(inputs.n)})`);
      }
      // Validate the GPU decide kernel: its WindowDesc + summary must match the
      // reference exactly (the Phase 2 exit criterion — unit-test the kernel).
      const { windowDesc: gpuWd, summary: gpuSummary } = await msm.debugDecideWindowSplit();
      const ref = buildWindowDescReference(hist, inputs.n, pickC(inputs.n), 128, pickC);
      const nW = ref.summary.numWindows;
      const sumExp = [
        ref.summary.isSplit,
        ref.summary.bStar,
        ref.summary.cLo,
        ref.summary.cHi,
        ref.summary.nLarge,
        ref.summary.wLo,
        ref.summary.wHi,
        ref.summary.numWindows,
        ref.summary.effNumBits,
      ];
      let sumBad = -1;
      for (let i = 0; i < sumExp.length; i++)
        if (gpuSummary[i] !== sumExp[i]) {
          sumBad = i;
          break;
        }
      let rowBad = -1;
      for (let i = 0; i < nW * 8 && rowBad < 0; i++) if (gpuWd[i] !== ref.windowDesc[i]) rowBad = i;
      if (sumBad < 0 && rowBad < 0) {
        log('ok', `[msbhist] decide PASS — WindowDesc(${nW}w) + summary match reference (isSplit=${gpuSummary[0]})`);
      } else {
        log(
          'error',
          `[msbhist] decide FAIL — summary field ${sumBad} (gpu=${gpuSummary.slice(0, 9)} ref=${sumExp}), row word ${rowBad}`,
        );
      }
      // Validate idx_large compaction: count == n_large, every entry has msb >= b_star-1.
      const { count: idxCount, idxLarge } = await msm.debugIdxLarge();
      const bStar = ref.summary.bStar;
      let idxBad = -1;
      if (bStar > 0) {
        for (let k = 0; k < idxCount && idxBad < 0; k++) {
          const i = idxLarge[k];
          const base = i * 8;
          let msb = -1;
          for (let w = 7; w >= 0; w--) {
            if (scalarsU32[base + w] !== 0) {
              msb = w * 32 + (31 - Math.clz32(scalarsU32[base + w]));
              break;
            }
          }
          if (msb < bStar - 1) idxBad = k;
        }
      }
      if (idxCount === ref.summary.nLarge && idxBad < 0) {
        log('ok', `[msbhist] idx_large PASS — count=${idxCount}=n_large, all msb>=${bStar > 0 ? bStar - 1 : 0}`);
      } else {
        log('error', `[msbhist] idx_large FAIL — count=${idxCount} n_large=${ref.summary.nLarge}, badEntry=${idxBad}`);
      }
    } catch (e) {
      log('error', `[msbhist] ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
    log('ok', `[bench] state=done`); // drive-persist completion marker
  } else if (autorun === 'msm-cross-check') {
    const autorunLogN = parseInt(qp.get('logn') ?? '14', 10);
    const tree = qp.get('use_tree_reduce') === '1';
    const debugSmvp = qp.get('debug_smvp') === '1';
    const debugTreeOut = qp.get('debug_tree_output') === '1';
    // Flags are NOT set here — they'd fire during warmup and abort the
    // page before the real run executes. We set them after waitForRun
    // (= SRS + warmup complete) just before clicking Run.
    const client = makeResultsClient({ page: 'msm-autorun' });
    log('info', `[autorun] msm-cross-check logN=${autorunLogN} tree=${tree} debug_smvp=${debugSmvp}`);
    // Wait for Run button to enable (SRS + WASM ready).
    const waitForRun = async (): Promise<void> => {
      for (let i = 0; i < 1200; i++) {
        if (!$run.disabled) return;
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('Run button never enabled within 10 minutes');
    };
    try {
      await waitForRun();
      $logn.value = String(autorunLogN);
      $logn.dispatchEvent(new Event('input'));
      // First click: warmup happens during this click (no debug, runs
      // to completion and produces a real gpu.x).
      $run.click();
      for (let i = 0; i < 60; i++) {
        if ($run.disabled) break;
        await new Promise(r => setTimeout(r, 100));
      }
      for (let i = 0; i < 1200; i++) {
        if (!$run.disabled) break;
        await new Promise(r => setTimeout(r, 500));
      }
      // If debug flags requested, set them now (after warmup) and click
      // Run again to exercise the real MSM with debug instrumentation.
      // The debug throw aborts before finalize, but the running_x /
      // tree_output dumps still get captured.
      if (debugSmvp || debugTreeOut) {
        if (debugSmvp) {
          (window as unknown as { __msm_debug_after_smvp: boolean }).__msm_debug_after_smvp = true;
        }
        if (debugTreeOut) {
          (window as unknown as { __msm_debug_tree_output: boolean }).__msm_debug_tree_output = true;
        }
        $run.click();
        for (let i = 0; i < 60; i++) {
          if ($run.disabled) break;
          await new Promise(r => setTimeout(r, 100));
        }
        for (let i = 0; i < 1200; i++) {
          if (!$run.disabled) break;
          await new Promise(r => setTimeout(r, 500));
        }
      }
      // The click handler clears $log at the very start; all remaining
      // children belong to this run.
      const lines: string[] = [];
      for (let i = 0; i < $log.children.length; i++) {
        lines.push($log.children[i].textContent ?? '');
      }
      const crossOk = lines.some(l => /cross-check.*\bagree\b/i.test(l));
      const crossErr = lines.find(l => /cross-check.*disagreement/i.test(l));
      const gpuLine = lines.find(l => /\[gpu\] x=0x/.test(l));
      const errLines = lines.filter(l => /^\[err\]/.test(l));
      const dump = (window as unknown as { __msm_debug_dump?: number[] }).__msm_debug_dump;
      const treeDump = (window as unknown as { __msm_debug_tree_dump?: unknown }).__msm_debug_tree_dump;
      const params = { logN: autorunLogN, tree, page: 'msm-autorun' };
      const abDiag = (window as unknown as { __abDiag?: unknown }).__abDiag ?? null;
      const results = {
        cross_ok: crossOk,
        cross_err: crossErr ?? null,
        gpu_line: gpuLine ?? null,
        err_count: errLines.length,
        debug_dump: dump ?? null,
        tree_dump: treeDump ?? null,
        ab_diag: abDiag,
      };
      const state =
        debugSmvp || debugTreeOut
          ? dump !== undefined || treeDump !== undefined
            ? 'done'
            : 'error'
          : crossOk && errLines.length === 0
            ? 'done'
            : 'error';
      await client.postResults({
        state,
        params,
        results,
        error: errLines.length > 0 ? errLines.slice(0, 5).join('\n') : null,
        log: lines.slice(-100),
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
      log(state === 'done' ? 'ok' : 'err', `[autorun] state=${state}`);
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      log('err', `[autorun] FATAL: ${msg}`);
      await client.postResults({
        state: 'error',
        params: { logN: autorunLogN, tree, page: 'msm-autorun' },
        results: null,
        error: msg,
        log: [],
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
    }
  } else if (autorun === 'validate-srs') {
    // Field-validity audit of the ACTUAL decompressed SRS points the MSM
    // consumes. The GPU decompresses + caches these per-device, but only the
    // first 16 are checked at decompress time (srs.ts). Here we verify EVERY
    // coordinate is a canonical field element (x,y < p) and the point is
    // on-curve (y^2 == x^3 + 3 mod p). Run per-device to confirm its cache is
    // clean — a non-canonical coord (>= p) is an out-of-field montmul input.
    const client = makeResultsClient({ page: 'validate-srs' });
    const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
    if (srsBuf === null) {
      log('err', '[validate-srs] SRS not loaded');
      await client.postResults({
        state: 'error',
        params: { page: 'validate-srs' },
        results: null,
        error: 'srs not loaded',
        log: [],
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
      return;
    }
    const loaded = srsBuf.length / 64;
    const n = Math.min(parseInt(qp.get('n') ?? String(loaded), 10), loaded);
    log('info', `[validate-srs] auditing ${n.toLocaleString()} points: x<p, y<p, on-curve`);
    let badGE = 0;
    let badCurve = 0;
    let firstBad = -1;
    for (let i = 0; i < n; i++) {
      const { x, y } = readSrsPointAt(srsBuf, i);
      let ok = true;
      if (x >= P || y >= P) {
        badGE++;
        ok = false;
      } else {
        const lhs = (y * y) % P;
        const rhs = (((((x * x) % P) * x) % P) + 3n) % P;
        if (lhs !== rhs) {
          badCurve++;
          ok = false;
        }
      }
      if (!ok && firstBad < 0) firstBad = i;
    }
    const bad = badGE + badCurve;
    if (firstBad >= 0) {
      const { x, y } = readSrsPointAt(srsBuf, firstBad);
      log('err', `[validate-srs] firstBad idx=${firstBad} x=0x${x.toString(16)} y=0x${y.toString(16)}`);
    }
    log(
      bad === 0 ? 'ok' : 'err',
      `[validate-srs] DONE n=${n} bad=${bad} (ge_p=${badGE} off_curve=${badCurve}) firstBad=${firstBad}`,
    );
    await client.postResults({
      state: bad === 0 ? 'done' : 'error',
      params: { page: 'validate-srs', n },
      results: { n, bad, badGE, badCurve, firstBad },
      error: bad === 0 ? null : `${bad} invalid points`,
      log: [],
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
    });
  } else if (autorun === 'msm-batch-check') {
    // Multi-MSM batch-of-K ≡ K-separate byte-identical check (MULTI_MSM_PLAN.md
    // step 1 runtime side). GPU-only — gates on SRS readiness, not WASM.
    const logNs = (qp.get('logns') ?? '16')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(x => x >= 7 && x <= 17);
    log('info', `[batch-check] autorun logns=${logNs.join(',')}`);
    const waitForSrs = async (): Promise<void> => {
      for (let i = 0; i < 1200; i++) {
        if (!$runSanity.disabled) return;
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('SRS never became ready within 10 minutes');
    };
    try {
      await waitForSrs();
      const res = await runBatchCheck(logNs);
      log(res.ok ? 'ok' : 'err', `[batch-check] state=${res.ok ? 'done' : 'error'} ${res.detail}`);
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      log('err', `[batch-check] state=error FATAL: ${msg}`);
    }
  } else if (autorun === 'msm-bridge-check') {
    // Bridge union-plumbing check: descriptor decode → candidate split → pack →
    // scalars-reorder → prepareBatch → per-member scatter, via the production
    // `runUnionPacks` core. GPU-only — gates on SRS readiness, not WASM.
    //   ?autorun=msm-bridge-check&logns=14,16,17  (add &bridge_budget_mib=70 to
    //   force multi-pack splits + the budget-peel fallback; &profile=E etc.)
    const logNs = (qp.get('logns') ?? '14,16,17')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(x => x >= 7 && x <= 17);
    log('info', `[bridge-check] autorun logns=${logNs.join(',')}`);
    const waitForSrs = async (): Promise<void> => {
      for (let i = 0; i < 1200; i++) {
        if (!$runSanity.disabled) return;
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('SRS never became ready within 10 minutes');
    };
    try {
      await waitForSrs();
      const res = await runBridgeCheck(logNs);
      log(res.ok ? 'ok' : 'err', `[bridge-check] state=${res.ok ? 'done' : 'error'} ${res.detail}`);
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      log('err', `[bridge-check] state=error FATAL: ${msg}`);
    }
  } else if (autorun === 'msm-bridge-e2e') {
    // End-to-end bridge acceptance: drive the REAL WebGpuMsmHost and assert the
    // union path's WASM result+meta regions are byte-identical to the legacy path
    // (⇒ identical proof). ?autorun=msm-bridge-e2e&logns=14,16,17
    const logNs = (qp.get('logns') ?? '14,16,17')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(x => x >= 7 && x <= 17);
    log('info', `[bridge-e2e] autorun logns=${logNs.join(',')}`);
    const waitForSrs = async (): Promise<void> => {
      for (let i = 0; i < 1200; i++) {
        if (!$runSanity.disabled) return;
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('SRS never became ready within 10 minutes');
    };
    try {
      await waitForSrs();
      const res = await runBridgeE2E(logNs);
      log(res.ok ? 'ok' : 'err', `[bridge-e2e] state=${res.ok ? 'done' : 'error'} ${res.detail}`);
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      log('err', `[bridge-e2e] state=error FATAL: ${msg}`);
    }
  } else if (autorun === 'msm-batch-bench') {
    // Saturation sweep for the small-MSM batching regime (the multi-MSM win):
    // homogeneous packs of K copies of n, swept over n × K, reporting median-over-
    // reps wall AND GPU-throughput speedup (union vs Σ solo) per cell. One warm
    // page load runs the whole grid (no per-cell chromium relaunch).
    //   ?ns=128,256,512,1024,2048,4096&Ks=2,4,8,16,32&reps=5
    //   scalar distribution via ?scalar_dist=profile&profile=E (hard rule #0).
    if (gpuDevice === null) gpuDevice = await get_device();
    const device = gpuDevice;
    const nsList = (qp.get('ns') ?? '128,256,512,1024,2048,4096')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(x => x >= 128 && (x & (x - 1)) === 0);
    const ksList = (qp.get('Ks') ?? '2,4,8,16,32')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(x => x >= 1);
    const reps = Math.max(1, parseInt(qp.get('reps') ?? '5', 10));
    const dist = qp.get('scalar_dist') === 'profile' ? (qp.get('profile') ?? 'A').toUpperCase() : 'uniform';
    log('info', `[batch-bench] ns=[${nsList.join(',')}] Ks=[${ksList.join(',')}] reps=${reps} dist=${dist}`);
    const waitForSrs = async (): Promise<void> => {
      for (let i = 0; i < 1200; i++) {
        if (!$runSanity.disabled) return;
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('SRS never became ready within 10 minutes');
    };
    const rows: Record<string, unknown>[] = [];
    try {
      await waitForSrs();
      for (const n of nsList) {
        const logN = Math.round(Math.log2(n));
        for (const K of ksList) {
          try {
            const m = await measurePack(device, new Array<number>(K).fill(logN), reps);
            const wall = m.soloWallMs / m.unionWallMs;
            const gput = m.soloGpuMs / m.unionGpuMs;
            rows.push({
              n,
              K,
              ok: m.ok,
              footprintMiB: +m.footprintMiB.toFixed(1),
              soloWallMs: +m.soloWallMs.toFixed(2),
              unionWallMs: +m.unionWallMs.toFixed(2),
              soloGpuMs: +m.soloGpuMs.toFixed(2),
              unionGpuMs: +m.unionGpuMs.toFixed(2),
              wallSpeedup: +wall.toFixed(2),
              gpuThroughput: +gput.toFixed(2),
              soloPhaseMs: m.soloPhaseMs,
              unionPhaseMs: m.unionPhaseMs,
            });
            log(
              m.ok ? 'ok' : 'err',
              `[batch-bench] n=${String(n).padStart(5)} K=${String(K).padStart(3)} | ` +
                `wall ${m.unionWallMs.toFixed(1)} vs ${m.soloWallMs.toFixed(1)}ms = ${wall.toFixed(2)}× | ` +
                `gpu ${m.unionGpuMs.toFixed(2)} vs ${m.soloGpuMs.toFixed(2)}ms = ${gput.toFixed(2)}× | ` +
                `${m.footprintMiB.toFixed(0)}MiB ${m.ok ? 'OK' : 'MISMATCH(' + m.detail + ')'}`,
            );
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            rows.push({ n, K, ok: false, error: msg.slice(0, 200) });
            log('err', `[batch-bench] n=${n} K=${K} SKIP: ${msg.slice(0, 140)}`);
          }
        }
      }
      (window as unknown as { __benchSamples: unknown }).__benchSamples = { kind: 'batch-bench', dist, reps, rows };
      const okN = rows.filter(r => r.ok).length;
      log('ok', `[batch-bench] state=done ${okN}/${rows.length} cells byte-identical`);
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      log('err', `[batch-bench] state=error FATAL: ${msg}`);
    }
  } else if (autorun === 'micro') {
    // Isolated montmul/inverse microbench (profiling harness):
    //   ?autorun=micro&op=mul|inv&montmul=&pk14=1&chain_k=&threads=&reps=
    // GPU-only, no WASM/SRS — hold a GPU-counter capture over the run to
    // attribute one field op's cost independent of MSM geometry.
    const op: 'mul' | 'inv' = qp.get('op') === 'inv' ? 'inv' : 'mul';
    const montmul = (gpuKnobs.montmul ?? 'karat') as MsmConfig['montmul'];
    const pk14 = gpuKnobs.pk14Inverse === true;
    const chainK = parseInt(qp.get('chain_k') ?? (op === 'inv' ? '6' : '64'), 10);
    const nthreads = parseInt(qp.get('threads') ?? '65536', 10);
    const reps = parseInt(qp.get('reps') ?? '20', 10);
    const client = makeResultsClient({ page: 'micro' });
    const lines: string[] = [];
    const mlog = (k: 'info' | 'ok' | 'err', m: string): void => {
      lines.push(m);
      log(k, m);
    };
    try {
      mlog('info', `[micro] op=${op} montmul=${montmul} pk14=${pk14} K=${chainK} threads=${nthreads} reps=${reps}`);
      const res = await runMicrobench({ op, montmul: montmul ?? 'karat', pk14, nthreads, chainK, reps });
      mlog('ok', `[micro] median=${res.medianMs.toFixed(3)}ms min=${res.minMs.toFixed(3)}ms groups=${res.numGroups}`);
      mlog('ok', `[micro] state=done`);
      await client.postResults({
        state: 'done',
        params: { op, montmul, pk14, chainK, nthreads, reps, page: 'micro' },
        results: {
          medianMs: res.medianMs,
          minMs: res.minMs,
          walls: res.walls,
          samples: res.walls.map(w => ({ wallMs: w })),
          medianWallMs: res.medianMs,
        },
        error: null,
        log: lines.slice(-50),
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      mlog('err', `[micro] FATAL: ${msg}`);
      mlog('err', `[micro] state=error`);
      await client.postResults({
        state: 'error',
        params: { op, montmul, pk14, chainK, nthreads, reps, page: 'micro' },
        results: null,
        error: msg,
        log: lines.slice(-50),
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
    }
  } else if (autorun === 'msm-matrix') {
    // FAST benchmark matrix — the iteration-speed path. ONE page load: acquire the
    // device, decompress the SRS into ONE point pool, generate inputs, then loop
    // over montmul×inverse configs IN-PAGE, building a fresh MsmV2 per config that
    // shares the pool's WGSL-keyed pipeline cache. So montmul-independent kernels
    // (planner/transpose/decompose/reduce-schedule) compile ONCE and are reused;
    // flipping pk14 only recompiles the walker. NO WASM, NO cross-check, NO page
    // reloads. Correctness is covered by the M2 byte-identical oracle; this is
    // pure GPU wall timing (profile=false, wall-around-submit).
    //   ?autorun=msm-matrix&logn=17&reps=8&scalar_dist=profile&profile=A
    //     &configs=karat:loop,cios_unrolled:loop,karat:pk14,cios_unrolled:pk14
    const autorunLogN = Math.min(17, parseInt(qp.get('logn') ?? '17', 10) || 17);
    const reps = Math.max(1, parseInt(qp.get('reps') ?? '8', 10));
    const warmups = Math.max(1, parseInt(qp.get('warmups') ?? '2', 10));
    const configsStr = qp.get('configs') ?? 'karat:loop,cios_unrolled:loop,karat:pk14,cios_unrolled:pk14';
    const configs = configsStr.split(',').map(s => {
      const [mm, inv] = s.split(':');
      return { montmul: (mm || 'karat') as MsmConfig['montmul'], pk14: inv === 'pk14' };
    });
    const client = makeResultsClient({ page: 'msm-matrix' });
    const lines: string[] = [];
    const mlog = (k: 'info' | 'ok' | 'err', m: string): void => {
      lines.push(m);
      log(k, m);
    };
    try {
      for (let i = 0; i < 1200 && srsBuf === null; i++) await new Promise(r => setTimeout(r, 500));
      if (srsBuf === null) throw new Error('SRS never became ready');
      $logn.value = String(autorunLogN);
      $logn.dispatchEvent(new Event('input'));
      const inputs = await generateInputs(autorunLogN, false);
      if (gpuDevice === null) gpuDevice = await get_device();
      const dist = `${qp.get('scalar_dist') ?? 'uniform'}${qp.get('profile') ? '/' + qp.get('profile') : ''}`;
      mlog(
        'info',
        `[matrix] logN=${autorunLogN} reps=${reps} dist=${dist} configs=${configs.length} (one page load, shared pool+pipeline cache)`,
      );
      const tPool = performance.now();
      const pool = await MsmV2Pool.create(gpuDevice, inputs.pointsBuf);
      mlog(
        'info',
        `[matrix] pool (SRS decompress) ready in ${(performance.now() - tPool).toFixed(0)}ms — reused across all configs`,
      );
      const rows: Array<Record<string, unknown>> = [];
      for (const cfg of configs) {
        const knobs: MsmConfig = {
          ...gpuKnobs,
          montmul: cfg.montmul,
          pk14Inverse: cfg.pk14,
          profile: false,
          combineOnHost: false,
          warmupRuns: 0,
        };
        const tBuild = performance.now();
        const msm = await MsmV2.create(gpuDevice, inputs.n, pool, knobs);
        msm.prepare(inputs.scalarsBuf);
        const buildMs = performance.now() - tBuild;
        for (let w = 0; w < warmups; w++) await msm.run(); // first-use + steady-state warm
        const walls: number[] = [];
        for (let r = 0; r < reps; r++) {
          const t0 = performance.now();
          await msm.run();
          walls.push(performance.now() - t0);
        }
        walls.sort((a, b) => a - b);
        const median = walls[walls.length >> 1];
        const min = walls[0];
        rows.push({
          montmul: cfg.montmul,
          pk14: cfg.pk14,
          median: +median.toFixed(1),
          min: +min.toFixed(1),
          buildMs: +buildMs.toFixed(0),
          walls: walls.map(x => +x.toFixed(1)),
        });
        mlog(
          'ok',
          `[matrix] ${String(cfg.montmul).padEnd(13)} inv=${cfg.pk14 ? 'pk14' : 'loop'}: median=${median.toFixed(1)}ms min=${min.toFixed(1)}ms (build+compile ${buildMs.toFixed(0)}ms)`,
        );
        msm.destroy();
      }
      mlog('ok', `[matrix] state=done`);
      (window as unknown as { __benchSamples?: unknown }).__benchSamples = { kind: 'matrix', dist, reps, rows };
      await client.postResults({
        state: 'done',
        params: { logN: autorunLogN, reps, configs: configsStr, page: 'msm-matrix' },
        results: { rows },
        error: null,
        log: lines.slice(-80),
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      mlog('err', `[matrix] FATAL: ${msg}`);
      mlog('err', `[matrix] state=error`);
      await client.postResults({
        state: 'error',
        params: { configs: configsStr, page: 'msm-matrix' },
        results: null,
        error: msg,
        log: lines.slice(-80),
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
    }
  }
})();
