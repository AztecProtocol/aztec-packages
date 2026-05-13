// In-browser MSM comparison harness for the BN254 WebGPU port.
//   Compares, for sizes 2^16..2^20 over a real prefix of the public SRS:
//     - WebGPU MSM via `compute_bn254_msm` (this repo's WGSL port)
//     - Barretenberg WASM Pippenger, single-threaded (numThreads = 1)
//     - Barretenberg WASM Pippenger, multi-threaded (numThreads = hw)
//   The WASM path uses `bb_native_pippenger_bn254`, a direct WASM export
//   that skips the BBERG_WEBGPU_MSM_HOOK delegation — calling the regular
//   batch entry point from a hooked WASM would recurse back into the
//   WebGPU bridge. Single-threaded vs multi-threaded both use the same
//   threaded build; the `numThreads` argument overrides bb's runtime
//   concurrency for the duration of the call, so the difference is the
//   Pippenger's threading speedup on the same compiled artifact (not a
//   strictly separate single-threaded build).
//
//   Noble correctness check runs only at log₂(n) = 16. At larger sizes
//   noble's bigint Pippenger is too slow to be a useful in-loop check.
//
// Layout assumptions (matches webgpu_msm_marshalling.hpp:marshal_points):
//   - `pointsBuf` is `n × 64` LE bytes: `[x_0[32] || y_0[32] || x_1[32] || y_1[32] || ...]`,
//     non-Montgomery, interleaved per point.
//   - `scalarsBuf` is `n × 32` LE bytes, non-Montgomery Fr.

import { bn254 } from "@noble/curves/bn254";

import { compute_bn254_msm } from "../../src/msm_webgpu/index.js";
import {
  createWasmPippenger,
  parseAffineLE,
  type WasmPippengerHandle,
} from "./pippenger_wasm.js";
import { loadSrsPoints, type SrsEvent } from "./srs.js";
import { runAllWgslUnitTests } from "./wgsl_unit_tests.js";

type LogLevel = "info" | "ok" | "err" | "warn";

const $log = document.getElementById("log") as HTMLDivElement;
const $progress = document.getElementById("srs-progress") as HTMLDivElement;
const $status = document.getElementById("status") as HTMLSpanElement;
const $run = document.getElementById("run") as HTMLButtonElement;
const $runBench = document.getElementById("run-bench") as HTMLButtonElement;
const $runSweep = document.getElementById("run-sweep") as HTMLButtonElement;
const $runSanity = document.getElementById("run-sanity") as HTMLButtonElement;
const $runUnitTests = document.getElementById("run-unit-tests") as HTMLButtonElement;
const $stop = document.getElementById("stop") as HTMLButtonElement;
const $logn = document.getElementById("logn") as HTMLInputElement;
const $nDisplay = document.getElementById("n-display") as HTMLSpanElement;
const $mtThreads = document.getElementById("mt-threads") as HTMLInputElement;
const $hwThreads = document.getElementById("hw-threads") as HTMLSpanElement;
const $noble = document.getElementById("noble") as HTMLInputElement;
const $results = document.getElementById("results") as HTMLDivElement;

// See pippenger_wasm.ts header for why the WebGPU floor (2^16) is also
// the floor here.
const LOGN_MIN = 16;
const LOGN_MAX = 20;
const SRS_NUM_POINTS = 1 << LOGN_MAX;

const SWEEP_LOGN: number[] = [16, 17, 18, 19, 20];
const NOBLE_REFERENCE_LOGN = 16;
const SWEEP_REPS = 5;

// Default to the machine's reported logical thread count, capped at
// MT_THREADS_MAX. Falls back to 4 if `navigator.hardwareConcurrency`
// is undefined.
const MT_THREADS_MAX = 32;
const MT_THREADS_DEFAULT = Math.min(
  MT_THREADS_MAX,
  navigator.hardwareConcurrency ?? 4,
);

// Cap the WASM heap maximum. bb.js's default is 4 GiB; at this dev page's
// peak (log₂(n)=20, ~96 MiB of points+scalars in the WASM heap) we never
// approach it. Capping at 256 MiB avoids the 4 GiB shared-memory address-
// space reservation on systems where that pre-allocation is expensive.
const WASM_MEM_INITIAL_PAGES = 256; //  16 MiB
const WASM_MEM_MAX_PAGES = 4096; // 256 MiB

// The dev page runs in two modes:
//   - Default (no `?coi=1`)        — no COOP/COEP set by the dev server.
//                                    WebGPU works. SharedArrayBuffer is
//                                    unavailable, so the threaded WASM
//                                    Pippenger paths can't run.
//   - `?coi=1` in the URL          — Vite dev server emits COOP/COEP.
//                                    SharedArrayBuffer is available;
//                                    WASM ST + MT paths come online.
// We default to no-COI because adding COOP/COEP unconditionally was
// observed to break the WebGPU MSM in this dev page (see the original
// vite.config.ts comment); they're also unrelated to the WebGPU path.
const COI_REQUESTED = /[?&]coi=1\b/.test(window.location.search);
const COI_ACTIVE = (self as any).crossOriginIsolated === true;
const WASM_AVAILABLE = COI_ACTIVE;

let srsBuf: Uint8Array | null = null;
// We boot TWO bb.js workers — one for the ST row, one for the MT row.
// Reusing a single worker for both was producing a strictly slower MT
// time than ST: bb's `parallel_for` pool is a function-static
// `ThreadPool(get_num_cpus() - 1)` sized at first call, and the
// thread_local override from `bb_native_pippenger_bn254(num_threads)`
// only changes how many work units the main thread dispatches — not
// the pool size. Whatever the first call set, sticks. With two workers
// each gets a clean static-pool init: ST sizes its pool at 0 (work
// runs synchronously, no dispatch overhead), MT sizes its pool at
// `mtThreads - 1`. Both stay lazy — created on the first action that
// needs them, torn down on Stop. If you change the MT threads input
// mid-session, hit Stop first so the next click reboots at the new
// value.
let wasmStPippenger: WasmPippengerHandle | null = null;
let wasmMtPippenger: WasmPippengerHandle | null = null;
let wasmStBootInFlight: Promise<WasmPippengerHandle> | null = null;
let wasmMtBootInFlight: Promise<WasmPippengerHandle> | null = null;
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

$logn.addEventListener("input", updateNDisplay);
updateNDisplay();
$hwThreads.textContent = String(navigator.hardwareConcurrency ?? "?");
$mtThreads.value = String(MT_THREADS_DEFAULT);

function log(level: LogLevel, msg: string): void {
  const span = document.createElement("span");
  if (level !== "info") span.className = level;
  span.textContent = msg + "\n";
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
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
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
    "info",
    `[mem] ${label}: used=${mib(mem.usedJSHeapSize)} MiB, ` +
      `total=${mib(mem.totalJSHeapSize)} MiB, ` +
      `limit=${mib(mem.jsHeapSizeLimit)} MiB`,
  );
}

function setBusy(busy: boolean, text = ""): void {
  // SRS load gates everything (we slice from it). WASM boot is lazy —
  // buttons are enabled even before WASM exists; the first click triggers
  // the boot via ensureWasmBooted().
  const ready = srsBuf !== null;
  $runSanity.disabled = busy || !ready;
  $runUnitTests.disabled = busy;
  // Sweep / Run / Run × 5 exercise the WASM paths in addition to WebGPU
  // — disable them when COI is off (the threaded WASM can't load without
  // SharedArrayBuffer). The user can still hit Quick Sanity Check to run
  // WebGPU on its own.
  $run.disabled = busy || !ready || !WASM_AVAILABLE;
  $runBench.disabled = busy || !ready || !WASM_AVAILABLE;
  $runSweep.disabled = busy || !ready || !WASM_AVAILABLE;
  // Stop is only meaningful while something is in flight OR WASM is booted.
  $stop.disabled = !busy && wasmStPippenger === null && wasmMtPippenger === null;
  $status.textContent = text;
}

type WasmRole = "st" | "mt";

/**
 * Boots a bb.js WASM worker lazily on first use for the given role.
 * Subsequent calls for the same role reuse the handle; concurrent
 * callers await the same in-flight boot. ST is booted with threads=1
 * (no pthread sub-workers), MT is booted with the user-chosen thread
 * count.
 */
async function ensureWasmBooted(role: WasmRole): Promise<WasmPippengerHandle> {
  if (!WASM_AVAILABLE) {
    throw new Error(
      "WASM paths are disabled: page is not cross-origin isolated. " +
        "Click 'Enable WASM (reload with COI)' to reload with COOP/COEP headers.",
    );
  }
  const cached = role === "st" ? wasmStPippenger : wasmMtPippenger;
  if (cached !== null) return cached;
  const inFlight = role === "st" ? wasmStBootInFlight : wasmMtBootInFlight;
  if (inFlight !== null) return inFlight;
  const threads = role === "st" ? 1 : readMtThreads();
  // The MT thread count is captured at boot time; lock the input
  // until the MT handle is torn down so the displayed value matches
  // what's actually live in the worker.
  if (role === "mt") $mtThreads.disabled = true;
  log(
    "info",
    `[wasm-boot/${role}] starting (threads=${threads}, ` +
      `max-mem=${(WASM_MEM_MAX_PAGES * 64) / 1024} MiB)`,
  );
  logMemSnapshot(`pre-wasm-boot/${role}`);
  const t0 = performance.now();
  const boot = createWasmPippenger(
    threads,
    (m) => log("info", `[wasm-boot/${role}] ${m}`),
    { initialPages: WASM_MEM_INITIAL_PAGES, maxPages: WASM_MEM_MAX_PAGES },
  )
    .then((handle) => {
      if (role === "st") wasmStPippenger = handle;
      else wasmMtPippenger = handle;
      log(
        "ok",
        `[wasm-boot/${role}] ready (${handle.threads} threads, ` +
          `${(performance.now() - t0).toFixed(0)} ms)`,
      );
      logMemSnapshot(`post-wasm-boot/${role}`);
      return handle;
    })
    .catch((err) => {
      log(
        "err",
        `[wasm-boot/${role}] failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (role === "mt") $mtThreads.disabled = false;
      throw err;
    })
    .finally(() => {
      if (role === "st") wasmStBootInFlight = null;
      else wasmMtBootInFlight = null;
    });
  if (role === "st") wasmStBootInFlight = boot;
  else wasmMtBootInFlight = boot;
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
  const handles: Array<[WasmRole, WasmPippengerHandle | null]> = [
    ["st", wasmStPippenger],
    ["mt", wasmMtPippenger],
  ];
  wasmStPippenger = null;
  wasmMtPippenger = null;
  for (const [role, handle] of handles) {
    if (handle === null) continue;
    try {
      await handle.destroy();
    } catch (err) {
      log(
        "warn",
        `[stop/${role}] destroy threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  $mtThreads.disabled = false;
  log("info", `[stop] WASM workers terminated`);
}

$stop.addEventListener("click", async () => {
  $stop.disabled = true;
  await stopAndDestroyWasm("user clicked Stop");
  setBusy(false);
});

// Toggle between COI-on / COI-off by reloading with a different URL.
// Implemented as a reload because the COOP/COEP headers are only
// honoured by the browser at the moment the document is fetched.
const $toggleCoi = document.getElementById("toggle-coi") as HTMLButtonElement;
$toggleCoi.textContent = COI_ACTIVE
  ? "Disable WASM (reload without COI)"
  : "Enable WASM (reload with COI)";
$toggleCoi.addEventListener("click", () => {
  const url = new URL(window.location.href);
  if (COI_ACTIVE) {
    url.searchParams.delete("coi");
  } else {
    url.searchParams.set("coi", "1");
  }
  window.location.href = url.toString();
});

function throwIfAborted(): void {
  if (abortRequested) {
    throw new Error("aborted by Stop");
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
function randomFr(): bigint {
  for (;;) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
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
// it's easy to forget the `1 << logN` conversion, leading to comically
// small MSMs that crash the WebGPU pipeline (it requires n ≥ 2^16).
async function generateInputs(logN: number, mirrorForNoble: boolean): Promise<TestInputs> {
  if (srsBuf === null) {
    throw new Error("[gen] SRS not loaded yet — wait for the [srs] ready line");
  }
  if (logN < LOGN_MIN || logN > LOGN_MAX) {
    throw new Error(`[gen] logN=${logN} outside the supported [${LOGN_MIN}, ${LOGN_MAX}] range`);
  }
  const n = 1 << logN;
  if (n * 64 > srsBuf.length) {
    throw new Error(
      `[gen] requested ${n} points but SRS only has ${srsBuf.length / 64}; bump LOGN_MAX`,
    );
  }

  log("info", `[gen] preparing ${n} SRS points + ${n} random scalars…`);
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

  log("info", `[gen] done in ${(performance.now() - t0).toFixed(0)} ms`);
  return { n, points, scalars, pointsBuf, scalarsBuf: scalarBytes };
}

function referenceMsm(
  points: { x: bigint; y: bigint }[],
  scalars: bigint[],
): { x: bigint; y: bigint } {
  log("info", `[noble] computing reference MSM on CPU (noble pippenger)…`);
  const t0 = performance.now();
  const projPoints = points.map((p) => bn254.G1.ProjectivePoint.fromAffine(p));
  const result = bn254.G1.ProjectivePoint.msm(projPoints, scalars);
  const aff = result.toAffine();
  log("info", `[noble] done in ${(performance.now() - t0).toFixed(0)} ms`);
  return aff;
}

function pointsEqual(
  a: { x: bigint; y: bigint },
  b: { x: bigint; y: bigint },
): boolean {
  return a.x === b.x && a.y === b.y;
}

async function runWebGpuOnce(inputs: TestInputs): Promise<{ ms: number; xy: { x: bigint; y: bigint } }> {
  if (!("gpu" in navigator)) {
    throw new Error("navigator.gpu is undefined — no WebGPU in this browser");
  }
  log("info", `[gpu] dispatch n=${inputs.n.toLocaleString()}`);
  const t0 = performance.now();
  const gpu = await compute_bn254_msm(
    inputs.pointsBuf as unknown as Buffer,
    inputs.scalarsBuf as unknown as Buffer,
    false,
  );
  const ms = performance.now() - t0;
  log("info", `[gpu] returned in ${ms.toFixed(1)} ms`);
  return { ms, xy: gpu };
}

async function runWasmOnce(
  inputs: TestInputs,
  role: WasmRole,
): Promise<{ ms: number; xy: { x: bigint; y: bigint } }> {
  const handle = await ensureWasmBooted(role);
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
  log(
    "info",
    `[wasm/${role}] dispatch n=${inputs.n.toLocaleString()} ` +
      `(${((inputs.pointsBuf.length + inputs.scalarsBuf.length) / 1024 / 1024).toFixed(1)} MiB in)`,
  );
  const t0 = performance.now();
  const resultBytes = await handle.runMsm(
    inputs.pointsBuf,
    inputs.scalarsBuf,
    numThreads,
  );
  const ms = performance.now() - t0;
  log("info", `[wasm/${role}] returned in ${ms.toFixed(1)} ms`);
  return { ms, xy: parseAffineLE(resultBytes) };
}

interface BackendSample {
  ms: number;
  // Tracked once per (logN, backend) pair — we cross-check the first
  // result of each backend against noble (at NOBLE_REFERENCE_LOGN) and
  // against the WebGPU result (at all sizes, so a regression in any one
  // backend is visible without paying for noble).
  xy: { x: bigint; y: bigint };
}

interface SweepRow {
  logN: number;
  webgpu: BackendSample[];
  wasmSt: BackendSample[];
  wasmMt: BackendSample[];
  nobleOk: boolean | null;
  crossOk: boolean | null; // WASM-ST/MT match WebGPU?
}

function median(samples: number[]): number {
  if (samples.length === 0) return NaN;
  const sorted = samples.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function fmtMs(samples: BackendSample[]): string {
  if (samples.length === 0) return "—";
  return median(samples.map((s) => s.ms)).toFixed(1);
}

function fmtSamples(samples: BackendSample[]): string {
  if (samples.length === 0) return "—";
  return `[${samples.map((s) => s.ms.toFixed(0)).join(", ")}]`;
}

function fmtSpeedup(ms: number, baseline: number): string {
  if (!Number.isFinite(ms) || !Number.isFinite(baseline) || baseline === 0) return "—";
  const ratio = baseline / ms;
  return ratio >= 1 ? `${ratio.toFixed(2)}× faster` : `${(1 / ratio).toFixed(2)}× slower`;
}

function fmtCheck(v: boolean | null): string {
  if (v === null) return "—";
  return v ? '<span class="ok">pass</span>' : '<span class="err">FAIL</span>';
}

function renderSweepTable(rows: SweepRow[]): void {
  // Two tables: a consistency check at log₂n = NOBLE_REFERENCE_LOGN
  // (cross-checks WebGPU / WASM-ST / WASM-MT / Noble pairwise), and a
  // perf comparison of WebGPU vs WASM MT across every sweep size.
  // WASM ST is omitted from the perf table — it's strictly slower at
  // these sizes and not the production path; noble lives in the
  // consistency table only because it's too slow to run at larger n.
  const refRow = rows.find((r) => r.logN === NOBLE_REFERENCE_LOGN);
  $results.innerHTML =
    renderConsistencyTable(refRow) + renderPerfTable(rows);
  $results.classList.add("visible");
}

function renderConsistencyTable(row: SweepRow | undefined): string {
  // Re-derive pairwise outcomes from the first rep's stored xy values
  // so each cell can be FAIL-pinpointed individually. Cells stay as
  // "—" until the reference row has run at least one rep.
  const gpu = row?.webgpu[0]?.xy;
  const st = row?.wasmSt[0]?.xy;
  const mt = row?.wasmMt[0]?.xy;
  const eq = (
    a: { x: bigint; y: bigint } | undefined,
    b: { x: bigint; y: bigint } | undefined,
  ): boolean | null => (!a || !b ? null : pointsEqual(a, b));
  return `
  <h3>Consistency (log₂n = ${NOBLE_REFERENCE_LOGN}, n = ${(1 << NOBLE_REFERENCE_LOGN).toLocaleString()})</h3>
  <table>
    <tr>
      <th>WebGPU vs WASM ST</th>
      <th>WebGPU vs WASM MT</th>
      <th>WASM ST vs WASM MT</th>
      <th>Noble vs WebGPU</th>
    </tr>
    <tr>
      <td>${fmtCheck(eq(gpu, st))}</td>
      <td>${fmtCheck(eq(gpu, mt))}</td>
      <td>${fmtCheck(eq(st, mt))}</td>
      <td>${fmtCheck(row?.nobleOk ?? null)}</td>
    </tr>
  </table>`;
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
    .map((r) => {
      const webgpuMs = median(r.webgpu.map((s) => s.ms));
      const mtMs = median(r.wasmMt.map((s) => s.ms));
      return `
    <tr>
      <td>${r.logN}</td>
      <td>${(1 << r.logN).toLocaleString()}</td>
      <td>${fmtMs(r.webgpu)}<br/><span class="samples">${fmtSamples(r.webgpu)}</span></td>
      <td>${fmtMs(r.wasmMt)}<br/><span class="samples">${fmtSamples(r.wasmMt)}</span></td>
      <td>${fmtSpeedup(webgpuMs, mtMs)}</td>
    </tr>`;
    })
    .join("");
  return `
  <h3>Performance — WebGPU vs Barretenberg WASM MT</h3>
  <table>${head}${body}</table>`;
}

$run.addEventListener("click", async () => {
  $log.innerHTML = "";
  abortRequested = false;
  setBusy(true, "running…");
  try {
    const logN = readLogN();
    const checkNoble = $noble.checked && logN === NOBLE_REFERENCE_LOGN;
    const inputs = await generateInputs(logN, checkNoble);
    await yieldToBrowser();

    const gpu = await runWebGpuOnce(inputs);
    log("info", `[gpu] x=0x${gpu.xy.x.toString(16).slice(0, 16)}…`);
    await yieldToBrowser();

    throwIfAborted();
    const st = await runWasmOnce(inputs, "st");
    await yieldToBrowser();

    throwIfAborted();
    const mt = await runWasmOnce(inputs, "mt");
    await yieldToBrowser();

    const cross = pointsEqual(gpu.xy, st.xy) && pointsEqual(gpu.xy, mt.xy);
    if (cross) {
      log("ok", `[cross-check] WebGPU, WASM ST, WASM MT all agree`);
    } else {
      log("err", `[cross-check] disagreement: gpu=${gpu.xy.x}, st=${st.xy.x}, mt=${mt.xy.x}`);
    }
    if (checkNoble && inputs.points && inputs.scalars) {
      const noble = referenceMsm(inputs.points, inputs.scalars);
      const nobleOk = pointsEqual(noble, gpu.xy);
      if (nobleOk) {
        log("ok", `[noble] matches GPU at log₂(n) = ${logN}`);
      } else {
        log("err", `[noble] mismatch: noble.x=${noble.x}, gpu.x=${gpu.xy.x}`);
      }
    }
  } catch (err) {
    log(abortRequested ? "warn" : "err", `[run] ${err instanceof Error ? err.message : String(err)}`);
    if (!abortRequested && err instanceof Error && err.stack) log("err", err.stack);
  } finally {
    setBusy(false);
  }
});

$runBench.addEventListener("click", async () => {
  $log.innerHTML = "";
  abortRequested = false;
  setBusy(true, "benchmarking…");
  try {
    const logN = readLogN();
    const inputs = await generateInputs(logN, false);
    const gpuSamples: number[] = [];
    const stSamples: number[] = [];
    const mtSamples: number[] = [];
    for (let i = 0; i < SWEEP_REPS; i++) {
      throwIfAborted();
      log("info", `[bench] iter ${i + 1}/${SWEEP_REPS}`);
      const gpu = await runWebGpuOnce(inputs);
      throwIfAborted();
      const st = await runWasmOnce(inputs, "st");
      throwIfAborted();
      const mt = await runWasmOnce(inputs, "mt");
      gpuSamples.push(gpu.ms);
      stSamples.push(st.ms);
      mtSamples.push(mt.ms);
      log(
        "info",
        `  gpu=${gpu.ms.toFixed(1)}, st=${st.ms.toFixed(1)}, mt=${mt.ms.toFixed(1)}`,
      );
    }
    log(
      "ok",
      `[bench] medians: gpu=${median(gpuSamples).toFixed(1)}, ` +
        `st=${median(stSamples).toFixed(1)}, mt=${median(mtSamples).toFixed(1)} ms`,
    );
  } catch (err) {
    log(abortRequested ? "warn" : "err", `[bench] ${err instanceof Error ? err.message : String(err)}`);
    if (!abortRequested && err instanceof Error && err.stack) log("err", err.stack);
  } finally {
    setBusy(false);
  }
});

$runSweep.addEventListener("click", async () => {
  $log.innerHTML = "";
  $results.classList.remove("visible");
  abortRequested = false;
  setBusy(true, "sweeping…");

  const mtThreads = readMtThreads();
  const nobleEnabled = $noble.checked;
  log(
    "info",
    `[sweep] start: mt-threads=${mtThreads}, noble=${nobleEnabled ? "on" : "off"}`,
  );
  logMemSnapshot("sweep-start");

  const rows: SweepRow[] = SWEEP_LOGN.map((logN) => ({
    logN,
    webgpu: [],
    wasmSt: [],
    wasmMt: [],
    nobleOk: null,
    crossOk: null,
  }));
  renderSweepTable(rows);

  try {
    for (const row of rows) {
      throwIfAborted();
      const checkNoble = nobleEnabled && row.logN === NOBLE_REFERENCE_LOGN;
      log("info", "");
      log(
        "info",
        `[sweep] === log₂(n) = ${row.logN} (n = ${(1 << row.logN).toLocaleString()}) ===`,
      );

      log("info", `[sweep] step 1/4: generateInputs (mirrorForNoble=${checkNoble})`);
      await yieldToBrowser();
      const tGen = performance.now();
      const inputs = await generateInputs(row.logN, checkNoble);
      log("info", `[sweep] step 1/4 done in ${(performance.now() - tGen).toFixed(0)} ms`);
      logMemSnapshot(`after generateInputs(${row.logN})`);
      await yieldToBrowser();

      let noble: { x: bigint; y: bigint } | null = null;
      if (checkNoble && inputs.points && inputs.scalars) {
        log("info", `[sweep] step 2/4: noble reference (blocking ~10s)`);
        await yieldToBrowser(16); // let the warning render before we block
        const tNoble = performance.now();
        noble = referenceMsm(inputs.points, inputs.scalars);
        log("info", `[sweep] step 2/4 done in ${(performance.now() - tNoble).toFixed(0)} ms`);
        await yieldToBrowser();
      } else {
        log("info", `[sweep] step 2/4: noble skipped`);
      }

      log(
        "info",
        `[sweep] step 3/4: ensure both WASM workers booted (lazy — fires on first rep)`,
      );
      // Pre-warm both WASM boots before the timed reps so we don't fold
      // the spawn time into the first rep's wall clock. Also if Stop
      // hits during boot we abort here cleanly rather than mid-MSM.
      await ensureWasmBooted("st");
      throwIfAborted();
      await ensureWasmBooted("mt");
      throwIfAborted();
      await yieldToBrowser();
      log("info", `[sweep] step 3/4 done`);

      log("info", `[sweep] step 4/4: ${SWEEP_REPS} reps × {gpu, wasm-st, wasm-mt}`);
      for (let i = 0; i < SWEEP_REPS; i++) {
        throwIfAborted();
        setBusy(true, `sweeping log₂(n)=${row.logN} (rep ${i + 1}/${SWEEP_REPS})…`);
        log("info", `[sweep]   rep ${i + 1}/${SWEEP_REPS}`);

        const gpu = await runWebGpuOnce(inputs);
        await yieldToBrowser();
        throwIfAborted();

        const st = await runWasmOnce(inputs, "st");
        await yieldToBrowser();
        throwIfAborted();

        const mt = await runWasmOnce(inputs, "mt");
        await yieldToBrowser();

        row.webgpu.push(gpu);
        row.wasmSt.push(st);
        row.wasmMt.push(mt);
        if (i === 0) {
          row.crossOk =
            pointsEqual(gpu.xy, st.xy) && pointsEqual(gpu.xy, mt.xy);
          if (noble !== null) row.nobleOk = pointsEqual(noble, gpu.xy);
          if (!row.crossOk) {
            log("err", `[sweep]   cross-check FAILED at log₂(n)=${row.logN}`);
            log("err", `         gpu.x=${gpu.xy.x.toString(16)}`);
            log("err", `         st.x =${st.xy.x.toString(16)}`);
            log("err", `         mt.x =${mt.xy.x.toString(16)}`);
          }
        }
        renderSweepTable(rows);
      }
      log(
        "info",
        `[sweep]   medians: gpu=${median(row.webgpu.map((s) => s.ms)).toFixed(1)}, ` +
          `st=${median(row.wasmSt.map((s) => s.ms)).toFixed(1)}, ` +
          `mt=${median(row.wasmMt.map((s) => s.ms)).toFixed(1)} ms`,
      );
      logMemSnapshot(`after log₂(n)=${row.logN}`);
    }
    log("ok", `[sweep] done — see comparison table above.`);
  } catch (err) {
    log(abortRequested ? "warn" : "err", `[sweep] ${err instanceof Error ? err.message : String(err)}`);
    if (!abortRequested && err instanceof Error && err.stack) log("err", err.stack);
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
const $probeGpu = document.getElementById("probe-gpu") as HTMLButtonElement;
$probeGpu?.addEventListener("click", async () => {
  $log.innerHTML = "";
  setBusy(true, "probing GPU…");
  try {
    log("info", "[probe] navigator.gpu in?: " + ("gpu" in navigator));
    if (!("gpu" in navigator)) {
      log("err", "[probe] no WebGPU available — stop here");
      return;
    }
    await yieldToBrowser();
    log("info", "[probe] requesting adapter…");
    const t0 = performance.now();
    const adapter = await navigator.gpu.requestAdapter();
    log("info", `[probe] requestAdapter returned in ${(performance.now() - t0).toFixed(0)} ms`);
    if (adapter === null) {
      log("err", "[probe] adapter is null — GPU not usable from this page");
      return;
    }
    // @ts-expect-error adapter.info is non-standard but widely available
    const info = adapter.info ?? (await adapter.requestAdapterInfo?.()) ?? {};
    log(
      "info",
      `[probe] adapter: vendor=${info.vendor ?? "?"} arch=${info.architecture ?? "?"} ` +
        `device=${info.device ?? "?"} description=${info.description ?? "?"}`,
    );
    log("info", "[probe] requesting device…");
    const t1 = performance.now();
    const device = await adapter.requestDevice();
    log("info", `[probe] requestDevice returned in ${(performance.now() - t1).toFixed(0)} ms`);
    log("info", "[probe] destroying device immediately…");
    device.destroy();
    log("ok", "[probe] PASS — basic WebGPU access is healthy");
  } catch (err) {
    log("err", `[probe] FAIL: ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) log("err", err.stack);
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
 * counts, byte offsets) before touching the GPU, so a crash inside
 * `compute_bn254_msm` leaves an audit trail. Several recent crashes
 * have been "right after `[gpu] dispatch`" with no further detail —
 * checking the input shape here separates "we sent garbage" from
 * "GPU went sideways on a valid input".
 */
$runSanity.addEventListener("click", async () => {
  $log.innerHTML = "";
  abortRequested = false;
  setBusy(true, "sanity check…");
  try {
    log("info", "[sanity] WebGPU-only smoke test, log₂(n)=16, no WASM, no noble");
    logMemSnapshot("sanity-start");

    log("info", "[sanity] step 1/3: generateInputs (no noble mirror)");
    await yieldToBrowser();
    const tGen = performance.now();
    const inputs = await generateInputs(16, false);
    log("info", `[sanity] step 1/3 done in ${(performance.now() - tGen).toFixed(0)} ms`);
    logMemSnapshot("after generateInputs");
    await yieldToBrowser();

    log("info", "[sanity] step 2/3: input invariant checks (pre-GPU)");
    const expectedPointBytes = inputs.n * 64;
    const expectedScalarBytes = inputs.n * 32;
    log("info", `[sanity]   inputs.n = ${inputs.n} (must be ≥ ${1 << LOGN_MIN})`);
    log(
      "info",
      `[sanity]   pointsBuf:  length=${inputs.pointsBuf.byteLength} (expected ${expectedPointBytes}), ` +
        `offset=${inputs.pointsBuf.byteOffset}, buffer.byteLength=${inputs.pointsBuf.buffer.byteLength}`,
    );
    log(
      "info",
      `[sanity]   scalarsBuf: length=${inputs.scalarsBuf.byteLength} (expected ${expectedScalarBytes}), ` +
        `offset=${inputs.scalarsBuf.byteOffset}, buffer.byteLength=${inputs.scalarsBuf.buffer.byteLength}`,
    );
    if (inputs.n < 1 << LOGN_MIN) {
      throw new Error(`[sanity] n=${inputs.n} is below LOGN_MIN (WebGPU MSM is known to crash below 2^16)`);
    }
    if (inputs.pointsBuf.byteLength !== expectedPointBytes) {
      throw new Error(
        `[sanity] pointsBuf has ${inputs.pointsBuf.byteLength} bytes, expected ${expectedPointBytes}`,
      );
    }
    if (inputs.scalarsBuf.byteLength !== expectedScalarBytes) {
      throw new Error(
        `[sanity] scalarsBuf has ${inputs.scalarsBuf.byteLength} bytes, expected ${expectedScalarBytes}`,
      );
    }
    // Spot-check the first point's bytes aren't all-zero (would indicate
    // an uninitialised slice). The SRS first point is the BN254 generator
    // (1, 2) in non-Montgomery LE — x[0] = 1.
    const firstByte = inputs.pointsBuf[0];
    log(
      "info",
      `[sanity]   pointsBuf[0..3] = ${Array.from(inputs.pointsBuf.subarray(0, 4)).join(",")} ` +
        `(should be "1,0,0,0" for the SRS generator)`,
    );
    if (firstByte === 0) {
      log("warn", `[sanity]   first SRS byte is 0 — SRS may be uninitialised`);
    }
    log("ok", `[sanity] step 2/3 input invariants OK`);
    await yieldToBrowser();

    log("info", "[sanity] step 3/3: WebGPU MSM (here we go)");
    throwIfAborted();
    const gpu = await runWebGpuOnce(inputs);
    log("info", `[sanity] gpu.x=0x${gpu.xy.x.toString(16).slice(0, 16)}…`);
    logMemSnapshot("sanity-end");
    log("ok", `[sanity] PASS in ${gpu.ms.toFixed(0)} ms`);
  } catch (err) {
    log(abortRequested ? "warn" : "err", `[sanity] ${err instanceof Error ? err.message : String(err)}`);
    if (!abortRequested && err instanceof Error && err.stack) log("err", err.stack);
  } finally {
    setBusy(false);
  }
});

$runUnitTests.addEventListener("click", async () => {
  $log.innerHTML = "";
  setBusy(true, "running unit tests…");
  try {
    log("info", "[wgsl-unit-tests] running primitive shader tests…");
    const results = await runAllWgslUnitTests();
    let allOk = true;
    for (const r of results) {
      if (r.ok) {
        log("ok", `[pass] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
      } else {
        allOk = false;
        log("err", `[fail] ${r.name}`);
        if (r.detail) {
          for (const line of r.detail.split("\n")) log("err", `       ${line}`);
        }
      }
    }
    log(
      allOk ? "ok" : "err",
      `[wgsl-unit-tests] ${results.filter((r) => r.ok).length}/${results.length} passed`,
    );
  } catch (err) {
    log("err", `[exception] ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) log("err", err.stack);
  } finally {
    setBusy(false);
  }
});

// Boot-time diagnostics so we have context for any crash report.
log("info", `Boot diagnostics:`);
log("info", `  webgpu: ${"gpu" in navigator ? "available" : "MISSING"}`);
log("info", `  COI requested: ${COI_REQUESTED ? "yes (?coi=1)" : "no"}`);
log(
  "info",
  `  crossOriginIsolated: ${COI_ACTIVE ? "yes" : "no — WASM paths disabled"}`,
);
log("info", `  hardwareConcurrency: ${navigator.hardwareConcurrency ?? "?"}`);
log("info", `  user-agent: ${navigator.userAgent}`);
log(
  "info",
  `  SharedArrayBuffer: ${typeof SharedArrayBuffer !== "undefined" ? "yes" : "NO"}`,
);
logMemSnapshot("page-load");

if (COI_REQUESTED && !COI_ACTIVE) {
  log(
    "warn",
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
  if (!Number.isFinite(secs) || secs < 0) return "--:--";
  const s = Math.round(secs);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
function renderProgress(event: SrsEvent): void {
  if (event.kind !== "phase") return;
  const { phase, current, total, elapsedMs } = event;
  const frac = total > 0 ? Math.min(1, current / total) : 0;
  const filledCells = Math.round(frac * BAR_WIDTH);
  const emptyCells = BAR_WIDTH - filledCells;
  const pct = (frac * 100).toFixed(1).padStart(5);
  const elapsedSec = elapsedMs / 1000;
  const rate = elapsedSec > 0 ? current / elapsedSec : 0;
  const remaining = rate > 0 ? (total - current) / rate : Infinity;
  const fmt = event.unit === "B" ? formatBytes : formatCount;
  const rateStr =
    event.unit === "B" ? `${formatBytes(rate)}/s` : `${formatCount(rate)} pt/s`;

  $progress.classList.add("visible");
  $progress.innerHTML = "";
  const phaseLabel = phase.padEnd(11);
  const head = document.createTextNode(`${phaseLabel} ${pct}% [`);
  const filled = document.createElement("span");
  filled.className = "bar-fill";
  filled.textContent = "█".repeat(filledCells);
  const empty = document.createElement("span");
  empty.className = "bar-empty";
  empty.textContent = "░".repeat(emptyCells);
  const tail = document.createTextNode(
    `] ${fmt(current)}/${fmt(total)} [${formatDuration(elapsedSec)}<${formatDuration(remaining)}, ${rateStr}]`,
  );
  $progress.appendChild(head);
  $progress.appendChild(filled);
  $progress.appendChild(empty);
  $progress.appendChild(tail);
}
function hideProgress(): void {
  $progress.classList.remove("visible");
}

// Page-load boot: load the SRS only. The barretenberg WASM (which forks
// `mt-threads` workers) stays cold until the user clicks Run / Run × 5 /
// Sweep — ensureWasmBooted() takes care of the first-click boot. The SRS
// fetch is just a download + JS-side decompression (no native workers),
// so it's safe to run unconditionally at page load.
(async () => {
  setBusy(true, "loading SRS…");
  try {
    srsBuf = await loadSrsPoints(SRS_NUM_POINTS, (event) => {
      if (event.kind === "info") {
        log("info", event.msg);
      } else if (event.kind === "phase") {
        renderProgress(event);
      } else if (event.kind === "done") {
        hideProgress();
      }
    });
    log("ok", `SRS loaded: ${SRS_NUM_POINTS.toLocaleString()} points available.`);
    log(
      "info",
      `WASM not booted yet (lazy). Click Run / Sweep — it'll spin up ` +
        `${readMtThreads()} pthread workers. Stop tears them down.`,
    );
  } catch (err) {
    log("err", `[boot] ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) log("err", err.stack);
    hideProgress();
  } finally {
    setBusy(false);
  }
})();
