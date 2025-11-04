import { BarretenbergWasmSyncBackend, BarretenbergWasmAsyncBackend } from '../wasm.js';
import { Barretenberg, BarretenbergSync } from '../../barretenberg/index.js';
import { BackendOptions, BackendType } from '../index.js';

/**
 * Create backend of specific type (no fallback)
 */
export async function createAsyncBackend(
  type: BackendType,
  options: BackendOptions,
  logger: (msg: string) => void,
): Promise<Barretenberg> {
  switch (type) {
    case BackendType.Wasm:
    case BackendType.WasmWorker: {
      const useWorker = type === BackendType.WasmWorker;
      logger(`Using WASM backend (worker: ${useWorker})`);
      const wasm = await BarretenbergWasmAsyncBackend.new({
        threads: options.threads,
        wasmPath: options.wasmPath,
        logger,
        memory: options.memory,
        useWorker,
      });
      return new Barretenberg(wasm, options);
    }

    default:
      throw new Error(`Unknown backend type: ${type}`);
  }
}

/**
 * Create backend of specific type (no fallback)
 */
export async function createSyncBackend(
  type: BackendType,
  options: BackendOptions,
  logger: (msg: string) => void,
): Promise<BarretenbergSync> {
  switch (type) {
    case BackendType.Wasm:
      logger('Using WASM backend');
      const wasm = await BarretenbergWasmSyncBackend.new(options.wasmPath, logger);
      return new BarretenbergSync(wasm);

    default:
      throw new Error(`Backend ${type} not supported for BarretenbergSync`);
  }
}
