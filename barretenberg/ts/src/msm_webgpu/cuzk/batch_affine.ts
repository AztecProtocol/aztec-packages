// Orchestration for the batch-affine SMVP pipeline.
//
// Replaces the per-bucket Jacobian mixed-add inner loop in the legacy
// SMVP shader with a Montgomery batch-inverse round-loop. Each round:
//   1. Schedule (per subtask) — every active bucket pulls one pair
//      (P=running_sum, Q=next_point), writes delta = Q.x - P.x to a
//      shared pool, atomically reserves a slot.
//   2. Batch inverse (per subtask) — single-thread Montgomery trick:
//      one fr_inv amortised across all deltas in the round.
//   3. Apply scatter (per subtask) — parallel affine add per pair,
//      result written back to running_x/y[bucket_global].
//
// Then once at the end:
//   4. Finalize — signed-bucket combine + j=0/j=1 fold + Jacobian
//      conversion. Bit-identical output layout to the legacy SMVP, so
//      the downstream BPR stage doesn't change.
//
// Caller contract: SRS-backed bases. The schedule kernel skips
// collisions (delta == 0) silently, leaving the bucket "stuck"; for
// SRS bases this never happens (collision probability ~ 2^-256).

import { CpuTimer, Profiler } from "./gpu.js";
import {
  create_and_write_sb,
  create_and_write_ub,
  create_bind_group,
  create_sb,
} from "./gpu.js";
import type { GpuContext } from "./gpu_context.js";
import { ShaderManager } from "./shader_manager.js";
import {
  create_bind_group_layout,
  execute_pipeline,
  execute_pipeline_indirect,
} from "./gpu.js";

// Per-stage profiling budgets for the per-round loop. Sized to cover
// every active round of every family at every benchmark size, including
// N=2^20 where MAX_ROUNDS=256. The Profiler is constructed with
// capacity=800 in submission.ts to fit this budget plus ~10 fixed
// stages with 23 slots of margin (well below Dawn's ~4096-per-QuerySet
// hard cap).
//
// Why every round of every family, not just samples:
//   At N=2^20 the post-T1.b/c profile showed `ba_apply` at 24.84 ms
//   and `ba_schedule` at 8.32 ms — but those were the first 8 of 256
//   rounds. The remaining 248 rounds of each (~80-150 ms combined)
//   hid in `untimestamped`, which made the `ba_apply` family row look
//   30× cheaper than its true total. Sampling every round keeps the
//   family-row sum honest so optimization-priority decisions stop
//   flying blind.
export const PROFILE_INVERSE_ROUNDS = 256;
export const PROFILE_SCHEDULE_ROUNDS = 256;
export const PROFILE_APPLY_ROUNDS = 256;

const numbers_to_u8s = (values: number[]): Uint8Array => {
  const buf = new Uint8Array(values.length * 4);
  const view = new DataView(buf.buffer);
  for (let i = 0; i < values.length; i++) {
    view.setUint32(i * 4, values[i], true);
  }
  return buf;
};

// Compile a pipeline with proactive WGSL diagnostic capture.
//
// Standard create_compute_pipeline silently drops compile errors into a
// GPUPipelineError with message "Invalid ShaderModule (unlabeled) is
// invalid due to a previous error" — useless. We instead create the
// shader module ourselves, await its compilationInfo to surface the
// real error message + line number, then build the pipeline.
const compile_pipeline_for = async (
  device: GPUDevice,
  bindings: Array<"storage" | "read-only-storage" | "uniform">,
  shaderCode: string,
  context: GpuContext | undefined,
  cacheKey: string,
): Promise<{
  pipeline: GPUComputePipeline;
  layout: GPUBindGroupLayout;
}> => {
  const compileOnce = async (): Promise<{
    pipeline: GPUComputePipeline;
    bindGroupLayout: GPUBindGroupLayout;
  }> => {
    const layout = create_bind_group_layout(device, bindings);
    const m = device.createShaderModule({ code: shaderCode });
    const info = await m.getCompilationInfo();
    let hasError = false;
    for (const msg of info.messages) {
      const tag = `[batch-affine ${cacheKey}]`;
      const where = `line ${msg.lineNum}, col ${msg.linePos}`;
      const line = `${tag} ${msg.type}: ${msg.message} (${where})`;
      if (msg.type === "error") {
        console.error(line);
        hasError = true;
      } else {
        console.warn(line);
      }
    }
    if (hasError) {
      // Throw with a clear message so the calling try/catch in the UI
      // surfaces it instead of swallowing into a generic
      // GPUPipelineError downstream.
      throw new Error(
        `WGSL compile failed for ${cacheKey} — see DevTools console`,
      );
    }
    const pipeline = await device.createComputePipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module: m, entryPoint: "main" },
    });
    console.log(`[batch-affine] compiled pipeline: ${cacheKey}`);
    return { pipeline, bindGroupLayout: layout };
  };

  if (context === undefined) {
    const r = await compileOnce();
    return { pipeline: r.pipeline, layout: r.bindGroupLayout };
  }
  const got = await context.getOrCreatePipeline(cacheKey, compileOnce);
  return { pipeline: got.pipeline, layout: got.bindGroupLayout };
};

export const smvp_batch_affine_gpu = async (
  shaderManager: ShaderManager,
  device: GPUDevice,
  commandEncoder: GPUCommandEncoder,
  num_subtasks: number,
  num_columns: number,
  input_size: number,
  all_csc_col_ptr_sb: GPUBuffer, // row_ptr
  point_x_sb: GPUBuffer,
  point_y_sb: GPUBuffer,
  all_csc_val_idxs_sb: GPUBuffer, // val_idx
  bucket_sum_x_sb: GPUBuffer, // OUTPUT (existing layout: T * h * BigInt)
  bucket_sum_y_sb: GPUBuffer,
  bucket_sum_z_sb: GPUBuffer,
  cpu_timer: CpuTimer | undefined,
  context: GpuContext | undefined,
  profiler?: Profiler,
  // True iff every external buffer above (point_x/y, all_csc_*,
  // bucket_sum_*) has stable identity across calls. When true, bind
  // groups and uniforms can be cached on the context. When false (cold
  // path with transient buffers) we fall back to per-call bind-group
  // creation. Caller's responsibility to set correctly.
  externals_persistent = false,
): Promise<void> => {
  const half_num_columns = num_columns / 2;
  const total_buckets = num_subtasks * num_columns;
  const num_words = shaderManager.num_words;
  const limb_byte_length = num_words * 4;

  // ----- Workspace buffers -----
  // When a persistent context is provided, all per-MSM workspace buffers
  // are pulled from `context.acquirePersistentBuffer` and survive across
  // calls (same GPUBuffer object every iteration of the benchmark loop).
  // Without a context (cold path), fall back to fresh `create_sb` per call.
  // Each MSM call had previously paid ~80 MB × 5 buffers = ~400 MB of
  // allocator round-trips at N=2^16; collapsing those to one-time gives a
  // measurable wall-time win.
  const ws_byte_len = total_buckets * limb_byte_length;
  // `input_size` must be part of the key. The workspace buffers
  // themselves are sized by (num_subtasks, num_columns, num_words), but
  // the bind groups under this key also capture `point_x_sb`/`point_y_sb`
  // from the caller's CachedBases plus the per-call transpose outputs —
  // both of which are recreated as fresh GPUBuffer objects when
  // `input_size` changes (CachedBases is regenerated, transpose uses a
  // size-keyed pool). Without `input_size` here, a bind group cached at
  // logN=16 stays bound to logN=16's CachedBases and CSR buffers, which
  // are destroyed when the harness moves to logN=17 — kernels then
  // dispatch against dead/zero buffers and the MSM returns identity.
  const ws_key = `bn254:ba:${num_subtasks}:${num_columns}:${num_words}:${input_size}`;
  const acquire_ws = (suffix: string, size: number): GPUBuffer =>
    context !== undefined
      ? context.acquirePersistentBuffer(`${ws_key}:${suffix}`, size)
      : create_sb(device, size);

  const running_x_sb = acquire_ws("running_x", ws_byte_len);
  const running_y_sb = acquire_ws("running_y", ws_byte_len);
  const bucket_cursor_sb = acquire_ws("bucket_cursor", total_buckets * 4);
  const bucket_active_sb = acquire_ws("bucket_active", total_buckets * 4);

  // Pair pool. Cross-subtask SMVP layout:
  //   - SMVP path: each subtask owns a slice of `num_columns` slots.
  //     Per-round dispatch covers ALL subtasks at once (z=T). Total
  //     capacity needed: T * num_columns.
  //   - Finalize path: T·h slots (each subtask owns h = num_columns/2).
  // T*num_columns dominates (== 2 × T*h), so allocate to that.
  const MAX_PAIRS_PER_SUBTASK = num_columns; // worst-case per round
  const pool_capacity = num_subtasks * MAX_PAIRS_PER_SUBTASK;
  const pair_buf_size = pool_capacity * limb_byte_length;
  const pair_delta_sb = acquire_ws("pair_delta", pair_buf_size);
  const pair_inv_sb = acquire_ws("pair_inv", pair_buf_size);
  const pair_prefix_sb = acquire_ws("pair_prefix", pair_buf_size);
  const pair_target_meta_sb = acquire_ws("pair_target_meta", pool_capacity * 8); // vec2<u32>
  // Per-subtask atomic counters. Schedule's atomicAdd target each round.
  // dispatch_args zeroes this at the end of its T-element scan, so the
  // value is fresh-zero on entry to the NEXT round's schedule — no
  // separate clearBuffer needed.
  const pair_counter_sb = acquire_ws("pair_counter", num_subtasks * 4);
  // Per-subtask "frozen" counts forwarded by dispatch_args. Read by
  // THIS round's inverse + apply. Decouples the schedule writer from
  // the inverse/apply readers so we can zero pair_counter in dispatch_args
  // without losing the values inverse/apply still need.
  const round_count_sb = acquire_ws("round_count", num_subtasks * 4);
  // Indirect-dispatch arg buffer. Layout: 9 u32s (36 B):
  //   args[0..3] = schedule (X, Y, Z)   — for the *next* round
  //   args[3..6] = inverse  (X, Y, Z)   — for *this* round
  //   args[6..9] = apply    (X, Y, Z)   — for *this* round
  // Filled by the dispatch_args kernel after each round's schedule;
  // schedule[r+1] reads what dispatch_args[r] wrote, so the indirect
  // chain naturally elides the round loop's late-round work once
  // pair_counter hits zero (every cursor exhausted = monotonic).
  // Needs INDIRECT usage in addition to the standard storage flags.
  let dispatch_args_sb: GPUBuffer;
  if (context !== undefined) {
    dispatch_args_sb = context.acquirePersistentBuffer(
      `${ws_key}:dispatch_args`,
      36,
      GPUBufferUsage.INDIRECT,
    );
  } else {
    dispatch_args_sb = device.createBuffer({
      size: 36,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST |
        GPUBufferUsage.INDIRECT,
    });
  }
  // Pre-filled count buffer for the finalize batch_inverse. T entries,
  // each set to half_num_columns — every workgroup processes its own
  // h-element slice. Inverse kernel reads count_buf[wid.x] for the
  // per-workgroup count and uses the pitch uniform for the slice stride.
  // Contents are constant across MSM calls, so we write once on first
  // acquisition and skip the writeBuffer thereafter.
  let finalize_count_sb: GPUBuffer;
  if (context !== undefined) {
    finalize_count_sb = context.acquirePersistentBuffer(
      `${ws_key}:finalize_count`,
      num_subtasks * 4,
    );
    // Re-write the constants every time (cheap — T u32s = 64 B at T=16)
    // rather than tracking a "first call" flag. Avoids a subtle bug where
    // a bigger N then smaller N would leave stale values in the cached
    // buffer (acquirePersistentBuffer resets identity on size change but
    // not on contents).
    device.queue.writeBuffer(
      finalize_count_sb,
      0,
      new Uint8Array(
        new Uint32Array(new Array(num_subtasks).fill(half_num_columns)).buffer,
      ),
    );
  } else {
    finalize_count_sb = create_and_write_sb(
      device,
      new Uint8Array(
        new Uint32Array(new Array(num_subtasks).fill(half_num_columns)).buffer,
      ),
    );
  }

  // ----- Shaders -----
  const init_workgroup_size = 256;
  const schedule_workgroup_size = 256;
  // ba_apply workgroup size. At WG=256, per-round geometry was
  // `apply_x = ceil(max_count / 256) = 1` for typical max_count ≈ 64-130
  // pairs/subtask (round 0 at N=2^16..2^20). That leaves 100-200 of the
  // 256 threads in each WG idle for the entire round. Dropping to WG=64
  // gives `apply_x = 1..3` with utilisation 80-100% across the
  // observed max_count range, without inflating launch overhead at
  // small max_count (still 1 WG per subtask, just 4× smaller).
  //
  // Late rounds at large N (max_count = 1..5): WG=64 → 1 WG × 64 × T
  // threads (~80 active) vs WG=256 → 1 WG × 256 × T (~80 active out of
  // 4096). Same active count, 4× fewer wasted threads, fewer cycles
  // spent in idle-thread bookkeeping.
  //
  // dispatch_args.params[1] picks this up automatically (it's the
  // apply_workgroup_size baked into the uniform — see below).
  const apply_workgroup_size = 64;
  const finalize_workgroup_size_default = 256;

  // Inverse pass parallelism: each subtask's pair pool is split across
  // NUM_SUB_WGS_PER_SUBTASK contiguous slices, with one workgroup of
  // TPB=64 threads inverting each slice independently (its own fr_inv).
  // Drops per-thread sequential bs by W× → W× faster Phase A/D at large
  // N. The W extra fr_invs run concurrently across SMs (zero wall-time
  // cost). W=8 keeps SM occupancy high (T=16 × W=8 = 128 in-flight
  // workgroups, matching RTX-class GPU SM counts).
  const NUM_SUB_WGS_PER_SUBTASK = 8;

  const init_shader = shaderManager.gen_batch_affine_init_shader(
    init_workgroup_size,
  );
  const schedule_shader = shaderManager.gen_batch_affine_schedule_shader(
    schedule_workgroup_size,
  );
  const dispatch_args_shader =
    shaderManager.gen_batch_affine_dispatch_args_shader();
  // Multi-workgroup batch-inverse (W sub-WGs per subtask). See
  // batch_inverse_parallel.template.wgsl for the algorithm.
  const inverse_shader = shaderManager.gen_batch_inverse_parallel_shader(
    NUM_SUB_WGS_PER_SUBTASK,
  );
  const apply_shader = shaderManager.gen_batch_affine_apply_scatter_shader(
    apply_workgroup_size,
  );
  // Finalize dispatch geometry — single dispatch covers all T·h IDs;
  // z workgroups = num_subtasks, threading inside the kernel mirrors
  // the legacy monolithic finalize layout.
  let f_workgroup_size = finalize_workgroup_size_default;
  let f_num_x_workgroups = 64;
  let f_num_y_workgroups =
    half_num_columns / f_workgroup_size / f_num_x_workgroups;
  let f_num_z_workgroups = num_subtasks;
  if (half_num_columns < 32768) {
    f_workgroup_size = 32;
    f_num_x_workgroups = 1;
    f_num_y_workgroups = Math.ceil(
      half_num_columns / f_workgroup_size / f_num_x_workgroups,
    );
  }
  if (num_columns < 256) {
    f_workgroup_size = 1;
    f_num_x_workgroups = half_num_columns;
    f_num_y_workgroups = 1;
    f_num_z_workgroups = 1;
  }
  // Two-pass finalize. Pass A (collect) resolves p1/p2 per bucket and
  // either writes the bucket directly (cases 1-3) or emits the affine
  // delta to pair_delta. A single batch_inverse over those deltas
  // produces all inverses with one shared fr_inv. Pass B (apply) reads
  // its inv_delta and finishes the affine add. Replaces the previous
  // monolithic finalize that called fr_inv per thread (~150 ms at
  // T*h ≈ 524 K threads).
  const finalize_collect_shader =
    shaderManager.gen_batch_affine_finalize_collect_shader(
      f_workgroup_size,
      num_columns,
    );
  const finalize_apply_shader =
    shaderManager.gen_batch_affine_finalize_apply_shader(
      f_workgroup_size,
      num_columns,
    );

  const _compile_t0 = performance.now();

  // ----- Pipelines -----
  const init_pipe = await compile_pipeline_for(
    device,
    [
      "read-only-storage", // 0 row_ptr
      "read-only-storage", // 1 val_idx
      "read-only-storage", // 2 new_point_x
      "read-only-storage", // 3 new_point_y
      "storage",           // 4 running_x
      "storage",           // 5 running_y
      "storage",           // 6 bucket_cursor
      "storage",           // 7 bucket_active
      "uniform",           // 8 params
    ],
    init_shader,
    context,
    `bn254:batch_affine_init:${num_columns}:${input_size}`,
  );

  const schedule_pipe = await compile_pipeline_for(
    device,
    [
      "read-only-storage", // 0 row_ptr
      "read-only-storage", // 1 val_idx
      "read-only-storage", // 2 new_point_x
      "read-only-storage", // 3 running_x
      "storage",           // 4 bucket_cursor
      "storage",           // 5 pair_delta
      "storage",           // 6 pair_target_meta
      "storage",           // 7 pair_counter (atomic, T entries)
      "uniform",           // 8 params
    ],
    schedule_shader,
    context,
    `bn254:batch_affine_schedule:xsubtask-v1:${num_columns}:${input_size}`,
  );

  const inverse_pipe = await compile_pipeline_for(
    device,
    [
      "read-only-storage", // 0 inputs (= pair_delta)
      "storage",           // 1 prefix
      "storage",           // 2 outputs (= pair_inv)
      "storage",           // 3 count_buf (atomic, atomicLoad; per-wg)
      "uniform",           // 4 params (pitch)
    ],
    inverse_shader,
    context,
    `bn254:batch_affine_inverse:parallel-v3-pitch:${num_columns}:${input_size}`,
  );

  const apply_pipe = await compile_pipeline_for(
    device,
    [
      "read-only-storage", // 0 val_idx
      "read-only-storage", // 1 new_point_x
      "read-only-storage", // 2 new_point_y
      "storage",           // 3 running_x
      "storage",           // 4 running_y
      "read-only-storage", // 5 pair_target_meta
      "read-only-storage", // 6 inv_deltas
      "storage",           // 7 count_buf (atomic, atomicLoad; per-subtask)
      "uniform",           // 8 params
    ],
    apply_shader,
    context,
    `bn254:batch_affine_apply:xsubtask-v1:${num_columns}:${input_size}`,
  );

  const dispatch_args_pipe = await compile_pipeline_for(
    device,
    [
      "storage",  // 0 pair_counter (atomic; T entries; read+zero)
      "storage",  // 1 round_count   (atomic; T entries; write)
      "storage",  // 2 dispatch_args (9 u32s)
      "uniform",  // 3 params
    ],
    dispatch_args_shader,
    context,
    `bn254:batch_affine_dispatch_args:v2-fwd:${num_subtasks}:${apply_workgroup_size}`,
  );

  const finalize_collect_pipe = await compile_pipeline_for(
    device,
    [
      "read-only-storage", // 0 running_x
      "read-only-storage", // 1 running_y
      "read-only-storage", // 2 bucket_active
      "storage",           // 3 bucket_x
      "storage",           // 4 bucket_y
      "storage",           // 5 bucket_z
      "storage",           // 6 pair_delta
      "uniform",           // 7 params
    ],
    finalize_collect_shader,
    context,
    `bn254:batch_affine_finalize_collect:v1:${num_columns}:${input_size}:${f_workgroup_size}`,
  );

  const finalize_apply_pipe = await compile_pipeline_for(
    device,
    [
      "read-only-storage", // 0 running_x
      "read-only-storage", // 1 running_y
      "read-only-storage", // 2 bucket_active
      "read-only-storage", // 3 pair_inv
      "storage",           // 4 bucket_x
      "storage",           // 5 bucket_y
      "storage",           // 6 bucket_z
      "uniform",           // 7 params
    ],
    finalize_apply_shader,
    context,
    `bn254:batch_affine_finalize_apply:v1:${num_columns}:${input_size}:${f_workgroup_size}`,
  );

  cpu_timer?.accumulate(
    "compile_smvp_batch_affine",
    performance.now() - _compile_t0,
  );

  // ----- Uniforms -----
  // All uniforms are constant for a given (num_subtasks, num_columns,
  // input_size) tuple. With a persistent context they're cached and the
  // contents written once on first acquisition; without one we fall back
  // to per-call create_and_write_ub.
  const acquire_ub = (
    suffix: string,
    bytes: Uint8Array,
  ): GPUBuffer => {
    if (context === undefined) {
      return create_and_write_ub(device, bytes);
    }
    const { buffer, created } = context.acquirePersistentUniform(
      `${ws_key}:${suffix}`,
      bytes.length,
    );
    if (created) device.queue.writeBuffer(buffer, 0, bytes as BufferSource);
    return buffer;
  };

  // Init: (total_buckets, num_columns, input_size, 0)
  const init_ub = acquire_ub(
    "init_ub",
    numbers_to_u8s([total_buckets, num_columns, input_size, 0]),
  );

  // Schedule: single uniform shared across all subtasks. Cross-subtask
  // dispatch derives the subtask index from global_id.z, so the uniform
  // only carries layout constants. Layout: (num_columns, input_size, 0, 0)
  const schedule_ub = acquire_ub(
    "schedule_ub",
    numbers_to_u8s([num_columns, input_size, 0, 0]),
  );

  // Apply: 1 uniform (constant across subtasks). (num_columns, input_size, 0, 0)
  const apply_ub = acquire_ub(
    "apply_ub",
    numbers_to_u8s([num_columns, input_size, 0, 0]),
  );

  // Dispatch-args kernel uniform: (num_subtasks, apply_workgroup_size,
  // sched_x_groups, num_sub_wgs_per_subtask). sched_x_groups is the
  // full-X dim for ba_schedule; dispatch_args writes this verbatim into
  // schedule's next-round arg triple unless max_count==0, in which case
  // it writes 0 to elide the dispatch. num_sub_wgs is the inverse
  // dispatch's X dim (0 when no work, W otherwise).
  const sched_x_groups = Math.ceil(num_columns / schedule_workgroup_size);
  const dispatch_args_ub = acquire_ub(
    "dispatch_args_ub",
    numbers_to_u8s([
      num_subtasks,
      apply_workgroup_size,
      sched_x_groups,
      NUM_SUB_WGS_PER_SUBTASK,
    ]),
  );

  // Inverse: per-workgroup slice stride. Two clients with different
  // pitches:
  //   - SMVP: pitch = num_columns       (T workgroups, each subtask's
  //                                       per-round pair pool slice)
  //   - Finalize: pitch = half_num_columns (T workgroups, each subtask's
  //                                          h-element slice)
  const inverse_smvp_ub = acquire_ub(
    "inverse_smvp_ub",
    numbers_to_u8s([num_columns, 0, 0, 0]),
  );
  const inverse_finalize_ub = acquire_ub(
    "inverse_finalize_ub",
    numbers_to_u8s([half_num_columns, 0, 0, 0]),
  );

  // Finalize: single uniform shared across collect and apply. Both
  // kernels run as one dispatch with z=num_subtasks, so num_z_workgroups
  // in the uniform must match. subtask_offset=0 because the kernels
  // derive their subtask from gidz / id-arithmetic.
  // Layout: (num_y_workgroups, num_z_workgroups, 0, num_columns)
  const finalize_ub = acquire_ub(
    "finalize_ub",
    numbers_to_u8s([f_num_y_workgroups, f_num_z_workgroups, 0, num_columns]),
  );

  // ----- Bind groups -----
  // Bind groups are cached on the context too. Since every buffer above
  // is now persistent (stable identity across calls), the bind group
  // built from those buffers is also stable. The cache key encodes the
  // pipeline variant + shape so pipeline-layout changes invalidate
  // automatically.
  //
  // Note: the SMVP-side bind groups depend on `all_csc_col_ptr_sb` /
  // `all_csc_val_idxs_sb` / `point_x_sb` / `point_y_sb` which originate
  // OUTSIDE batch_affine.ts (they come from the cached_bases or per-call
  // transpose output). For the warm + cached-bases path used by the
  // benchmark, those are also persistent — see the workspace allocator
  // in submission.ts. For the cold path we still create fresh bind
  // groups every call.
  const persistent_bgs = context !== undefined && externals_persistent;
  const acquire_bg = (
    suffix: string,
    layout: GPUBindGroupLayout,
    buffers: GPUBuffer[],
  ): GPUBindGroup => {
    if (persistent_bgs) {
      return context!.getOrCreatePersistentBindGroup(`${ws_key}:${suffix}`, () =>
        create_bind_group(device, layout, buffers),
      );
    }
    return create_bind_group(device, layout, buffers);
  };

  const init_bg = acquire_bg("init_bg", init_pipe.layout, [
    all_csc_col_ptr_sb,
    all_csc_val_idxs_sb,
    point_x_sb,
    point_y_sb,
    running_x_sb,
    running_y_sb,
    bucket_cursor_sb,
    bucket_active_sb,
    init_ub,
  ]);

  // Single schedule bind group — cross-subtask dispatch covers all T
  // subtasks in one launch (z=T).
  const schedule_bg = acquire_bg("schedule_bg", schedule_pipe.layout, [
    all_csc_col_ptr_sb,
    all_csc_val_idxs_sb,
    point_x_sb,
    running_x_sb,
    bucket_cursor_sb,
    pair_delta_sb,
    pair_target_meta_sb,
    pair_counter_sb,
    schedule_ub,
  ]);

  // Inverse and apply now read round_count (forwarded by dispatch_args)
  // instead of pair_counter directly. Schedule still writes pair_counter
  // via atomicAdd; dispatch_args bridges the two by copying then zeroing.
  // Cache suffix bumped to "v2" so we don't accidentally reuse a cached
  // bind group from the pre-fold v1 layout (same buffer count, different
  // semantics — the v2 suffix tags the new wiring explicitly).
  const inverse_bg = acquire_bg("inverse_bg:v2", inverse_pipe.layout, [
    pair_delta_sb,
    pair_prefix_sb,
    pair_inv_sb,
    round_count_sb,
    inverse_smvp_ub,
  ]);

  const apply_bg = acquire_bg("apply_bg:v2", apply_pipe.layout, [
    all_csc_val_idxs_sb,
    point_x_sb,
    point_y_sb,
    running_x_sb,
    running_y_sb,
    pair_target_meta_sb,
    pair_inv_sb,
    round_count_sb,
    apply_ub,
  ]);

  // Suffix bumped to v2 by P2-clear: bind group now binds 4 buffers
  // (pair_counter + round_count + dispatch_args + ub) instead of 3.
  // W suffix dropped along with the P1 revert.
  const dispatch_args_bg = acquire_bg(
    "dispatch_args_bg:v2",
    dispatch_args_pipe.layout,
    [pair_counter_sb, round_count_sb, dispatch_args_sb, dispatch_args_ub],
  );

  // Single bind groups for collect and apply — finalize runs as one
  // dispatch over T·h threads (z=num_subtasks). The inverse pass
  // dispatches T workgroups, each handling one h-slice in parallel.
  const finalize_collect_bg = acquire_bg(
    "finalize_collect_bg",
    finalize_collect_pipe.layout,
    [
      running_x_sb,
      running_y_sb,
      bucket_active_sb,
      bucket_sum_x_sb,
      bucket_sum_y_sb,
      bucket_sum_z_sb,
      pair_delta_sb,
      finalize_ub,
    ],
  );

  const finalize_inverse_bg = acquire_bg(
    "finalize_inverse_bg",
    inverse_pipe.layout,
    [
      pair_delta_sb,
      pair_prefix_sb,
      pair_inv_sb,
      finalize_count_sb,
      inverse_finalize_ub,
    ],
  );

  const finalize_apply_bg = acquire_bg(
    "finalize_apply_bg",
    finalize_apply_pipe.layout,
    [
      running_x_sb,
      running_y_sb,
      bucket_active_sb,
      pair_inv_sb,
      bucket_sum_x_sb,
      bucket_sum_y_sb,
      bucket_sum_z_sb,
      finalize_ub,
    ],
  );

  // ----- Dispatch sequence -----

  // 1. Init: ceil(total_buckets / 256) workgroups in x, 1 thread per bucket.
  const init_x_groups = Math.ceil(total_buckets / init_workgroup_size);
  await execute_pipeline(
    commandEncoder,
    init_pipe.pipeline,
    init_bg,
    init_x_groups,
    1,
    1,
    profiler?.stage("ba_init"),
  );

  // 2. Round loop, cross-subtask parallel.
  //
  // Each round dispatches the schedule, inverse, and apply kernels
  // ONCE — all subtasks run concurrently via the Z dispatch dimension.
  // Idle subtasks (those whose buckets are exhausted) early-return per
  // thread, so the cap is set by the worst-case bucket depth across
  // every (subtask, bucket) pair.
  //
  // MAX_ROUNDS is a hard cap on bucket depth — pairs scheduled past it
  // are silently dropped, producing a wrong MSM. At chunk_size=16 the
  // bottleneck is subtask 15 (the top 16-bit chunk of a 256-bit
  // scalar): BN254 Fr is ~2^253.77, so chunk 15 only takes values in
  // [0, ~12000), giving avg load N/12000 (~5× higher than the other 15
  // subtasks). At chunk_size=15 the top chunk has 14 useful bits → ~14000
  // active buckets, λ_top ≈ N/14000 (very close to non-top λ = N/16384),
  // so the top no longer dominates and the bound is the global max
  // bucket depth.
  //
  // Each idle round costs a clearBuffer + 3 dispatches + bind-group
  // bind. Keep MAX_ROUNDS just above the worst-case max depth so we
  // don't waste round overhead. Max ≈ λ + √(2·λ·ln B):
  //
  //   chunk_size=16 (B_top≈12000, λ=N/12000):
  //     N=2^16: λ=5.5,  max~15,  MAX_ROUNDS=64
  //     N=2^17: λ=10.9, max~25,  MAX_ROUNDS=64
  //     N=2^18: λ=21.8, max~42,  MAX_ROUNDS=96
  //     N=2^19: λ=43.7, max~73,  MAX_ROUNDS=192
  //     N=2^20: λ=87.4, max~129, MAX_ROUNDS=256
  //
  //   chunk_size=15 (B_top≈14000, B_other=16384, λ_top≈N/14000):
  //     N=2^16: λ=4.7,  max~14,  MAX_ROUNDS=32
  //     N=2^17: λ=9.4,  max~22,  MAX_ROUNDS=48
  //     N=2^18: λ=18.7, max~36,  MAX_ROUNDS=64
  //     N=2^19: λ=37.4, max~63,  MAX_ROUNDS=128
  //     N=2^20: λ=74.9, max~114, MAX_ROUNDS=192
  //
  // The right long-term fix is indirect dispatch with early-exit on
  // `pair_counter == 0` — let the GPU itself decide. Until then, this
  // table is the per-N tuning.
  const cs15 = num_columns === (1 << 15);
  let MAX_ROUNDS: number;
  if (cs15) {
    if (input_size >= 1 << 20) MAX_ROUNDS = 192;
    else if (input_size >= 1 << 19) MAX_ROUNDS = 128;
    else if (input_size >= 1 << 18) MAX_ROUNDS = 64;
    else if (input_size >= 1 << 17) MAX_ROUNDS = 48;
    else MAX_ROUNDS = 32;
  } else {
    if (input_size >= 1 << 20) MAX_ROUNDS = 256;
    else if (input_size >= 1 << 19) MAX_ROUNDS = 192;
    else if (input_size >= 1 << 18) MAX_ROUNDS = 96;
    else MAX_ROUNDS = 64;
  }
  // schedule_x, inverse_x, apply_x are all computed on the GPU each
  // round (in the dispatch_args kernel). All three passes use
  // dispatchWorkgroupsIndirect.
  const counter_clear_bytes = num_subtasks * 4;

  // Single startup clear of pair_counter. In steady-state every prior
  // MSM call's last dispatch_args zeroed pair_counter at the end of
  // its T-element scan — but for a cold persistent buffer (or a
  // brand-new context), that guarantee doesn't hold. One clearBuffer
  // here costs ~one dispatch's worth of latency vs MAX_ROUNDS=256
  // clears under the prior policy.
  commandEncoder.clearBuffer(pair_counter_sb, 0, counter_clear_bytes);

  // Pre-seed dispatch_args with round 0's schedule arg triple. Round 0
  // schedule must run full size — there's no previous round whose
  // pair_counter could tell us otherwise. From round 1 onward, the
  // dispatch_args kernel rewrites this slot at the end of each round
  // based on whether pair_counter went to zero.
  //
  // Inverse/apply slots are left zero here; they're written by
  // dispatch_args BEFORE inverse/apply read them in the same round,
  // so initial values don't matter.
  const initial_args = new Uint32Array([
    sched_x_groups, 1, num_subtasks,             // schedule (read by round 0)
    0, 0, 0,                                     // inverse  (written before read each round)
    0, 0, 0,                                     // apply    (written before read each round)
  ]);
  device.queue.writeBuffer(dispatch_args_sb, 0, initial_args.buffer);

  // Per-stage profiling budgets (kept in sync with PROFILE_*_ROUNDS
  // exports above). The Profiler is constructed in submission.ts with
  // capacity=320 — well below Dawn's ~4096-per-QuerySet hard cap that
  // wedges the device when exceeded.
  //
  //   * All three round-loop families (`ba_schedule`, `ba_inverse`,
  //     `ba_apply`) are profiled on EVERY round. The per-round labels
  //     group under the family in the report, so the family-row sum is
  //     the TRUE total cost. Previously schedule/apply were sampled
  //     8/256 — the missing 248 rounds (~80-150 ms combined at N=2^20)
  //     hid in `untimestamped`.
  //
  //   * `ba_dispatch_args` is not profiled — it consistently reports
  //     0.00 ms (single-thread, single-workgroup arithmetic), so the
  //     slot would be wasted.
  //
  //   * Slot tally at worst case (N=2^20): 256 ba_schedule + 256
  //     ba_inverse + 256 ba_apply = 768 round-loop. Plus ~9 fixed
  //     (decompose, transpose_*, ba_init, ba_finalize_×3, bpr_1, bpr_2,
  //     subtask_reduce) = ~777. Capacity=800 leaves 23 slots of margin.
  for (let round = 0; round < MAX_ROUNDS; round++) {
    // pair_counter starts each round at zero — guaranteed by the
    // previous round's dispatch_args atomicStore(pair_counter, 0u),
    // and by the single startup clearBuffer above for round 0.

    const sample_schedule = round < PROFILE_SCHEDULE_ROUNDS;
    const sample_inverse = round < PROFILE_INVERSE_ROUNDS;
    const sample_apply = round < PROFILE_APPLY_ROUNDS;

    // 2a. Schedule — INDIRECT. Reads schedule_x at args[0..3], which
    // was either pre-seeded (round 0) or written by the previous round's
    // dispatch_args kernel. Once any round produces pair_counter==0
    // (every cursor exhausted = monotonic), schedule_x stays at 0 for
    // every subsequent round and the dispatch becomes a near-zero
    // empty pass.
    execute_pipeline_indirect(
      commandEncoder,
      schedule_pipe.pipeline,
      schedule_bg,
      dispatch_args_sb,
      0,
      sample_schedule ? profiler?.stage(`ba_schedule[r=${round}]`) : undefined,
    );

    // 2b. Compute indirect-dispatch args from pair_counter. Single
    // workgroup of one thread; reads the per-subtask atomic counts
    // schedule just wrote and emits (X, Y, Z) triples for the next
    // round's schedule and this round's inverse + apply. Not profiled —
    // see budget rationale above.
    await execute_pipeline(
      commandEncoder,
      dispatch_args_pipe.pipeline,
      dispatch_args_bg,
      1,
      1,
      1,
      undefined,
    );

    // 2c. Batch inverse — INDIRECT. T workgroups when any subtask has
    // pairs, 0 otherwise. Each workgroup inverts its subtask's
    // pair_delta slice (count_buf[k] = pair_counter[k]).
    execute_pipeline_indirect(
      commandEncoder,
      inverse_pipe.pipeline,
      inverse_bg,
      dispatch_args_sb,
      12,
      sample_inverse ? profiler?.stage(`ba_inverse[r=${round}]`) : undefined,
    );

    // 2d. Apply scatter — INDIRECT. (ceil(max/wg), 1, T) workgroups,
    // 0 when no subtask scheduled any pair.
    execute_pipeline_indirect(
      commandEncoder,
      apply_pipe.pipeline,
      apply_bg,
      dispatch_args_sb,
      24,
      sample_apply ? profiler?.stage(`ba_apply[r=${round}]`) : undefined,
    );
  }

  // 3. Finalize — three single dispatches: collect → batch_inverse → apply.
  //
  // Pass A (collect): single dispatch over T·h threads. Each thread
  // resolves p1/p2 for its bucket, writes the bucket directly for
  // cases 1-3 (with R placeholder in pair_delta), or emits delta into
  // pair_delta for case 4.
  await execute_pipeline(
    commandEncoder,
    finalize_collect_pipe.pipeline,
    finalize_collect_bg,
    f_num_x_workgroups,
    f_num_y_workgroups,
    f_num_z_workgroups,
    profiler?.stage("ba_finalize_collect"),
  );

  // Pass B (batch_inverse): (W, 1, T) workgroups in parallel — each
  // subtask's h-element slice is split across W sub-WGs, each
  // independently inverting its sub-slice. Same kernel as the round
  // loop's inverse pass.
  await execute_pipeline(
    commandEncoder,
    inverse_pipe.pipeline,
    finalize_inverse_bg,
    NUM_SUB_WGS_PER_SUBTASK,
    1,
    num_subtasks,
    profiler?.stage("ba_finalize_inverse"),
  );

  // Pass C (apply): single dispatch over T·h threads. Cases 1-3
  // early-return (bucket already written by collect). Case 4 reads
  // inv_delta[id] and writes the affine sum.
  await execute_pipeline(
    commandEncoder,
    finalize_apply_pipe.pipeline,
    finalize_apply_bg,
    f_num_x_workgroups,
    f_num_y_workgroups,
    f_num_z_workgroups,
    profiler?.stage("ba_finalize_apply"),
  );
};
