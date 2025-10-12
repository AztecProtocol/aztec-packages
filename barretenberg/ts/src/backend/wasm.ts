import { BarretenbergWasmMain } from '../barretenberg_wasm/barretenberg_wasm_main/index.js';
import { fetchModuleAndThreads } from '../barretenberg_wasm/index.js';
import { IMsgpackBackendSync, IMsgpackBackendAsync } from './interface.js';

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
 * Asynchronous WASM backend that wraps BarretenbergWasmMain directly (no worker).
 *
 * Note: We use direct WASM access instead of a worker to avoid worker communication
 * overhead. While workers prevent blocking the main thread, the serialize/deserialize
 * overhead for each call makes them impractical for high-frequency operations.
 * For tight loops with many calls, direct access is ~3-4x faster.
 */
export class BarretenbergWasmAsyncBackend implements IMsgpackBackendAsync {
  private constructor(private wasm: BarretenbergWasmMain) {}

  /**
   * Create and initialize an asynchronous WASM backend.
   * Uses direct WASM access (no worker) for better performance.
   * @param threads Number of threads (defaults to hardware availability)
   * @param wasmPath Optional path to WASM files
   * @param logger Optional logging function
   * @param memory Optional initial and maximum memory configuration
   */
  static async new(
    options: {
      threads?: number;
      wasmPath?: string;
      logger?: (msg: string) => void;
      memory?: { initial?: number; maximum?: number };
    } = {},
  ): Promise<BarretenbergWasmAsyncBackend> {
    const wasm = new BarretenbergWasmMain();
    // Default to 1 thread for better startup time, user can override if needed
    const { module, threads } = await fetchModuleAndThreads(options.threads ?? 1, options.wasmPath, options.logger);
    await wasm.init(module, threads, options.logger, options.memory?.initial, options.memory?.maximum);
    return new BarretenbergWasmAsyncBackend(wasm);
  }

  async call(inputBuffer: Uint8Array): Promise<Uint8Array> {
    // Return Promise.resolve to maintain async interface but avoid worker overhead
    return this.wasm.cbindCall('bbapi', inputBuffer);
  }

  async destroy(): Promise<void> {
    await this.wasm.destroy();
  }
}
