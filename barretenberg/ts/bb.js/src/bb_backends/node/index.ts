import { createBackend, createBackendSync } from '@aztec-foundation/bb.js-api';
import * as os from 'os';

import { BackendOptions, BackendType } from '../index.js';
import type { IMsgpackBackendAsync, IMsgpackBackendSync } from '../interface.js';

// Shared-memory rings sized for bb's payloads (witnesses, proofs); the async backend pipelines, so
// it gets a response ring of the same size.
const SHM_RING_SIZE = 1024 * 1024 * 4;

/**
 * bb monitors parent death (prctl/kqueue) and exits on its own, so the child must never hold the
 * Node event loop open; its log pipes (present with a logger) do, unless the caller asked for unref.
 */
function bbProcessLifetime(options: BackendOptions) {
  return { unref: true, unrefStdio: options.unref };
}

/**
 * Create backend of specific type (no fallback). Everything here is bb's choice of options over
 * @aztec-foundation/bb.js-api's backends: thread defaults, ring sizes, artifact overrides.
 */
export async function createAsyncBackend(
  type: BackendType,
  options: BackendOptions,
  logger: (msg: string) => void,
): Promise<IMsgpackBackendAsync> {
  const wasmPath = options.wasmPath ?? process.env.BB_WASM_PATH;

  switch (type) {
    case BackendType.NativeUnixSocket:
      logger('Using native Unix socket backend');
      return await createBackend({
        backend: 'process',
        // If threads not set use num cpu cores, max 16.
        threads: options.threads ?? Math.min(16, os.cpus().length),
        logger: options.logger,
        process: { binaryPath: options.bbPath, transport: 'uds', ...bbProcessLifetime(options) },
      });

    case BackendType.NativeSharedMemory:
      logger('Using native shared memory async backend');
      return await createBackend({
        backend: 'process',
        threads: options.threads ?? 16,
        logger: options.logger,
        process: {
          binaryPath: options.bbPath,
          transport: 'shm',
          clientId: 0,
          napiPath: options.napiPath,
          extraArgs: ['--request-ring-size', `${SHM_RING_SIZE}`, '--response-ring-size', `${SHM_RING_SIZE}`],
          ...bbProcessLifetime(options),
        },
      });

    case BackendType.Wasm:
    case BackendType.WasmWorker: {
      // WasmWorker hosts the module in a worker thread; Wasm runs it on the calling thread, where
      // every call blocks until bb returns.
      const worker = type === BackendType.WasmWorker;
      logger(`Using WASM backend (worker: ${worker})`);
      return await createBackend({
        backend: 'wasm',
        threads: options.threads,
        logger: options.logger,
        unref: options.unref,
        wasm: { module: wasmPath, memory: options.memory, worker },
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
  const wasmPath = options.wasmPath ?? process.env.BB_WASM_PATH;

  switch (type) {
    case BackendType.NativeSharedMemory:
      logger('Using native shared memory backend');
      return await createBackendSync({
        backend: 'process',
        // Sync callers do short, one-at-a-time requests: one thread, one request ring.
        threads: options.threads ?? 1,
        logger: options.logger,
        process: {
          binaryPath: options.bbPath,
          transport: 'shm',
          napiPath: options.napiPath,
          extraArgs: ['--request-ring-size', `${SHM_RING_SIZE}`],
          ...bbProcessLifetime(options),
        },
      });

    case BackendType.Wasm:
      logger('Using WASM backend');
      return await createBackendSync({
        backend: 'wasm',
        logger: options.logger,
        unref: options.unref,
        wasm: { module: wasmPath, memory: options.memory },
      });

    default:
      throw new Error(`Backend ${type} not supported for BarretenbergSync`);
  }
}
