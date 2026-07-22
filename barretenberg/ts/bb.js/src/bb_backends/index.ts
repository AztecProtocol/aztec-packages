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
   * @description Per-MSM scalar-distribution capture mode. When true, every
   * call to `MSM::batch_multi_scalar_mul` emits a `[msm-dist] name=<entity>
   * n=<size> nnz=<count> density=<f> c=<pickC(n)> maxbucket=<n> p99bucket=<n>
   * mean_nonzero_bucket=<f>` log line per MSM. Purely additive: leaves the
   * MSM execution path unchanged. Used to classify columns by sparsity /
   * bucket-collision pressure when deciding which polynomials are safe to
   * delegate to the WebGPU pair-tree pipeline. Off by default.
   */
  msmDistributionMode?: boolean;

  /**
   * @description Per-MSM trace mode. When true, every production
   * `MSM::batch_multi_scalar_mul` dispatch emits a `[msm-span] t0_us=<f>
   * t1_us=<f> count=<n> n=<n> labels=<csv>` log line with prove-relative
   * timestamps — a wall-clock timeline of the WASM MSM phase that the
   * chonk-webgpu page renders as a Perfetto trace (the WASM counterpart to the
   * WebGPU bridge trace). Purely additive (one log line per batch call). Off by
   * default; enable for a single traced run.
   */
  msmTraceMode?: boolean;

  /**
   * @description Phase-level BB_BENCH per-call trace capture. When true, the WASM build records a
   * `{name, parent, ts, dur, tid, depth}` event for every BB_BENCH scope within `benchTraceMaxDepth`
   * across the whole prove (all worker threads), dumped post-prove via `dumpBenchTraceJson()` as
   * Chrome Trace Event JSON. Powers the C++/WASM lanes of the end-to-end WebGPU Perfetto trace.
   * Off by default; enable for a single traced run only — capture adds a per-scope cost.
   */
  benchTrace?: boolean;

  /**
   * @description Record-time nesting-depth cap for `benchTrace` (1 == outermost scope). Keeps the
   * prove-stage tree (ChonkAPI::prove → accumulate* → …Prover::* → batch_commit → BatchMultiScalarMul)
   * and drops the per-op leaves (field arithmetic, Execution::*). Defaults to 0xff (keep all) when
   * unset; calibrate ~5–6. Ignored unless `benchTrace` is true.
   */
  benchTraceMaxDepth?: number;

  /**
   * @description Deny-list of BB_BENCH leaf op names excluded from `benchTrace` capture regardless
   * of depth — for hot work-unit leaves the depth cap alone doesn't drop (e.g.
   * `MSM::evaluate_work_units`, `compute_univariate_with_row_skipping/chunk`). Keeps the phase-level
   * trace clean. Names must not contain commas. Ignored unless `benchTrace` is true.
   */
  benchTraceDenylist?: readonly string[];

  /**
   * @description Per-label block-list of MSMs that must stay on the native CPU
   * Pippenger even when `webgpuMsm` is true. The label is the entity name
   * passed down to `MSM::batch_multi_scalar_mul` via `batch_commit(..., labels)`
   * — e.g. `LOOKUP_READ_TAGS`, `VK_PRECOMPUTED_POLY`. Used to exclude
   * pair-tree-hostile columns (selectors / single-value counters whose
   * scalar distribution concentrates every entry into a single bucket) from
   * GPU delegation. Empty/undefined means no blocking. Ignored when
   * `webgpuMsm` is false.
   */
  webgpuMsmBlocklist?: readonly string[];
};
