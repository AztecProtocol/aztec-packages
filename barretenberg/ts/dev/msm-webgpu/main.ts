// Standalone correctness harness for the BN254 WebGPU MSM port.
// Cross-checks `compute_bn254_msm` against a CPU reference computed
// with @noble/curves/bn254. Failure indicates the WGSL kernels or the
// Montgomery marshalling layer is broken — nothing downstream of the
// WebGPU port can be trusted in that case.
//
// Layout assumptions (matches C++ marshalling in
// webgpu_msm_marshalling.hpp:marshal_points):
//   - `baseAffinePoints` is a Buffer of `n × 64` LE bytes:
//     `[x_0[32] | y_0[32] | x_1[32] | y_1[32] | ... | x_{n-1}[32] | y_{n-1}[32]]`,
//     non-Montgomery, 32 bytes per coord, little-endian, INTERLEAVED per point.
//     The convert shader (see convert_point_coords_and_decompose_scalars.wgsl)
//     splits this buffer in half by bytes and expects each half to contain
//     interleaved [x, y, x, y, ...] for its h = n/2 points.
//   - `scalars` is a Buffer of `n × 32` LE bytes, non-Montgomery.
// Both are passed straight through to the shader-side conversion.

import { bn254 } from "@noble/curves/bn254";

import { compute_bn254_msm } from "../../src/msm_webgpu/index.js";
import { loadSrsPoints, type SrsEvent } from "./srs.js";
import { runAllWgslUnitTests } from "./wgsl_unit_tests.js";

type LogLevel = "info" | "ok" | "err" | "warn";

const $log = document.getElementById("log") as HTMLDivElement;
const $progress = document.getElementById("srs-progress") as HTMLDivElement;
const $status = document.getElementById("status") as HTMLSpanElement;
const $run = document.getElementById("run") as HTMLButtonElement;
const $runBench = document.getElementById("run-bench") as HTMLButtonElement;
const $runUnitTests = document.getElementById("run-unit-tests") as HTMLButtonElement;
const $logn = document.getElementById("logn") as HTMLInputElement;
const $nDisplay = document.getElementById("n-display") as HTMLSpanElement;

// Floor matches the C++ BBERG_WEBGPU_MSM_MIN_N gate (2^16). Smaller
// inputs hit chunk_size=4, which has a pre-existing BPR underflow
// (buckets_per_thread = h/256 = 0 → u32 underflow into a 4-billion-iter
// loop → GPU hang). Production never exercises that path because the C++
// hook only delegates n ≥ 65536.
const LOGN_MIN = 16;
// Ceiling matches what we preload from the SRS at startup. Raising
// this means re-decompressing past the cached prefix (slow first time;
// instant from IndexedDB after). At 2^20 the cold decompress is
// ~2.5 min on a modern laptop — bump if you can afford a longer pull
// for a one-off, or set up a worker pool.
const LOGN_MAX = 20;
const SRS_NUM_POINTS = 1 << LOGN_MAX;

// Module-level cache for the decompressed SRS, populated on page load.
// All Run / Run × 5 buttons take a prefix of this buffer.
let srsBuf: Uint8Array | null = null;

function readLogN(): number {
  const raw = parseInt($logn.value, 10);
  if (!Number.isFinite(raw)) return 16;
  return Math.max(LOGN_MIN, Math.min(LOGN_MAX, raw));
}

function updateNDisplay(): void {
  const logN = readLogN();
  const n = 1 << logN;
  $nDisplay.textContent = `(n = ${n.toLocaleString()})`;
}

$logn.addEventListener("input", updateNDisplay);
updateNDisplay();

function log(level: LogLevel, msg: string): void {
  const span = document.createElement("span");
  if (level !== "info") span.className = level;
  span.textContent = msg + "\n";
  $log.appendChild(span);
  $log.scrollTop = $log.scrollHeight;
}

function setBusy(busy: boolean, text = ""): void {
  $run.disabled = busy;
  $runBench.disabled = busy;
  $runUnitTests.disabled = busy;
  $status.textContent = text;
}

// Bigint → 32 LE bytes. Throws on out-of-range to catch coordinate-pack
// bugs early (a silent truncation here would look like a GPU bug).
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

// Random Fr scalar in [0, r). Uses crypto.getRandomValues with rejection
// sampling — biased construction would skew certain bucket counts in
// ways correctness tests don't catch.
const FR_ORDER = bn254.fields.Fr.ORDER;
function randomFr(): bigint {
  // r fits in 254 bits, so 32 random bytes with the top two bits cleared
  // gives uniform-with-rejection samples in [0, 2^254). Reject anything
  // ≥ r and retry.
  for (;;) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    bytes[31] &= 0x3f; // clear top two bits → value < 2^254
    let v = 0n;
    for (let i = 31; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
    if (v < FR_ORDER) return v;
  }
}

interface TestInputs {
  n: number;
  points: { x: bigint; y: bigint }[]; // affine, in non-Montgomery form
  scalars: bigint[]; // Fr, canonical
  pointsBuf: Uint8Array; // [x_0|y_0|x_1|y_1|...] interleaved, LE-32 each coord
  scalarsBuf: Uint8Array; // [s_0..s_{n-1}], LE-32 each
}

// Read the i-th SRS point as an affine bigint pair out of the cached
// interleaved buffer. The buffer holds n × 64 bytes laid out as
// [x_0[32] | y_0[32] | x_1[32] | y_1[32] | ...] in little-endian.
function readSrsPointAt(buf: Uint8Array, i: number): { x: bigint; y: bigint } {
  const off = i * 64;
  let x = 0n;
  for (let k = 31; k >= 0; k--) x = (x << 8n) | BigInt(buf[off + k]);
  let y = 0n;
  for (let k = 31; k >= 0; k--) y = (y << 8n) | BigInt(buf[off + 32 + k]);
  return { x, y };
}

async function generateInputs(n: number): Promise<TestInputs> {
  if (srsBuf === null) {
    throw new Error("[gen] SRS not loaded yet — wait for the [srs] ready line in the log");
  }
  if (n * 64 > srsBuf.length) {
    throw new Error(
      `[gen] requested ${n} points but SRS only has ${srsBuf.length / 64}; bump LOGN_MAX or pick smaller log2(n)`,
    );
  }

  log("info", `[gen] preparing ${n} SRS points + ${n} random scalars…`);
  const t0 = performance.now();

  // Slice the SRS prefix straight into the GPU input buffer — same
  // interleaved layout already.
  const pointsBuf = new Uint8Array(srsBuf.buffer, srsBuf.byteOffset, n * 64);

  // Mirror the affine bigints into a parallel array for the noble
  // Pippenger reference. This is what makes the cross-check meaningful;
  // the bytes themselves can't be fed to noble directly.
  const points: { x: bigint; y: bigint }[] = new Array(n);
  for (let i = 0; i < n; i++) points[i] = readSrsPointAt(srsBuf, i);

  const scalars: bigint[] = new Array(n);
  const scalarBytes = new Uint8Array(n * 32);
  for (let i = 0; i < n; i++) {
    const s = randomFr();
    scalars[i] = s;
    scalarBytes.set(biToLe32(s, `scalar[${i}]`), i * 32);
  }

  log("info", `[gen] done in ${(performance.now() - t0).toFixed(0)} ms`);
  return {
    n,
    points,
    scalars,
    pointsBuf,
    scalarsBuf: scalarBytes,
  };
}

function referenceMsm(
  points: { x: bigint; y: bigint }[],
  scalars: bigint[],
): { x: bigint; y: bigint } {
  log("info", `[ref] computing reference MSM on CPU (noble pippenger)…`);
  const t0 = performance.now();
  // Use noble's built-in Pippenger MSM rather than a naive
  // multiply-and-sum loop — at log2(n) = 16 the naive loop takes
  // multiple minutes, batched is a few seconds.
  const projPoints = points.map((p) => bn254.G1.ProjectivePoint.fromAffine(p));
  const result = bn254.G1.ProjectivePoint.msm(projPoints, scalars);
  const aff = result.toAffine();
  log("info", `[ref] done in ${(performance.now() - t0).toFixed(0)} ms`);
  return aff;
}

function pointsEqual(
  a: { x: bigint; y: bigint },
  b: { x: bigint; y: bigint },
): boolean {
  return a.x === b.x && a.y === b.y;
}

async function runOnce(logN: number): Promise<{ wallMs: number; ok: boolean }> {
  if (!("gpu" in navigator)) {
    log("err", "[fail] navigator.gpu is undefined — no WebGPU in this browser.");
    return { wallMs: 0, ok: false };
  }

  const n = 1 << logN;
  log("info", `[run] log2(n) = ${logN}, n = ${n.toLocaleString()}`);

  const inputs = await generateInputs(n);
  const reference = referenceMsm(inputs.points, inputs.scalars);
  log(
    "info",
    `[ref] result: x=0x${reference.x.toString(16)}\n             y=0x${reference.y.toString(16)}`,
  );

  log("info", "[gpu] running compute_bn254_msm…");
  const t0 = performance.now();
  // The signature claims `Buffer` but the runtime path only touches the
  // Uint8Array surface (`.length`, `.slice`, `device.queue.writeBuffer`).
  // Cast through `unknown` so this dev page doesn't need a Buffer polyfill.
  const gpu = await compute_bn254_msm(
    inputs.pointsBuf as unknown as Buffer,
    inputs.scalarsBuf as unknown as Buffer,
    false,
  );
  const wallMs = performance.now() - t0;
  log(
    "info",
    `[gpu] result: x=0x${gpu.x.toString(16)}\n             y=0x${gpu.y.toString(16)} (${wallMs.toFixed(1)} ms)`,
  );

  const ok = pointsEqual(reference, gpu);
  if (ok) {
    log("ok", `[pass] GPU result matches noble reference (log2(n) = ${logN}, n = ${n.toLocaleString()}).`);
  } else {
    log("err", `[fail] GPU and reference disagree.`);
    log("err", `       Δx = ${(gpu.x - reference.x).toString()}`);
    log("err", `       Δy = ${(gpu.y - reference.y).toString()}`);
  }
  return { wallMs, ok };
}

$run.addEventListener("click", async () => {
  $log.innerHTML = "";
  setBusy(true, "running…");
  try {
    await runOnce(readLogN());
  } catch (err) {
    log("err", `[exception] ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) log("err", err.stack);
  } finally {
    setBusy(false);
  }
});

$runBench.addEventListener("click", async () => {
  $log.innerHTML = "";
  setBusy(true, "benchmarking…");
  try {
    const logN = readLogN();
    const samples: number[] = [];
    let allOk = true;
    for (let i = 0; i < 5; i++) {
      log("info", `[bench] iteration ${i + 1}/5`);
      const { wallMs, ok } = await runOnce(logN);
      if (!ok) {
        allOk = false;
        break;
      }
      samples.push(wallMs);
    }
    if (allOk) {
      const sorted = samples.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      log(
        "ok",
        `[bench] all 5 passed; wall ms = [${samples.map((s) => s.toFixed(1)).join(", ")}], median ${median.toFixed(1)} ms`,
      );
    }
  } catch (err) {
    log("err", `[exception] ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) log("err", err.stack);
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

log("info", `Ready. WebGPU: ${"gpu" in navigator ? "available" : "MISSING"}.`);

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
    event.unit === "B"
      ? `${formatBytes(rate)}/s`
      : `${formatCount(rate)} pt/s`;

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

// Kick off SRS load on page init. Cold path is slow (~5 min for 2^21
// points: 64 MB download + JS-bigint decompression of 2M sqrts).
// Subsequent reloads hit the IndexedDB cache and finish in <1s.
// Buttons stay disabled until the buffer is ready.
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
  } catch (err) {
    log("err", `[srs] ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && err.stack) log("err", err.stack);
    hideProgress();
  } finally {
    setBusy(false);
  }
})();
