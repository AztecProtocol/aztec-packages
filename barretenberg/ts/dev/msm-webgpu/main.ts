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
import { MsmV2, MsmV2Pool, type MsmConfig } from '../../src/msm_webgpu/msm_v2.js';
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
const LOGN_MIN = 8;
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
  return {
    c: optInt('c'),
    s: optInt('s'),
    wgi: optInt('wgi'),
    reduceWg: optInt('reducewg'),
    l0Log: optInt('l0log'),
    invVariant: q.get('inv') === 'loop' ? 'loop' : q.get('inv') === 'pk' ? 'pk' : undefined,
    accum: q.get('accum') === 'coop' ? 'coop' : q.get('accum') === 'walker' ? 'walker' : undefined,
    coopG: optInt('coopg'),
    profile: q.get('profile') === '1' || q.get('autorun') === 'msm-bench' || undefined,
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
  await msm.run();
  const t0 = performance.now();
  const gpu = await msm.run();
  const ms = performance.now() - t0;
  log('info', `[gpu] returned in ${ms.toFixed(1)} ms`);
  // MsmV2 does not emit a per-pass GPU profile; the breakdown table skips
  // a null-profile capture, so the GPU column there simply renders empty.
  return { ms, xy: gpu, capture: { profile: null } };
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
// fetch is just a download + JS-side decompression (no native workers),
// so it's safe to run unconditionally at page load.
// For the msm-accum-ab BrowserStack sweep the SRS download runs in this boot
// block — before the autorun branch — and on mobile it dominates the wall. We
// emit progress from here (and reuse this client in the autorun branch) so the
// runner's first-progress/stall watchdog sees the SRS phase and both phases
// share ONE runId. A boot-start ping also distinguishes "device never reached
// the page / can't POST" from "device is busy loading SRS".
const accumAbActive = new URLSearchParams(window.location.search).get('autorun') === 'msm-accum-ab';
const accumAbClient = accumAbActive ? makeResultsClient({ page: 'msm-accum-ab' }) : null;

(async () => {
  setBusy(true, 'loading SRS…');
  try {
    accumAbClient?.postProgress({ phase: 'boot-start', ua: navigator.userAgent, webgpu: 'gpu' in navigator });
    let lastSrsPost = 0;
    // Optional `?srs_logn=N` caps the SRS download to 2^N points instead of
    // the full 2^LOGN_MAX. A mobile BrowserStack run that only sweeps up to
    // logn 16 has no reason to pull 16× the data (2^20) over the tunnel — the
    // oversized download was overrunning the first-progress watchdog.
    const srsLognCap = parseInt(new URLSearchParams(window.location.search).get('srs_logn') ?? '', 10);
    const srsNumPoints =
      Number.isFinite(srsLognCap) && srsLognCap >= LOGN_MIN && srsLognCap <= LOGN_MAX
        ? 1 << srsLognCap
        : SRS_NUM_POINTS;
    srsBuf = await loadSrsPoints(srsNumPoints, event => {
      if (event.kind === 'info') {
        log('info', event.msg);
      } else if (event.kind === 'phase') {
        renderProgress(event);
        // Heartbeat at most every 5 s so the watchdog sees the SRS download.
        if (accumAbClient && performance.now() - lastSrsPost > 5000) {
          lastSrsPost = performance.now();
          accumAbClient.postProgress({ phase: 'srs', srsPhase: event.phase, current: event.current, total: event.total });
        }
      } else if (event.kind === 'done') {
        hideProgress();
      }
    });
    log('ok', `SRS loaded: ${srsNumPoints.toLocaleString()} points available.`);
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
  if (autorun === 'msm-noble') {
    // Direct GPU-vs-noble cross-check at an arbitrary (small) logN. Unlike
    // msm-cross-check (which compares GPU against the WASM Pippenger and only
    // consults noble at logN=16), this generates the points/scalars with a
    // noble mirror, runs the GPU MSM, and compares the affine result to
    // noble's reference. Headless-SwiftShader friendly: no WASM boot.
    const autorunLogN = parseInt(qp.get('logn') ?? '10', 10);
    const client = makeResultsClient({ page: 'msm-noble' });
    log('info', `[noble-xcheck] logN=${autorunLogN}`);
    try {
      const inputs = await generateInputs(autorunLogN, /*mirrorForNoble=*/ true);
      const { xy } = await runWebGpuOnce(inputs);
      const ref = referenceMsm(inputs.points!, inputs.scalars!);
      const agree = pointsEqual(xy, ref);
      if (agree) {
        log('ok', `[noble-xcheck] cross-check agree (gpu == noble) at logN=${autorunLogN}`);
      } else {
        log('err', `[noble-xcheck] cross-check disagreement: gpu.x=0x${xy.x.toString(16)} noble.x=0x${ref.x.toString(16)}`);
      }
      const state = agree ? 'done' : 'error';
      await client.postResults({
        state,
        params: { logN: autorunLogN, page: 'msm-noble' },
        results: { cross_ok: agree, gpu_x: '0x' + xy.x.toString(16), noble_x: '0x' + ref.x.toString(16) },
        error: agree ? null : 'gpu != noble',
        log: [],
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
      log(state === 'done' ? 'ok' : 'err', `[autorun] state=${state}`);
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      log('err', `[noble-xcheck] FATAL: ${msg}`);
      await client.postResults({
        state: 'error',
        params: { logN: autorunLogN, page: 'msm-noble' },
        results: null,
        error: msg,
        log: [],
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
      log('err', `[autorun] state=error`);
    }
  } else if (autorun === 'msm-accum-ab') {
    // Same-device A/B benchmark of both bucket-accumulate kernels in ONE page
    // load (identical thermal state, one BrowserStack worker for the pair).
    // GPU-only, no WASM, no noble. Posts {walker, coop} min/median ms.
    const logns = (qp.get('logns') ?? qp.get('logn') ?? '14')
      .split(',').map(x => parseInt(x, 10)).filter(x => Number.isFinite(x));
    const reps = parseInt(qp.get('reps') ?? '12', 10);
    const order = (qp.get('order') ?? 'walker,coop').split(',') as ('walker' | 'coop')[];
    const client = accumAbClient ?? makeResultsClient({ page: 'msm-accum-ab' });
    log('info', `[ab] logns=${logns.join(',')} reps=${reps} order=${order.join(',')}`);
    try {
      // Heartbeat into the JSONL while waiting for the SRS load (the only
      // thing gating $run) so the BrowserStack first-progress/stall watchdog
      // sees life during the (mobile, over-the-tunnel) download.
      for (let i = 0; i < 1200; i++) {
        if (!$run.disabled) break;
        if (i % 20 === 0) client.postProgress({ phase: 'waiting-srs', i });
        await new Promise(r => setTimeout(r, 500));
      }
      const device = await get_device();
      // Global warmup so the first real sweep entry doesn't eat one-time
      // driver JIT / cold GPU-clock cost (otherwise the first logN reads
      // anomalously high — e.g. seconds instead of ms).
      {
        const wi = await generateInputs(logns[0], false);
        const wpool = await MsmV2Pool.create(device, wi.pointsBuf);
        const wmsm = await MsmV2.create(device, wi.n, wpool, { ...gpuKnobs, accum: 'walker' });
        wmsm.prepare(wi.scalarsBuf);
        await wmsm.run();
        await wmsm.run();
        wmsm.destroy();
        wpool.destroy();
      }
      // Heartbeat so the BrowserStack watchdog sees first-progress before the
      // (slow on mobile) per-(logN,accum) pipeline builds + reps run. The
      // msm-accum-ab sweep otherwise only posts once at the very end.
      client.postProgress({ phase: 'warmup-done', logns: logns.join(',') });
      const sweep: Record<string, unknown>[] = [];
      for (const logN of logns) {
        const inputs = await generateInputs(logN, /*mirrorForNoble=*/ false);
        const pool = await MsmV2Pool.create(device, inputs.pointsBuf);
        const out: Record<string, { min: number; median: number; avg: number; samples: number[] }> = {};
        for (const accum of order) {
          client.postProgress({ phase: 'build', logN, accum });
          const msm = await MsmV2.create(device, inputs.n, pool, { ...gpuKnobs, accum });
          msm.prepare(inputs.scalarsBuf);
          await msm.run(); // warmup (untimed)
          const samples: number[] = [];
          for (let r = 0; r < reps; r++) {
            const t0 = performance.now();
            await msm.run();
            samples.push(performance.now() - t0);
            client.postProgress({ phase: 'rep', logN, accum, rep: r, ms: samples[r] });
          }
          msm.destroy();
          const sorted = [...samples].sort((a, b) => a - b);
          const min = sorted[0];
          const median = sorted[Math.floor(sorted.length / 2)];
          const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
          out[accum] = { min, median, avg, samples };
          log('ok', `[ab] logN=${logN} accum=${accum}: min=${min.toFixed(1)} median=${median.toFixed(1)} ms`);
        }
        pool.destroy();
        const speedup = out.walker && out.coop ? out.walker.min / out.coop.min : null;
        if (speedup !== null) {
          log('ok', `[ab] logN=${logN} coop speedup vs walker (min): ${speedup.toFixed(3)}x`);
        }
        sweep.push({ logN, ...out, speedup_min: speedup });
      }
      await client.postResults({
        state: 'done',
        params: { logns: logns.join(','), reps, page: 'msm-accum-ab' },
        results: { reps, sweep },
        error: null,
        log: [],
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
      log('ok', `[autorun] state=done`);
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      log('err', `[ab] FATAL: ${msg}`);
      await client.postResults({
        state: 'error',
        params: { logns: logns.join(','), reps, page: 'msm-accum-ab' },
        results: null,
        error: msg,
        log: [],
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
      log('err', `[autorun] state=error`);
    }
  } else if (autorun === 'msm-coop-gsweep') {
    // Same-device granularity sweep of the coop-walker in ONE page load: a
    // walker baseline plus coop at each inversion-granularity G (threads per
    // shared batched inversion). One BrowserStack worker measures the whole
    // curve under identical thermal state. GPU-only, no WASM, no noble.
    const logns = (qp.get('logns') ?? qp.get('logn') ?? '14')
      .split(',').map(x => parseInt(x, 10)).filter(x => Number.isFinite(x));
    const reps = parseInt(qp.get('reps') ?? '12', 10);
    const gs = (qp.get('gsweep') ?? '1,8,16,32,64')
      .split(',').map(x => parseInt(x, 10)).filter(x => Number.isFinite(x) && x > 0);
    const client = makeResultsClient({ page: 'msm-coop-gsweep' });
    log('info', `[gsweep] logns=${logns.join(',')} reps=${reps} G=${gs.join(',')}`);
    const benchOne = async (
      device: GPUDevice, pool: MsmV2Pool, inputs: Awaited<ReturnType<typeof generateInputs>>,
      cfg: Parameters<typeof MsmV2.create>[3],
    ) => {
      const msm = await MsmV2.create(device, inputs.n, pool, cfg);
      msm.prepare(inputs.scalarsBuf);
      await msm.run(); // warmup (untimed)
      const samples: number[] = [];
      for (let r = 0; r < reps; r++) {
        const t0 = performance.now();
        await msm.run();
        samples.push(performance.now() - t0);
      }
      msm.destroy();
      const sorted = [...samples].sort((a, b) => a - b);
      return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)],
        avg: samples.reduce((a, b) => a + b, 0) / samples.length, samples };
    };
    try {
      for (let i = 0; i < 1200; i++) {
        if (!$run.disabled) break;
        await new Promise(r => setTimeout(r, 500));
      }
      const device = await get_device();
      {
        // Global warmup so the first timed entry doesn't eat cold-clock cost.
        const wi = await generateInputs(logns[0], false);
        const wpool = await MsmV2Pool.create(device, wi.pointsBuf);
        const wmsm = await MsmV2.create(device, wi.n, wpool, { ...gpuKnobs, accum: 'walker' });
        wmsm.prepare(wi.scalarsBuf);
        await wmsm.run();
        await wmsm.run();
        wmsm.destroy();
        wpool.destroy();
      }
      const sweep: Record<string, unknown>[] = [];
      for (const logN of logns) {
        const inputs = await generateInputs(logN, /*mirrorForNoble=*/ false);
        const pool = await MsmV2Pool.create(device, inputs.pointsBuf);
        const walker = await benchOne(device, pool, inputs, { ...gpuKnobs, accum: 'walker' });
        log('ok', `[gsweep] logN=${logN} walker: min=${walker.min.toFixed(1)} median=${walker.median.toFixed(1)} ms`);
        client.postProgress({ logN, config: 'walker', min: walker.min, median: walker.median });
        const coop: Record<string, { min: number; median: number; avg: number; samples: number[] }> = {};
        for (const g of gs) {
          const r = await benchOne(device, pool, inputs, { ...gpuKnobs, accum: 'coop', coopG: g });
          coop[`g${g}`] = r;
          log('ok', `[gsweep] logN=${logN} coop G=${g}: min=${r.min.toFixed(1)} median=${r.median.toFixed(1)} ms ` +
            `(speedup vs walker ${(walker.min / r.min).toFixed(3)}x)`);
          client.postProgress({ logN, config: `coop_g${g}`, min: r.min, median: r.median, speedup: walker.min / r.min });
        }
        pool.destroy();
        const speedups: Record<string, number> = {};
        for (const g of gs) speedups[`g${g}`] = walker.min / coop[`g${g}`].min;
        sweep.push({ logN, walker, coop, speedup_min: speedups });
      }
      await client.postResults({
        state: 'done',
        params: { logns: logns.join(','), reps, gsweep: gs.join(','), page: 'msm-coop-gsweep' },
        results: { reps, gs, sweep },
        error: null,
        log: [],
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
      log('ok', `[autorun] state=done`);
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      log('err', `[gsweep] FATAL: ${msg}`);
      await client.postResults({
        state: 'error',
        params: { logns: logns.join(','), reps, gsweep: gs.join(','), page: 'msm-coop-gsweep' },
        results: null,
        error: msg,
        log: [],
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
      log('err', `[autorun] state=error`);
    }
  } else if (autorun === 'msm-accum-bench') {
    // GPU-only timed-reps benchmark for the bucket-accumulate kernel
    // (selected via ?accum=walker|coop). Calls runWebGpuOnce directly — no
    // WASM boot (so the 213-byte stub is irrelevant) and no noble — so it runs
    // on real BrowserStack devices that lack the bb wasm. Posts per-rep ms +
    // min/median for the run() window.
    const autorunLogN = parseInt(qp.get('logn') ?? '16', 10);
    const reps = parseInt(qp.get('reps') ?? '10', 10);
    const accum = gpuKnobs.accum ?? 'walker';
    const client = makeResultsClient({ page: 'msm-accum-bench' });
    log('info', `[accum-bench] logN=${autorunLogN} reps=${reps} accum=${accum}`);
    try {
      // Wait for SRS (Run button leaves the perpetually-disabled state).
      for (let i = 0; i < 1200; i++) {
        if (!$run.disabled) break;
        await new Promise(r => setTimeout(r, 500));
      }
      const inputs = await generateInputs(autorunLogN, /*mirrorForNoble=*/ false);
      const samples: number[] = [];
      for (let r = 0; r < reps; r++) {
        const { ms } = await runWebGpuOnce(inputs);
        samples.push(ms);
        log('info', `[accum-bench] rep ${r + 1}/${reps}: ${ms.toFixed(1)} ms`);
      }
      const sorted = [...samples].sort((a, b) => a - b);
      const min = sorted[0];
      const median = sorted[Math.floor(sorted.length / 2)];
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      log('ok', `[accum-bench] DONE accum=${accum} logN=${autorunLogN}: min=${min.toFixed(1)} median=${median.toFixed(1)} avg=${avg.toFixed(1)} ms`);
      await client.postResults({
        state: 'done',
        params: { logN: autorunLogN, reps, accum, page: 'msm-accum-bench' },
        results: { accum, logN: autorunLogN, samples, min, median, avg },
        error: null,
        log: [],
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
      log('ok', `[autorun] state=done`);
    } catch (e) {
      const msg = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
      log('err', `[accum-bench] FATAL: ${msg}`);
      await client.postResults({
        state: 'error',
        params: { logN: autorunLogN, reps, accum, page: 'msm-accum-bench' },
        results: null,
        error: msg,
        log: [],
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
      });
      log('err', `[autorun] state=error`);
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
        const phaseStr = Object.entries(phases).map(([k, v]) => `${k}=${v.toFixed(1)}`).join(' ');
        log('info', `[bench] rep ${r + 1}/${reps}: wall=${wallMs.toFixed(1)}ms gpu=${gpuMs.toFixed(1)}ms ${phaseStr}`);
      }
      const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const avgWall = avg(samples.map(s => s.wallMs));
      const avgGpu = avg(samples.map(s => s.gpuMs));
      const allPhaseKeys = Array.from(new Set(samples.flatMap(s => Object.keys(s.phases))));
      const avgPhases: Record<string, number> = {};
      for (const key of allPhaseKeys) avgPhases[key] = avg(samples.map(s => s.phases[key] ?? 0));
      const avgPhaseStr = Object.entries(avgPhases).map(([k, v]) => `${k}=${v.toFixed(1)}`).join(' ');
      log('ok', `[bench] DONE logN=${autorunLogN} reps=${reps}: ` +
        `wall=${avgWall.toFixed(1)}ms gpu=${avgGpu.toFixed(1)}ms ${avgPhaseStr}`);
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
      await client.postResults({ state: 'error', params: { logN: autorunLogN, reps, page: 'msm-bench' }, results: null, error: msg, log: allLines.slice(-100), userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency });
    }
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
