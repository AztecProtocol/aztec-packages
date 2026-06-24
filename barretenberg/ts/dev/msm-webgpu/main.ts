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
import { MsmV2, MsmV2Pool, type MsmConfig, type ProfileBreakdown } from '../../src/msm_webgpu/msm_v2.js';
import { BatchMsmV2 } from '../../src/msm_webgpu/batch_msm.js';
import { createWasmPippenger, parseAffineLE, type WasmPippengerHandle } from './pippenger_wasm.js';
import { loadSrsPoints, type SrsEvent } from './srs.js';
import { buildPerfettoTrace, downloadTrace, type TraceInput, type TraceSpan } from './perfetto.js';
import { makeResultsClient } from './results_post.js';

type LogLevel = 'info' | 'ok' | 'err' | 'warn';

// Per-rep profiling capture from a single WebGPU MSM run. Null on non-profile
// reps (the sweep / Run / Run × 5 buttons all run with profile=false because
// `timestamp-query` enrolment doubles createQuerySet/buffer churn). Populated
// only by the Profile button (the run-profile control).
type ProfileCapture = ProfileBreakdown | null;

const $log = document.getElementById('log') as HTMLDivElement;
const $progress = document.getElementById('srs-progress') as HTMLDivElement;
const $status = document.getElementById('status') as HTMLSpanElement;
const $run = document.getElementById('run') as HTMLButtonElement;
const $runBench = document.getElementById('run-bench') as HTMLButtonElement;
const $runSweep = document.getElementById('run-sweep') as HTMLButtonElement;
const $runProfile = document.getElementById('run-profile') as HTMLButtonElement;
const $profilePerBatch = document.getElementById('profile-per-batch') as HTMLInputElement;
const $runSanity = document.getElementById('run-sanity') as HTMLButtonElement;
const $runTrace = document.getElementById('run-trace') as HTMLButtonElement;
const $runBatch = document.getElementById('run-batch') as HTMLButtonElement;
const $runBatchSweep = document.getElementById('run-batch-sweep') as HTMLButtonElement;
const $stop = document.getElementById('stop') as HTMLButtonElement;
const $logn = document.getElementById('logn') as HTMLInputElement;
const $nDisplay = document.getElementById('n-display') as HTMLSpanElement;
const $mtThreads = document.getElementById('mt-threads') as HTMLInputElement;
const $hwThreads = document.getElementById('hw-threads') as HTMLSpanElement;
const $noble = document.getElementById('noble') as HTMLInputElement;
const $results = document.getElementById('results') as HTMLDivElement;

// The sweep spans 2^10..2^20 — small sizes show where the GPU pipeline
// overtakes the WASM Pippenger; the v2 pipeline has no size floor.
const LOGN_MIN = 10;
const LOGN_MAX = 20;
const SRS_NUM_POINTS = 1 << LOGN_MAX;
// 20 reps × 3 sizes ≈ 60 timed runs — well under a minute on Metal-3 at the
// largest size, and tight enough confidence intervals on the small ones that
// sub-millisecond stages don't bounce around with run-to-run jitter.
const PROFILE_REPS = 40;
// Sizes the Profile button sweeps in one click. One column per size in the
// rendered breakdown table.
const PROFILE_SIZES = [12, 16, 20] as const;

// One-time setup phase timings. `srs_fetch_ms` and `srs_decompress_ms`
// are populated once at page boot from SrsEvent's `kind: 'phase'`
// events — they cover the full SRS load (always the max prefix this
// dev page supports) and are IndexedDB-cached after the first run, so
// they're not per-n. The pool buffers ARE per-n: `MsmV2Pool.create`
// uploads + converts the n-prefix of the SRS (n × 64 bytes / n GPU
// threads), and the pool is rebuilt whenever the dev page's logN
// changes. So pool timings live in `poolByLogN` keyed by logN.
interface PoolBuildTimings {
  pool_upload_ms: number;
  pool_upload_bytes: number;
  pool_convert_ms: number;
}
interface SetupTimings {
  srs_fetch_ms: number;
  srs_decompress_ms: number;
  srs_cached: boolean;
  poolByLogN: Map<number, PoolBuildTimings>;
  /** True once at least one pool has been built with `profile: true`,
   *  so the renderer knows the table has data worth showing. */
  pool_built: boolean;
}
const setupTimings: SetupTimings = {
  srs_fetch_ms: 0,
  srs_decompress_ms: 0,
  srs_cached: false,
  poolByLogN: new Map(),
  pool_built: false,
};

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
  return {
    c: optInt('c'),
    s: optInt('s'),
    wgi: optInt('wgi'),
    reduceWg: optInt('reducewg'),
    l0Log: optInt('l0log'),
    invVariant: q.get('inv') === 'loop' ? 'loop' : q.get('inv') === 'pk' ? 'pk' : undefined,
    // `?hostHist=1`: route prepare() through the host buildInitCounts loop
    // (no GPU histogram dispatch). A/B knob for the SLC cache-thrash
    // hypothesis — compare per-pass `fused` between this and the default
    // (GPU-histogram) path.
    useHostHistogram: q.get('hostHist') === '1',
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
  $runProfile.disabled = busy || !ready;
  $runTrace.disabled = busy || !ready;
  // Batch MSM is WebGPU-only — does not need WASM / cross-origin isolation.
  // Enabled whenever the SRS is loaded and nothing else is running.
  $runBatch.disabled = busy || !ready;
  $runBatchSweep.disabled = busy || !ready;
  // Sweep / Run / Run × 5 exercise the WASM paths in addition to WebGPU
  // — disable them when COI is off (the threaded WASM can't load without
  // SharedArrayBuffer). The user can still hit Quick Sanity Check / Profile
  // to run WebGPU on its own.
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

  const scalarBytes = new Uint8Array(n * 32);
  for (let i = 0; i < n; i++) {
    const s = randomFr();
    if (mirrorForNoble) scalars![i] = s;
    scalarBytes.set(biToLe32(s, `scalar[${i}]`), i * 32);
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
async function ensureWebGpuWarmed(inputs: TestInputs, profile = false): Promise<MsmV2> {
  const logN = Math.log2(inputs.n);
  if (gpuDevice === null) {
    log('info', '[gpu-warm] acquiring GPUDevice (one-time)');
    const t0 = performance.now();
    gpuDevice = await get_device();
    log('ok', `[gpu-warm] device ready in ${(performance.now() - t0).toFixed(0)} ms`);
  }
  // Rebuild when logN changes OR when the cached instance was built without
  // profile and the caller now asks for one (the query set is sized at
  // create-time; a non-profile MsmV2 has no querySet at all).
  const needRebuild = msmV2 === null || msmV2LogN !== logN || (profile && !msmV2.profileEnabled);
  if (needRebuild) {
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
    msmV2Pool = await MsmV2Pool.create(gpuDevice, inputs.pointsBuf, { profile });
    if (profile && msmV2Pool.createProfile) {
      setupTimings.poolByLogN.set(logN, {
        pool_upload_ms: msmV2Pool.createProfile.upload_ms,
        pool_upload_bytes: msmV2Pool.createProfile.upload_bytes,
        pool_convert_ms: msmV2Pool.createProfile.convert_ms,
      });
      setupTimings.pool_built = true;
    } else if (profile) {
      setupTimings.pool_built = true;
    }
    msmV2 = await MsmV2.create(gpuDevice, inputs.n, msmV2Pool, { ...gpuKnobs, profile });
    msmV2LogN = logN;
    log('ok', `[gpu-warm] MsmV2 ready in ${(performance.now() - t0).toFixed(0)} ms`);
  }
  return msmV2!;
}

async function runWebGpuOnce(
  inputs: TestInputs,
  opts: { profile?: boolean } = {},
): Promise<{ ms: number; xy: { x: bigint; y: bigint }; capture: ProfileCapture }> {
  if (!('gpu' in navigator)) {
    throw new Error('navigator.gpu is undefined — no WebGPU in this browser');
  }
  const profile = opts.profile === true;
  const msm = await ensureWebGpuWarmed(inputs, profile);
  if (profile && !msm.profileEnabled) {
    throw new Error(
      "[gpu] requested profile mode but the WebGPU device lacks 'timestamp-query'. " +
        'Chrome usually exposes it under chrome://flags/#enable-unsafe-webgpu (or via ' +
        '--enable-dawn-features=allow_unsafe_apis).',
    );
  }
  log('info', `[gpu] dispatch n=${inputs.n.toLocaleString()}${profile ? ' [profile]' : ''}`);
  // Plan the level tree for these scalars + (re)build the data-dependent
  // buffers — untimed setup, outside the `t0` window.
  await msm.prepare(inputs.scalarsBuf);
  // prepare() reallocates every data-dependent buffer; the first run() on
  // those fresh buffers pays a one-time first-use cost (driver lazy
  // zero-init / first-touch). Warm it out of the timed window so the
  // measurement is steady-state GPU, matching the bench's reused buffers.
  await msm.run();
  // Profile reps want a real prepare() in the timed window — the previous
  // prepare() identity-cached, so a second call would no-op. Re-upload the
  // scalars in a way that defeats the cache: bind a slice with a new
  // identity, then re-prepare.
  if (profile) {
    const reidentified = new Uint8Array(
      inputs.scalarsBuf.buffer,
      inputs.scalarsBuf.byteOffset,
      inputs.scalarsBuf.byteLength,
    );
    // Force a non-cached prepare so host_prepare reflects the real cost
    // (typically the fast-path uniform rewrite + scalar upload).
    await msm.prepare(reidentified);
  }
  const t0 = performance.now();
  const gpu = await msm.run();
  const ms = performance.now() - t0;
  log('info', `[gpu] returned in ${ms.toFixed(1)} ms`);
  return { ms, xy: gpu, capture: gpu.profile ?? null };
}

/**
 * Isolated single-MSM correctness probe for arbitrary `n` (NOT restricted to
 * powers of two like the UI's logN sweep), an SRS point offset, and the
 * `combineOnHost` mode. Runs `n` random scalars against SRS[srsOffset .. +n)
 * on the GPU, recomputes the same MSM with noble, and logs MATCH / MISMATCH.
 *
 * The chonk failure is at n=131071 (=2^17-1), srsOffset=1, combineOnHost=false
 * (the bridge mode). The UI only ever ran power-of-two n with combineOnHost
 * the default, so it never covered that case. Matrix to separate the variables:
 *   await testRawMsm(131072, 0, false)  // 2^17 control — expect MATCH
 *   await testRawMsm(131071, 0, false)  // size 2^17-1 alone
 *   await testRawMsm(131071, 1, false)  // the chonk case (size + offset)
 *   await testRawMsm(131071, 1, true)   // does the combine mode matter?
 */
type ScalarMode = 'random' | 'small' | 'sparse' | 'binary' | 'repeated';

async function testRawMsm(
  n: number,
  srsOffset = 0,
  combineOnHost = false,
  scalarMode: ScalarMode = 'random',
  poolPoints?: number,
): Promise<boolean> {
  if (srsBuf === null) throw new Error('[raw] SRS not loaded yet — wait for the [srs] ready line');
  // The bridge builds ONE pool from the full SRS and runs each MSM as an
  // offset-prefix of it; the pool size (srsN) drives the convert-shader
  // dispatch geometry (msm_v2.ts:1129 — 8 vs 32 X-workgroups at srsN>131072).
  // Default here mimics that with a big pool unless an explicit size is given.
  const poolN = poolPoints ?? Math.min(srsBuf.length / 64, Math.max(srsOffset + n, 1 << 18));
  if (poolN < srsOffset + n) throw new Error(`[raw] poolPoints ${poolN} < srsOffset+n ${srsOffset + n}`);
  if (poolN * 64 > srsBuf.length) {
    throw new Error(`[raw] need ${poolN} SRS points but only ${srsBuf.length / 64} loaded`);
  }
  log(
    'info',
    `[raw] n=${n} srsOffset=${srsOffset} combineOnHost=${combineOnHost} scalars=${scalarMode} poolPoints=${poolN}`,
  );
  const G = bn254.G1.ProjectivePoint;

  // Structured scalar generators that mimic the chonk translator polys:
  // range-constrained limbs are SMALL (~14-bit), SPARSE (many zeros), and
  // heavily REPEATED — exactly the shape that piles many points into one
  // Pippenger bucket and stresses the affine-add pair tree (no P==±Q margin).
  const MASK14 = (1n << 14n) - 1n;
  const genScalar = (): bigint => {
    const r = randomFr();
    switch (scalarMode) {
      case 'small':
        return r & MASK14;
      case 'sparse':
        return r % 10n < 7n ? 0n : r & MASK14; // ~70% zero, rest small
      case 'binary':
        return r & 1n;
      case 'repeated':
        return BigInt(Number(r & 0xffn) % 8); // only 8 distinct small values
      case 'random':
      default:
        return r;
    }
  };

  const scalarBytes = new Uint8Array(n * 32);
  const refPts: ReturnType<typeof G.fromAffine>[] = [];
  const refScs: bigint[] = [];
  for (let i = 0; i < n; i++) {
    const s = genScalar();
    scalarBytes.set(biToLe32(s, `scalar[${i}]`), i * 32);
    if (s !== 0n) {
      refPts.push(G.fromAffine(readSrsPointAt(srsBuf, srsOffset + i)));
      refScs.push(s);
    }
  }
  const toAff = (p: { toAffine: () => { x: bigint; y: bigint } }): { x: bigint; y: bigint } => {
    try {
      const a = p.toAffine();
      return { x: a.x, y: a.y };
    } catch {
      return { x: 0n, y: 0n };
    }
  };
  log('info', `[raw] noble reference over ${refScs.length} nonzero terms…`);
  const cpu = refPts.length === 0 ? { x: 0n, y: 0n } : toAff(G.msm(refPts, refScs));

  const device = await get_device();
  const poolPts = new Uint8Array(srsBuf.buffer, srsBuf.byteOffset, poolN * 64);
  const pool = await MsmV2Pool.create(device, poolPts);
  const msm = await MsmV2.create(device, n, pool, { warmupRuns: 0, combineOnHost });
  let gpu: { x: bigint; y: bigint };
  try {
    await msm.prepare(scalarBytes, srsOffset);
    const out = (await msm.run()) as { x?: bigint; y?: bigint; windowSums?: { x: bigint; y: bigint }[]; c?: number };
    if (combineOnHost) {
      gpu = { x: out.x!, y: out.y! };
    } else {
      // Horner-fold the window sums exactly as the bridge / C++ combine_windows does.
      const toPt = (p: { x: bigint; y: bigint }) => (p.x === 0n && p.y === 0n ? G.ZERO : G.fromAffine(p));
      const W = out.windowSums!;
      let acc = toPt(W[W.length - 1]);
      for (let w = W.length - 2; w >= 0; w--) {
        for (let d = 0; d < out.c!; d++) acc = acc.double();
        acc = acc.add(toPt(W[w]));
      }
      gpu = toAff(acc);
    }
  } finally {
    msm.destroy();
    pool.destroy();
  }

  const match = gpu.x === cpu.x && gpu.y === cpu.y;
  log(
    match ? 'ok' : 'error',
    `[raw] n=${n} srsOffset=${srsOffset} combineOnHost=${combineOnHost} → ${match ? 'MATCH ✓' : 'MISMATCH ✗'}`,
  );
  if (!match) {
    log('error', `[raw]   gpu.x=0x${gpu.x.toString(16)}`);
    log('error', `[raw]   cpu.x=0x${cpu.x.toString(16)}`);
  }
  return match;
}
(window as unknown as { testRawMsm: typeof testRawMsm }).testRawMsm = testRawMsm;

/**
 * Instance-reuse probe. The chonk bridge keeps ONE cached MsmV2 per n and runs
 * every same-n commit through it (the 10 translator range polys + Z_PERM all
 * share the n=131071 instance). This runs `count` independent MSMs (fresh
 * random scalars each) through a SINGLE reused MsmV2 — cross-checking every one
 * against noble — to catch state that leaks across prepare()/run() cycles.
 * If the first matches but a later one mismatches, the reuse path is the bug.
 */
async function testRawMsmReuse(n: number, srsOffset = 1, count = 11, combineOnHost = false): Promise<void> {
  if (srsBuf === null) throw new Error('[reuse] SRS not loaded yet');
  if ((srsOffset + n) * 64 > srsBuf.length) throw new Error('[reuse] not enough SRS points');
  const G = bn254.G1.ProjectivePoint;
  const toAff = (p: { toAffine: () => { x: bigint; y: bigint } }) => {
    try {
      const a = p.toAffine();
      return { x: a.x, y: a.y };
    } catch {
      return { x: 0n, y: 0n };
    }
  };
  const toPt = (p: { x: bigint; y: bigint }) => (p.x === 0n && p.y === 0n ? G.ZERO : G.fromAffine(p));

  const device = await get_device();
  const poolPts = new Uint8Array(srsBuf.buffer, srsBuf.byteOffset, (srsOffset + n) * 64);
  const pool = await MsmV2Pool.create(device, poolPts);
  const msm = await MsmV2.create(device, n, pool, { warmupRuns: 0, combineOnHost });
  log(
    'info',
    `[reuse] one MsmV2 instance, ${count} runs, n=${n} srsOffset=${srsOffset} combineOnHost=${combineOnHost}`,
  );
  try {
    for (let k = 0; k < count; k++) {
      const scalarBytes = new Uint8Array(n * 32);
      const refPts: ReturnType<typeof G.fromAffine>[] = [];
      const refScs: bigint[] = [];
      for (let i = 0; i < n; i++) {
        const s = randomFr();
        scalarBytes.set(biToLe32(s, `s[${i}]`), i * 32);
        if (s !== 0n) {
          refPts.push(G.fromAffine(readSrsPointAt(srsBuf, srsOffset + i)));
          refScs.push(s);
        }
      }
      const cpu = refPts.length === 0 ? { x: 0n, y: 0n } : toAff(G.msm(refPts, refScs));
      await msm.prepare(scalarBytes, srsOffset);
      const out = (await msm.run()) as { x?: bigint; y?: bigint; windowSums?: { x: bigint; y: bigint }[]; c?: number };
      let gpu: { x: bigint; y: bigint };
      if (combineOnHost) {
        gpu = { x: out.x!, y: out.y! };
      } else {
        const W = out.windowSums!;
        let acc = toPt(W[W.length - 1]);
        for (let w = W.length - 2; w >= 0; w--) {
          for (let d = 0; d < out.c!; d++) acc = acc.double();
          acc = acc.add(toPt(W[w]));
        }
        gpu = toAff(acc);
      }
      const match = gpu.x === cpu.x && gpu.y === cpu.y;
      log(match ? 'ok' : 'error', `[reuse]   run ${k + 1}/${count} → ${match ? 'MATCH ✓' : 'MISMATCH ✗'}`);
    }
  } finally {
    msm.destroy();
    pool.destroy();
  }
}
(window as unknown as { testRawMsmReuse: typeof testRawMsmReuse }).testRawMsmReuse = testRawMsmReuse;

/**
 * Faithful replica of the bridge's same-N collision path: B MSMs of identical
 * n, all sharing ONE cached MsmV2 instance, PIPELINED — prepare + encodeIntoBatch
 * + submit per MSM with NO await of GPU completion between them, then a single
 * drain + readback at the end (exactly bridge/main.ts runBatchMsm same-N branch).
 * This is what `testRawMsmReuse` did NOT do (it awaited each run). Each MSM gets
 * its own random scalars; every result is cross-checked against noble.
 * If the earlier MSMs mismatch (a later prepare clobbered the shared instance's
 * buffers before their submitted GPU work ran), this is the chonk bug.
 */
async function testRawMsmSameN(n: number, srsOffset = 1, B = 10): Promise<void> {
  if (srsBuf === null) throw new Error('[same-n] SRS not loaded yet');
  if ((srsOffset + n) * 64 > srsBuf.length) throw new Error('[same-n] not enough SRS points');
  const G = bn254.G1.ProjectivePoint;
  const toAff = (p: { toAffine: () => { x: bigint; y: bigint } }) => {
    try {
      const a = p.toAffine();
      return { x: a.x, y: a.y };
    } catch {
      return { x: 0n, y: 0n };
    }
  };
  const toPt = (p: { x: bigint; y: bigint }) => (p.x === 0n && p.y === 0n ? G.ZERO : G.fromAffine(p));

  const device = await get_device();
  const poolPts = new Uint8Array(srsBuf.buffer, srsBuf.byteOffset, (srsOffset + n) * 64);
  const pool = await MsmV2Pool.create(device, poolPts);
  const msm = await MsmV2.create(device, n, pool, { warmupRuns: 0, combineOnHost: false });
  log('info', `[same-n] ONE instance, ${B} PIPELINED same-n MSMs, n=${n} srsOffset=${srsOffset} (no await between)`);

  // CPU references up front (independent of GPU).
  const cpu: { x: bigint; y: bigint }[] = [];
  const scalarSets: Uint8Array[] = [];
  for (let k = 0; k < B; k++) {
    const sb = new Uint8Array(n * 32);
    const refPts: ReturnType<typeof G.fromAffine>[] = [];
    const refScs: bigint[] = [];
    for (let i = 0; i < n; i++) {
      const s = randomFr();
      sb.set(biToLe32(s, `s[${i}]`), i * 32);
      if (s !== 0n) {
        refPts.push(G.fromAffine(readSrsPointAt(srsBuf, srsOffset + i)));
        refScs.push(s);
      }
    }
    scalarSets.push(sb);
    cpu.push(refPts.length === 0 ? { x: 0n, y: 0n } : toAff(G.msm(refPts, refScs)));
  }

  try {
    // Pipelined dispatch — matches the bridge: prepare+encode+submit per MSM,
    // collect stagings, drain once at the end.
    const stagings: GPUBuffer[] = [];
    for (let k = 0; k < B; k++) {
      await msm.prepare(scalarSets[k], srsOffset);
      const staging = device.createBuffer({
        size: msm.windowSumsByteLength,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      const enc = device.createCommandEncoder();
      msm.encodeIntoBatch(enc, staging, 0);
      device.queue.submit([enc.finish()]);
      stagings.push(staging);
    }
    await device.queue.onSubmittedWorkDone();
    for (let k = 0; k < B; k++) {
      await stagings[k].mapAsync(GPUMapMode.READ);
      const bytes = new Uint8Array(stagings[k].getMappedRange().slice(0));
      stagings[k].unmap();
      const W = msm.decodeWindowSumsFromBytes(bytes, 0);
      let acc = toPt(W[W.length - 1]);
      for (let w = W.length - 2; w >= 0; w--) {
        for (let d = 0; d < msm.c; d++) acc = acc.double();
        acc = acc.add(toPt(W[w]));
      }
      const gpu = toAff(acc);
      const match = gpu.x === cpu[k].x && gpu.y === cpu[k].y;
      log(match ? 'ok' : 'error', `[same-n]   msm ${k + 1}/${B} → ${match ? 'MATCH ✓' : 'MISMATCH ✗'}`);
      stagings[k].destroy();
    }
  } finally {
    msm.destroy();
    pool.destroy();
  }
}
(window as unknown as { testRawMsmSameN: typeof testRawMsmSameN }).testRawMsmSameN = testRawMsmSameN;

/**
 * Additive-masking correctness probe — the on-GPU test of the whole idea.
 *
 * For a column of structured scalars `s` (the GPU-breaking shapes) over an SRS
 * prefix, this:
 *   1. builds a per-row random mask vector R over the pool,
 *   2. uploads R as a GPU `maskBuf` and creates a MASKED MsmV2 (config.maskBuf),
 *   3. runs the masked MSM — the shader rewrites each scalar to (s+R) mod r, so
 *      the GPU only ever sees uniform full-width scalars,
 *   4. recovers C = C' - O by subtracting the offset O = Σ R_i·P_i, and
 *   5. cross-checks C against noble's MSM of the ORIGINAL structured scalars.
 *
 * MATCH ⇒ masking makes the structured MSM correct on the real GPU. The control
 * is `testRawMsm(n, srsOffset, false, scalarMode)` (no masking) on the same
 * shape: it should MISMATCH where this MATCHES. O is computed two ways and
 * cross-checked: noble (reference) and a GPU zero-scalar masked run (masked = R),
 * which is exactly how the bridge derives offsets — so this also validates that
 * derivation path. The chonk case is `testRawMsmMasked(131071, 1, 'sparse')`.
 */
async function testRawMsmMasked(
  n: number,
  srsOffset = 1,
  scalarMode: ScalarMode = 'sparse',
  poolPoints?: number,
): Promise<boolean> {
  if (srsBuf === null) throw new Error('[mask] SRS not loaded yet — wait for the [srs] ready line');
  const poolN = poolPoints ?? Math.min(srsBuf.length / 64, Math.max(srsOffset + n, 1 << 18));
  if (poolN < srsOffset + n) throw new Error(`[mask] poolPoints ${poolN} < srsOffset+n ${srsOffset + n}`);
  if (poolN * 64 > srsBuf.length)
    throw new Error(`[mask] need ${poolN} SRS points but only ${srsBuf.length / 64} loaded`);
  log('info', `[mask] n=${n} srsOffset=${srsOffset} scalars=${scalarMode} poolPoints=${poolN}`);
  const G = bn254.G1.ProjectivePoint;
  const MASK14 = (1n << 14n) - 1n;
  const genScalar = (): bigint => {
    const r = randomFr();
    switch (scalarMode) {
      case 'small':
        return r & MASK14;
      case 'sparse':
        return r % 10n < 7n ? 0n : r & MASK14;
      case 'binary':
        return r & 1n;
      case 'repeated':
        return BigInt(Number(r & 0xffn) % 8);
      case 'random':
      default:
        return r;
    }
  };
  const toAff = (p: { toAffine: () => { x: bigint; y: bigint } }): { x: bigint; y: bigint } => {
    try {
      const a = p.toAffine();
      return { x: a.x, y: a.y };
    } catch {
      return { x: 0n, y: 0n };
    }
  };
  const toPt = (p: { x: bigint; y: bigint }) => (p.x === 0n && p.y === 0n ? G.ZERO : G.fromAffine(p));
  const fold = (W: { x: bigint; y: bigint }[], c: number): { x: bigint; y: bigint } => {
    let acc = toPt(W[W.length - 1]);
    for (let w = W.length - 2; w >= 0; w--) {
      for (let d = 0; d < c; d++) acc = acc.double();
      acc = acc.add(toPt(W[w]));
    }
    return toAff(acc);
  };

  // Per-row random mask R over the whole pool (8×u32 LE per entry), the layout
  // the mask shader indexes by absolute pool position (srsOffset + p).
  const Rvals = new Array<bigint>(poolN);
  const maskBytes = new Uint8Array(poolN * 32);
  for (let i = 0; i < poolN; i++) {
    const ri = randomFr();
    Rvals[i] = ri;
    maskBytes.set(biToLe32(ri, `R[${i}]`), i * 32);
  }

  // Structured scalars + the two CPU references: O (offset) and C (truth).
  const scalarBytes = new Uint8Array(n * 32);
  const sVals = new Array<bigint>(n);
  const offPts: ReturnType<typeof G.fromAffine>[] = [];
  const offScs: bigint[] = [];
  const truePts: ReturnType<typeof G.fromAffine>[] = [];
  const trueScs: bigint[] = [];
  for (let i = 0; i < n; i++) {
    const s = genScalar();
    sVals[i] = s;
    scalarBytes.set(biToLe32(s, `s[${i}]`), i * 32);
    const P = G.fromAffine(readSrsPointAt(srsBuf, srsOffset + i));
    offPts.push(P);
    offScs.push(Rvals[srsOffset + i]); // O uses R at the SAME positions the shader masks with
    if (s !== 0n) {
      truePts.push(P);
      trueScs.push(s);
    }
  }
  log('info', `[mask] noble references (offset over ${n}, truth over ${trueScs.length} nnz)…`);
  const O_noble = toAff(G.msm(offPts, offScs));
  const C_true = truePts.length === 0 ? { x: 0n, y: 0n } : toAff(G.msm(truePts, trueScs));

  const device = await get_device();
  const poolPts = new Uint8Array(srsBuf.buffer, srsBuf.byteOffset, poolN * 64);
  const pool = await MsmV2Pool.create(device, poolPts);
  const maskBuf = device.createBuffer({
    size: maskBytes.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(maskBuf, 0, maskBytes as BufferSource);
  const msm = await MsmV2.create(device, n, pool, { warmupRuns: 0, combineOnHost: false, maskBuf });
  let ok = false;
  try {
    // Offset via the GPU itself: a masked run over ZERO scalars yields
    // masked = (0+R) mod r = R, so the result is exactly O. This is how the
    // bridge derives offsets — cross-check it against noble.
    const zeroBytes = new Uint8Array(n * 32);
    await msm.prepare(zeroBytes, srsOffset);
    const oOut = (await msm.run()) as { windowSums: { x: bigint; y: bigint }[]; c: number };
    const O_gpu = fold(oOut.windowSums, oOut.c);
    const oMatch = O_gpu.x === O_noble.x && O_gpu.y === O_noble.y;
    log(oMatch ? 'ok' : 'err', `[mask]   offset O: gpu(zero-run) vs noble → ${oMatch ? 'MATCH ✓' : 'MISMATCH ✗'}`);

    // The real masked run over the structured scalars, then recover C = C' - O.
    await msm.prepare(scalarBytes, srsOffset);
    const cOut = (await msm.run()) as { windowSums: { x: bigint; y: bigint }[]; c: number };
    const Cprime = fold(cOut.windowSums, cOut.c);
    const recovered = toAff(toPt(Cprime).add(toPt(O_noble).negate()));
    ok = recovered.x === C_true.x && recovered.y === C_true.y;
    log(
      ok ? 'ok' : 'err',
      `[mask] n=${n} srsOffset=${srsOffset} ${scalarMode} → C'-O vs truth: ${ok ? 'MATCH ✓ (masking fixes it)' : 'MISMATCH ✗'}`,
    );
    if (!ok) {
      log('err', `[mask]   recovered.x=0x${recovered.x.toString(16)}`);
      log('err', `[mask]   truth.x    =0x${C_true.x.toString(16)}`);
    }
  } finally {
    msm.destroy();
    maskBuf.destroy();
    pool.destroy();
  }
  return ok;
}
(window as unknown as { testRawMsmMasked: typeof testRawMsmMasked }).testRawMsmMasked = testRawMsmMasked;

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

// Pipeline-execution order so breakdown rows read top-to-bottom along the
// dataflow. The labels are emitted by encodeIntoBatch as `<stage>#<batchIdx>`
// (and bare `<stage>` for the reduction passes that live outside the batch
// loop). Stages not in this list (added later, label drift) sort to the end
// alphabetically.
const STAGE_ORDER = [
  'decompose',
  'xpose_count',
  'xpose_reduce',
  'xpose_scan',
  'xpose_scatter',
  'csr2v2_active',
  'csr2v2_meta',
  'planner_a',
  'planner_b',
  'fused',
  'carry',
  'finalize',
  'reduce_init',
  'reduce_level',
];

// `decompose#3` → `decompose`. Used for the collapsed-by-stage view.
function stripBatch(label: string): string {
  const hash = label.indexOf('#');
  return hash < 0 ? label : label.substring(0, hash);
}

// Median across all reps of (sum over passes with `keyOf(label) == key`).
function aggregatePerKey(captures: ProfileCapture[], keyOf: (label: string) => string): Map<string, number> {
  const perRepByKey = new Map<string, number[]>();
  for (const c of captures) {
    if (c === null) continue;
    const repTotals = new Map<string, number>();
    for (const p of c.passes) {
      const k = keyOf(p.label);
      repTotals.set(k, (repTotals.get(k) ?? 0) + p.ms);
    }
    for (const [k, v] of repTotals) {
      if (!perRepByKey.has(k)) perRepByKey.set(k, []);
      perRepByKey.get(k)!.push(v);
    }
  }
  const out = new Map<string, number>();
  for (const [k, xs] of perRepByKey) out.set(k, median(xs));
  return out;
}

interface MedianedHost {
  host_prepare: number;
  prepare_kind_fast: number; // fraction of reps that were fast-path (0..1)
  host_encode: number;
  host_submit_wait: number;
  host_decode: number;
  wall: number;
  scalar_upload_wall: number;
  scalar_upload_bytes: number;
  prep_booth_decode: number;
  bucket_histogram_gpu: number;
  prep_level_plan: number;
  prep_other: number;
  numBatches: number;
  batchWindows: number;
}

function aggregateHost(captures: ProfileCapture[]): MedianedHost | null {
  const xs = captures.filter((c): c is ProfileBreakdown => c !== null);
  if (xs.length === 0) return null;
  const pick = (sel: (h: ProfileBreakdown['host']) => number): number => median(xs.map(c => sel(c.host)));
  const fastCount = xs.filter(c => c.host.prepare_kind === 'fast').length;
  return {
    host_prepare: pick(h => h.host_prepare),
    prepare_kind_fast: fastCount / xs.length,
    host_encode: pick(h => h.host_encode),
    host_submit_wait: pick(h => h.host_submit_wait),
    host_decode: pick(h => h.host_decode),
    wall: pick(h => h.wall),
    scalar_upload_wall: pick(h => h.scalar_upload_wall),
    scalar_upload_bytes: xs[0].host.scalar_upload_bytes,
    prep_booth_decode: pick(h => h.prep_booth_decode),
    bucket_histogram_gpu: pick(h => h.bucket_histogram_gpu),
    prep_level_plan: pick(h => h.prep_level_plan),
    prep_other: pick(h => h.prep_other),
    numBatches: xs[0].numBatches,
    batchWindows: xs[0].batchWindows,
  };
}

function fmtCell(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

function fmtBytes(b: number): string {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MiB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KiB`;
  return `${b} B`;
}

// Auto-unit time formatter: switches to µs / ns when the value drops below
// the precision threshold so sub-microsecond passes don't render as "0.00".
// Named `fmtTime` rather than `fmtMs` because the existing benchmark renderer
// already owns that name (and takes a samples array, not a scalar).
function fmtTime(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (v === 0) return '0 ms';
  const abs = Math.abs(v);
  if (abs < 0.001) return `${(v * 1e6).toFixed(0)} ns`;
  if (abs < 0.1) return `${(v * 1000).toFixed(1)} µs`;
  if (abs < 1) return `${v.toFixed(3)} ms`;
  if (abs < 10) return `${v.toFixed(2)} ms`;
  return `${v.toFixed(1)} ms`;
}

function fmtPct(v: number, total: number): string {
  if (!Number.isFinite(v) || !Number.isFinite(total) || total <= 0) return '—';
  return `${((100 * v) / total).toFixed(1)}%`;
}

// Per-column aggregation for the multi-N profile table. `stagesMap` is keyed
// by the label scheme picked by `expand` (full label vs. batch-stripped).
interface ProfileColumn {
  logN: number;
  stagesMap: Map<string, number>;
  host: MedianedHost | null;
  profileReps: number;
  profiledSum: number;
  gpuOther: number;
  wall: number;
}

function buildColumns(entries: { logN: number; captures: ProfileCapture[] }[], expand: boolean): ProfileColumn[] {
  return entries.map(({ logN, captures }) => {
    const stagesMap = aggregatePerKey(captures, expand ? l => l : stripBatch);
    const host = aggregateHost(captures);
    const profileReps = captures.filter(c => c !== null).length;
    const profiledSum = Array.from(stagesMap.values()).reduce((a, b) => a + b, 0);
    const wall = host?.wall ?? 0;
    const gpuOther = Math.max(0, wall - profiledSum);
    return { logN, stagesMap, host, profileReps, profiledSum, gpuOther, wall };
  });
}

// Per-column top-3 ranking by ms, restricted to per-stage rows (totals like
// `profiled_sum` / `wall` don't get a ranking).
function topRanksPerColumn(cols: ProfileColumn[]): Map<string, number>[] {
  return cols.map(({ stagesMap }) => {
    const sorted = Array.from(stagesMap.entries()).sort((a, b) => b[1] - a[1]);
    const ranks = new Map<string, number>();
    for (let i = 0; i < Math.min(3, sorted.length); i++) ranks.set(sorted[i][0], i + 1);
    return ranks;
  });
}

// Render one stage cell: `12.3 ms <span class="pct">(45.6%)</span>`, with
// `top1`/`top2`/`top3` class on the `<td>` when this stage is in the
// column's top-3.
function renderStageCell(ms: number | undefined, wall: number, rank: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return `<td>—</td>`;
  const pct = wall > 0 ? ` <span class="pct">(${((100 * ms) / wall).toFixed(1)}%)</span>` : '';
  const cls = rank === 1 ? ' class="top1"' : rank === 2 ? ' class="top2"' : rank === 3 ? ' class="top3"' : '';
  return `<td${cls}>${fmtTime(ms)}${pct}</td>`;
}

// Render a non-stage cell (totals / host phases) — same ms-with-pct format,
// no top-N highlight.
function renderPlainCell(ms: number | undefined, wall: number): string {
  if (ms === undefined || !Number.isFinite(ms)) return `<td>—</td>`;
  const pct = wall > 0 ? ` <span class="pct">(${((100 * ms) / wall).toFixed(1)}%)</span>` : '';
  return `<td>${fmtTime(ms)}${pct}</td>`;
}

// Stage-label sort: known stages first (in pipeline order), then unknowns
// alphabetically; within an expanded label like `decompose#3`, sort by the
// `#` index numerically.
function compareStageLabels(a: string, b: string): number {
  const sa = stripBatch(a);
  const sb = stripBatch(b);
  const ia = STAGE_ORDER.indexOf(sa);
  const ib = STAGE_ORDER.indexOf(sb);
  if (ia !== ib) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
  if (sa !== sb) return sa < sb ? -1 : 1;
  const ah = a.indexOf('#');
  const bh = b.indexOf('#');
  const an = ah < 0 ? -1 : parseInt(a.substring(ah + 1), 10);
  const bn = bh < 0 ? -1 : parseInt(b.substring(bh + 1), 10);
  return an - bn;
}

// Build the multi-N profile breakdown HTML and (on the final render) dump a
// CSV to console. The table has one column per `entries` size — typically
// `n ∈ {2^12, 2^16, 2^20}` — with per-cell `ms (pct%)` and top-3 highlight
// per column. `progress[i]` reports rep status for column `i`; entries with
// `done < target` get a "(d/t)" header tag, the final state gets "(t reps)".
// The CSV is only logged on the final render (`progress.every(done === target)`)
// to avoid spamming the console between in-progress renders.
function renderProfileTable(
  entries: { logN: number; captures: ProfileCapture[] }[],
  expand: boolean,
  progress?: { done: number; target: number }[],
): string {
  const cols = buildColumns(entries, expand);

  // In collapsed mode, seed the row order with the full pipeline so the user
  // sees the skeleton (empty cells) as soon as the button is clicked, before
  // the first rep finishes. In expanded mode the labels depend on numBatches
  // (which varies per N) so we can't pre-seed — rows grow as reps land.
  const allLabels = new Set<string>();
  if (!expand) for (const s of STAGE_ORDER) allLabels.add(s);
  for (const { stagesMap } of cols) for (const l of stagesMap.keys()) allLabels.add(l);
  const orderedLabels = Array.from(allLabels).sort(compareStageLabels);
  const topRanks = topRanksPerColumn(cols);

  const headCells = cols
    .map(({ logN, host, profileReps }, i) => {
      const nb = host ? `numBatches=${host.numBatches}, batchWindows=${host.batchWindows}` : 'no data yet';
      const prog = progress?.[i];
      let tag = '';
      if (prog) {
        if (prog.done === 0) tag = ' <span class="samples">(pending)</span>';
        else if (prog.done < prog.target) tag = ` <span class="samples">(${prog.done}/${prog.target}…)</span>`;
        else tag = ` <span class="samples">(${prog.target} reps)</span>`;
      } else if (profileReps === 0) {
        tag = ' <span class="samples">(no data)</span>';
      }
      return `<th>n = 2<sup>${logN}</sup> = ${(1 << logN).toLocaleString()}${tag}<br/><span class="samples">${nb}</span></th>`;
    })
    .join('');

  const stageRows = orderedLabels
    .map(label => {
      const cells = cols
        .map(({ stagesMap, wall }, i) => renderStageCell(stagesMap.get(label), wall, topRanks[i].get(label)))
        .join('');
      return `<tr><td>${label}</td>${cells}</tr>`;
    })
    .join('');

  const totalsRows = [
    `<tr><td><b>profiled Σ</b></td>${cols.map(c => renderPlainCell(c.profiledSum, c.wall)).join('')}</tr>`,
    `<tr><td><b>gpu_other</b><br/><span class="samples">wall − profiled Σ</span></td>${cols
      .map(c => renderPlainCell(c.gpuOther, c.wall))
      .join('')}</tr>`,
    `<tr><td><b>wall</b></td>${cols.map(c => `<td><b>${fmtTime(c.wall)}</b></td>`).join('')}</tr>`,
  ].join('');

  // `host_prepare` and its sub-phases happen BEFORE `run()` returns, so
  // they're not part of `wall`. Compare them against e2e = prepare + wall —
  // that's the actual per-MSM cost the caller sees end-to-end. The three
  // in-wall phases (encode, submit_wait, decode) still use `wall` as the
  // denominator so they continue to sum to ~100%.
  //
  // Containment hierarchy as actually measured in `MsmV2.prepare()`:
  //
  //   host_prepare
  //     ├─ scalar_upload_wall   (writeBuffer host call)
  //     ├─ prep_booth_decode    (encode + dispatch + mapAsync + readback)
  //     │    └─ bucket_histogram_gpu   (GPU dispatch, timestamped)
  //     ├─ prep_level_plan      (host CPU level walk)
  //     └─ prep_other           (residual — see msm_v2.ts)
  //
  // The three in-wall phases (host_encode / host_submit_wait / host_decode)
  // hang off `wall`, not `host_prepare`. They use `wall` as their denominator
  // so they continue to sum to ~100% of `wall`. Everything else uses `e2e`
  // (= host_prepare + wall) so the rows comparing prepare and run share the
  // same denominator.
  const hostPhases: { key: keyof MedianedHost; denom: 'wall' | 'e2e'; indent?: 0 | 1 | 2 }[] = [
    { key: 'host_prepare', denom: 'e2e' },
    { key: 'scalar_upload_wall', denom: 'e2e', indent: 1 },
    { key: 'prep_booth_decode', denom: 'e2e', indent: 1 },
    { key: 'bucket_histogram_gpu', denom: 'e2e', indent: 2 },
    { key: 'prep_level_plan', denom: 'e2e', indent: 1 },
    { key: 'prep_other', denom: 'e2e', indent: 1 },
    { key: 'host_encode', denom: 'wall' },
    { key: 'host_submit_wait', denom: 'wall' },
    { key: 'host_decode', denom: 'wall' },
  ];
  const renderHostRow = ({
    key,
    denom,
    indent,
  }: {
    key: keyof MedianedHost;
    denom: 'wall' | 'e2e';
    indent?: 0 | 1 | 2;
  }): string => {
    const cells = cols
      .map(({ host, wall }) => {
        if (!host) return `<td>—</td>`;
        const d = denom === 'e2e' ? host.host_prepare + wall : wall;
        return renderPlainCell(host[key] as number, d);
      })
      .join('');
    const note = denom === 'e2e' ? ' <span class="samples">(% of e2e)</span>' : '';
    const prefix = indent ? `<span class="samples">${'↳ '.repeat(indent)}</span>` : '';
    return `<tr><td>${prefix}${key}${note}</td>${cells}</tr>`;
  };

  const hostRows = hostPhases.map(renderHostRow).join('');

  // e2e per-MSM = host_prepare + wall — the total wall a caller of MsmV2
  // sees for one prepare()+run() round-trip.
  const e2eRow = `<tr><td><b>e2e (prepare + wall)</b></td>${cols
    .map(({ host, wall }) => {
      if (!host) return `<td>—</td>`;
      const e2e = host.host_prepare + wall;
      return `<td><b>${fmtTime(e2e)}</b></td>`;
    })
    .join('')}</tr>`;

  const prepKindRow = `<tr><td>prepare_kind</td>${cols
    .map(({ host }) => {
      if (!host) return `<td>—</td>`;
      const f = host.prepare_kind_fast;
      const label = f >= 1 ? 'fast' : f <= 0 ? 'slow' : `mixed (${(f * 100).toFixed(0)}% fast)`;
      return `<td>${label}</td>`;
    })
    .join('')}</tr>`;

  const scalarBytesRow = `<tr><td>scalar_upload_bytes</td>${cols
    .map(({ host }) => `<td>${host ? fmtBytes(host.scalar_upload_bytes) : '—'}</td>`)
    .join('')}</tr>`;

  // Setup table. `srs_*` are page-global (cached after the first load,
  // not per-n) so they get a `colspan` cell across all size columns.
  // `pool_*` ARE per-n because the pool is rebuilt for each logN —
  // each size gets its own cell, with `—` when the pool for that size
  // hasn't been built yet (e.g. mid-sweep incremental renders).
  const sizeHeaders = cols
    .map(({ logN }) => `<th>n = 2<sup>${logN}</sup> = ${(1 << logN).toLocaleString()}</th>`)
    .join('');
  const colspanAll = cols.length;
  const srsNote = setupTimings.srs_cached ? '(cached)' : '';
  const poolRow = (key: 'pool_upload_ms' | 'pool_convert_ms', label: string): string => {
    const cells = cols
      .map(({ logN }) => {
        const p = setupTimings.poolByLogN.get(logN);
        return `<td>${p ? fmtTime(p[key]) : '—'}</td>`;
      })
      .join('');
    return `<tr><td>${label}</td>${cells}</tr>`;
  };
  // pool_upload_bytes row mirrors the scalar_upload_bytes row in the
  // per-MSM breakdown: shows the per-n SRS-prefix byte count.
  const poolUploadBytesRow = `<tr><td>pool_upload_bytes</td>${cols
    .map(({ logN }) => {
      const p = setupTimings.poolByLogN.get(logN);
      return `<td>${p ? fmtBytes(p.pool_upload_bytes) : '—'}</td>`;
    })
    .join('')}</tr>`;
  const setupSection = setupTimings.pool_built
    ? `
  <h3>Setup (one-time)</h3>
  <table>
    <tr><th>Phase</th>${sizeHeaders}</tr>
    <tr><td>srs_fetch</td><td colspan="${colspanAll}">${fmtTime(setupTimings.srs_fetch_ms)} ${srsNote}</td></tr>
    <tr><td>srs_decompress</td><td colspan="${colspanAll}">${fmtTime(setupTimings.srs_decompress_ms)} ${srsNote}</td></tr>
    ${poolRow('pool_upload_ms', 'pool_upload')}
    ${poolUploadBytesRow}
    ${poolRow('pool_convert_ms', 'pool_convert')}
  </table>`
    : '';

  // CSV: only dump once everything is finished, so the user gets a clean
  // paste-ready block in the console (incremental renders would spam ~60
  // CSVs into devtools over the course of one click).
  const isFinal = progress ? progress.every(p => p.done >= p.target && p.target > 0) : true;
  if (isFinal) {
    const csvCols = cols.flatMap(({ logN }) => [`logn${logN}_ms`, `logn${logN}_pct`]);
    const csvHeader = ['stage', ...csvCols].join(',');
    const csvNumFor = (ms: number, wall: number): string[] => [
      Number.isFinite(ms) ? ms.toFixed(4) : '',
      Number.isFinite(ms) && wall > 0 ? ((100 * ms) / wall).toFixed(2) : '',
    ];
    const csvCellFor = (m: Map<string, number>, label: string, wall: number): string[] => {
      const v = m.get(label);
      return v === undefined ? ['', ''] : csvNumFor(v, wall);
    };
    const csvBody = [
      ...orderedLabels.map(label => [label, ...cols.flatMap(c => csvCellFor(c.stagesMap, label, c.wall))].join(',')),
      ['profiled_sum', ...cols.flatMap(c => csvNumFor(c.profiledSum, c.wall))].join(','),
      ['gpu_other', ...cols.flatMap(c => csvNumFor(c.gpuOther, c.wall))].join(','),
      ['wall', ...cols.flatMap(c => csvNumFor(c.wall, c.wall))].join(','),
      [
        'e2e',
        ...cols.flatMap(c =>
          c.host ? csvNumFor(c.host.host_prepare + c.wall, c.host.host_prepare + c.wall) : ['', ''],
        ),
      ].join(','),
      ...hostPhases.map(({ key, denom }) =>
        [
          key,
          ...cols.flatMap(c => {
            if (!c.host) return ['', ''];
            const d = denom === 'e2e' ? c.host.host_prepare + c.wall : c.wall;
            return csvNumFor(c.host[key] as number, d);
          }),
        ].join(','),
      ),
    ];
    console.log([csvHeader, ...csvBody].join('\n'));
  }

  const view = expand ? 'per-batch view' : 'collapsed view';
  return `
  ${setupSection}
  <h3>Per-MSM breakdown — ${view}, median of ${PROFILE_REPS} reps</h3>
  <p style="font-size: 0.85rem; color: #6b7280;">
    Cell format: <code>median</code> <span class="pct">(% of wall)</span>.
    Top 3 stages per column are highlighted —
    <span class="legend top1">#1</span>
    <span class="legend top2">#2</span>
    <span class="legend top3">#3</span>.
  </p>
  <table>
    <tr><th>Stage (GPU pass)</th>${headCells}</tr>
    ${stageRows}
    ${totalsRows}
  </table>
  <h3>Host phases</h3>
  <table>
    <tr><th>Phase</th>${headCells}</tr>
    ${hostRows}
    ${e2eRow}
    ${prepKindRow}
    ${scalarBytesRow}
  </table>
  <p style="font-size: 0.8rem; color: #6b7280;">
    CSV (stage, logn{${PROFILE_SIZES.join(',')}}_ms / _pct) logged to the JavaScript console for copy-paste.
  </p>`;
}

// Sweep-table consumer of the breakdown — currently produces an empty string
// because no sweep path runs with profile=true. Kept as the integration
// point in case we later add a "profile sweep" button.
function captureEntriesFromRows(_rows: SweepRow[]): { logN: number; captures: ProfileCapture[] }[] {
  return [];
}

function renderSweepTable(rows: SweepRow[]): void {
  // Two tables: a consistency check at log₂n = NOBLE_REFERENCE_LOGN
  // (cross-checks WebGPU / WASM-MT / Noble pairwise), and a perf
  // comparison of WebGPU vs WASM MT across every sweep size. Noble
  // lives in the consistency table only because it's too slow to run
  // at larger n. Followed by a per-pass GPU/CPU breakdown built from
  // the `profile_capture` out-params collected on every WebGPU rep.
  const refRow = rows.find(r => r.logN === NOBLE_REFERENCE_LOGN);
  $results.innerHTML = renderConsistencyTable(refRow) + renderPerfTable(rows);
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
    // Run × 5 doesn't enrol timestamp-query, so gpuCaptures are all null.
    // The per-pass breakdown lives behind the Profile button instead.
    void gpuCaptures;
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
 * WebGPU-only profile harness: at each of log₂(n) ∈ {12, 16, 20}, runs
 * `PROFILE_REPS` MSMs with `timestamp-query` enrolled,
 * medianises per-pass GPU times + host phases, and renders one breakdown
 * table with one column per size. The first run after each `prepare()` is a
 * throwaway warm-up (the existing `runWebGpuOnce` pattern). No WASM, no
 * noble — pure WebGPU profile, so the table is comparable across machines
 * that can't load the threaded WASM.
 */
$runProfile.addEventListener('click', async () => {
  $log.innerHTML = '';
  abortRequested = false;
  setBusy(true, 'profiling…');
  const expand = $profilePerBatch.checked;
  // Pre-allocate one entry per size so the table can render an empty
  // skeleton on click and fill in column-by-column as reps complete.
  const entries: { logN: number; captures: ProfileCapture[] }[] = PROFILE_SIZES.map(logN => ({
    logN,
    captures: [],
  }));
  const progress = PROFILE_SIZES.map(() => ({ done: 0, target: PROFILE_REPS }));
  const renderNow = (): void => {
    $results.innerHTML = renderProfileTable(entries, expand, progress);
    $results.classList.add('visible');
  };
  renderNow();
  try {
    for (let ci = 0; ci < PROFILE_SIZES.length; ci++) {
      const logN = PROFILE_SIZES[ci];
      throwIfAborted();
      log('info', `[profile] === log₂(n) = ${logN} (n = ${(1 << logN).toLocaleString()}) ===`);
      const inputs = await generateInputs(logN, false);
      await yieldToBrowser();
      for (let i = 0; i < PROFILE_REPS; i++) {
        throwIfAborted();
        setBusy(true, `profiling log₂(n)=${logN} rep ${i + 1}/${PROFILE_REPS}…`);
        log('info', `[profile]   rep ${i + 1}/${PROFILE_REPS}`);
        const gpu = await runWebGpuOnce(inputs, { profile: true });
        entries[ci].captures.push(gpu.capture);
        progress[ci].done = i + 1;
        renderNow();
        await yieldToBrowser();
      }
    }
    log('ok', `[profile] done — ${PROFILE_SIZES.length} sizes × ${PROFILE_REPS} reps`);
    renderNow();
  } catch (err) {
    log(abortRequested ? 'warn' : 'err', `[profile] ${err instanceof Error ? err.message : String(err)}`);
    if (!abortRequested && err instanceof Error && err.stack) log('err', err.stack);
    // Keep whatever partial table the user has — don't blow it away on abort.
    renderNow();
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
// Capture one MsmV2 run as an aligned CPU+GPU timeline. Host phases come from
// `performance.now()` markers around prepare/encode/submit/decode; the GPU pass
// timestamps come from `timestamp-query` (profile mode). The two clocks are
// joined by anchoring the first GPU pass's begin to the submit instant — the
// scheduling latency between `queue.submit()` and the GPU actually starting is
// the only unmodeled gap (sub-ms in practice).
async function traceOneMsm(inputs: TestInputs): Promise<TraceInput> {
  const msm = await ensureWebGpuWarmed(inputs, true); // profile=true → timestamp-query enrolled
  if (!msm.profileEnabled) {
    throw new Error(
      "trace needs profile mode but this device lacks 'timestamp-query' — enable it via " +
        'chrome://flags/#enable-unsafe-webgpu (or --enable-dawn-features=allow_unsafe_apis).',
    );
  }
  const device = gpuDevice!;
  // Warm prepare + run once so the traced window pays no JIT / first-touch cost.
  await msm.prepare(inputs.scalarsBuf);
  await msm.run();

  // Defeat prepare()'s identity cache so the traced prepare does real work.
  const reident = new Uint8Array(inputs.scalarsBuf.buffer, inputs.scalarsBuf.byteOffset, inputs.scalarsBuf.byteLength);
  const tPrep0 = performance.now();
  await msm.prepare(reident);
  const tPrep1 = performance.now();

  const staging = device.createBuffer({
    size: msm.windowSumsByteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  const tEnc0 = performance.now();
  const enc = device.createCommandEncoder();
  msm.encodeIntoBatch(enc, staging, 0);
  const cb = enc.finish();
  const tEnc1 = performance.now(); // ≈ the submit instant
  device.queue.submit([cb]);
  await staging.mapAsync(GPUMapMode.READ);
  const tMapped = performance.now();
  staging.unmap();
  const tDecode = performance.now();

  // Per-pass GPU timestamps for THIS submit (rebased so pass 0 begins at 0 ns).
  const passes = await msm.readProfilePassTimeline();
  staging.destroy();
  if (passes.length === 0) {
    log('warn', '[trace] no GPU pass timestamps captured — the GPU track will be empty');
  }

  const cpu: TraceSpan[] = [
    { name: 'prepare', startMs: tPrep0, endMs: tPrep1 },
    { name: 'encode', startMs: tEnc0, endMs: tEnc1 },
    { name: 'submit+wait', startMs: tEnc1, endMs: tMapped },
    { name: 'decode', startMs: tMapped, endMs: tDecode },
  ];
  // Anchor the GPU clock onto the CPU clock: pass 0's begin (0 ns) = submit.
  const gpu: TraceSpan[] = passes.map(p => ({
    name: p.label,
    startMs: tEnc1 + p.beginNs / 1e6,
    endMs: tEnc1 + p.endNs / 1e6,
    args: { gpu_us: Math.round((p.endNs - p.beginNs) / 1000) },
  }));
  return { cpu, gpu };
}

// Trace → Perfetto: capture one aligned CPU+GPU run and download a trace-event
// JSON. Open it at https://ui.perfetto.dev. WebGPU-only; no WASM/COI needed.
$runTrace.addEventListener('click', async () => {
  $log.innerHTML = '';
  abortRequested = false;
  setBusy(true, 'tracing…');
  try {
    const logN = readLogN();
    const inputs = await generateInputs(logN, false);
    log('info', `[trace] capturing aligned CPU+GPU trace at n=${inputs.n.toLocaleString()}…`);
    const trace = await traceOneMsm(inputs);
    const json = buildPerfettoTrace(trace);
    const fname = `msmv2-trace-n${inputs.n}-${Date.now()}.json`;
    downloadTrace(json, fname);
    log('ok', `[trace] downloaded ${fname} — open it at https://ui.perfetto.dev → "Open trace file".`);
    log('info', `[trace] CPU spans=${trace.cpu.length}, GPU passes=${trace.gpu.length} (one process, two tracks).`);
  } catch (err) {
    log(abortRequested ? 'warn' : 'err', `[trace] ${err instanceof Error ? err.message : String(err)}`);
    if (!abortRequested && err instanceof Error && err.stack) log('err', err.stack);
  } finally {
    setBusy(false);
  }
});

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
    // Sanity runs with profile=false, so per-pass breakdown is unavailable
    // — click the Profile button for that.
    $results.innerHTML = '';
    $results.classList.remove('visible');
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

// --- Batch MSM (WebGPU-only) ------------------------------------------------
//
// Exercises BatchMsmV2 — the same-N batched MSM path designed for the Chonk
// W_L/W_R/W_O (B=3) and translator range-constraint poly (B=10) batches.
//
// For each B in {3, 10}:
//   1. Generate B independent random scalar buffers (n × 32 LE Fr).
//   2. Build a BatchMsmV2 (one SRS upload + Montgomery convert shared across
//      slots; per-slot scratch).
//   3. Time `prepareAll + runAll`.
//   4. Build a single solo MsmV2 (same n, same pool) and time B serial
//      prepare+run runs as the baseline.
//   5. Cross-check every per-slot result against its solo counterpart.
//   6. Report wall ms / GPU ms / speedup.
//
// See barretenberg/ts/src/msm_webgpu/BATCH_MSM_DESIGN.md for the algorithm.
async function runBatchOnce(
  logN: number,
  B: number,
): Promise<{
  wallBatchMs: number;
  gpuBatchMs: number;
  wallSoloMs: number;
  gpuSoloMs: number;
  perSlot: { batch: { x: bigint; y: bigint }; solo: { x: bigint; y: bigint }; matched: boolean }[];
  /** WASM baseline (null when COI is off or the baseline threw). */
  wasmRunOnlyMs: number | null;
  wasmWallMs: number | null;
  wasmAllMatch: boolean | null;
}> {
  if (!('gpu' in navigator)) throw new Error('navigator.gpu is undefined — no WebGPU in this browser');
  if (srsBuf === null) throw new Error('SRS not loaded yet');
  const n = 1 << logN;
  if (gpuDevice === null) {
    log('info', '[batch] acquiring GPUDevice');
    gpuDevice = await get_device();
  }

  // Tear down any cached solo MsmV2 / pool — the BatchMsmV2 owns its own
  // pool (master pool inside the batch), and we want a clean slate so the
  // pool/cache state from a prior Run / Sweep doesn't bleed into the batch
  // measurement. The cached state is rebuilt lazily on the next Run.
  if (msmV2 !== null) {
    msmV2.destroy();
    msmV2 = null;
    msmV2Pool?.destroy();
    msmV2Pool = null;
    msmV2LogN = null;
  }

  // Generate B independent random scalar buffers — the W_L/W_R/W_O case is
  // 3 different witness polys committed against the same SRS prefix; the
  // translator range-constraint case is 10 different polys. Each is a
  // fresh random Fr vector.
  log('info', `[batch] generating ${B} random scalar buffers (n=${n.toLocaleString()} each)`);
  const tGen0 = performance.now();
  // Helper: B fresh random scalar buffers. Used twice (warm-up + timed) so
  // both passes get distinct Uint8Array identities — `MsmV2.prepare()` keys
  // its no-op cache on the scalar buffer reference, and re-using one buffer
  // across passes makes the second prepare a silent no-op that leaves the
  // first pass's plan in place.
  const genScalars = (): Uint8Array[] => {
    const out: Uint8Array[] = new Array(B);
    for (let b = 0; b < B; b++) {
      const buf = new Uint8Array(n * 32);
      for (let i = 0; i < n; i++) buf.set(biToLe32(randomFr(), `[batch ${b}].scalar[${i}]`), i * 32);
      out[b] = buf;
    }
    return out;
  };
  log('info', `[batch] inputs generated in ${(performance.now() - tGen0).toFixed(0)} ms`);

  const pointsBuf = new Uint8Array(srsBuf.buffer, srsBuf.byteOffset, n * 64);

  // --- Batched path -------------------------------------------------------
  log('info', `[batch] building BatchMsmV2 (B=${B}, n=${n.toLocaleString()})…`);
  const tBuild0 = performance.now();
  const batch = await BatchMsmV2.create(gpuDevice, pointsBuf, n, B);
  log('info', `[batch] build done in ${(performance.now() - tBuild0).toFixed(0)} ms`);
  // Sanity check: every slot must point at the master pool's SRS buffers
  // (poolX/Y) but its own pool object — anything else means the wiring of
  // `fromSharedSrs` regressed and slots are inadvertently sharing scratch.
  {
    const poolXId = (batch.pool.poolX as unknown as { __id?: number }).__id ?? Math.random();
    void poolXId;
    log(
      'info',
      `[batch] slot wiring check: c=${batch.instances[0].c}, ` +
        `numWindows=${batch.instances[0].numWindows}, ` +
        `winSumsBytes=${batch.instances[0].windowSumsByteLength}`,
    );
  }

  // Warm pass on throwaway scalars: first prepare+run pays driver lazy-init
  // costs we don't want in the steady-state measurement. The warm scalars'
  // buffer identities are NEVER used again — the timed pass below allocates
  // brand-new buffers so each slot's `MsmV2.preparedFor` identity cache
  // misses and re-runs prepare with the real timed scalars.
  log('info', `[batch] warm-up pass…`);
  await batch.prepareAll(genScalars());
  await batch.runAll();

  // Timed scalars: fresh Uint8Array identities so prepare() doesn't no-op.
  // These are the inputs both the batched and solo paths run against so the
  // cross-check is apples-to-apples.
  const scalarsList = genScalars();

  log('info', `[batch] timed batch run…`);
  const tBatchPrep0 = performance.now();
  await batch.prepareAll(scalarsList);
  const tBatchPrepEnd = performance.now();
  const batchOut = await batch.runAll();
  const tBatchEnd = performance.now();
  const wallBatchMs = tBatchEnd - tBatchPrep0;
  log(
    'info',
    `[batch] B=${B} prepareAll=${(tBatchPrepEnd - tBatchPrep0).toFixed(1)}ms ` +
      `runAll wall=${batchOut.wallMs.toFixed(1)}ms gpu=${batchOut.gpuMs.toFixed(1)}ms ` +
      `total=${wallBatchMs.toFixed(1)}ms`,
  );

  // --- Solo baseline path -------------------------------------------------
  log('info', `[batch] solo baseline: ${B} sequential MsmV2.prepare + run on one instance…`);
  // The batch already owns a pool; reuse it for the solo baseline so we
  // don't pay an extra SRS upload + Montgomery-convert in the baseline path.
  const soloMsm = await MsmV2.create(gpuDevice, n, batch.pool, { warmupRuns: 0, combineOnHost: true });
  // Warm-up so the solo baseline's first run is steady-state too.
  await soloMsm.prepare(scalarsList[0]);
  await soloMsm.run();

  const soloResults: { x: bigint; y: bigint }[] = new Array(B);
  const tSolo0 = performance.now();
  let gpuSoloMs = 0;
  for (let b = 0; b < B; b++) {
    // Force a fresh slice so prepare()'s identity-cache doesn't no-op
    // (the warm-up's scalarsList[0] is the same object we'd hand it now).
    const reidentified = new Uint8Array(scalarsList[b].buffer, scalarsList[b].byteOffset, scalarsList[b].byteLength);
    await soloMsm.prepare(reidentified);
    const tRun0 = performance.now();
    const r = await soloMsm.run();
    gpuSoloMs += performance.now() - tRun0;
    soloResults[b] = { x: r.x, y: r.y };
  }
  const wallSoloMs = performance.now() - tSolo0;
  log('info', `[batch] solo baseline total wall=${wallSoloMs.toFixed(1)}ms (gpu-only=${gpuSoloMs.toFixed(1)}ms)`);

  // --- Cross-check --------------------------------------------------------
  const perSlot = batchOut.results.map((batchResult, b) => ({
    batch: batchResult,
    solo: soloResults[b],
    matched: batchResult.x === soloResults[b].x && batchResult.y === soloResults[b].y,
  }));
  const allMatch = perSlot.every(s => s.matched);
  if (allMatch) {
    log('ok', `[batch] correctness OK — all ${B} batched results match solo MSMs`);
  } else {
    for (let b = 0; b < B; b++) {
      if (!perSlot[b].matched) {
        log(
          'err',
          `[batch] MISMATCH slot ${b}: batch.x=${perSlot[b].batch.x.toString(16).slice(0, 16)}… vs ` +
            `solo.x=${perSlot[b].solo.x.toString(16).slice(0, 16)}…`,
        );
      }
    }
  }

  // --- WASM batch baseline (true `batch_multi_scalar_mul_native` call) ---
  //
  // Calls the new `bb_native_pippenger_bn254_batch_{load,run}` exports
  // which wrap `MSM::batch_multi_scalar_mul_native` with a vector of B
  // spans. This is the native code path that the production Chonk wires
  // (W_L/W_R/W_O, translator range constraints) actually go through —
  // unlike B serial single-MSM `_run` calls, which serialize per-MSM
  // Pippenger setup that the batch path can overlap across the whole
  // batch via one `parallel_for`.
  //
  // We log two numbers:
  //   wasmRunOnlyMs: the timed _batch_run window (Pippenger compute only,
  //     matches the existing `Run` button's measurement convention).
  //   wasmWallMs:    end-to-end including _batch_load (heap upload + native
  //     vector decode) — honest wall vs the WebGPU `wallBatchMs` which
  //     includes upload + plan.
  let wasmRunOnlyMs: number | null = null;
  let wasmWallMs: number | null = null;
  let wasmAllMatch: boolean | null = null;
  if (WASM_AVAILABLE) {
    try {
      log('info', `[batch] WASM baseline: batch_multi_scalar_mul_native with B=${B} spans (true batch)…`);
      const handle = await ensureWasmBooted();
      const threads = handle.threads;
      const tWasmWall0 = performance.now();
      await handle.loadBatchMsm(pointsBuf, scalarsList);
      const tWasmRun0 = performance.now();
      const out = await handle.runBatchMsm(threads);
      wasmRunOnlyMs = performance.now() - tWasmRun0;
      wasmWallMs = performance.now() - tWasmWall0;
      const wasmResults: { x: bigint; y: bigint }[] = new Array(B);
      for (let b = 0; b < B; b++) wasmResults[b] = parseAffineLE(out.subarray(b * 64, b * 64 + 64));
      wasmAllMatch = wasmResults.every((r, b) => r.x === perSlot[b].batch.x && r.y === perSlot[b].batch.y);
      if (wasmAllMatch) {
        log('ok', `[batch] WASM↔batch correctness OK (${B} results match)`);
      } else {
        for (let b = 0; b < B; b++) {
          if (wasmResults[b].x !== perSlot[b].batch.x || wasmResults[b].y !== perSlot[b].batch.y) {
            log(
              'err',
              `[batch] WASM↔batch MISMATCH slot ${b}: wasm.x=${wasmResults[b].x.toString(16).slice(0, 16)}… ` +
                `vs batch.x=${perSlot[b].batch.x.toString(16).slice(0, 16)}…`,
            );
          }
        }
      }
    } catch (e) {
      log('warn', `[batch] WASM baseline skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    log(
      'info',
      `[batch] WASM baseline skipped — page is not cross-origin isolated. ` +
        `Click 'Enable WASM (reload with COI)' to compare against the WASM Pippenger.`,
    );
  }

  soloMsm.destroy();
  batch.destroy();
  // The batch teardown freed the pool that solo was bound to, so null out
  // the module caches so the next Run rebuilds from scratch.
  msmV2 = null;
  msmV2Pool = null;
  msmV2LogN = null;

  return {
    wallBatchMs,
    gpuBatchMs: batchOut.gpuMs,
    wallSoloMs,
    gpuSoloMs,
    perSlot,
    wasmRunOnlyMs,
    wasmWallMs,
    wasmAllMatch,
  };
}

$runBatch.addEventListener('click', async () => {
  $log.innerHTML = '';
  abortRequested = false;
  setBusy(true, 'batch MSM…');
  try {
    // Bump this version string whenever the batch path changes — printed at
    // the top of every Batch MSM run so you can confirm at a glance which
    // code revision is actually executing in the browser. (Vite usually
    // hot-reloads, but cached service-worker bundles have bitten us.)
    log(
      'info',
      `[batch] rev 9: Tier 2 production path — GPU histogram (correctness now Node-tested), ` +
        `planner NUM_WINDOWS=B·W, pool-owned carryOffBuf`,
    );
    const logN = readLogN();
    log('info', `[batch] log₂(n) = ${logN} (n = ${(1 << logN).toLocaleString()})`);
    log('info', `[batch] target batches: B=3 (W_L/W_R/W_O), B=10 (translator range constraints)`);

    for (const B of [3, 10]) {
      throwIfAborted();
      log('info', '');
      log('info', `--- Batch B=${B} ---`);
      const r = await runBatchOnce(logN, B);
      const speedup = r.wallSoloMs / r.wallBatchMs;
      const gpuSpeedup = r.gpuSoloMs / r.gpuBatchMs;
      const verdict = r.perSlot.every(s => s.matched) ? 'PASS' : 'FAIL';
      log(
        'ok',
        `[batch] B=${B} verdict=${verdict} ` +
          `wall: batch=${r.wallBatchMs.toFixed(1)}ms solo=${r.wallSoloMs.toFixed(1)}ms ` +
          `speedup=${speedup.toFixed(2)}× ` +
          `(gpu-only: ${r.gpuBatchMs.toFixed(1)}ms vs ${r.gpuSoloMs.toFixed(1)}ms, ${gpuSpeedup.toFixed(2)}×)`,
      );
      if (r.wasmRunOnlyMs !== null && r.wasmWallMs !== null) {
        // The "vs WASM" ratios use the WebGPU batch path's wall time as the
        // numerator we want to *beat*; > 1.0× means batch is faster than
        // WASM. `run-only` is the Pippenger-compute portion of the WASM
        // wall (matching the existing `Run` button convention); `wall` is
        // the whole serial sequence of B load+run calls.
        const wasmRunSpeedup = r.wasmRunOnlyMs / r.wallBatchMs;
        const wasmWallSpeedup = r.wasmWallMs / r.wallBatchMs;
        const correctness = r.wasmAllMatch === false ? ' [MISMATCH!]' : '';
        log(
          'ok',
          `[batch] B=${B} vs WASM-MT(${MT_THREADS_DEFAULT}t) serial: ` +
            `wasm-run-only=${r.wasmRunOnlyMs.toFixed(1)}ms (${wasmRunSpeedup.toFixed(2)}×), ` +
            `wasm-wall=${r.wasmWallMs.toFixed(1)}ms (${wasmWallSpeedup.toFixed(2)}×)${correctness}`,
        );
      }
    }
  } catch (err) {
    log(abortRequested ? 'warn' : 'err', `[batch] ${err instanceof Error ? err.message : String(err)}`);
    if (!abortRequested && err instanceof Error && err.stack) log('err', err.stack);
  } finally {
    setBusy(false);
  }
});

$runBatchSweep.addEventListener('click', async () => {
  $log.innerHTML = '';
  abortRequested = false;
  setBusy(true, 'batch sweep…');
  try {
    log('info', `[batch-sweep] rev 3 — sweeping log₂(n) ∈ {15, 16, 17, 18} × B ∈ {3, 10}`);
    log(
      'info',
      `[batch-sweep] this covers the translator range-constraint poly sizes (≈2^15..2^17) ` +
        `and the W_L/W_R/W_O witness column sizes (≈2^17, sometimes 2^18). One measurement per ` +
        `(logN, B); first run at each (logN, B) eats a warm-up pass internally.`,
    );

    interface Row {
      logN: number;
      B: number;
      wallBatchMs: number;
      gpuBatchMs: number;
      wallSoloMs: number;
      gpuSoloMs: number;
      wasmRunOnlyMs: number | null;
      wasmWallMs: number | null;
      verdict: 'PASS' | 'FAIL';
    }
    const rows: Row[] = [];

    const LOGNS = [15, 16, 17, 18] as const;
    const BS = [3, 10] as const;
    let stepIdx = 0;
    const stepTotal = LOGNS.length * BS.length;
    for (const B of BS) {
      for (const logN of LOGNS) {
        throwIfAborted();
        stepIdx++;
        log('info', '');
        log('info', `--- step ${stepIdx}/${stepTotal}: log₂(n)=${logN}, B=${B} ---`);
        const r = await runBatchOnce(logN, B);
        const verdict: 'PASS' | 'FAIL' = r.perSlot.every(s => s.matched) ? 'PASS' : 'FAIL';
        rows.push({
          logN,
          B,
          wallBatchMs: r.wallBatchMs,
          gpuBatchMs: r.gpuBatchMs,
          wallSoloMs: r.wallSoloMs,
          gpuSoloMs: r.gpuSoloMs,
          wasmRunOnlyMs: r.wasmRunOnlyMs,
          wasmWallMs: r.wasmWallMs,
          verdict,
        });
        log(
          'info',
          `[batch-sweep] (logN=${logN}, B=${B}) verdict=${verdict} batch=${r.wallBatchMs.toFixed(0)}ms ` +
            `solo=${r.wallSoloMs.toFixed(0)}ms ` +
            (r.wasmWallMs !== null
              ? `wasm-wall=${r.wasmWallMs.toFixed(0)}ms wasm-run=${r.wasmRunOnlyMs?.toFixed(0)}ms`
              : `wasm=skipped`),
        );
        // Yield between steps so the renderer can paint the log + a Stop click
        // can land. Without this the 8 runs feel like a frozen tab.
        await yieldToBrowser(16);
      }
    }

    // --- Summary table ---------------------------------------------------
    log('info', '');
    log('info', `--- Batch sweep summary (all wall times in ms) ---`);
    const hdr = `  B  logN |   batch   solo    wasm-run    wasm-wall | batch/solo  batch/wasm-run  batch/wasm-wall | verdict`;
    log('info', hdr);
    log(
      'info',
      `  ---  ----   -------  ------   ---------   ---------   ----------  --------------  --------------   -------`,
    );
    for (const r of rows) {
      const ratioSolo = r.wallSoloMs / r.wallBatchMs;
      const ratioWasmRun = r.wasmRunOnlyMs !== null ? r.wasmRunOnlyMs / r.wallBatchMs : null;
      const ratioWasmWall = r.wasmWallMs !== null ? r.wasmWallMs / r.wallBatchMs : null;
      const w = (v: number, n = 8) => v.toFixed(0).padStart(n);
      const ratio = (v: number | null, n = 9) => (v === null ? '       —'.padStart(n) : `${v.toFixed(2)}×`.padStart(n));
      log(
        'info',
        `  ${String(r.B).padStart(2)}  ${String(r.logN).padStart(2)}   |  ${w(r.wallBatchMs)}  ${w(r.wallSoloMs)}   ${
          r.wasmRunOnlyMs !== null ? w(r.wasmRunOnlyMs) : '      —'
        }     ${r.wasmWallMs !== null ? w(r.wasmWallMs) : '      —'} | ${ratio(ratioSolo)}      ${ratio(
          ratioWasmRun,
        )}        ${ratio(ratioWasmWall)} | ${r.verdict}`,
      );
    }
    log('info', '');
    log(
      'ok',
      `[batch-sweep] done. Ratios > 1.0× mean batch is faster. The "batch/wasm-wall" ` +
        `column is the headline: it's the apples-to-apples comparison vs the existing WASM ` +
        `Pippenger path (load + run × B).`,
    );

    // Stash on window for any external harness or e2e script that wants to
    // pull the table without scraping the log.
    (window as unknown as { __batchSweep?: unknown }).__batchSweep = rows;
  } catch (err) {
    log(abortRequested ? 'warn' : 'err', `[batch-sweep] ${err instanceof Error ? err.message : String(err)}`);
    if (!abortRequested && err instanceof Error && err.stack) log('err', err.stack);
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
// fetch is just a download + JS-side decompression (no native workers),
// so it's safe to run unconditionally at page load.
(async () => {
  setBusy(true, 'loading SRS…');
  try {
    // Page-load detects the IndexedDB cache hit through the info log line —
    // it's the only signal `loadSrsPoints` gives for that case. When cached,
    // fetch / decompress both report 0 ms; when not, the final phase events
    // for each phase carry the cumulative `elapsedMs`.
    setupTimings.srs_cached = true;
    srsBuf = await loadSrsPoints(SRS_NUM_POINTS, event => {
      if (event.kind === 'info') {
        // A non-cache info line means we went through the download/decompress
        // path; flip srs_cached so the 0 ms timings get reported as real.
        if (!event.msg.includes('IndexedDB cache')) setupTimings.srs_cached = false;
        log('info', event.msg);
      } else if (event.kind === 'phase') {
        if (event.phase === 'download') setupTimings.srs_fetch_ms = event.elapsedMs;
        else if (event.phase === 'decompress') setupTimings.srs_decompress_ms = event.elapsedMs;
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
  if (autorun === 'msm-cross-check') {
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
      const results = {
        cross_ok: crossOk,
        cross_err: crossErr ?? null,
        gpu_line: gpuLine ?? null,
        err_count: errLines.length,
        debug_dump: dump ?? null,
        tree_dump: treeDump ?? null,
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
  }
})();
