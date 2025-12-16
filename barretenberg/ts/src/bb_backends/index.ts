/**
 * Backend types for Barretenberg
 */
export enum BackendType {
  /** WASM direct execution (no worker) */
  Wasm = 'wasm',
  /** WASM with worker threads */
  WasmWorker = 'wasm-worker',
  /** Native via Unix domain socket (async only) */
  NativeUnixSocket = 'native-unix-socket',
  /** Native via shared memory (sync only currently) */
  NativeSharedMemory = 'native-shared-mem',
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

  /** @description Logging function */
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
