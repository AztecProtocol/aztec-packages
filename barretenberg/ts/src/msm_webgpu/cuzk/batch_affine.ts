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

import { CpuTimer, Profiler } from './gpu.js';
import { create_and_write_sb, create_and_write_ub, create_bind_group, create_sb } from './gpu.js';
import type { GpuContext } from './gpu_context.js';
import { ShaderManager } from './shader_manager.js';
import { create_bind_group_layout, execute_pipeline, execute_pipeline_indirect } from './gpu.js';
import { runTreeReduce } from './smvp_tree.js';

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
  bindings: Array<'storage' | 'read-only-storage' | 'uniform'>,
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
      if (msg.type === 'error') {
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
      throw new Error(`WGSL compile failed for ${cacheKey} — see DevTools console`);
    }
    const pipeline = await device.createComputePipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module: m, entryPoint: 'main' },
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
  commandEncoderRef: { current: GPUCommandEncoder },
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
  // When true, swap the round-loop for the tree-reduce pipeline.
  // Init (zeroes running_x/y, sets bucket_active from CSR) and the
  // three finalize dispatches stay unchanged — they consume the same
  // running_x/y + bucket_active state regardless of how the per-bucket
  // affine sums were computed. The tree-reduce path writes those
  // exact buffers via the scatter kernel after the
  // smvp_tree_phase1/2 orchestrator finishes.
  use_tree_reduce = false,
  // When true, replace the per-round batch_inverse_parallel +
  // apply_scatter dispatch pair with a SINGLE fused kernel per round
  // (the ba_rev_packed_carry suffix-product / one-fr_inv_by_a /
  // lean-apply scheme). Init / schedule / dispatch_args / finalize stay
  // unchanged: the fused kernel reads + writes the same BigInt-layout
  // running_x/y buffers, so schedule's collision check and finalize's
  // consumption are unaffected. Mutually exclusive with use_tree_reduce
  // (tree path takes precedence if both are set). Currently bn254 only.
  fused_revcarry = false,
): Promise<void> => {
  // The tree-reduce path needs to mid-flush commandEncoder so its CSR
  // reads see the current call's transpose output (not stale data from
  // the previous call). The caller passes commandEncoderRef.current,
  // which we mutate to a fresh encoder mid-execution; the caller then
  // continues recording BPR on the replaced encoder.
  let commandEncoder = commandEncoderRef.current;
  const half_num_columns = num_columns / 2;
  const total_buckets = num_subtasks * num_columns;
  const num_words = shaderManager.num_words;
  const limb_byte_length = num_words * 4;

  // WINDOWS_PER_BATCH pools the pair pools of WPB consecutive subtasks
  // into ONE fr_inv_by_a per (batch, sub_wg) — see
  // batch_inverse_parallel.template.wgsl. With T=17 subtasks at logN=16
  // and WPB=4, num_batches = ceil(17/4) = 5, so a round runs 5×W
  // workgroups in the inverse pass instead of 17×W (~4× fewer fr_inv
  // calls overall). The pair-pool layout is per-subtask, unchanged; the
  // pooling only changes how the inverse kernel reads/writes scratch.
  // WPB=1 falls back to byte-identical pre-pooling behaviour.
  //
  // Default is 1: the per-pass profiler at logN=16 on Apple Silicon
  // showed ba_inverse Σ ≈ 14% of MSM, so pooling buys little relative
  // to BPR (51%). The plumbing stays in place so the knob is one edit
  // away once BPR is no longer the dominant cost.
  const WINDOWS_PER_BATCH = 1;
  const num_batches = Math.ceil(num_subtasks / WINDOWS_PER_BATCH);
  // count_buf (round_count + finalize_count) must be safely loadable
  // for every slot the inverse kernel reads — i.e. through the tail of
  // the last batch.
  const count_slots_padded = num_batches * WINDOWS_PER_BATCH;

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
    context !== undefined ? context.acquirePersistentBuffer(`${ws_key}:${suffix}`, size) : create_sb(device, size);

  const running_x_sb = acquire_ws('running_x', ws_byte_len);
  const running_y_sb = acquire_ws('running_y', ws_byte_len);
  const bucket_cursor_sb = acquire_ws('bucket_cursor', total_buckets * 4);
  const bucket_active_sb = acquire_ws('bucket_active', total_buckets * 4);

  // Pair pool. Cross-subtask SMVP layout:
  //   - SMVP path: each subtask owns a slice of `num_columns` slots.
  //     Per-round dispatch covers ALL subtasks at once (z=T). Total
  //     capacity needed: T * num_columns.
  //   - Finalize path: T·h slots (each subtask owns h = num_columns/2).
  // T*num_columns dominates (== 2 × T*h), so allocate to that.
  const MAX_PAIRS_PER_SUBTASK = num_columns; // worst-case per round
  const pool_capacity = num_subtasks * MAX_PAIRS_PER_SUBTASK;
  const pair_buf_size = pool_capacity * limb_byte_length;
  const pair_delta_sb = acquire_ws('pair_delta', pair_buf_size);
  const pair_inv_sb = acquire_ws('pair_inv', pair_buf_size);
  const pair_prefix_sb = acquire_ws('pair_prefix', pair_buf_size);
  const pair_target_meta_sb = acquire_ws('pair_target_meta', pool_capacity * 8); // vec2<u32>
  // Per-subtask atomic counters. Schedule's atomicAdd target each round.
  // dispatch_args zeroes this at the end of its T-element scan, so the
  // value is fresh-zero on entry to the NEXT round's schedule — no
  // separate clearBuffer needed.
  const pair_counter_sb = acquire_ws('pair_counter', num_subtasks * 4);
  // Per-subtask "frozen" counts forwarded by dispatch_args. Read by
  // THIS round's inverse + apply. Decouples the schedule writer from
  // the inverse/apply readers so we can zero pair_counter in dispatch_args
  // without losing the values inverse/apply still need.
  //
  // Padded to num_batches × WPB so the inverse kernel's per-batch WPB-
  // wide atomicLoad scan can safely touch the tail of the last batch
  // when num_subtasks isn't a multiple of WPB. Persistent buffers come
  // zero-initialised; nothing else writes those tail slots.
  const round_count_sb = acquire_ws('round_count', count_slots_padded * 4);
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
    dispatch_args_sb = context.acquirePersistentBuffer(`${ws_key}:dispatch_args`, 36, GPUBufferUsage.INDIRECT);
  } else {
    dispatch_args_sb = device.createBuffer({
      size: 36,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST | GPUBufferUsage.INDIRECT,
    });
  }
  // Pre-filled count buffer for the finalize batch_inverse. T entries,
  // each set to half_num_columns — every workgroup processes its own
  // h-element slice. Inverse kernel reads count_buf[wid.x] for the
  // per-workgroup count and uses the pitch uniform for the slice stride.
  // Contents are constant across MSM calls, so we write once on first
  // acquisition and skip the writeBuffer thereafter.
  let finalize_count_sb: GPUBuffer;
  // Sized to count_slots_padded so the inverse's per-batch WPB-wide scan
  // sees zeros for tail slots past num_subtasks (which the kernel
  // skips by treating wg_counts[w]=0 as an empty subtask). The first
  // num_subtasks slots carry half_num_columns each.
  const finalize_counts_arr = new Uint32Array(count_slots_padded);
  for (let i = 0; i < num_subtasks; i++) finalize_counts_arr[i] = half_num_columns;
  if (context !== undefined) {
    finalize_count_sb = context.acquirePersistentBuffer(`${ws_key}:finalize_count`, count_slots_padded * 4);
    // Re-write the constants every time (cheap — at most ~20 u32s = 80 B)
    // rather than tracking a "first call" flag. Avoids a subtle bug where
    // a bigger N then smaller N would leave stale values in the cached
    // buffer (acquirePersistentBuffer resets identity on size change but
    // not on contents).
    device.queue.writeBuffer(
      finalize_count_sb,
      0,
      new Uint8Array(finalize_counts_arr.buffer, finalize_counts_arr.byteOffset, finalize_counts_arr.byteLength),
    );
  } else {
    finalize_count_sb = create_and_write_sb(
      device,
      new Uint8Array(finalize_counts_arr.buffer, finalize_counts_arr.byteOffset, finalize_counts_arr.byteLength),
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

  // Inverse pass parallelism: each (batch, sub_wg) inverts a contiguous
  // slice of the merged pool. NUM_SUB_WGS_PER_SUBTASK workgroups of
  // TPB=64 threads each handle one slice independently (own fr_inv).
  // Drops per-thread sequential bs by W× → W× faster Phase A/D at large
  // N. The W extra fr_invs run concurrently across SMs (zero wall-time
  // cost).
  const NUM_SUB_WGS_PER_SUBTASK = 8;

  const init_shader = shaderManager.gen_batch_affine_init_shader(init_workgroup_size);
  const schedule_shader = shaderManager.gen_batch_affine_schedule_shader(schedule_workgroup_size);
  const dispatch_args_shader = shaderManager.gen_batch_affine_dispatch_args_shader(WINDOWS_PER_BATCH);
  // Multi-workgroup batch-inverse (W sub-WGs per (batch, sub_wg)). See
  // batch_inverse_parallel.template.wgsl for the algorithm.
  const inverse_shader = shaderManager.gen_batch_inverse_parallel_shader(NUM_SUB_WGS_PER_SUBTASK, WINDOWS_PER_BATCH);
  const apply_shader = shaderManager.gen_batch_affine_apply_scatter_shader(apply_workgroup_size);
  // Finalize dispatch geometry — single dispatch covers all T·h IDs;
  // z workgroups = num_subtasks, threading inside the kernel mirrors
  // the legacy monolithic finalize layout.
  let f_workgroup_size = finalize_workgroup_size_default;
  let f_num_x_workgroups = 64;
  let f_num_y_workgroups = half_num_columns / f_workgroup_size / f_num_x_workgroups;
  let f_num_z_workgroups = num_subtasks;
  if (half_num_columns < 32768) {
    f_workgroup_size = 32;
    f_num_x_workgroups = 1;
    f_num_y_workgroups = Math.ceil(half_num_columns / f_workgroup_size / f_num_x_workgroups);
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
  const finalize_collect_shader = shaderManager.gen_batch_affine_finalize_collect_shader(f_workgroup_size, num_columns);
  const finalize_apply_shader = shaderManager.gen_batch_affine_finalize_apply_shader(f_workgroup_size, num_columns);

  const _compile_t0 = performance.now();

  // ----- Pipelines -----
  const init_pipe = await compile_pipeline_for(
    device,
    [
      'read-only-storage', // 0 row_ptr
      'read-only-storage', // 1 val_idx
      'read-only-storage', // 2 new_point_x
      'read-only-storage', // 3 new_point_y
      'storage', // 4 running_x
      'storage', // 5 running_y
      'storage', // 6 bucket_cursor
      'storage', // 7 bucket_active
      'uniform', // 8 params
    ],
    init_shader,
    context,
    `bn254:batch_affine_init:${num_columns}:${input_size}`,
  );

  const schedule_pipe = await compile_pipeline_for(
    device,
    [
      'read-only-storage', // 0 row_ptr
      'read-only-storage', // 1 val_idx
      'read-only-storage', // 2 new_point_x
      'read-only-storage', // 3 running_x
      'storage', // 4 bucket_cursor
      'storage', // 5 pair_delta
      'storage', // 6 pair_target_meta
      'storage', // 7 pair_counter (atomic, T entries)
      'uniform', // 8 params
    ],
    schedule_shader,
    context,
    `bn254:batch_affine_schedule:xsubtask-v1:${num_columns}:${input_size}`,
  );

  const inverse_pipe = await compile_pipeline_for(
    device,
    [
      'read-only-storage', // 0 inputs (= pair_delta)
      'storage', // 1 prefix
      'storage', // 2 outputs (= pair_inv)
      'storage', // 3 count_buf (atomic, atomicLoad; per-wg)
      'uniform', // 4 params (pitch)
    ],
    inverse_shader,
    context,
    `bn254:batch_affine_inverse:parallel-v4-wpb${WINDOWS_PER_BATCH}:${num_columns}:${input_size}`,
  );

  const apply_pipe = await compile_pipeline_for(
    device,
    [
      'read-only-storage', // 0 val_idx
      'read-only-storage', // 1 new_point_x
      'read-only-storage', // 2 new_point_y
      'storage', // 3 running_x
      'storage', // 4 running_y
      'read-only-storage', // 5 pair_target_meta
      'read-only-storage', // 6 inv_deltas
      'storage', // 7 count_buf (atomic, atomicLoad; per-subtask)
      'uniform', // 8 params
    ],
    apply_shader,
    context,
    `bn254:batch_affine_apply:xsubtask-v1:${num_columns}:${input_size}`,
  );

  // Fused round kernel (ba_rev_packed_carry). Compiled only when the
  // flag is set so the default path pays no extra shader-compile cost.
  // Bindings: 0 val_idx, 1 new_point_x, 2 new_point_y, 3 running_x (rw),
  // 4 running_y (rw), 5 pair_target_meta, 6 count_buf (atomic rw =
  // round_count_sb), 7 uniform params (num_columns, input_size, 0, 0).
  // Same BigInt layout as apply_scatter; no pack/unpack stage.
  const FUSED_SCHUNK = 16;
  let fused_pipe: { pipeline: GPUComputePipeline; layout: GPUBindGroupLayout } | undefined;
  if (fused_revcarry && !use_tree_reduce) {
    const fused_shader = shaderManager.gen_batch_affine_fused_revcarry_shader(apply_workgroup_size, FUSED_SCHUNK);
    fused_pipe = await compile_pipeline_for(
      device,
      [
        'read-only-storage', // 0 val_idx
        'read-only-storage', // 1 new_point_x
        'read-only-storage', // 2 new_point_y
        'storage', // 3 running_x
        'storage', // 4 running_y
        'read-only-storage', // 5 pair_target_meta
        'storage', // 6 count_buf (atomic, atomicLoad; per-subtask)
        'uniform', // 7 params
      ],
      fused_shader,
      context,
      `bn254:batch_affine_fused_revcarry:v1:sc${FUSED_SCHUNK}:wg${apply_workgroup_size}:${num_columns}:${input_size}`,
    );
  }

  const dispatch_args_pipe = await compile_pipeline_for(
    device,
    [
      'storage', // 0 pair_counter (atomic; T entries; read+zero)
      'storage', // 1 round_count   (atomic; T entries; write)
      'storage', // 2 dispatch_args (9 u32s)
      'uniform', // 3 params
    ],
    dispatch_args_shader,
    context,
    `bn254:batch_affine_dispatch_args:v3-wpb${WINDOWS_PER_BATCH}:${num_subtasks}:${apply_workgroup_size}`,
  );

  const finalize_collect_pipe = await compile_pipeline_for(
    device,
    [
      'read-only-storage', // 0 running_x
      'read-only-storage', // 1 running_y
      'read-only-storage', // 2 bucket_active
      'storage', // 3 bucket_x
      'storage', // 4 bucket_y
      'storage', // 5 bucket_z
      'storage', // 6 pair_delta
      'uniform', // 7 params
    ],
    finalize_collect_shader,
    context,
    `bn254:batch_affine_finalize_collect:v1:${num_columns}:${input_size}:${f_workgroup_size}`,
  );

  const finalize_apply_pipe = await compile_pipeline_for(
    device,
    [
      'read-only-storage', // 0 running_x
      'read-only-storage', // 1 running_y
      'read-only-storage', // 2 bucket_active
      'read-only-storage', // 3 pair_inv
      'storage', // 4 bucket_x
      'storage', // 5 bucket_y
      'storage', // 6 bucket_z
      'uniform', // 7 params
    ],
    finalize_apply_shader,
    context,
    `bn254:batch_affine_finalize_apply:v1:${num_columns}:${input_size}:${f_workgroup_size}`,
  );

  cpu_timer?.accumulate('compile_smvp_batch_affine', performance.now() - _compile_t0);

  // ----- Uniforms -----
  // All uniforms are constant for a given (num_subtasks, num_columns,
  // input_size) tuple. With a persistent context they're cached and the
  // contents written once on first acquisition; without one we fall back
  // to per-call create_and_write_ub.
  const acquire_ub = (suffix: string, bytes: Uint8Array): GPUBuffer => {
    if (context === undefined) {
      return create_and_write_ub(device, bytes);
    }
    const { buffer, created } = context.acquirePersistentUniform(`${ws_key}:${suffix}`, bytes.length);
    if (created) device.queue.writeBuffer(buffer, 0, bytes as BufferSource);
    return buffer;
  };

  // Init: (total_buckets, num_columns, input_size, 0)
  const init_ub = acquire_ub('init_ub', numbers_to_u8s([total_buckets, num_columns, input_size, 0]));

  // Schedule: single uniform shared across all subtasks. Cross-subtask
  // dispatch derives the subtask index from global_id.z, so the uniform
  // only carries layout constants. Layout: (num_columns, input_size, 0, 0)
  const schedule_ub = acquire_ub('schedule_ub', numbers_to_u8s([num_columns, input_size, 0, 0]));

  // Apply: 1 uniform (constant across subtasks). (num_columns, input_size, 0, 0)
  const apply_ub = acquire_ub('apply_ub', numbers_to_u8s([num_columns, input_size, 0, 0]));

  // Dispatch-args kernel uniform: (num_subtasks, apply_workgroup_size,
  // sched_x_groups, num_sub_wgs_per_subtask). sched_x_groups is the
  // full-X dim for ba_schedule; dispatch_args writes this verbatim into
  // schedule's next-round arg triple unless max_count==0, in which case
  // it writes 0 to elide the dispatch. num_sub_wgs is the inverse
  // dispatch's X dim (0 when no work, W otherwise).
  const sched_x_groups = Math.ceil(num_columns / schedule_workgroup_size);
  const dispatch_args_ub = acquire_ub(
    'dispatch_args_ub',
    numbers_to_u8s([num_subtasks, apply_workgroup_size, sched_x_groups, NUM_SUB_WGS_PER_SUBTASK]),
  );

  // Inverse: per-workgroup slice stride. Two clients with different
  // pitches:
  //   - SMVP: pitch = num_columns       (T workgroups, each subtask's
  //                                       per-round pair pool slice)
  //   - Finalize: pitch = half_num_columns (T workgroups, each subtask's
  //                                          h-element slice)
  const inverse_smvp_ub = acquire_ub('inverse_smvp_ub', numbers_to_u8s([num_columns, 0, 0, 0]));
  const inverse_finalize_ub = acquire_ub('inverse_finalize_ub', numbers_to_u8s([half_num_columns, 0, 0, 0]));

  // Finalize: single uniform shared across collect and apply. Both
  // kernels run as one dispatch with z=num_subtasks, so num_z_workgroups
  // in the uniform must match. subtask_offset=0 because the kernels
  // derive their subtask from gidz / id-arithmetic.
  // Layout: (num_y_workgroups, num_z_workgroups, 0, num_columns)
  const finalize_ub = acquire_ub(
    'finalize_ub',
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
  const acquire_bg = (suffix: string, layout: GPUBindGroupLayout, buffers: GPUBuffer[]): GPUBindGroup => {
    if (persistent_bgs) {
      return context!.getOrCreatePersistentBindGroup(`${ws_key}:${suffix}`, () =>
        create_bind_group(device, layout, buffers),
      );
    }
    return create_bind_group(device, layout, buffers);
  };

  const init_bg = acquire_bg('init_bg', init_pipe.layout, [
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
  const schedule_bg = acquire_bg('schedule_bg', schedule_pipe.layout, [
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
  const inverse_bg = acquire_bg(`inverse_bg:v3-wpb${WINDOWS_PER_BATCH}`, inverse_pipe.layout, [
    pair_delta_sb,
    pair_prefix_sb,
    pair_inv_sb,
    round_count_sb,
    inverse_smvp_ub,
  ]);

  const apply_bg = acquire_bg('apply_bg:v2', apply_pipe.layout, [
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

  // Fused round bind group. Reuses the same external + workspace buffers
  // as the apply path (val_idx, point_x/y, running_x/y, pair_target_meta,
  // round_count) plus apply_ub. round_count_sb carries the per-subtask
  // pair count forwarded by dispatch_args, same as apply's count_buf.
  const fused_bg =
    fused_pipe !== undefined
      ? acquire_bg('fused_revcarry_bg:v1', fused_pipe.layout, [
          all_csc_val_idxs_sb,
          point_x_sb,
          point_y_sb,
          running_x_sb,
          running_y_sb,
          pair_target_meta_sb,
          round_count_sb,
          apply_ub,
        ])
      : undefined;

  // Suffix bumped to v2 by P2-clear: bind group now binds 4 buffers
  // (pair_counter + round_count + dispatch_args + ub) instead of 3.
  // W suffix dropped along with the P1 revert.
  const dispatch_args_bg = acquire_bg(`dispatch_args_bg:v3-wpb${WINDOWS_PER_BATCH}`, dispatch_args_pipe.layout, [
    pair_counter_sb,
    round_count_sb,
    dispatch_args_sb,
    dispatch_args_ub,
  ]);

  // Single bind groups for collect and apply — finalize runs as one
  // dispatch over T·h threads (z=num_subtasks). The inverse pass
  // dispatches T workgroups, each handling one h-slice in parallel.
  const finalize_collect_bg = acquire_bg('finalize_collect_bg', finalize_collect_pipe.layout, [
    running_x_sb,
    running_y_sb,
    bucket_active_sb,
    bucket_sum_x_sb,
    bucket_sum_y_sb,
    bucket_sum_z_sb,
    pair_delta_sb,
    finalize_ub,
  ]);

  const finalize_inverse_bg = acquire_bg(`finalize_inverse_bg:v2-wpb${WINDOWS_PER_BATCH}`, inverse_pipe.layout, [
    pair_delta_sb,
    pair_prefix_sb,
    pair_inv_sb,
    finalize_count_sb,
    inverse_finalize_ub,
  ]);

  const finalize_apply_bg = acquire_bg('finalize_apply_bg', finalize_apply_pipe.layout, [
    running_x_sb,
    running_y_sb,
    bucket_active_sb,
    pair_inv_sb,
    bucket_sum_x_sb,
    bucket_sum_y_sb,
    bucket_sum_z_sb,
    finalize_ub,
  ]);

  // ----- Dispatch sequence -----

  // 1. Init: ceil(total_buckets / 256) workgroups in x, 1 thread per bucket.
  const init_x_groups = Math.ceil(total_buckets / init_workgroup_size);
  await execute_pipeline(commandEncoder, init_pipe.pipeline, init_bg, init_x_groups, 1, 1, profiler?.stage('ba_init'));

  if (use_tree_reduce) {
    // 2'. Tree-reduce path. The init dispatch above has already zeroed
    // running_x/y and populated bucket_active from the CSR row pointers.
    // We now compute per-CSR-row affine sums via tree-reduce and scatter
    // them into running_x/y. bucket_active stays as init wrote it
    // (which matches our scatter coverage exactly — both mark the
    // CSR-active buckets and leave the rest at zero).
    //
    // The existing finalize stage (collect → batch_inverse → apply)
    // below consumes the populated running_x/y + bucket_active and
    // performs the affine→Jacobian + magnitude-bucket fold unchanged.
    //
    // Pipelines are compiled lazily and cached on the gpu context when
    // available so warm bench loops don't pay shader-compile cost.
    const TREE_TPB = 64;
    const TREE_MAX_SLICE_ENTRIES = 1024;
    const tree_p1_key = `bn254:smvp_tree_phase1:tpb${TREE_TPB}:max${TREE_MAX_SLICE_ENTRIES}`;
    const tree_p2_key = `bn254:smvp_tree_phase2:tpb${TREE_TPB}:max${TREE_MAX_SLICE_ENTRIES}`;
    const tree_scatter_key = `bn254:smvp_tree_scatter:tpb64`;
    const tree_ebid_key = `bn254:smvp_tree_entry_bucket_id:tpb64`;
    const buildPipeline = async (code: string, numBindings: number, readOnlyCount: number, lastIsUniform: boolean = false) => {
      const mod = device.createShaderModule({ code });
      const layout = device.createBindGroupLayout({
        entries: Array.from({ length: numBindings }, (_, i) => ({
          binding: i,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: (i < readOnlyCount
              ? 'read-only-storage'
              : (lastIsUniform && i === numBindings - 1 ? 'uniform' : 'storage')) as GPUBufferBindingType,
          },
        })),
      });
      const pipeline = await device.createComputePipelineAsync({
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module: mod, entryPoint: 'main' },
      });
      return { pipeline, layout };
    };
    const p1Compile = async () =>
      buildPipeline(shaderManager.gen_smvp_tree_phase1_shader(TREE_TPB, TREE_MAX_SLICE_ENTRIES), 10, 6);
    const p2Compile = async () =>
      buildPipeline(shaderManager.gen_smvp_tree_phase2_shader(TREE_TPB, TREE_MAX_SLICE_ENTRIES), 9, 5);
    const scatterCompile = async () =>
      buildPipeline(shaderManager.gen_smvp_tree_scatter_shader(TREE_TPB), 7, 3, true);
    const ebidCompile = async () =>
      buildPipeline(shaderManager.gen_smvp_tree_entry_bucket_id_shader(TREE_TPB), 3, 1, true);
    const p1Got = context !== undefined ? await context.getOrCreatePipeline(tree_p1_key, p1Compile) : await p1Compile();
    const p2Got = context !== undefined ? await context.getOrCreatePipeline(tree_p2_key, p2Compile) : await p2Compile();
    const scatterGot =
      context !== undefined ? await context.getOrCreatePipeline(tree_scatter_key, scatterCompile) : await scatterCompile();
    const ebidGot =
      context !== undefined ? await context.getOrCreatePipeline(tree_ebid_key, ebidCompile) : await ebidCompile();
    const p1 = { pipeline: p1Got.pipeline, layout: 'bindGroupLayout' in p1Got ? p1Got.bindGroupLayout : p1Got.layout };
    const p2 = { pipeline: p2Got.pipeline, layout: 'bindGroupLayout' in p2Got ? p2Got.bindGroupLayout : p2Got.layout };
    const scatter = {
      pipeline: scatterGot.pipeline,
      layout: 'bindGroupLayout' in scatterGot ? scatterGot.bindGroupLayout : scatterGot.layout,
    };
    const ebid = {
      pipeline: ebidGot.pipeline,
      layout: 'bindGroupLayout' in ebidGot ? ebidGot.bindGroupLayout : ebidGot.layout,
    };

    const totalEntries = input_size * num_subtasks;
    const entryBucketIdBuf = device.createBuffer({
      size: totalEntries * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    const ebidParamsBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(ebidParamsBuf, 0, new Uint32Array([num_columns, input_size, num_subtasks, 0]));
    const ebidBg = device.createBindGroup({
      layout: ebid.layout,
      entries: [
        { binding: 0, resource: { buffer: all_csc_col_ptr_sb } },
        { binding: 1, resource: { buffer: entryBucketIdBuf } },
        { binding: 2, resource: { buffer: ebidParamsBuf } },
      ],
    });
    // Record ebid into the caller's commandEncoder, AFTER transpose +
    // ba_init were recorded. Then finish + submit so ebid (and the
    // upstream transpose) actually run on the GPU before runTreeReduce
    // reads back entry_bucket_id. After that, swap to a fresh encoder
    // for scatter + finalize + downstream BPR work.
    {
      const pass = commandEncoder.beginComputePass();
      pass.setPipeline(ebid.pipeline);
      pass.setBindGroup(0, ebidBg);
      pass.dispatchWorkgroups(Math.ceil(totalEntries / TREE_TPB), 1, 1);
      pass.end();
    }
    device.queue.submit([commandEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    commandEncoder = device.createCommandEncoder();
    commandEncoderRef.current = commandEncoder;

    if ((globalThis as unknown as { __tree_debug?: boolean }).__tree_debug) {
      const dumpN = 32;
      const dumpStaging = device.createBuffer({
        size: dumpN * 4,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      const enc = device.createCommandEncoder();
      enc.copyBufferToBuffer(entryBucketIdBuf, 0, dumpStaging, 0, dumpN * 4);
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      await dumpStaging.mapAsync(GPUMapMode.READ);
      const dumped = new Uint32Array(dumpStaging.getMappedRange().slice(0));
      dumpStaging.unmap();
      dumpStaging.destroy();
      console.log(`[tree-dbg] num_columns=${num_columns} num_subtasks=${num_subtasks} input_size=${input_size} totalEntries=${totalEntries}`);
      console.log(`[tree-dbg] entry_bucket_id[0..${dumpN}] = ${Array.from(dumped).join(',')}`);
      const rpStaging = device.createBuffer({
        size: (num_columns + 1) * 4,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      try {
        const e2 = device.createCommandEncoder();
        e2.copyBufferToBuffer(all_csc_col_ptr_sb, 0, rpStaging, 0, (num_columns + 1) * 4);
        device.queue.submit([e2.finish()]);
        await device.queue.onSubmittedWorkDone();
        await rpStaging.mapAsync(GPUMapMode.READ);
        const rpDump = new Uint32Array(rpStaging.getMappedRange().slice(0));
        rpStaging.unmap();
        rpStaging.destroy();
        console.log(`[tree-dbg] subtask0 row_ptr[0..16] = ${Array.from(rpDump.subarray(0, 16)).join(',')}`);
        console.log(`[tree-dbg] subtask0 row_ptr[end-3..end] = ${Array.from(rpDump.subarray(num_columns - 2, num_columns + 1)).join(',')}`);
      } catch (e) {
        console.log(`[tree-dbg] row_ptr readback failed: ${(e as Error).message}`);
      }
    }

    const treeRes = await runTreeReduce(
      device,
      p1.pipeline, p1.layout,
      p2.pipeline, p2.layout,
      all_csc_val_idxs_sb, entryBucketIdBuf, point_x_sb, point_y_sb,
      totalEntries,
      { tpb: TREE_TPB, maxSliceEntries: TREE_MAX_SLICE_ENTRIES },
    );

    if ((globalThis as unknown as { __msm_debug_tree_output?: boolean }).__msm_debug_tree_output) {
      const N = treeRes.totalOutputs;
      const bidStaging = device.createBuffer({ size: N * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const xStaging = device.createBuffer({ size: N * limb_byte_length, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      const yStaging = device.createBuffer({ size: N * limb_byte_length, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
      {
        const enc = device.createCommandEncoder();
        enc.copyBufferToBuffer(treeRes.outputBucketId, 0, bidStaging, 0, N * 4);
        enc.copyBufferToBuffer(treeRes.outputX, 0, xStaging, 0, N * limb_byte_length);
        enc.copyBufferToBuffer(treeRes.outputY, 0, yStaging, 0, N * limb_byte_length);
        device.queue.submit([enc.finish()]);
        await device.queue.onSubmittedWorkDone();
        await Promise.all([bidStaging.mapAsync(GPUMapMode.READ), xStaging.mapAsync(GPUMapMode.READ), yStaging.mapAsync(GPUMapMode.READ)]);
      }
      const bidArr = new Uint32Array(bidStaging.getMappedRange().slice(0));
      const xArr = new Uint32Array(xStaging.getMappedRange().slice(0));
      const yArr = new Uint32Array(yStaging.getMappedRange().slice(0));
      bidStaging.unmap(); xStaging.unmap(); yStaging.unmap();
      bidStaging.destroy(); xStaging.destroy(); yStaging.destroy();
      // Aggregate per-subtask: (count, sumX, sumY).
      const perSub: number[] = [];
      const sCount = new Array(num_subtasks).fill(0);
      const sX = new Array(num_subtasks).fill(0);
      const sY = new Array(num_subtasks).fill(0);
      let dupBids = 0;
      let seenBids = new Set<number>();
      for (let i = 0; i < N; i++) {
        const bid = bidArr[i];
        const sub = Math.floor(bid / num_columns);
        if (sub < num_subtasks) {
          sCount[sub]++;
          let xfp = sX[sub] >>> 0;
          let yfp = sY[sub] >>> 0;
          for (let w = 0; w < num_words; w++) {
            xfp = (xfp + (xArr[i * num_words + w] >>> 0)) >>> 0;
            yfp = (yfp + (yArr[i * num_words + w] >>> 0)) >>> 0;
          }
          sX[sub] = xfp;
          sY[sub] = yfp;
        }
        if (seenBids.has(bid)) dupBids++;
        seenBids.add(bid);
      }
      for (let s = 0; s < num_subtasks; s++) perSub.push(sCount[s], sX[s], sY[s]);
      (globalThis as unknown as { __msm_debug_tree_dump?: { N: number; perSub: number[]; dupBids: number } }).__msm_debug_tree_dump =
        { N, perSub, dupBids };
      console.log(`[msm-tree-debug] totalOutputs=${N} duplicateBidCount=${dupBids}`);
    }

    const scatterParamsBuf = device.createBuffer({
      size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(
      scatterParamsBuf,
      0,
      new Uint32Array([treeRes.totalOutputs, total_buckets, 0, 0]),
    );
    const scatterBg = device.createBindGroup({
      layout: scatter.layout,
      entries: [
        { binding: 0, resource: { buffer: treeRes.outputBucketId } },
        { binding: 1, resource: { buffer: treeRes.outputX } },
        { binding: 2, resource: { buffer: treeRes.outputY } },
        { binding: 3, resource: { buffer: running_x_sb } },
        { binding: 4, resource: { buffer: running_y_sb } },
        { binding: 5, resource: { buffer: bucket_active_sb } },
        { binding: 6, resource: { buffer: scatterParamsBuf } },
      ],
    });
    await execute_pipeline(
      commandEncoder,
      scatter.pipeline,
      scatterBg,
      Math.ceil(treeRes.totalOutputs / TREE_TPB),
      1,
      1,
      profiler?.stage('ba_tree_scatter'),
    );

    // Buffer lifetime: treeRes.* + entryBucketIdBuf + scatterParamsBuf
    // + ebidParamsBuf are all referenced by bind groups recorded into
    // commandEncoder OR were used in already-submitted ebid encoder.
    // They get GC'd after the caller submits + finishes commandEncoder.
    // No explicit `.destroy()` here — destroying buffers referenced by
    // a pending bind group invalidates the encoder.
  } else {
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
  const cs15 = num_columns === 1 << 15;
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
    sched_x_groups,
    1,
    num_subtasks, // schedule (read by round 0)
    0,
    0,
    0, // inverse  (written before read each round)
    0,
    0,
    0, // apply    (written before read each round)
  ]);
  device.queue.writeBuffer(dispatch_args_sb, 0, initial_args.buffer);

  // Per-stage profiling budgets (kept in sync with PROFILE_*_ROUNDS
  // exports above). The Profiler is constructed in submission.ts with
  // capacity=1100 — well below Dawn's ~4096-per-QuerySet hard cap that
  // wedges the device when exceeded.
  //
  //   * All four round-loop families (`ba_schedule`, `ba_inverse`,
  //     `ba_apply`, `ba_dispatch_args`) are profiled on EVERY round.
  //     The per-round labels group under the family in the report, so
  //     the family-row sum is the TRUE total cost. Previously
  //     schedule/apply were sampled 8/256 and `ba_dispatch_args` was
  //     skipped entirely — the missing rounds hid in `untimestamped`.
  //
  //   * Slot tally at worst case (N=2^20): 256 ba_schedule + 256
  //     ba_inverse + 256 ba_apply + 256 ba_dispatch_args = 1024
  //     round-loop. Plus ~9 fixed (decompose, transpose_*, ba_init,
  //     ba_finalize_×3, bpr_1, bpr_2, subtask_reduce) = ~1033.
  //     Capacity=1100 leaves ~67 slots of margin.
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
    // round's schedule and this round's inverse + apply. Per-kernel
    // cost is small but it runs every round, so at MAX_ROUNDS=256 the
    // sum used to be a multi-ms slice of `untimestamped`.
    await execute_pipeline(
      commandEncoder,
      dispatch_args_pipe.pipeline,
      dispatch_args_bg,
      1,
      1,
      1,
      profiler?.stage(`ba_dispatch_args[r=${round}]`),
    );

    if (fused_pipe !== undefined && fused_bg !== undefined) {
      // 2c'. Fused round — INDIRECT. One kernel replaces the separate
      // inverse + apply dispatches. Reuses the apply arg triple at
      // offset 24 = (ceil(max_count / apply_wg_size), 1, num_subtasks).
      // The fused kernel addresses pairs as `global_id.x * SCHUNK`, so
      // this triple over-provisions the X dim by SCHUNK× vs what the
      // fused slicing needs; every surplus thread early-returns via
      // `base >= n`, so over-dispatch is correctness-safe. The single
      // fr_inv_by_a per SCHUNK slice is the actual win regardless.
      execute_pipeline_indirect(
        commandEncoder,
        fused_pipe.pipeline,
        fused_bg,
        dispatch_args_sb,
        24,
        sample_apply ? profiler?.stage(`ba_fused[r=${round}]`) : undefined,
      );
    } else {
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
  }
  } // end if (!use_tree_reduce)

  // DEBUG: dump running_x for ALL total_buckets buckets to console
  // when `window.__msm_debug_after_smvp = true`. Used to A/B compare
  // stock vs tree SMVP output without modifying finalize. Compact:
  // per-subtask aggregated fingerprint (sum of all limbs mod 2^32) +
  // active count.
  if ((globalThis as unknown as { __msm_debug_after_smvp?: boolean }).__msm_debug_after_smvp) {
    const DEBUG_N_BUCKETS = total_buckets;
    const dumpBytes = DEBUG_N_BUCKETS * limb_byte_length;
    const xStaging = device.createBuffer({
      size: dumpBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const yStaging = device.createBuffer({
      size: dumpBytes,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const aStaging = device.createBuffer({
      size: DEBUG_N_BUCKETS * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const tmpEnc = device.createCommandEncoder();
    // Source buffer is in the MAIN commandEncoder which we haven't
    // submitted yet. We need a separate encoder that runs AFTER the
    // main one. Since the caller hasn't submitted the main encoder yet,
    // we have to flush main first then copy. To keep this simple we just
    // copy from running_x_sb directly — the GPU sees writes from the
    // main encoder when both encoders submit in order.
    tmpEnc.copyBufferToBuffer(running_x_sb, 0, xStaging, 0, dumpBytes);
    tmpEnc.copyBufferToBuffer(running_y_sb, 0, yStaging, 0, dumpBytes);
    tmpEnc.copyBufferToBuffer(bucket_active_sb, 0, aStaging, 0, DEBUG_N_BUCKETS * 4);
    // Submit main FIRST so the writes land, then submit our debug copy.
    // The caller normally submits later; here we steal-submit to make
    // the debug readback meaningful. The downside: the caller's later
    // submit on the same encoder will error (encoder is consumed).
    // This is fine for one-shot debug runs.
    const cmd = commandEncoder.finish();
    device.queue.submit([cmd, tmpEnc.finish()]);
    await device.queue.onSubmittedWorkDone();
    await Promise.all([xStaging.mapAsync(GPUMapMode.READ), yStaging.mapAsync(GPUMapMode.READ), aStaging.mapAsync(GPUMapMode.READ)]);
    const xLimbs = new Uint32Array(xStaging.getMappedRange().slice(0));
    const yLimbs = new Uint32Array(yStaging.getMappedRange().slice(0));
    const aFlags = new Uint32Array(aStaging.getMappedRange().slice(0));
    xStaging.unmap(); yStaging.unmap(); aStaging.unmap();
    xStaging.destroy(); yStaging.destroy(); aStaging.destroy();
    // Aggregate per-subtask: (active_count, sum_of_x_limbs, sum_of_y_limbs)
    // — but ONLY over active buckets. Persistent buffers retain stale
    // values for inactive buckets from prior MSM calls, so summing them
    // makes the fingerprint depend on warm-context history (different
    // across workers) and the comparison becomes meaningless.
    const perSubtask: number[] = [];
    let globalActive = 0;
    let globalSumX = 0 >>> 0;
    let globalSumY = 0 >>> 0;
    for (let s = 0; s < num_subtasks; s++) {
      let sActive = 0;
      let sX = 0 >>> 0;
      let sY = 0 >>> 0;
      for (let b = 0; b < num_columns; b++) {
        const bucket = s * num_columns + b;
        if (aFlags[bucket]) {
          sActive++;
          for (let w = 0; w < num_words; w++) {
            sX = (sX + (xLimbs[bucket * num_words + w] >>> 0)) >>> 0;
            sY = (sY + (yLimbs[bucket * num_words + w] >>> 0)) >>> 0;
          }
        }
      }
      perSubtask.push(sActive, sX, sY);
      globalActive += sActive;
      globalSumX = (globalSumX + sX) >>> 0;
      globalSumY = (globalSumY + sY) >>> 0;
    }
    (globalThis as unknown as { __msm_debug_dump?: number[] }).__msm_debug_dump = perSubtask;
    const mode = use_tree_reduce ? 'tree' : 'stock';
    console.log(`[msm-debug] mode=${mode} subtasks=${num_subtasks} total_buckets=${total_buckets} ` +
      `globalActive=${globalActive} globalSumX=${globalSumX} globalSumY=${globalSumY}`);
    // Halt before finalize since we already submitted the encoder.
    throw new Error('msm-debug-stop');
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
    profiler?.stage('ba_finalize_collect'),
  );

  // Pass B (batch_inverse): (W, 1, num_batches) workgroups in parallel
  // — each (batch, sub_wg) inverts the merged h-element slices of WPB
  // consecutive subtasks with one fr_inv_by_a. Same kernel as the
  // round loop's inverse pass; finalize_count_sb is pre-populated with
  // half_num_columns for valid subtasks and zero for the padded tail.
  await execute_pipeline(
    commandEncoder,
    inverse_pipe.pipeline,
    finalize_inverse_bg,
    NUM_SUB_WGS_PER_SUBTASK,
    1,
    num_batches,
    profiler?.stage('ba_finalize_inverse'),
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
    profiler?.stage('ba_finalize_apply'),
  );
};
