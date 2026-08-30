import { BackendOptions, BackendType } from '../index.js';
import type { IMsgpackBackendAsync, IMsgpackBackendSync } from '../interface.js';
import { BarretenbergWasmAsyncBackend, BarretenbergWasmSyncBackend } from '../wasm.js';
import { BarretenbergNativeShmSyncBackend } from './native_shm.js';
import { BarretenbergNativeShmAsyncBackend } from './native_shm_async.js';
import { BarretenbergNativeSocketAsyncBackend } from './native_socket.js';
import { findBbBinary } from './platform.js';

/**
 * Create backend of specific type (no fallback)
 */
export async function createAsyncBackend(
  type: BackendType,
  options: BackendOptions,
  logger: (msg: string) => void,
): Promise<IMsgpackBackendAsync> {
  options = {
    ...options,
    wasmPath: options.wasmPath ?? process.env.BB_WASM_PATH,
  };

  switch (type) {
    case BackendType.NativeUnixSocket: {
      const bbPath = findBbBinary(options.bbPath);
      if (!bbPath) {
        throw new Error('Native backend requires bb binary.');
      }
      logger(`Using native Unix socket backend: ${bbPath}`);
      return await BarretenbergNativeSocketAsyncBackend.new(bbPath, options.threads, options.logger, options.unref);
    }

    case BackendType.NativeSharedMemory: {
      const bbPath = findBbBinary(options.bbPath);
      if (!bbPath) {
        throw new Error('Native backend requires bb binary.');
      }
      logger(`Using native shared memory async backend: ${bbPath}`);
      return await BarretenbergNativeShmAsyncBackend.new(bbPath, options.napiPath, options.threads, options.logger);
    }

    case BackendType.Wasm:
    case BackendType.WasmWorker: {
      const useWorker = type === BackendType.WasmWorker;
      logger(`Using WASM backend (worker: ${useWorker})`);
      return await BarretenbergWasmAsyncBackend.new({
        threads: options.threads,
        wasmPath: options.wasmPath,
        logger: options.logger,
        memory: options.memory,
        useWorker,
        unref: options.unref,
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
  options = {
    ...options,
    wasmPath: options.wasmPath ?? process.env.BB_WASM_PATH,
  };

  switch (type) {
    case BackendType.NativeSharedMemory: {
      const bbPath = findBbBinary(options.bbPath);
      if (!bbPath) {
        throw new Error('Native backend requires bb binary.');
      }
      logger(`Using native shared memory backend: ${bbPath}`);
      return await BarretenbergNativeShmSyncBackend.new(bbPath, options.napiPath, options.threads, options.logger);
    }

    case BackendType.Wasm: {
      logger('Using WASM backend');
      return await BarretenbergWasmSyncBackend.new(options.wasmPath, logger);
    }

    default:
      throw new Error(`Backend ${type} not supported for BarretenbergSync`);
  }
}
