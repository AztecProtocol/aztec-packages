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
  ) {}

  /**
   * Create and initialize an asynchronous WASM backend.
   * @param options.threads Number of threads (defaults to hardware max, up to 32 for parallel proving)
   * @param options.wasmPath Optional path to WASM files
   * @param options.logger Optional logging function
   * @param options.memory Optional initial and maximum memory configuration
   * @param options.useWorker Run on worker thread (default: true for browser safety)
   */
  static async new(
    options: {
      threads?: number;
      wasmPath?: string;
      logger?: (msg: string) => void;
      memory?: { initial?: number; maximum?: number };
      useWorker?: boolean;
    } = {},
  ): Promise<BarretenbergWasmAsyncBackend> {
    // Default to worker mode for browser safety
    const useWorker = options.useWorker ?? true;

    if (useWorker) {
      // Worker-based mode: runs on worker thread (browser-safe)
      const worker = await createMainWorker();
      const wasm = getRemoteBarretenbergWasm<BarretenbergWasmMainWorker>(worker);
      const { module, threads } = await fetchModuleAndThreads(options.threads, options.wasmPath, options.logger);
      await wasm.init(
        module,
        threads,
        proxy(options.logger ?? (() => {})),
        options.memory?.initial,
        options.memory?.maximum,
      );
      return new BarretenbergWasmAsyncBackend(wasm, worker);
    } else {
      // Direct mode: runs on calling thread (faster but blocks thread)
      const wasm = new BarretenbergWasmMain();
      const { module, threads } = await fetchModuleAndThreads(options.threads, options.wasmPath, options.logger);
      await wasm.init(module, threads, options.logger, options.memory?.initial, options.memory?.maximum);
      return new BarretenbergWasmAsyncBackend(wasm);
    }
  }

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    return this.wasm.cbindCall('bbapi', inputBuffer);
  }

  async destroy(): Promise<void> {
    await this.wasm.destroy();
    if (this.worker) {
      await this.worker.terminate();
    }
  }
}
