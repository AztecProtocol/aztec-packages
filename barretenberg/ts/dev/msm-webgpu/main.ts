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
import { createWasmPippenger, parseAffineLE, type WasmPippengerHandle } from './pippenger_wasm.js';
import { loadSrsPoints, type SrsEvent } from './srs.js';
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

// One-time setup phase timings, populated as SRS load / pool build run. The
// breakdown renderer reads these to show the "Setup" section alongside the
// per-MSM table. `srs_fetch_ms` and `srs_decompress_ms` are populated from
// SrsEvent's `kind: 'phase'` events at page boot; `pool_*` are populated when
// MsmV2Pool.create runs with `{ profile: true }` on the first Profile click.
interface SetupTimings {
  srs_fetch_ms: number;
  srs_decompress_ms: number;
  srs_cached: boolean;
  pool_upload_ms: number;
  pool_upload_bytes: number;
  pool_convert_ms: number;
  pool_built: boolean;
}
const setupTimings: SetupTimings = {
  srs_fetch_ms: 0,
  srs_decompress_ms: 0,
  srs_cached: false,
  pool_upload_ms: 0,
  pool_upload_bytes: 0,
  pool_convert_ms: 0,
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
    // `?hostLevelWalk=1`: GPU histogram + host JS level walk. Default is
    // GPU histogram + GPU level walk in one submit. Use the flag to A/B
    // the cost of moving the per-level walk to the GPU.
    useHostLevelWalk: q.get('hostLevelWalk') === '1',
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
      setupTimings.pool_upload_ms = msmV2Pool.createProfile.upload_ms;
      setupTimings.pool_upload_bytes = msmV2Pool.createProfile.upload_bytes;
      setupTimings.pool_convert_ms = msmV2Pool.createProfile.convert_ms;
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
    const reidentified = new Uint8Array(inputs.scalarsBuf.buffer, inputs.scalarsBuf.byteOffset, inputs.scalarsBuf.byteLength);
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

function buildColumns(
  entries: { logN: number; captures: ProfileCapture[] }[],
  expand: boolean,
): ProfileColumn[] {
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
      const nb = host
        ? `numBatches=${host.numBatches}, batchWindows=${host.batchWindows}`
        : 'no data yet';
      const prog = progress?.[i];
      let tag = '';
      if (prog) {
        if (prog.done === 0) tag = ' <span class="samples">(pending)</span>';
        else if (prog.done < prog.target)
          tag = ` <span class="samples">(${prog.done}/${prog.target}…)</span>`;
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
  }: { key: keyof MedianedHost; denom: 'wall' | 'e2e'; indent?: 0 | 1 | 2 }): string => {
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

  const setupSection = setupTimings.pool_built
    ? `
  <h3>Setup (one-time)</h3>
  <table>
    <tr><th>Phase</th><th>ms</th><th>notes</th></tr>
    <tr><td>srs_fetch</td><td>${fmtTime(setupTimings.srs_fetch_ms)}</td><td>${setupTimings.srs_cached ? '(cached)' : ''}</td></tr>
    <tr><td>srs_decompress</td><td>${fmtTime(setupTimings.srs_decompress_ms)}</td><td>${setupTimings.srs_cached ? '(cached)' : ''}</td></tr>
    <tr><td>pool_upload</td><td>${fmtTime(setupTimings.pool_upload_ms)}</td><td>${fmtBytes(setupTimings.pool_upload_bytes)} writeBuffer</td></tr>
    <tr><td>pool_convert</td><td>${fmtTime(setupTimings.pool_convert_ms)}</td><td>GPU dispatch</td></tr>
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
      ...orderedLabels.map(label =>
        [label, ...cols.flatMap(c => csvCellFor(c.stagesMap, label, c.wall))].join(','),
      ),
      ['profiled_sum', ...cols.flatMap(c => csvNumFor(c.profiledSum, c.wall))].join(','),
      ['gpu_other', ...cols.flatMap(c => csvNumFor(c.gpuOther, c.wall))].join(','),
      ['wall', ...cols.flatMap(c => csvNumFor(c.wall, c.wall))].join(','),
      ['e2e', ...cols.flatMap(c =>
        c.host ? csvNumFor(c.host.host_prepare + c.wall, c.host.host_prepare + c.wall) : ['', ''],
      )].join(','),
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
  $results.innerHTML =
    renderConsistencyTable(refRow) + renderPerfTable(rows);
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
      const state = (debugSmvp || debugTreeOut)
        ? ((dump !== undefined || treeDump !== undefined) ? 'done' : 'error')
        : (crossOk && errLines.length === 0 ? 'done' : 'error');
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
