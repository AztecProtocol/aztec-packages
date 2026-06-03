// msm_types.ts — types shared by both MSM backends (stream-walker + high-memory).
//
// Kept backend-neutral so neither `msm_stream_walker.ts` nor `msm_high_memory.ts`
// has to import types from the other. The dispatcher (`msm.ts`) and the bridge
// import `MsmConfig`/`MsmBackendKind` from here.

/** Which MSM algorithm backend `createMsm` should build. Default 'stream_walker'. */
export type MsmBackendKind = 'stream_walker' | 'high_memory';

/** An affine point in canonical (non-Montgomery) form. */
export interface Pt {
  x: bigint;
  y: bigint;
}

/**
 * Tuning knobs for the MSM backends. Every field is optional and defaults to the
 * value that reproduces current behaviour, so `{}` (or omitting it) is a no-op
 * — which keeps A/B comparisons honest. Backend-specific knobs are ignored by
 * the backend they don't apply to.
 */
export interface MsmConfig {
  /** Which backend algorithm to run. Default 'stream_walker'. */
  backend?: MsmBackendKind;
  /** Pippenger window bits. Default: `pickC(n)`. */
  c?: number;
  /** Fused-kernel chunk size (pairs batched per thread). Default: `pickS(n)`. */
  s?: number;
  /** Generic kernel workgroup size. Default 128. */
  wgi?: number;
  /** Bucket-reduction workgroup size. Default: `pickReduceWg(c)`. */
  reduceWg?: number;
  /** Reduction leaf-partition log2. Default 1. */
  l0Log?: number;
  /** GPU field-inversion variant. Default 'pk' (2×13-packed safegcd). */
  invVariant?: 'loop' | 'pk';
  /** ba_fused_super 8×u32 fr_add/fr_sub: 'native' or 'unpack'-repack. Default 'native'. */
  addsub?: 'native' | 'unpack';
  /**
   * Enable the single-dispatch cooperative bucket reduce for small c (high
   * memory backend, STRIDE <= 128). Default false — it is unreliable on
   * M2/Metal (the threadgroup array-of-arrays handoff corrupts ~7-50% of runs).
   * Opt in on backends where workgroup arrays-of-arrays are reliable.
   */
  coopReduce?: boolean;
  /**
   * Enable the segmented-global bucket reduce for small c (high memory backend,
   * STRIDE <= 128). Default false — it is reliable but slower than the default
   * all-Jacobian reduce (its per-window phase-2 combine is latency-bound). Kept
   * for reference. Mutually exclusive with coopReduce. Shares config.coopSeg.
   */
  segReduce?: boolean;
  /** Cooperative reduce: buckets per segment (each thread's serial running-sum),
   * snapped to a power of two in [1, STRIDE]. G = STRIDE/coopSeg is the
   * workgroup size. Default targets G=8. coopSeg=1 is a pure (tot,ws) tree. */
  coopSeg?: number;
  /** Record per-pass GPU timestamps in `run()` (needs the `timestamp-query` feature). */
  profile?: boolean;
  /** Phase-2 hook — Jacobian-crossover threshold. Accepted but inert in Phase 1. */
  jacobianCrossover?: number;
  /**
   * Recursive segmented reduction: when > 0, replace the level-based reduce
   * with the recursive radix-m kernel (m = this value, power of 2 dividing
   * STRIDE). WIP — opt-in for validation. 0 = off.
   */
  segReduceG?: number;
  /**
   * Threads needed to saturate the GPU for the segmented reduce. Each level
   * fields min(work, reduceTsat) threads; work beyond that packs multiple
   * outputs per thread. Swept against real MSMs to find the device value.
   */
  reduceTsat?: number;
  /** Radix-2 coarse reduce level runs affine (batched S=8) instead of Jacobian. WIP. */
  segAffineCoarse?: boolean;
  /**
   * Per-level affine/Jacobian cut. When set, each reduce level independently
   * runs Jacobian if it can't saturate the batch-affine path (doublings always
   * Jacobian; adds Jacobian iff numWindows·ppw < {@link reduceSatThreshold}),
   * else batch-affine. Saturated late tree levels stay affine even with a
   * Jacobian middle — the jac→affine flip is bridged by a batched convert.
   * Replaces the single contiguous `jacobianCrossover` suffix-cut.
   */
  perLevelJac?: boolean;
  /** Per-level cut saturation threshold (active threads); ppw·numWindows below this runs Jacobian. */
  reduceSatThreshold?: number;
  /** Slots per thread (one safegcd per chunk) in the batched jac→affine convert. Tuning knob. */
  convChunk?: number;
  /**
   * GPU/CPU split experiment: snapshot red_buf after this many reduce levels so
   * the remaining levels can be finished single-threaded on the CPU (wasm
   * bb_msm_complete_reduce). -1 = off. Requires the all-affine reduce
   * (jacobianCrossover=0) so the snapshot slots are affine. The host reads
   * getReduceDensePack() and hands it to the wasm completion.
   */
  reduceSnapshotLevel?: number;
  /**
   * Convert-affordability bound (in slots = numWindows·stride). The per-level
   * cut only pushes the doublings to Jacobian — which forces one jac→affine
   * convert — when numWindows·stride is at or below this. Above it, only the
   * free starved suffix runs Jacobian (no convert). Device-calibrated; on M2 the
   * crossover is between c=13 (82k slots, convert pays) and c=15 (279k, doesn't).
   */
  convertBound?: number;
  /**
   * Sparsity extent clamp: process only the first STRIDE' = this value buckets
   * per window in the segmented reduce (must be >= the max live bucket index,
   * a power of 2, <= STRIDE). 0 = full STRIDE. Normally set automatically from
   * {@link maxScalarBits}; this knob is for validation.
   */
  reduceStride?: number;
  /**
   * Guaranteed upper bound on scalar size: every scalar is < 2^maxScalarBits.
   * When this implies the buckets occupy fewer than STRIDE slots (only when
   * maxScalarBits < c), the reduce auto-switches to the recursive segmented
   * kernel clamped to the safe extent — a large win for small-scalar MSMs
   * (profiles D/E). Honest bound required: a scalar exceeding it corrupts the
   * result. 0/unset = no bound (full reduce).
   */
  maxScalarBits?: number;
  /**
   * Discarded warm-up `run()`s in `create()` — they ramp the GPU clock and pay
   * the shader-JIT / command-buffer cold start before the first timed run.
   * Default 5 (benchmark harness); the production bridge passes 0 so the first
   * real MSM is the work, not a throwaway.
   */
  warmupRuns?: number;
  /**
   * Run the Horner window-combine + final modular inverse on the host. Default
   * `true` — the benchmark harness wants the affine `{x, y}`. The production
   * bridge passes `false`: it ships the per-window sums across the bridge and
   * the C++ hook does the combine in native `bb::g1`.
   */
  combineOnHost?: boolean;
  /**
   * Per-MSM scratch budget in MiB for the high-memory backend's batch-count
   * solver. The solver raises `numBatches` (window-batching) and, once that
   * bottoms out at one window, the point-chunk count, until the metered scratch
   * fits this budget. Default 248 (legacy lever-G target). The bounded-memory
   * backend sets this to 100.
   */
  memBudgetMB?: number;
}

/** Per-pass GPU time (ms) for one `run()`, returned when `profile` is set. */
export interface ProfileBreakdown {
  decompose: number;
  transpose: number;
  convert: number;
  planner: number;
  fused: number;
  carry: number;
  finalize: number;
  redInit: number;
  redLevel: number;
  wall: number;
}
