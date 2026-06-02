import { BarretenbergWasmMain, BarretenbergWasmMainWorker } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { fetchModuleAndThreads } from '../barretenberg_wasm/index.js';
import { IMsgpackBackendSync, IMsgpackBackendAsync } from './interface.js';
import { createMainWorker } from '../barretenberg_wasm/barretenberg_wasm_main/factory/node/index.js';
import { getRemoteBarretenbergWasm } from '../barretenberg_wasm/helpers/index.js';
import { proxy } from 'comlink';

/**
 * Marshal a per-label blocklist into the WASM heap as a null-terminated CSV
 * string and call `bb_set_webgpu_msm_blocklist`. Used to keep specific named
 * MSMs (e.g. `LOOKUP_READ_TAGS`, `VK_PRECOMPUTED_POLY`) on the native CPU
 * Pippenger even when the WebGPU bridge is enabled — see the column-safety
 * analysis at `/tmp/zac-webgpu/chonk-delegate-eligible.md`.
 *
 * Labels must not contain commas (the C++ side splits on `,`). The buffer is
 * intentionally leaked: it's a one-shot init-time string, freeing it after
 * the setter copies it into a `std::vector<std::string>` would just add
 * complexity. Total size ≤ a few hundred bytes.
 */
async function applyBlocklist(
  wasm: { call(name: string, ...args: any[]): Promise<any> | any; writeMemory(offset: number, arr: Uint8Array): any },
  labels: readonly string[],
): Promise<void> {
  const csv = labels.join(',');
  const bytes = new TextEncoder().encode(csv);
  const buf = new Uint8Array(bytes.length + 1);
  buf.set(bytes, 0);
  // Trailing null already 0-initialised; explicit for clarity.
  buf[bytes.length] = 0;
  const ptr = await wasm.call('bbmalloc', buf.length);
  await wasm.writeMemory(ptr, buf);
  await wasm.call('bb_set_webgpu_msm_blocklist', ptr);
}

/**
 * Marshal a comma-separated deny-list of BB_BENCH leaf op names into the WASM heap and call
 * `bb_set_bench_trace_denylist`. Drops hot work-unit leaves (e.g. `MSM::evaluate_work_units`,
 * `compute_univariate_with_row_skipping/chunk`) from per-call capture regardless of depth, keeping
 * a phase-level trace clean. Same null-terminated-CSV convention and one-shot leak as
 * `applyBlocklist`; names must not contain commas.
 */
async function applyBenchTraceDenylist(
  wasm: { call(name: string, ...args: any[]): Promise<any> | any; writeMemory(offset: number, arr: Uint8Array): any },
  names: readonly string[],
): Promise<void> {
  const csv = names.join(',');
  const bytes = new TextEncoder().encode(csv);
  const buf = new Uint8Array(bytes.length + 1);
  buf.set(bytes, 0);
  buf[bytes.length] = 0;
  const ptr = await wasm.call('bbmalloc', buf.length);
  await wasm.writeMemory(ptr, buf);
  await wasm.call('bb_set_bench_trace_denylist', ptr);
}

/**
 * Synchronous WASM backend that wraps BarretenbergWasmMain.
 * Encapsulates all WASM initialization and memory management.
 */
export class BarretenbergWasmSyncBackend implements IMsgpackBackendSync {
  private constructor(private wasm: BarretenbergWasmMain) {}

  /**
   * Create and initialize a synchronous WASM backend.
   * @param wasmPath Optional path to WASM files
   * @param logger Optional logging function
   */
  static async new(wasmPath?: string, logger?: (msg: string) => void): Promise<BarretenbergWasmSyncBackend> {
    const wasm = new BarretenbergWasmMain();
    const { module, threads } = await fetchModuleAndThreads(1, wasmPath, logger);
    await wasm.init(module, threads, logger);
    return new BarretenbergWasmSyncBackend(wasm);
  }

  call(inputBuffer: Uint8Array): Uint8Array {
    return this.wasm.cbindCall('bbapi', inputBuffer);
  }

  destroy(): void {
    // BarretenbergWasmMain has async destroy, but for sync API we call it without awaiting
    // This is consistent with the synchronous semantics expected by the caller
    void this.wasm.destroy();
  }
}

/**
 * Asynchronous WASM backend that supports both direct WASM and worker-based modes.
 *
 * Worker mode (default): Runs WASM on a worker thread to avoid blocking the main thread. Used in browsers.
 * Direct mode: Runs WASM directly on the calling thread. Used by node.js for better performance.
 */
export class BarretenbergWasmAsyncBackend implements IMsgpackBackendAsync {
  private constructor(
    private wasm: BarretenbergWasmMain | BarretenbergWasmMainWorker,
    private worker?: any,
    // Bridge handle when webgpuMsm was wired during init. Destroyed alongside
    // the backend so the GPUDevice + MSM point pool are released.
    private webgpuBridge?: { destroy: () => Promise<void> },
  ) {}

  /**
   * Create and initialize an asynchronous WASM backend.
   * @param options.threads Number of threads (defaults to hardware max, up to 32 for parallel proving)
   * @param options.wasmPath Optional path to WASM files
   * @param options.logger Optional logging function
   * @param options.memory Optional initial and maximum memory configuration
   * @param options.useWorker Run on worker thread (default: true for browser safety)
   * @param options.unref Unref worker handles so they don't prevent process exit
   * @param options.webgpuMsm Wire the WebGPU MSM bridge (browser + worker mode only)
   */
  static async new(
    options: {
      threads?: number;
      wasmPath?: string;
      logger?: (msg: string) => void;
      memory?: { initial?: number; maximum?: number };
      useWorker?: boolean;
      unref?: boolean;
      webgpuMsm?: boolean;
      msmCsvMode?: boolean;
      msmDistributionMode?: boolean;
      msmTraceMode?: boolean;
      benchTrace?: boolean;
      benchTraceMaxDepth?: number;
      benchTraceDenylist?: readonly string[];
      webgpuMsmBlocklist?: readonly string[];
    } = {},
  ): Promise<BarretenbergWasmAsyncBackend> {
    // Default to worker mode for browser safety
    const useWorker = options.useWorker ?? true;

    if (useWorker) {
      // Worker-based mode: runs on worker thread (browser-safe)
      const worker = await createMainWorker();
      const wasm = getRemoteBarretenbergWasm<BarretenbergWasmMainWorker>(worker);

      // WebGPU bridge wiring. Must happen BEFORE wasm.init() so the worker's
      // env imports for bb_external_msm_bn254 / bb_publish_srs_bn254 are
      // overridden with the SAB-backed bridge stubs in time for WASM
      // instantiation. Browser-only; main-thread-only (the GPUDevice lives
      // there). Skipped silently if navigator.gpu is unavailable.
      let webgpuBridge: { destroy: () => Promise<void> } | undefined;
      if (options.webgpuMsm && typeof navigator !== 'undefined' && 'gpu' in navigator) {
        const { setupWebGpuMsmBridge } = await import('../msm_webgpu/setup.js');
        webgpuBridge = await setupWebGpuMsmBridge(worker as unknown as Worker);
      }

      const { module, threads } = await fetchModuleAndThreads(options.threads, options.wasmPath, options.logger);
      await wasm.init(
        module,
        threads,
        proxy(options.logger ?? (() => {})),
        options.memory?.initial,
        options.memory?.maximum,
      );

      // After init the WASM memory exists. Have the worker post it back to
      // the bridge host (handled by setupWebGpuMsmBridge's message listener),
      // then flip the runtime gate so batch_multi_scalar_mul starts routing
      // BN254 MSMs at or above WEBGPU_MSM_THRESHOLD through the bridge.
      if (webgpuBridge) {
        await wasm.publishWebGpuMemory();
        await wasm.call('bb_set_webgpu_msm_enabled', 1);
        if (options.webgpuMsmBlocklist && options.webgpuMsmBlocklist.length > 0) {
          await applyBlocklist(wasm, options.webgpuMsmBlocklist);
        }
      }
      if (options.msmCsvMode) {
        await wasm.call('bb_set_msm_csv_mode', 1);
      }
      if (options.msmDistributionMode) {
        await wasm.call('bb_set_msm_distribution_mode', 1);
      }
      if (options.msmTraceMode) {
        await wasm.call('bb_set_msm_trace_mode', 1);
      }
      // Phase-level BB_BENCH capture. Set the depth cap first, then enable capture — both flip
      // globals in shared WASM memory before the prove starts, so every worker thread sees them.
      if (options.benchTrace) {
        if (options.benchTraceMaxDepth !== undefined) {
          await wasm.call('bb_set_bench_trace_max_depth', options.benchTraceMaxDepth & 0xff);
        }
        if (options.benchTraceDenylist && options.benchTraceDenylist.length > 0) {
          await applyBenchTraceDenylist(wasm, options.benchTraceDenylist);
        }
        await wasm.call('bb_set_bench_trace', 1);
      }

      if (options.unref) {
        worker.unref();
      }
      return new BarretenbergWasmAsyncBackend(wasm, worker, webgpuBridge);
    } else {
      // Direct mode: runs on calling thread (faster but blocks thread). The
      // WebGPU bridge is worker-mode only — the bridge protocol assumes a
      // worker that can block on Atomics.wait while the main thread services
      // GPU work, which is the inverse topology of direct mode.
      const wasm = new BarretenbergWasmMain();
      const { module, threads } = await fetchModuleAndThreads(options.threads, options.wasmPath, options.logger);
      await wasm.init(module, threads, options.logger, options.memory?.initial, options.memory?.maximum, options.unref);
      if (options.msmCsvMode) {
        await wasm.call('bb_set_msm_csv_mode', 1);
      }
      if (options.msmDistributionMode) {
        await wasm.call('bb_set_msm_distribution_mode', 1);
      }
      if (options.msmTraceMode) {
        await wasm.call('bb_set_msm_trace_mode', 1);
      }
      if (options.benchTrace) {
        if (options.benchTraceMaxDepth !== undefined) {
          await wasm.call('bb_set_bench_trace_max_depth', options.benchTraceMaxDepth & 0xff);
        }
        if (options.benchTraceDenylist && options.benchTraceDenylist.length > 0) {
          await applyBenchTraceDenylist(wasm, options.benchTraceDenylist);
        }
        await wasm.call('bb_set_bench_trace', 1);
      }
      return new BarretenbergWasmAsyncBackend(wasm);
    }
  }

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    return this.wasm.cbindCall('bbapi', inputBuffer);
  }

  /**
   * Invoke a no-argument WASM export by name (e.g. the MSM-phase instrumentation
   * `bb_emit_msm_phase`, which logs a `[msm-phase-total] ms=…` line via the C++
   * logger). Used by measurement harnesses; not part of the proving API.
   */
  async callRawExport(name: string): Promise<void> {
    await this.wasm.call(name);
  }

  /**
   * Serialize the phase-level BB_BENCH per-call trace captured during the most recent prove to
   * Chrome Trace Event JSON. Returns `undefined` on a build without the trace export. The C++ side
   * writes a length-prefixed heap buffer (`[u32 BE value-length][json bytes]`), so the leading 4
   * bytes are stripped here. Call after prove, before destroy. No-op cost when `benchTrace` was off
   * (the trace is just empty).
   */
  async dumpBenchTraceJson(): Promise<string | undefined> {
    // `this.wasm` is BarretenbergWasmMain (direct) or its comlink Remote (worker); both expose
    // callWasmExport (comlink proxies it). Don't guard on `typeof` — a comlink method proxy doesn't
    // reliably report `'function'` — just call and let a missing export surface as a thrown error.
    const w = this.wasm as unknown as {
      callWasmExport: (
        n: string,
        inArgs: (Uint8Array | number)[],
        outLens: (number | undefined)[],
      ) => Promise<any> | any;
    };
    try {
      const out = await w.callWasmExport('bb_dump_bench_trace_json', [], [undefined]);
      const buf: Uint8Array = out[0];
      // C++ returns `[u32 BE value-length][json bytes]` (to_heap_buffer's inner prefix); strip it.
      return new TextDecoder().decode(buf.subarray(4));
    } catch {
      return undefined;
    }
  }

  /**
   * Read the BB_BENCH wall clock (the same source per-call `ts` is stamped with — the WASI
   * `clock_time_get` import, i.e. `Date.now()·1e6`) as nanoseconds. Used to validate that the C++
   * clock matches the JS-side `Date.now()` anchors. Returns `undefined` on a build without it.
   */
  async benchClockNs(): Promise<bigint | undefined> {
    const w = this.wasm as unknown as {
      callWasmExport: (
        n: string,
        inArgs: (Uint8Array | number)[],
        outLens: (number | undefined)[],
      ) => Promise<any> | any;
    };
    try {
      const out = await w.callWasmExport('bb_bench_clock_ns', [], [8]);
      const buf: Uint8Array = out[0];
      return new DataView(buf.buffer, buf.byteOffset, 8).getBigUint64(0, true);
    } catch {
      return undefined;
    }
  }

  async destroy(): Promise<void> {
    await this.wasm.destroy();
    if (this.webgpuBridge) {
      await this.webgpuBridge.destroy();
    }
    if (this.worker) {
      await this.worker.terminate();
    }
  }
}
