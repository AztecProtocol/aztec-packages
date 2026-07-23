import { BackendOptions, BackendType } from '../index.js';
import type { IMsgpackBackendAsync, IMsgpackBackendSync } from '../interface.js';
import { BarretenbergWasmAsyncBackend, BarretenbergWasmSyncBackend } from '../wasm.js';

/**
 * Create backend of specific type (no fallback)
 */
export async function createAsyncBackend(
  type: BackendType,
  options: BackendOptions,
  logger: (msg: string) => void,
): Promise<IMsgpackBackendAsync> {
  switch (type) {
    case BackendType.Wasm:
    case BackendType.WasmWorker: {
      const useWorker = type === BackendType.WasmWorker;
      logger(`Using WASM backend (worker: ${useWorker})`);
      return await BarretenbergWasmAsyncBackend.new({
        threads: options.threads,
        wasmPath: options.wasmPath,
        logger,
        memory: options.memory,
        useWorker,
      });
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
): Promise<IMsgpackBackendSync> {
  switch (type) {
    case BackendType.Wasm: {
      logger('Using WASM backend');
      return await BarretenbergWasmSyncBackend.new(options.wasmPath, logger);
    }

    default:
      throw new Error(`Backend ${type} not supported for BarretenbergSync`);
  }
}
