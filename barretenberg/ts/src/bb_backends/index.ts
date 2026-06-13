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

  /** @description Number of G1 points to download when initializing the CRS/SRS for WASM backends */
  srsSize?: number;

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

  /**
   * @description Mark backend handles (worker threads, sockets, pipes) as unref'd so they
   * don't prevent the Node.js process from exiting. Used for the singleton instance where
   * callers don't manage the lifecycle. Non-singleton instances should leave this false
   * and call destroy() to clean up.
   */
  unref?: boolean;

  /**
   * @description Skip SRS/CRS initialization for WASM backends.
   * Use this when you only need hashing functions (blake2s, poseidon, pedersen) and
   * don't need proving/verification capabilities.
   */
  skipSrsInit?: boolean;

  /**
   * @description Wire the WebGPU MSM bridge into the WASM worker so BN254 batch MSMs
   * at or above WEBGPU_MSM_THRESHOLD are dispatched to a GPU host on the main
   * thread instead of running the in-tree native Pippenger. Browser-only; ignored
   * in Node. Requires a WASM built with -DBBERG_WEBGPU_MSM_HOOK=ON.
   */
  webgpuMsm?: boolean;

  /**
   * @description Per-MSM CSV measurement mode. When true, every call to
   * `MSM::batch_multi_scalar_mul` runs each MSM solo (multi-threaded
   * Pippenger, but one at a time) and emits a `[msm-csv-cpu] name=<entity>
   * n=<size> cpu_ms=<ms>` log line per MSM. Used by the bench harness to
   * build a per-MSM (named) CSV table of CPU times. Off in production —
   * removes the cross-MSM thread-balancing in batch MSMs.
   */
  msmCsvMode?: boolean;

  /**
   * @description Oracle MSM routing. When set, the WebGPU hook dispatches
   * exactly the listed MSM sequence indices (deterministic commit order) to
   * the GPU and keeps the rest on CPU — used to measure a per-MSM CPU-vs-GPU
   * oracle's prove wall. Requires webgpuMsm. Empty/undefined uses the size
   * predicate.
   */
  oracleRouteSeqs?: number[];
};
