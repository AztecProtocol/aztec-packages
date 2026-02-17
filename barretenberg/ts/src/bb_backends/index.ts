/**
 * Backend types for Barretenberg
 */
export enum BackendType {
  /** WASM direct execution (no worker) */
  Wasm = 'Wasm',
  /** WASM with worker threads */
  WasmWorker = 'WasmWorker',
  /** Native via Unix domain socket (async only) */
  NativeUnixSocket = 'NativeUnixSocket',
  /** Native via shared memory */
  NativeSharedMemory = 'NativeSharedMemory',
}

export type BackendOptions = {
  /** @description Number of threads to run the backend worker on */
  threads?: number;

  /** @description Initial and Maximum memory to be alloted to the backend worker */
  memory?: { initial?: number; maximum?: number };

  /** @description Path to download CRS files */
  crsPath?: string;

  /** @description Path to download WASM files */
  wasmPath?: string;

  /** @description Custom path to bb binary for native backend (overrides automatic detection) */
  bbPath?: string;

  /** @description Custom path to bb NAPI module for native backend (overrides automatic detection) */
  napiPath?: string;

  /**
   * @description Logging function
   * Warning: Attaching a logger can prevent nodejs from exiting without explicitly destroying the backend.
   */
  logger?: (msg: string) => void;

  /**
   * @description Maximum concurrent clients for shared memory IPC server (default: 1)
   * Only applies to NativeSharedMemory backend
   */
  maxClients?: number;

  /**
   * @description Specify exact backend to use
   * - If unset: tries backends in default order with fallback
   * - If set: must succeed with specified backend or throw error (no fallback)
   *
   * Barretenberg (async) supports: all types
   * BarretenbergSync supports: Wasm, NativeSharedMem only
   */
  backend?: BackendType;
};
