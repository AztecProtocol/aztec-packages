import { createBackend, createBackendSync, sharedMemoryAvailable } from '@aztec-foundation/bb.js-api';
import type { IpcClientAsync, IpcClientSync } from '@aztec-foundation/ipc-runtime';

import { experimentalEnvironment } from '../experimental_optimizations.js';
import { BackendOptions, BackendType } from '../index.js';

/** Resolve experimental options once, including before a backend fallback. */
export function resolveExperimentalOptions(options: BackendOptions): BackendOptions {
  const env = experimentalEnvironment(options);
  return {
    ...options,
    experimentalOptimizations: env.BB_EXPERIMENTAL_OPTIMIZATIONS === '1',
    rollupExperimentalOptimizations: env.ROLLUP_EXPERIMENTAL_OPTIMIZATIONS === '1',
  };
}

/** There is no bb binary in a browser; the node build's counterpart locates the packaged one. */
export function findBbBinary(_customPath?: string): string | null {
  throw new Error('findBbBinary is not available in a browser.');
}

/**
 * Create backend of specific type (no fallback)
 */
export async function createAsyncBackend(
  type: BackendType,
  options: BackendOptions,
  logger: (msg: string) => void,
): Promise<IpcClientAsync> {
  const env = experimentalEnvironment(options);

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
        wasm: { env, module: options.wasmPath, memory: options.memory, worker },
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
): Promise<IpcClientSync> {
  const env = experimentalEnvironment(options);

  switch (type) {
    case BackendType.Wasm:
      logger('Using WASM backend');
      return await createBackendSync({
        backend: 'wasm',
        logger,
        wasm: { env, module: options.wasmPath, memory: options.memory },
      });

    default:
      throw new Error(`Backend ${type} not supported for BarretenbergSync`);
  }
}
