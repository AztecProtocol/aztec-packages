// In-browser harness for the native barretenberg Pippenger MSM, calling
// the `bb_native_pippenger_bn254` WASM export directly. We bypass the
// `cbindCall('bbapi', …)` msgpack path because the export takes raw
// LE-32 bytes (same byte layout the WebGPU MSM consumes), so there's no
// schema indirection to add — and bypassing keeps the comparison "what's
// the raw cost of a Pippenger call from JS", not "what's bbapi msgpack
// overhead + Pippenger".
//
// The export lives in `barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.cpp`
// and is only compiled into builds with `BBERG_WEBGPU_MSM_HOOK` defined — i.e. the
// same WASM that bb.js ships for production. The export calls
// `MSM<BN254>::batch_multi_scalar_mul_native`, which skips the hook
// delegation, so we measure in-tree Pippenger rather than recursing back
// into the WebGPU bridge.

import { createMainWorker } from "../../src/barretenberg_wasm/barretenberg_wasm_main/factory/browser/index.js";
import { fetchModuleAndThreads } from "../../src/barretenberg_wasm/index.js";
import { getRemoteBarretenbergWasm } from "../../src/barretenberg_wasm/helpers/browser/index.js";
import type { BarretenbergWasmMainWorker } from "../../src/barretenberg_wasm/barretenberg_wasm_main/index.js";

// bb.js's main bb worker doesn't currently install the WebGPU bridge
// stubs on its own; the default `main.worker.ts` we ship hands the
// WASM module a no-op `bb_publish_srs_bn254` and a throwing
// `bb_external_msm_bn254`. That's fine for our purposes because
// `bb_native_pippenger_bn254` never invokes the hook path.
export interface WasmPippengerHandle {
  /** Single MSM. `numThreads === 0` keeps the runtime default. */
  runMsm(
    pointsBuf: Uint8Array,
    scalarsBuf: Uint8Array,
    numThreads: number,
  ): Promise<Uint8Array>;
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

  async function runMsm(
    pointsBuf: Uint8Array,
    scalarsBuf: Uint8Array,
    numThreads: number,
  ): Promise<Uint8Array> {
    if (pointsBuf.length % 64 !== 0 || scalarsBuf.length % 64 !== 0) {
      // Note: scalars are 32-byte; we also assert points are 64.
    }
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
    const resultPtr = await wasm.call("bbmalloc", 64);
    try {
      await wasm.writeMemory(pointsPtr, pointsBuf);
      await wasm.writeMemory(scalarsPtr, scalarsBuf);
      await wasm.call(
        "bb_native_pippenger_bn254",
        pointsPtr,
        scalarsPtr,
        n,
        numThreads,
        resultPtr,
      );
      return await wasm.getMemorySlice(resultPtr, resultPtr + 64);
    } finally {
      // Best-effort frees. If a call throws, the WASM heap retains these
      // until the worker is destroyed — fine for the dev page.
      await wasm.call("bbfree", pointsPtr);
      await wasm.call("bbfree", scalarsPtr);
      await wasm.call("bbfree", resultPtr);
    }
  }

  return {
    runMsm,
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
