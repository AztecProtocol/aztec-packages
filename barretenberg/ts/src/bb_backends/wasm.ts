import { BarretenbergWasmMain, BarretenbergWasmMainWorker } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { fetchModuleAndThreads } from '../barretenberg_wasm/index.js';
import { IMsgpackBackendSync, IMsgpackBackendAsync } from './interface.js';
import { createMainWorker } from '../barretenberg_wasm/barretenberg_wasm_main/factory/node/index.js';
import { getRemoteBarretenbergWasm } from '../barretenberg_wasm/helpers/index.js';
import { proxy } from 'comlink';

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
        // Batch-size-aware small-MSM delegation. When a batch_multi_scalar_mul holds
        // >= BD_K MSMs, MSMs of size >= BD_SMALL are delegated to the GPU union
        // (instead of the compile-time 2^14), so the union batches the small ones —
        // which saturate the GPU (MULTI_MSM_PERF.md) where one-at-a-time would starve
        // it. In csv-measurement mode every MSM is delegated (k=1, small=1) so each
        // commit is timed on the GPU; otherwise the shipped batch-size-aware config.
        const [BD_K, BD_SMALL] = options.msmCsvMode ? [1, 1] : [2, 512];
        if (BD_K !== 0xffffffff) {
          await wasm.call('bb_set_webgpu_batch_delegate', BD_K >>> 0, BD_SMALL >>> 0);
        }
      }
      if (options.msmCsvMode) {
        await wasm.call('bb_set_msm_csv_mode', 1);
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
      return new BarretenbergWasmAsyncBackend(wasm);
    }
  }

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    return this.wasm.cbindCall('bbapi', inputBuffer);
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
