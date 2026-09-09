import { createBackend, createBackendSync, sharedMemoryAvailable } from '@aztec-foundation/bb.js-api';

import { BackendOptions, BackendType } from '../index.js';
import type { IMsgpackBackendAsync, IMsgpackBackendSync } from '../interface.js';

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
      const worker = type === BackendType.WasmWorker;
      logger(`Using WASM backend (worker: ${worker})`);
      return await createBackend({
        backend: 'wasm',
        // bb.js's documented behaviour: a page served without COOP/COEP gets the single-threaded
        // module, whatever thread count was asked for.
        threads: sharedMemoryAvailable() ? options.threads : 1,
        logger,
        wasm: { module: options.wasmPath, memory: options.memory, worker },
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
    case BackendType.Wasm:
      logger('Using WASM backend');
      return await createBackendSync({
        backend: 'wasm',
        logger,
        wasm: { module: options.wasmPath, memory: options.memory },
      });

    default:
      throw new Error(`Backend ${type} not supported for BarretenbergSync`);
  }
}
