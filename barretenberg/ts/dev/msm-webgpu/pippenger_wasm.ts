// In-browser harness for the native barretenberg Pippenger MSM, calling
// the `bb_native_pippenger_bn254_*` WASM exports directly. We bypass the
// `cbindCall('bbapi', …)` msgpack path because the exports take raw
// LE-32 bytes (same byte layout the WebGPU MSM consumes), so there's no
// schema indirection to add — and bypassing keeps the comparison "what's
// the raw cost of a Pippenger call from JS", not "what's bbapi msgpack
// overhead + Pippenger".
//
// The path is split into `_load` (decode + upload inputs) and `_run`
// (compute) so the dev page can time pure Pippenger compute, excluding
// input-structure population. `_run` calls `batch_multi_scalar_mul_native`
// — the fast affine multithreaded Pippenger.
//
// The exports live in `barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.cpp`
// and are only compiled into builds with `BBERG_WEBGPU_MSM_HOOK` defined — i.e.
// the same WASM that bb.js ships for production. `batch_multi_scalar_mul_native`
// bypasses the hook delegation, so we measure the in-tree Pippenger rather than
// recursing back into the (uninstalled) WebGPU bridge.

import { createMainWorker } from "../../src/barretenberg_wasm/barretenberg_wasm_main/factory/browser/index.js";
import { fetchModuleAndThreads } from "../../src/barretenberg_wasm/index.js";
import { getRemoteBarretenbergWasm } from "../../src/barretenberg_wasm/helpers/browser/index.js";
import { BarretenbergWasmMain, type BarretenbergWasmMainWorker } from "../../src/barretenberg_wasm/barretenberg_wasm_main/index.js";

// bb.js's main bb worker doesn't currently install the WebGPU bridge
// stubs on its own; the default `main.worker.ts` we ship hands the
// WASM module a no-op `bb_publish_srs_bn254` and a throwing
// `bb_external_msm_bn254`. That's fine because the timed export calls
// `batch_multi_scalar_mul_native`, which never invokes the hook path.
export interface WasmPippengerHandle {
  /**
   * Decode + upload points/scalars into WASM-side vectors. Untimed setup —
   * kept out of the benchmark's measured window.
   */
  loadMsm(pointsBuf: Uint8Array, scalarsBuf: Uint8Array): Promise<void>;
  /**
   * Run batch_multi_scalar_mul_native over the inputs from the last
   * `loadMsm`. The timed call — pure compute. `numThreads === 0` keeps the
   * runtime default.
   */
  runMsm(numThreads: number): Promise<Uint8Array>;
  /**
   * Complete a partially-reduced bucket reduction on the CPU from the GPU's
   * dense-packed working set. Runs on a MAIN-THREAD wasm instance — direct,
   * synchronous, no worker IPC. `dense` = numWindows*kPerWindow × 64 LE
   * non-Montgomery affine ((0,0)=empty); `ops` = the flat op-list (per op
   * (opcode,dst_rank,src_rank,_)); `rootRank` = per-window output rank.
   * `computeMs` is the bb_msm_complete_reduce call; `totalMs` adds the in-process
   * memcpy of inputs/result.
   */
  completeReduce(
    dense: Uint8Array,
    ops: Uint32Array,
    rootRank: number,
    kPerWindow: number,
    numWindows: number,
  ): { result: Uint8Array; computeMs: number; totalMs: number };
  /** Thread count this handle was instantiated with (post-detection). */
  readonly threads: number;
  destroy(): Promise<void>;
}

const WASM_PATH = "/dev/msm-webgpu/barretenberg.wasm.gz";

/**
 * Boot a bb.js-style worker hosting the threaded barretenberg WASM. The
 * worker spawns `threads-1` pthread sub-workers internally.
 *
 * `maxMemoryPages` caps the `WebAssembly.Memory` maximum. The default for
 * bb.js is 2^16 pages = 4 GiB, which a shared-memory build pre-reserves
 * as address space the moment it's instantiated — that's a big ask on a
 * constrained laptop. For the MSM dev page we only ever push ~96 MiB
 * into the heap at log₂(n)=20 (n*64 + n*32 + a 64-byte result + bb's own
 * scratch buffers), so 256 pages (16 MiB) initial / 2048 pages (128 MiB)
 * max is plenty and keeps the page out of the OOM-killer's path. Bump
 * if a sweep ever reports `bbmalloc` failures.
 */
/**
 * Wrap a step in a hard timeout. If the underlying promise hasn't
 * resolved by `ms`, reject with a clear error mentioning the step
 * name. Critical because `createMainWorker()` waits forever on a
 * `Ready` message — if the worker module fails to load, the page
 * looks "stuck" instead of "failed".
 */
function withTimeout<T>(label: string, ms: number, p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => {
      reject(
        new Error(
          `[pippenger_wasm] timed out after ${ms} ms waiting for ${label}. ` +
            `Check the browser DevTools console for worker-load errors ` +
            `(syntax errors, missing modules, etc.).`,
        ),
      );
    }, ms);
    p.then(
      (value) => {
        clearTimeout(handle);
        resolve(value);
      },
      (err) => {
        clearTimeout(handle);
        reject(err);
      },
    );
  });
}

export async function createWasmPippenger(
  requestedThreads: number,
  logger?: (msg: string) => void,
  memory?: { initialPages?: number; maxPages?: number },
): Promise<WasmPippengerHandle> {
  const log = logger ?? (() => {});
  log(`createMainWorker: spawning main bb Worker`);
  const worker = await withTimeout(
    "createMainWorker (waiting for the worker's Ready postMessage)",
    10_000,
    createMainWorker(),
  );
  // Surface worker-thread errors in the page log. By default these only
  // appear in DevTools console, which is easy to miss.
  worker.addEventListener("error", (e: ErrorEvent) => {
    log(`MAIN-WORKER error: ${e.message} (${e.filename}:${e.lineno})`);
  });
  worker.addEventListener("messageerror", (e) => {
    log(`MAIN-WORKER messageerror: ${String(e)}`);
  });
  const wasm = getRemoteBarretenbergWasm<BarretenbergWasmMainWorker>(worker);
  log(`fetchModuleAndThreads: ${requestedThreads} threads requested, fetching wasm`);
  const { module, threads } = await withTimeout(
    "fetchModuleAndThreads (WASM download + compile)",
    30_000,
    fetchModuleAndThreads(requestedThreads, WASM_PATH, log),
  );
  log(
    `wasm.init: spawning ${threads - 1} pthread sub-workers, memory ` +
      `${memory?.initialPages ?? 35} → ${memory?.maxPages ?? 65536} pages ` +
      `(${(((memory?.maxPages ?? 65536) * 64) / 1024).toFixed(0)} MiB)`,
  );
  await withTimeout(
    "wasm.init (pthread sub-worker spawn + WASM instantiation)",
    30_000,
    wasm.init(
      module,
      threads,
      undefined,
      memory?.initialPages,
      memory?.maxPages,
    ),
  );
  log(`wasm.init: complete`);

  // A second, MAIN-THREAD wasm instance for the CPU reduce-tail completion. The
  // worker above is the multithreaded Pippenger oracle; the completion is pure
  // single-threaded compute and must run in-process so its timing is the actual
  // compute, not main↔worker IPC. init(threads=1) spawns no sub-workers.
  const wasmMain = new BarretenbergWasmMain();
  await withTimeout(
    "wasmMain.init (main-thread completion instance)",
    30_000,
    wasmMain.init(module, 1, undefined, 256, 2048),
  );
  log(`wasmMain.init: complete (main-thread completion instance)`);

  // Decode + upload the points/scalars into WASM-side vectors. UNTIMED:
  // bb_native_pippenger_bn254_load builds the AffineElement / ScalarField
  // vectors, which is input-structure population — not Pippenger compute.
  async function loadMsm(
    pointsBuf: Uint8Array,
    scalarsBuf: Uint8Array,
  ): Promise<void> {
    if (pointsBuf.length % 64 !== 0) {
      throw new Error(`pointsBuf length ${pointsBuf.length} not a multiple of 64`);
    }
    if (scalarsBuf.length % 32 !== 0) {
      throw new Error(`scalarsBuf length ${scalarsBuf.length} not a multiple of 32`);
    }
    const n = pointsBuf.length / 64;
    if (scalarsBuf.length / 32 !== n) {
      throw new Error(
        `point/scalar count mismatch: points=${n}, scalars=${scalarsBuf.length / 32}`,
      );
    }

    const pointsPtr = await wasm.call("bbmalloc", pointsBuf.length);
    const scalarsPtr = await wasm.call("bbmalloc", scalarsBuf.length);
    try {
      await wasm.writeMemory(pointsPtr, pointsBuf);
      await wasm.writeMemory(scalarsPtr, scalarsBuf);
      await wasm.call("bb_native_pippenger_bn254_load", pointsPtr, scalarsPtr, n);
    } finally {
      // The load call copied the bytes into WASM-side vectors; the raw
      // upload buffers can return to the heap right away.
      await wasm.call("bbfree", pointsPtr);
      await wasm.call("bbfree", scalarsPtr);
    }
  }

  // Run batch_multi_scalar_mul_native over the inputs from the last loadMsm.
  // This is the call the dev page times — pure Pippenger compute, no input
  // population.
  async function runMsm(numThreads: number): Promise<Uint8Array> {
    const resultPtr = await wasm.call("bbmalloc", 64);
    try {
      await wasm.call("bb_native_pippenger_bn254_run", numThreads, resultPtr);
      return await wasm.getMemorySlice(resultPtr, resultPtr + 64);
    } finally {
      await wasm.call("bbfree", resultPtr);
    }
  }

  // Finish the reduce tail on the CPU, in-process on the main-thread wasm — no
  // worker, no IPC. All three steps (write inputs, call, read result) are
  // synchronous. Buffers are reused; the op-list is written each call (cheap
  // in-process memcpy). `totalMs` is the whole CPU finish; `computeMs` isolates
  // the bb_msm_complete_reduce call.
  let cDensePtr = 0;
  let cDenseCap = 0;
  let cOpsPtr = 0;
  let cOpsCap = 0;
  let cResPtr = 0;
  let cResCap = 0;
  function completeReduce(
    dense: Uint8Array,
    ops: Uint32Array,
    rootRank: number,
    kPerWindow: number,
    numWindows: number,
  ): { result: Uint8Array; computeMs: number; totalMs: number } {
    const numOps = ops.length / 4;
    const opsBytes = new Uint8Array(ops.buffer, ops.byteOffset, ops.byteLength);
    const resBytes = numWindows * 64;
    if (dense.length > cDenseCap) {
      if (cDensePtr) wasmMain.call("bbfree", cDensePtr);
      cDensePtr = wasmMain.call("bbmalloc", Math.max(64, dense.length));
      cDenseCap = dense.length;
    }
    if (opsBytes.length > cOpsCap) {
      if (cOpsPtr) wasmMain.call("bbfree", cOpsPtr);
      cOpsPtr = wasmMain.call("bbmalloc", Math.max(4, opsBytes.length));
      cOpsCap = opsBytes.length;
    }
    if (resBytes > cResCap) {
      if (cResPtr) wasmMain.call("bbfree", cResPtr);
      cResPtr = wasmMain.call("bbmalloc", Math.max(64, resBytes));
      cResCap = resBytes;
    }
    const t0 = performance.now();
    wasmMain.writeMemory(cDensePtr, dense);
    if (opsBytes.length > 0) wasmMain.writeMemory(cOpsPtr, opsBytes);
    const t1 = performance.now();
    wasmMain.call("bb_msm_complete_reduce", numWindows, kPerWindow, cDensePtr, numOps, cOpsPtr, rootRank, cResPtr);
    const t2 = performance.now();
    const result = wasmMain.getMemorySlice(cResPtr, cResPtr + resBytes);
    const t3 = performance.now();
    return { result, computeMs: t2 - t1, totalMs: t3 - t0 };
  }

  return {
    loadMsm,
    runMsm,
    completeReduce,
    threads,
    async destroy() {
      await wasm.destroy();
      worker.terminate();
    },
  };
}

// Parse the 64-byte LE non-Montgomery result back into a (x, y) bigint
// pair so the dev page can cross-check against the WebGPU MSM and noble.
export function parseAffineLE(buf: Uint8Array): { x: bigint; y: bigint } {
  if (buf.length !== 64) {
    throw new Error(`expected 64-byte affine result, got ${buf.length}`);
  }
  let x = 0n;
  for (let i = 31; i >= 0; i--) x = (x << 8n) | BigInt(buf[i]);
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(buf[32 + i]);
  return { x, y };
}
