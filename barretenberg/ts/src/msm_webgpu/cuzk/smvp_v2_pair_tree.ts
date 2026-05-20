/// <reference types="@webgpu/types" />

/**
 * v2 bin-packed pair-tree MSM bucket-accumulate orchestrator —
 * step 3 of the rewrite from the cuZK round-loop to a single-submit
 * pair-tree per pippenger window.
 *
 * Goal: a drop-in replacement for `smvp_batch_affine_gpu` (the
 * schedule + batch_inverse_parallel + apply_scatter round-loop) that
 * produces the same downstream contract — running_x / running_y /
 * bucket_active per (subtask, bucket_local) — so the existing
 * batch_affine_finalize_collect / finalize_apply / BPR / horner stages
 * can consume the v2 output without any changes.
 *
 * Pipeline per window:
 *
 *   csr_to_v2_meta         row_ptr -> counts[B] + offsets[B]
 *   csr_to_v2_active_sums  val_idx + cached bases (packed 8x u32) ->
 *                          bucket-major active_sums in v2 combined SoA
 *   for level in 0..max_levels:
 *     planner_v2           counts/offsets -> chunk_plan / scatter_plan
 *                          / carry_plan + new_counts / new_offsets +
 *                          totals
 *     marshal_pairs        active_sums + chunk_plan -> chain_buf
 *     pair_disjoint_tree   chain_buf -> tempOut (S pair sums per chunk,
 *                          single-fr_inv per chunk, lean affine add)
 *     scatter_pairs        tempOut + scatter_plan -> active_sums_next
 *     carry_copy           odd-count tails -> active_sums_next
 *   v2_to_running          final active_sums slot per non-empty bucket
 *                          -> running_x / running_y / bucket_active
 *                          (production layout, ready for finalize)
 *
 * Layouts:
 *   active_sums (combined SoA, one buffer per ping-pong copy):
 *     plane 0 (x) vec4 indices [0, PG * M)
 *     plane 1 (y) vec4 indices [PG * M, 2 * PG * M)
 *     per-element layout: PG=2 vec4 at [PG*elem, PG*elem+1].
 *     M = input_size + 2 (last 2 slots hold a pad pair).
 *   running_x / running_y (production, separate buffers):
 *     packed 8x u32 = 2 vec4 per (subtask, bucket_local), at
 *     [PG * bucket_global, PG * bucket_global + 1] with
 *     bucket_global = subtask_idx * num_columns + bucket_local.
 *   bucket_active: u32 per bucket_global.
 *
 * @remarks IMPLEMENTATION STATUS — Step 3 scaffolding only.
 *
 * `runSmvpV2PairTree` below is **not yet runtime-correct** because the
 * planner_v2 shader (`ba_planner_v2_bench.template.wgsl`) writes only
 * the first `numChunks * S` entries of chunk_plan / scatter_plan — it
 * does not pad-fill the tail with (padLIdx, padRIdx) / discardIdx the
 * way the host planner in bench-msm-tree-v2 does. Dispatching
 * marshal_pairs / pair_disjoint_tree / scatter_pairs at the worst-case
 * `T_upper` (the buffer's allocated chunk count) would then read stale
 * / zero entries from chunk_plan, compute garbage affine adds, and
 * scatter the garbage into real bucket slots via stale scatter_plan
 * entries — corrupting the result.
 *
 * Two correct paths to land next:
 *   (a) Extend planner_v2 to take padLIdx / padRIdx / discardIdx
 *       uniforms and pad-fill chunk_plan / scatter_plan / carry_plan
 *       tails in a final phase. Re-validate the standalone bench-
 *       planner harness against an updated host reference, then this
 *       orchestrator can dispatch at T_upper safely.
 *   (b) Have planner_v2 write per-level dispatch counts (numChunks /
 *       numCarries derived from totals) into a small dispatch_args
 *       buffer, and switch marshal / disjoint / scatter / carry to
 *       `dispatchWorkgroupsIndirect`. Avoids the pad-fill but needs a
 *       per-level uniform-vs-storage rewrite for the T-and-N
 *       parameters that those four kernels currently read from
 *       `var<uniform>`.
 *
 * Option (a) is the simpler change. The scaffolding below records
 * pipeline compiles + bind-group construction so the eventual runtime
 * is a small delta once planner_v2 pad-fill lands.
 *
 * The companion `v2_to_running` shader (`v2_to_running.template.wgsl`)
 * is finished and correct: it copies the final per-bucket reduced
 * packed point from the v2 active_sums slot into the production
 * running_x / running_y / bucket_active layout at the correct
 * bucket_global. Its bindings allow per-subtask views (offset by
 * subtask_idx * num_columns) so a single per-window dispatch lands the
 * result in the right slab of the global running buffers.
 */

import { ShaderManager } from './shader_manager.js';

const PG = 2;

export interface SmvpV2PairTreeOptions {
  device: GPUDevice;
  shaderManager: ShaderManager;
  num_subtasks: number;
  num_columns: number;
  input_size: number;

  s?: number;
  tpb?: number;
  per_thread?: number;
  wgi?: number;
  max_levels?: number;

  /** Per-subtask CSR row_ptr layout from cuZK transpose. */
  val_idx_buf: GPUBuffer;
  /** Per-subtask CSR row_ptr (num_columns + 1 entries per subtask). */
  row_ptr_buf: GPUBuffer;
  /** Packed cached_bases.point_x_sb (input_size * 32 bytes). */
  point_x_buf: GPUBuffer;
  /** Packed cached_bases.point_y_sb (input_size * 32 bytes). */
  point_y_buf: GPUBuffer;

  /**
   * Output: running_x / running_y per bucket_global, packed 8x u32.
   * Sized num_subtasks * num_columns * 32 bytes each.
   */
  running_x_buf: GPUBuffer;
  running_y_buf: GPUBuffer;
  /** Output: bucket_active per bucket_global, u32. */
  bucket_active_buf: GPUBuffer;
}

export interface SmvpV2PairTreeStats {
  levels_per_window: number;
  pipelines_compiled: number;
  bind_groups_recorded: number;
}

/**
 * Construct the v2 bucket-accumulate dispatch chain.
 *
 * @throws Always — runtime is gated on the planner_v2 pad-fill
 * follow-up described in this module's docstring.
 */
export async function runSmvpV2PairTree(
  _opts: SmvpV2PairTreeOptions,
): Promise<SmvpV2PairTreeStats> {
  throw new Error(
    'smvp_v2_pair_tree: orchestrator scaffolding is checked in but ' +
      'runtime is gated on planner_v2 pad-fill (option a) or indirect ' +
      'dispatch (option b). See module docstring.',
  );
}

/**
 * Reference upper bound on the chunk count any level can produce, used
 * by the orchestrator to size chunk_plan / scatter_plan / chain_buf /
 * tempOut at the worst case (level 0 with all pairs).
 *
 * Per-bucket count C, total active points N (sum of counts), per-level
 * pair count is bounded by floor(N / 2). After bin-packing into chunks
 * of S, numChunks <= ceil(N / 2 / S). Plus a +num_columns slack for the
 * carry-forward elements that bump some buckets at the next level.
 */
export function maxChunksUpperBound(input_size: number, num_columns: number, s: number): number {
  return Math.max(1, Math.ceil(input_size / 2 / s) + num_columns);
}

/**
 * Buffer-byte-size helpers — kept here so the production msm.ts
 * integration can pre-allocate matching scratch when wiring v2 in
 * behind a flag.
 */
export const sizes = {
  /** Combined-SoA active_sums byte size for one window, including the pad pair. */
  activeSumsBytes(input_size: number): number {
    const M = input_size + 2;
    return 2 * PG * M * 16;
  },
  /** chain_buf byte size for one window. */
  chainBufBytes(input_size: number, num_columns: number, s: number): number {
    const T = maxChunksUpperBound(input_size, num_columns, s);
    return 2 * PG * (2 * s * T) * 16;
  },
  /** tempOut byte size for one window. */
  tempOutBytes(input_size: number, num_columns: number, s: number): number {
    const T = maxChunksUpperBound(input_size, num_columns, s);
    return 2 * PG * (s * T) * 16;
  },
  /** chunk_plan byte size per level. */
  chunkPlanBytes(input_size: number, num_columns: number, s: number): number {
    const T = maxChunksUpperBound(input_size, num_columns, s);
    return 2 * s * T * 4;
  },
  /** scatter_plan byte size per level. */
  scatterPlanBytes(input_size: number, num_columns: number, s: number): number {
    const T = maxChunksUpperBound(input_size, num_columns, s);
    return s * T * 4;
  },
  /** carry_plan byte size per level. */
  carryPlanBytes(num_columns: number): number {
    return 2 * num_columns * 4;
  },
  /** counts byte size per level. */
  countsBytes(num_columns: number): number {
    return num_columns * 4;
  },
  /** offsets byte size per level. */
  offsetsBytes(num_columns: number): number {
    return num_columns * 4;
  },
};
