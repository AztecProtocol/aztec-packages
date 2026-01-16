import { BarretenbergNativeSocketAsyncBackend } from './native_socket.js';
import { BarretenbergWasmSyncBackend, BarretenbergWasmAsyncBackend } from '../wasm.js';
import { BarretenbergNativeShmSyncBackend } from './native_shm.js';
import { BarretenbergNativeShmAsyncBackend } from './native_shm_async.js';
import { findBbBinary, findNapiBinary } from './platform.js';
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
      const socket = new BarretenbergNativeSocketAsyncBackend(bbPath, options.threads, options.logger);
      return new Barretenberg(socket, options);
    }

    case BackendType.NativeSharedMemory: {
      const bbPath = findBbBinary(options.bbPath);
      if (!bbPath) {
        throw new Error('Native backend requires bb binary.');
      }
      const napiPath = findNapiBinary(options.napiPath);
      if (!napiPath) {
        throw new Error('Native async backend requires napi client stub.');
      }
      logger(`Using native shared memory async backend: ${bbPath}`);
      const asyncBackend = await BarretenbergNativeShmAsyncBackend.new(
        bbPath,
        napiPath,
        options.threads,
        options.logger,
      );
      return new Barretenberg(asyncBackend, options);
    }

    case BackendType.Wasm:
    case BackendType.WasmWorker: {
      const useWorker = type === BackendType.WasmWorker;
      logger(`Using WASM backend (worker: ${useWorker})`);
      const wasm = await BarretenbergWasmAsyncBackend.new({
        threads: options.threads,
        wasmPath: options.wasmPath,
        logger: options.logger,
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
      const napiPath = findNapiBinary(options.napiPath);
      if (!napiPath) {
        throw new Error('Native sync backend requires napi client stub.');
      }
      logger(`Using native shared memory backend: ${bbPath}`);
      const shm = await BarretenbergNativeShmSyncBackend.new(bbPath, napiPath, options.threads, options.logger);
      return new BarretenbergSync(shm);
    }

    case BackendType.Wasm:
      logger('Using WASM backend');
      const wasm = await BarretenbergWasmSyncBackend.new(options.wasmPath, logger);
      return new BarretenbergSync(wasm);

    default:
      throw new Error(`Backend ${type} not supported for BarretenbergSync`);
  }
}
