/**
 * Copyright 2024 Tal Derei and Koh Wei Jie. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * Authors: Koh Wei Jie and Tal Derei
 */

import { assert } from './assert.js';
import { BigIntPoint, U32ArrayPoint, readBigIntsFromBufferLE } from './types.js';
import { ShaderManager } from './cuzk/shader_manager.js';
import {
  get_device,
  create_and_write_sb,
  create_and_write_ub,
  create_bind_group,
  create_bind_group_layout,
  create_sb,
  read_from_gpu,
  execute_pipeline,
  Profiler,
  CpuTimer,
  type ProfileEntryKind,
} from './cuzk/gpu.js';
import { GpuContext } from './cuzk/gpu_context.js';
import { CachedBases, precompute_bn254_bases } from './cuzk/cached_bases.js';
import {
  smvp_batch_affine_gpu,
  PROFILE_SCHEDULE_ROUNDS,
  PROFILE_INVERSE_ROUNDS,
  PROFILE_APPLY_ROUNDS,
} from './cuzk/batch_affine.js';
import {
  u8s_to_bigints,
  u8s_to_numbers,
  u8s_to_numbers_32,
  numbers_to_u8s_for_gpu,
  compute_misc_params,
  decompose_scalars_signed,
  u8s_to_bigints_without_assertion,
} from './cuzk/utils.js';
import { cpu_transpose } from './cuzk/transpose.js';
import { cpu_smvp_signed } from './cuzk/smvp.js';
import { parallel_bucket_reduction_1, parallel_bucket_reduction_2 } from './cuzk/bpr.js';
import { BN254_CURVE_CONFIG, CpuPoint, CurveConfig } from './cuzk/curve_config.js';
import {
  createBn254AffinePointFromJacobian,
  addBn254Jacobian,
  doubleBn254Jacobian,
  scalarMultBn254Jacobian,
  toAffineBn254Jacobian,
  BN254_JACOBIAN_ZERO,
  Bn254Jacobian,
} from './cuzk/bn254.js';

// The original tal-webgpu submission used `G1` (from @celo/bls12377js) as a
// debug type tag inside `log_result === true` blocks. We drop that
// dependency in the bb.js port; aliasing here keeps the original debug
// branches compiling without pulling the BLS curve library back in. They
// remain unreachable in production (log_result defaults to false).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type G1 = any;

// Compatibility shim. The original tal-webgpu file imported
// `createAffinePoint` from the BLS12-377 module to construct debug
// reference points inside log_result=true blocks. Those blocks are
// unreachable in the bb.js port (log_result defaults to false on every
// callsite), but the references still have to typecheck. Stub returns a
// plain bag so the debug paths compile.
const createAffinePoint = (x: bigint, y: bigint, z: bigint): G1 => ({ x, y, z }) as G1;
// The original module also exported a BLS12-377 `compute_msm` entry point
// keyed by the imported `BLS12_377_CURVE_CONFIG`. The bb.js port is BN254
// only, so `compute_msm`, `compute_atheonxyz_bn254_msm`, and the GLV cold
// paths (compute_bn254_msm_glv / compute_bn254_msm_glv_with_context) were
// removed below. `compute_bn254_msm_with_context` is the main entry, with
// `compute_bn254_msm_cached` / `compute_bn254_msm_batch_affine` for the
// warm SRS-backed path.

/*
 * End-to-end implementation of the modified cuZK MSM algorithm by Lu et al,
 * 2022: https://eprint.iacr.org/2022/1321.pdf
 * Many aspects of cuZK were adapted and modified for our submission, and some
 * aspects were omitted. As such, please refer to the documentation we have
 * written for a more accurate description of our work. We also used techniques
 * by previous ZPrize contestations. In summary, we took the following
 * approach:
 * 1. Perform as much of the computation within the GPU as possible, in order
 *    to minimse CPU-GPU and GPU-CPU data transfer, which is slow.
 * 2. Use optimisations inspired by previous years' submissions, such as:
 *    - Montgomery multiplication with smaller limb sizes
 *    - Signed bucket indices
 * 3. Careful memory management to stay within WebGPU's default buffer size
 *    limits.
 * 4. Perform the final computation of the MSM result from the subtask results
 *    (Horner's rule) in the CPU instead of the GPU, as the number of points is
 *    small, and the time taken to compile a shader to perform this computation
 *    is greater than the time it takes for the CPU to do so.
 */

/**
 * Profile capture out-parameter shape. Pass an object literal `{}` to
 * `compute_bn254_msm_batch_affine` (or `compute_curve_msm`) and read the
 * fields after the await:
 *
 *   - `profile`     — raw GPU per-pass timestamps (the same data the
 *                     console `[gpu-profile]` table groups by family).
 *   - `cpu_phases`  — CPU-side phase report, sorted entries +
 *                     `total_wall_ms`. Same data the console
 *                     `[cpu-phases]` block prints.
 *   - `gpu_readback`— GPU readback decomposition: ground-truth
 *                     `gpu_compute_wall` from
 *                     `device.queue.onSubmittedWorkDone()`, the sum of
 *                     all profiled passes, the implied untimestamped
 *                     remainder, and (when available) the
 *                     `mapAsync`/readback breakdown.
 *
 * `cpu_phases` and `gpu_readback` are populated regardless of the
 * `log_result` flag — they are read off the same internal data the
 * console block uses, so callers can capture without spamming the
 * console.
 */
export interface ProfileCapture {
  profile: { label: string; ms: number; kind: ProfileEntryKind }[] | null;
  cpu_phases?: {
    phases: { label: string; ms: number }[];
    total_wall_ms: number;
  };
  gpu_readback?: {
    gpu_compute_wall: number;
    profiled_passes_sum: number;
    untimestamped: number;
    mapasync_overhead?: number;
    readback_total?: number;
  };
}

/**
 * Global constants (BN254). The original tal-webgpu file derived these from
 * BLS12_377_CURVE_CONFIG; for the BN254-only port, derive from BN254.
 */
const p = BN254_CURVE_CONFIG.baseFieldModulus;
const params = compute_misc_params(p, BN254_CURVE_CONFIG.wordSize);
const num_words = params.num_words;
const word_size = params.word_size;
const rinv = params.rinv;

export const compute_bn254_msm = async (
  baseAffinePoints: BigIntPoint[] | U32ArrayPoint[] | Buffer,
  scalars: bigint[] | Uint32Array[] | Buffer,
  log_result = true,
  force_recompile = false,
): Promise<{ x: bigint; y: bigint }> =>
  compute_curve_msm(baseAffinePoints, scalars, BN254_CURVE_CONFIG, log_result, force_recompile);

/**
 * BN254 MSM with a caller-provided persistent GPU context. Reuses the
 * device, compiled pipelines, and template-substituted shader strings
 * across calls — a major win for Honk/chonk-style workloads that issue
 * 20–50 MSMs per proof against the same SRS.
 *
 * The context must outlive all MSM calls that use it; destroy it via
 * `context.destroy()` when the page/proof is done.
 */
export const compute_bn254_msm_with_context = async (
  context: GpuContext,
  baseAffinePoints: BigIntPoint[] | U32ArrayPoint[] | Buffer,
  scalars: bigint[] | Uint32Array[] | Buffer,
  log_result = true,
): Promise<{ x: bigint; y: bigint }> =>
  compute_curve_msm(baseAffinePoints, scalars, BN254_CURVE_CONFIG, log_result, false, undefined, context);

export { GpuContext };
export { CachedBases, precompute_bn254_bases };

/**
 * BN254 MSM with precomputed SRS bases. The caller uploads the SRS to
 * the GPU once via `precompute_bn254_bases(context, points_buffer)`
 * and then reuses the returned `CachedBases` across many MSM calls —
 * skipping the point upload and Montgomery conversion entirely on each
 * call. Only the scalars buffer is uploaded per MSM.
 *
 * Intended for the Honk/chonk prover flow that issues 20–50 MSMs per
 * proof against the same SRS.
 */
export const compute_bn254_msm_cached = async (
  context: GpuContext,
  cachedBases: CachedBases,
  scalars: Buffer,
  log_result = true,
): Promise<{ x: bigint; y: bigint }> =>
  compute_curve_msm(
    // The `baseAffinePoints` argument is ignored on the cached path;
    // passing an empty Uint8Array (cast through to Buffer) keeps the
    // type signature happy without requiring a Node `Buffer` global,
    // which the browser does not provide.
    new Uint8Array(0) as unknown as Buffer,
    scalars,
    BN254_CURVE_CONFIG,
    log_result,
    false,
    undefined,
    context,
    cachedBases,
  );

/**
 * BN254 MSM with batch-affine SMVP. Same I/O contract and warm-path
 * behaviour as `compute_bn254_msm_cached`, but the SMVP step replaces
 * the per-bucket Jacobian mixed-add accumulation with Montgomery's
 * batch-inverse trick — every round of bucket reduction performs N
 * affine adds sharing one field inversion.
 *
 * Output is bit-identical to the cached path, so a `correct=true`
 * check against the same fixture validates the algorithm end-to-end.
 *
 * Caller contract: SRS-backed bases. The schedule kernel skips
 * collisions (delta == 0) silently; for SRS bases that's
 * statistically unreachable.
 */
export const compute_bn254_msm_batch_affine = async (
  context: GpuContext,
  cachedBases: CachedBases,
  scalars: Buffer,
  log_result = true,
  // Microbench-only forwarder. Defaults to {} (production behaviour).
  // When any flag is set, the MSM result is bench-grade garbage —
  // callers must not trust the returned x/y.
  bpr_bench_flags: {
    bench_null?: boolean;
    bench_compute_only?: boolean;
    bench_memory_only?: boolean;
    bench_no_store?: boolean;
  } = {},
  // Microbench-only: caller passes `{}` to receive the GPU profile array
  // in `.profile` after the await. May also receive CPU phase summary +
  // GPU readback decomposition in optional fields when `log_result=true`
  // (these are populated even if console logging is disabled — they are
  // read from the same internal data the console report uses).
  profile_capture?: ProfileCapture,
  // BPR stage_1 inner-loop variant. 'legacy' (default) = full add_points
  // with collision check, the production-stable path. 'mixed_safe' =
  // mixed-add for m, full add for g. 'assume_affine' = mixed-add for m
  // and no-collision Jacobian for g (saves ~13-25 ms but requires
  // batch-affine SMVP buckets and is sensitive to Tint codegen).
  bpr_inner_loop: 'legacy' | 'mixed_safe' | 'assume_affine' = 'legacy',
  use_tree_reduce = false,
  // Opt-in: route the per-round affine reduction through the single
  // fused ba_rev_packed_carry kernel instead of the separate
  // batch_inverse_parallel + apply_scatter dispatches. Init / schedule /
  // finalize stay unchanged (same BigInt-layout buffers). bn254 only.
  fused_revcarry = false,
): Promise<{ x: bigint; y: bigint }> =>
  compute_curve_msm(
    // Cached path: `baseAffinePoints` is ignored. Uint8Array cast keeps
    // the call browser-safe (no Node `Buffer` global).
    new Uint8Array(0) as unknown as Buffer,
    scalars,
    BN254_CURVE_CONFIG,
    log_result,
    false,
    undefined,
    context,
    cachedBases,
    undefined,
    true, // use_batch_affine_smvp
    bpr_bench_flags,
    profile_capture,
    bpr_inner_loop,
    use_tree_reduce,
    fused_revcarry,
  );

// GLV cold-path entry points (compute_bn254_msm_glv and
// compute_bn254_msm_glv_with_context) were removed from the bb.js port.
// They depended on `bn254_prepare_glv_inputs` from
// `implementation/cuzk/glv_bn254`, which was not ported because the warm
// SRS-backed path (`compute_bn254_msm_cached` / batch-affine variant) is
// the only one the Chonk integration exercises.

/**
 * Compile (or fetch from cache) a compute pipeline.
 *
 * Without a context, this is `create_compute_pipeline` plus a matching
 * bind-group-layout construction — identical to the legacy inline
 * sequence. With a context, the `(shaderCode, entryPoint, bindLayoutKey)`
 * triple is used as the cache key; repeated calls for the same
 * configuration skip both `createShaderModule` and
 * `createComputePipelineAsync` and return the cached pipeline + layout.
 *
 * The bind-group layout must still be reused across calls — WebGPU
 * requires bind groups created with the same layout object as the
 * pipeline was built with. The cache stores both.
 */
const compile_pipeline_cached = async (
  device: GPUDevice,
  bindLayoutTypes: Array<'storage' | 'read-only-storage' | 'uniform'>,
  shaderCode: string,
  entryPoint: string,
  context: GpuContext | undefined,
  cacheKey: string,
): Promise<{
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
}> => {
  // Proactive WGSL compile-error capture. The default
  // `create_compute_pipeline` -> `createComputePipelineAsync` flow
  // surfaces compile errors as a generic GPUPipelineError with the
  // useless message "Invalid ShaderModule (unlabeled) is invalid due
  // to a previous error" — losing the line number and the actual
  // diagnostic. We instead build the shader module ourselves, await
  // its compilationInfo, and surface every message to the console
  // before constructing the pipeline. Same pattern as
  // batch_affine.ts:compile_pipeline_for. Works whether or not a
  // context is provided.
  const compileOnce = async (): Promise<{
    pipeline: GPUComputePipeline;
    bindGroupLayout: GPUBindGroupLayout;
  }> => {
    const bindGroupLayout = create_bind_group_layout(device, bindLayoutTypes);
    const m = device.createShaderModule({ code: shaderCode });
    const info = await m.getCompilationInfo();
    const errors: string[] = [];
    for (const msg of info.messages) {
      const tag = `[compile_pipeline_cached ${cacheKey} :: ${entryPoint}]`;
      const where = `line ${msg.lineNum}, col ${msg.linePos}`;
      const line = `${tag} ${msg.type}: ${msg.message} (${where})`;
      if (msg.type === 'error') {
        console.error(line);
        errors.push(line);
      } else {
        console.warn(line);
      }
    }
    if (errors.length > 0) {
      // Embed the actual error messages in the thrown error so the
      // orchestrator can surface them in the UI log without requiring
      // the user to have DevTools open.
      throw new Error(`WGSL compile failed for ${cacheKey}::${entryPoint}: ${errors.join(' | ')}`);
    }
    let pipeline: GPUComputePipeline;
    try {
      pipeline = await device.createComputePipelineAsync({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
        compute: { module: m, entryPoint },
      });
    } catch (e: unknown) {
      // createComputePipelineAsync can reject with a GPUPipelineError
      // even when getCompilationInfo() reported no errors (e.g. binding
      // layout / WGSL semantic problems detected at pipeline build).
      // Re-throw with cache-key context so the failure is attributable
      // to a specific variant.
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Pipeline build failed for ${cacheKey}::${entryPoint}: ${msg}`);
    }
    return { pipeline, bindGroupLayout };
  };

  if (context === undefined) {
    return compileOnce();
  }
  return context.getOrCreatePipeline(cacheKey, compileOnce);
};

// Intermediate Montgomery-form buffers captured during compute_curve_msm
// when debug_trace is enabled. Each Uint8Array is the raw byte buffer
// (num_words × 4 bytes per value) and length-dependent per stage.
export type DebugTraceDump = {
  // After convert_points. point_x/y hold input_size BigInt values in
  // Montgomery form. There is no per-point z output from this stage.
  convert: {
    point_x_mont: Uint8Array;
    point_y_mont: Uint8Array;
  };
  // After SMVP (all dispatches complete).
  smvp: {
    bucket_x_mont: Uint8Array;
    bucket_y_mont: Uint8Array;
    bucket_z_mont: Uint8Array;
  };
  // After BPR stage 1.
  bpr1: {
    bucket_x_mont: Uint8Array;
    bucket_y_mont: Uint8Array;
    bucket_z_mont: Uint8Array;
    g_points_x_mont: Uint8Array;
    g_points_y_mont: Uint8Array;
    g_points_z_mont: Uint8Array;
  };
  // After BPR stage 2.
  bpr2: {
    g_points_x_mont: Uint8Array;
    g_points_y_mont: Uint8Array;
    g_points_z_mont: Uint8Array;
    // Per-thread intermediates from the inline add-2007-bl formula in
    // stage_2 (subtask 0 only). 8 BigInts per thread, indexed as
    // debug_capture[thread_id * 8 + k] with k as documented in
    // bpr_bn254.template.wgsl.
    debug_capture?: Uint8Array;
  };
  // Pipeline parameters so the caller can decode the buffers correctly.
  params: {
    input_size: number;
    chunk_size: number;
    num_columns: number;
    num_subtasks: number;
    num_words: number;
    word_size: number;
    bpr_workgroup_size: number;
  };
};

// Returns the MSM result plus raw intermediate buffer dumps from each
// pipeline stage. Intended for step-by-step diffing against a JS reference
// (see src/submission/miscellaneous/tests/bn254_pipeline_trace.test.ts) to
// pinpoint which WebGPU stage diverges from the algorithm's expected
// behavior.
export const compute_bn254_msm_debug_trace = async (
  baseAffinePoints: BigIntPoint[] | U32ArrayPoint[] | Buffer,
  scalars: bigint[] | Uint32Array[] | Buffer,
  log_result = false,
  force_recompile = false,
): Promise<{ x: bigint; y: bigint; trace: DebugTraceDump }> => {
  const trace: Partial<DebugTraceDump> = {};
  const result = await compute_curve_msm(
    baseAffinePoints,
    scalars,
    BN254_CURVE_CONFIG,
    log_result,
    force_recompile,
    trace,
  );
  return { ...result, trace: trace as DebugTraceDump };
};

const compute_curve_msm = async (
  baseAffinePoints: BigIntPoint[] | U32ArrayPoint[] | Buffer,
  scalars: bigint[] | Uint32Array[] | Buffer,
  curveConfig: CurveConfig,
  log_result = true,
  force_recompile = false,
  // When provided, compute_curve_msm will stage-copy the intermediate GPU
  // buffers into mapped staging buffers and populate this object before
  // returning. See DebugTraceDump for the schema.
  debug_trace?: Partial<DebugTraceDump>,
  // Optional persistent GPU context. When set:
  //   - No `get_device()` call; reuse the context's device.
  //   - No `device.destroy()` on exit; the context owns the device.
  //   - Shader pipelines are looked up in the context's pipeline cache
  //     and only compiled on first use.
  // When null/undefined (legacy path), the function creates a device,
  // runs the pipeline once, and destroys the device on exit.
  context?: GpuContext,
  // Optional precomputed SRS bases. When provided:
  //   - `baseAffinePoints` is ignored.
  //   - Stage-1 point conversion is skipped entirely.
  //   - Only scalars are uploaded; a scalars-only decomposition shader
  //     runs in place of the full convert shader.
  //   - The cached `point_x_sb`, `point_y_sb` feed SMVP directly.
  // Requires `context` to match `cached_bases.context` (not checked at
  // runtime for efficiency — caller must not cross the streams).
  cached_bases?: CachedBases,
  // GLV-specific overrides. When set, the pipeline interprets `scalars`
  // as `glv_override.scalar_byte_length`-byte LE unsigned integers
  // (e.g. 16 bytes for 128-bit GLV scalars), and uses
  // `glv_override.num_subtasks` (e.g. 8 instead of 16). The point buffer
  // is expected to already be 2n in length, with signs of the original
  // (k1, k2) absorbed into Y.
  glv_override?: {
    scalar_bit_length: number;
    scalar_byte_length: number;
    num_subtasks: number;
  },
  // Opt-in flag: when true, replaces the per-bucket Jacobian
  // mixed-add SMVP loop with the batch-affine pipeline (init →
  // [schedule → batch_inverse → apply_scatter] × MAX_ROUNDS → finalize).
  // Output bucket_x/y/z layout is bit-identical, so BPR is unaffected.
  // Currently BN254 only.
  use_batch_affine_smvp = false,
  // Microbench-only: forwarded into gen_bpr_shader. Mutates the BPR
  // stage_1 inner loop and/or writes for diagnosis. Defaults are all
  // false (production behaviour). Result correctness is not preserved
  // when any flag is true — bench output should be discarded.
  bpr_bench_flags: {
    bench_null?: boolean;
    bench_compute_only?: boolean;
    bench_memory_only?: boolean;
    bench_no_store?: boolean;
  } = {},
  // Microbench-only out-param: when supplied, the field `profile` is
  // populated with the GPU profiler's raw {label, ms}[] report at the
  // end of the call (or null when timestamp-query is unavailable). The
  // optional cpu_phases and gpu_readback fields carry the same data the
  // console reports use, structured for programmatic consumption.
  profile_capture?: ProfileCapture,
  // BPR stage_1 inner-loop variant. See compute_bn254_msm_batch_affine
  // for the full description. Default 'legacy' (production-stable).
  bpr_inner_loop: 'legacy' | 'mixed_safe' | 'assume_affine' = 'legacy',
  // Opt-in: route the per-bucket affine reduction through the
  // tree-reduce pipeline (smvp_tree_phase1 + recursive smvp_tree_phase2
  // + scatter) instead of the round-loop. Init + finalize stages stay
  // unchanged. Currently bn254 only (uses the same fr_inv_by_a from
  // the existing batch_affine pipelines). Output bit-identical.
  use_tree_reduce = false,
  // Opt-in: route the per-round affine reduction through the single
  // fused ba_rev_packed_carry kernel (suffix-product / one fr_inv_by_a /
  // lean apply) instead of the separate batch_inverse_parallel +
  // apply_scatter dispatches. Init / schedule / finalize unchanged.
  // Forwarded into smvp_batch_affine_gpu. bn254 only.
  fused_revcarry = false,
): Promise<{ x: bigint; y: bigint }> => {
  const curveParams = compute_misc_params(curveConfig.baseFieldModulus, curveConfig.wordSize);
  const num_words = curveParams.num_words;
  const rinv = curveParams.rinv;
  // PACKED 8×u32 (32 bytes/element) storage for every INTERMEDIATE
  // field-element buffer on the fused path (point_x/y, running_x/y,
  // bucket_sum_x/y/z, g_points_x/y/z). Arithmetic still unpacks to the
  // BigInt limb layout in-register; only storage-buffer bytes change.
  // The final gpu_horner_sums_* result buffer and the raw point input
  // stay BigInt-layout so host decoding is unchanged. Tree-reduce takes
  // precedence (mutually exclusive with fused), so packed implies the
  // batch_affine fused round path.
  const packed = fused_revcarry && !use_tree_reduce;
  const effective_scalar_byte_length = glv_override?.scalar_byte_length ?? curveConfig.scalarByteLength;
  const input_size = cached_bases ? cached_bases.input_size : (scalars as Buffer).length / effective_scalar_byte_length;

  if (input_size === 0) {
    return { x: BigInt(0), y: BigInt(1) };
  }

  // Sanity: cached_bases forces the persistent-context path.
  if (cached_bases !== undefined && context === undefined) {
    throw new Error('compute_curve_msm: cached_bases requires a context to share its device');
  }
  if (cached_bases !== undefined && cached_bases.context !== context) {
    throw new Error('compute_curve_msm: cached_bases.context must equal the passed-in context');
  }
  if (
    cached_bases !== undefined &&
    (scalars as Buffer).length / effective_scalar_byte_length !== cached_bases.input_size
  ) {
    throw new Error(
      `compute_curve_msm: scalar count ${
        (scalars as Buffer).length / effective_scalar_byte_length
      } does not match cached base count ${cached_bases.input_size}`,
    );
  }

  // CPU-side per-phase timer. Orthogonal to the GPU `Profiler` below (which
  // times the interior of each compute pass). Together they let us tell
  // whether a given MSM call's wall time is limited by CPU host work,
  // transfer, compile, or GPU compute.
  //
  // Enabled when EITHER `log_result` (console dump) OR `profile_capture`
  // (structured out-param for the UI) is set. The UI medianises across
  // runs, so it needs phases populated on every run — not just the first
  // one where log_result=true. Without this, runs after i=0 produce an
  // empty phases array, which then medians-to-zero in the breakdown table.
  const cpu_timer = new CpuTimer(log_result || profile_capture !== undefined);
  cpu_timer.mark('setup_begin');

  // Adaptive chunk_size policy. BPR-1 cost scales with T·B = (λ/c)·2^(c-1),
  // where λ = scalar bit length. Setting d/dc [T·B] = 0 gives c ≈ λ/ln 2 ≈ 36
  // in the limit, but topmost-chunk skew (Fr ≈ 2^253.77) and SMVP work
  // n·T = n·λ/c push the optimum down. Empirically c=15 cuts T·B by 1.88×
  // (16·32768 → 17·16384) at near-zero SMVP penalty and identical top-chunk
  // density (top chunk uses 14 bits in either case), so it dominates c=16
  // across N=2^16..2^20.
  //
  // For BN254 (λ=254) the chunk_size c=15 gives T=17 instead of 16, which
  // requires the BPR dispatch to handle T not divisible by 16 — see the
  // `num_subtasks_per_bpr_1 = num_subtasks` change below. GLV (λ=128) keeps
  // c=16 because c=15 would give T=9 with a heavy top-chunk-skew penalty.
  // chunk_size=4 still applies for inputs below the GPU-amortisation
  // threshold.
  const using_glv = glv_override !== undefined;
  const chunk_size = input_size >= 65536 ? (using_glv ? 16 : 15) : 4;

  // When a persistent context is supplied, reuse its ShaderManager cache
  // (template Mustache substitution is deterministic per config) and its
  // device. Otherwise, create a fresh ShaderManager every call — identical
  // to the pre-context behaviour.
  const shaderManager =
    context !== undefined
      ? context.getShaderManager(curveConfig, chunk_size, input_size)
      : new ShaderManager(chunk_size, input_size, curveConfig, force_recompile);

  const num_columns = 2 ** chunk_size;
  const num_rows = Math.ceil(input_size / num_columns);
  const effective_scalar_bit_length = glv_override?.scalar_bit_length ?? curveConfig.scalarBitLength;
  // Derive num_subtasks from the effective bit length and chunk size.
  // For default BN254 at large N: 256/16 = 16. For GLV: 128/16 = 8 (or
  // 128/4 = 32 when n is small enough that chunk_size drops to 4).
  // The glv_override.num_subtasks field is now informational only — the
  // actual value is recomputed here so it stays correct under the
  // chunk_size policy in compute_curve_msm.
  const num_subtasks = Math.ceil(effective_scalar_bit_length / chunk_size);

  // Each pass must use the same GPUDevice and GPUCommandEncoder, or else
  // storage buffers can't be reused across compute passes
  cpu_timer.mark('device_begin');
  const device = context !== undefined ? context.device : await get_device();
  cpu_timer.phaseFrom('device_acquire', 'device_begin');

  // Create single command encoder for device
  // commandEncoder is wrapped in a ref so smvp_batch_affine_gpu's
  // tree-reduce path can swap it (it has to mid-flush the encoder to
  // ensure ebid sees the current transpose, then continue with a fresh
  // encoder for scatter + finalize + BPR).
  const commandEncoderRef: { current: GPUCommandEncoder } = {
    current: device.createCommandEncoder(),
  };
  // Backwards-compat alias for existing code paths that use the local
  // `commandEncoder` name. Stock path never mutates the ref, so they
  // resolve to the same object.
  let commandEncoder = commandEncoderRef.current;
  // The tree-reduce branch swaps commandEncoderRef.current; subsequent
  // BPR / readback work must use the latest. We rebind `commandEncoder`
  // below right after smvp_batch_affine_gpu.

  // Per-pass GPU profiler. No-ops if "timestamp-query" isn't supported.
  //
  // Capacity = 1100 (= 2200 timestamps per QuerySet) is well below
  // Dawn's ~4096 cap that wedges the device when exceeded. Sized to
  // profile EVERY round of EVERY family in the batch-affine SMVP loop
  // at worst case (MAX_ROUNDS = 256 at N=2^20) plus the per-round
  // `ba_dispatch_args` kernel.
  //
  // The `encoder_all` row in the report is NOT a separate slot — it's
  // derived inside `Profiler.report()` from `max(end_ts) − min(begin_ts)`
  // over all stage timestamps, which captures the full encoder span
  // and quantifies Dawn inter-pass barrier overhead without paying for
  // synthetic empty-pass markers (those get elided by Dawn).
  //
  // Slot tally (worst case, N=2^20, batch-affine SMVP):
  //   ~9 fixed (decompose, transpose_*, ba_init, ba_finalize_×3,
  //             bpr_1, bpr_2, subtask_reduce)
  //   + 256 ba_schedule + 256 ba_inverse + 256 ba_apply
  //   + 256 ba_dispatch_args
  //   = ~1033 — under 1100 with ~67 slots of margin.
  //
  // Why every round of ba_apply / ba_schedule, not just samples:
  //   The previous PROFILE_APPLY_ROUNDS=8 / PROFILE_SCHEDULE_ROUNDS=8
  //   left 248 of 256 rounds unprofiled at N=2^20. Their cost (~80-150
  //   ms combined) hid in `untimestamped`, which made the "ba_apply"
  //   family row look 30× cheaper than its true total. Sampling every
  //   round makes the family-row sums correctly reflect total cost so
  //   optimization-priority decisions stop flying blind.
  const profiler = new Profiler(device, 1100);

  // When debug_trace is requested, we stage-copy intermediate buffers to
  // MAP_READ-usable staging buffers. They accumulate into debug_stagings
  // and get mapped/decoded at the end (before device.destroy).
  type DebugStagings = {
    convert?: { point_x: GPUBuffer; point_y: GPUBuffer };
    smvp?: { bucket_x: GPUBuffer; bucket_y: GPUBuffer; bucket_z: GPUBuffer };
    bpr1?: {
      bucket_x: GPUBuffer;
      bucket_y: GPUBuffer;
      bucket_z: GPUBuffer;
      g_x: GPUBuffer;
      g_y: GPUBuffer;
      g_z: GPUBuffer;
    };
    bpr2?: { g_x: GPUBuffer; g_y: GPUBuffer; g_z: GPUBuffer; debug_capture?: GPUBuffer };
  };
  const debug_stagings: DebugStagings = {};
  const mkStaging = (size: number): GPUBuffer =>
    device.createBuffer({
      size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
  const copyToStaging = (src: GPUBuffer, dst: GPUBuffer) => {
    commandEncoder.copyBufferToBuffer(src, 0, dst, 0, src.size);
  };

  // Calculate the workgroup size and number of workgroups
  const workgroup = await calculate_workgoups(input_size);

  let point_x_sb: GPUBuffer;
  let point_y_sb: GPUBuffer;
  let scalar_chunks_sb: GPUBuffer;

  // Fused decompose+count buffer: when the warm path is taken AND we
  // have a persistent context, the decompose kernel atomicAdds into
  // this same col_ptr buffer that transpose_gpu_parallel would have
  // populated separately. Saves one full scalar_chunks pass + one
  // dispatch.
  let fused_col_ptr_sb: GPUBuffer | undefined;
  const can_fuse_count = cached_bases !== undefined && context !== undefined && curveConfig.id === 'bn254';

  if (cached_bases) {
    // Warm path: points are already Montgomery-form on the GPU. Only do
    // scalar decomposition.
    //
    // CachedBases point_x/y layout must match the MSM path: packed
    // 8×u32 when `packed`, num_words-limb BigInt otherwise. Build the
    // CachedBases with the matching `packed` arg to precompute_bn254_bases.
    const cached_packed = (cached_bases as { packed?: boolean }).packed === true;
    if (cached_packed !== packed) {
      throw new Error(
        `CachedBases layout mismatch: cached_bases.packed=${cached_packed} but MSM packed=${packed}. ` +
          'Call precompute_bn254_bases(..., /*packed*/ ' +
          `${packed}) to build layout-matched bases for this path.`,
      );
    }
    cpu_timer.mark('convert_host_begin');
    point_x_sb = cached_bases.point_x_sb;
    point_y_sb = cached_bases.point_y_sb;

    if (can_fuse_count) {
      const xpose_key = `${curveConfig.id}:xpose:${num_subtasks}:${num_columns}:${input_size}`;
      fused_col_ptr_sb = context!.acquirePersistentBuffer(`${xpose_key}:col_ptr`, num_subtasks * (num_columns + 1) * 4);
      // Decompose kernel atomicAdds into this — must start at zero.
      commandEncoder.clearBuffer(fused_col_ptr_sb);
    }

    scalar_chunks_sb = await decompose_scalars_only_gpu(
      shaderManager,
      workgroup.c_workgroup_size,
      workgroup.c_num_x_workgroups,
      workgroup.c_num_y_workgroups,
      device,
      commandEncoder,
      scalars as Buffer,
      num_subtasks,
      num_columns,
      input_size,
      curveConfig,
      profiler.stage('decompose_scalars_only'),
      cpu_timer,
      context,
      fused_col_ptr_sb,
    );
    cpu_timer.phaseFrom('convert_host_total', 'convert_host_begin');
  } else {
    const c_shader = shaderManager.gen_convert_points_and_decomp_scalars_shader(
      workgroup.c_workgroup_size,
      workgroup.c_num_y_workgroups,
      num_subtasks,
      num_columns,
      glv_override?.scalar_bit_length,
      glv_override?.scalar_byte_length,
      packed,
    );

    // Convert the affine points to Montgomery form and decompose the scalars
    // using a single shader
    cpu_timer.mark('convert_host_begin');
    const converted = await convert_point_coords_and_decompose_shaders(
      c_shader,
      workgroup.c_num_x_workgroups,
      workgroup.c_num_y_workgroups,
      device,
      commandEncoder,
      baseAffinePoints as Buffer,
      num_words,
      curveConfig.wordSize,
      scalars as Buffer,
      num_subtasks,
      chunk_size,
      curveConfig,
      curveParams,
      false,
      profiler.stage('convert_points'),
      cpu_timer,
      context,
      effective_scalar_byte_length,
      packed,
    );
    point_x_sb = converted.point_x_sb;
    point_y_sb = converted.point_y_sb;
    scalar_chunks_sb = converted.scalar_chunks_sb;
    cpu_timer.phaseFrom('convert_host_total', 'convert_host_begin');
  }

  if (debug_trace) {
    const dx = mkStaging(point_x_sb.size);
    const dy = mkStaging(point_y_sb.size);
    copyToStaging(point_x_sb, dx);
    copyToStaging(point_y_sb, dy);
    debug_stagings.convert = { point_x: dx, point_y: dy };
  }

  // Per field-element storage size: packed = two vec4<u32> (32 bytes),
  // baseline = num_words 32-bit limbs.
  const field_elem_bytes = packed ? 32 : num_words * 4;

  // Buffers to  store the SMVP result (the bucket sum). They are overwritten per iteration
  const bucket_sum_coord_bytelength = (num_columns / 2) * field_elem_bytes * num_subtasks;
  // When a context is provided, pull the bucket-sum scratch from the
  // persistent buffer cache. Same lifetime semantics as the workspace
  // buffers in batch_affine.ts: same buffer reused across MSM calls,
  // recreated only on size change. The MSM call sequence (SMVP →
  // collect → finalize_apply / BPR) fully overwrites these on each
  // call, so no clear is needed.
  // `packed` is part of the key: packed field buffers are 32 B/element
  // vs num_words·4 B baseline and the shaders differ, so a persistent
  // buffer / pipeline / bind group cached under one layout must never be
  // reused for the other.
  const ws_key = `bn254:msm:${num_subtasks}:${num_columns}:${num_words}:${input_size}:${packed ? 'pk' : 'bi'}`;
  const acquire_msm_ws = (suffix: string, size: number): GPUBuffer =>
    context !== undefined ? context.acquirePersistentBuffer(`${ws_key}:${suffix}`, size) : create_sb(device, size);
  const bucket_sum_x_sb = acquire_msm_ws('bucket_sum_x', bucket_sum_coord_bytelength);
  const bucket_sum_y_sb = acquire_msm_ws('bucket_sum_y', bucket_sum_coord_bytelength);
  const bucket_sum_z_sb = acquire_msm_ws('bucket_sum_z', bucket_sum_coord_bytelength);

  // Transpose. BN254 uses the three-phase parallel transpose (count + scan
  // + scatter); BLS12-377 stays on the serial-per-subtask path. The serial
  // path measured ~65 ms at N=2^16 (a quarter of total GPU time at that
  // size); the parallel path collapses the n*T count and scatter passes
  // to ~1M threads.
  cpu_timer.mark('transpose_host_begin');
  let all_csc_col_ptr_sb: GPUBuffer;
  let all_csc_val_idxs_sb: GPUBuffer;
  if (curveConfig.id === 'bn254') {
    const countShader = shaderManager.gen_transpose_count_shader(64);
    const scanShader = shaderManager.gen_transpose_scan_shader(num_subtasks);
    const scatterShader = shaderManager.gen_transpose_scatter_shader(64);
    const out = await transpose_gpu_parallel(
      countShader,
      scanShader,
      scatterShader,
      device,
      commandEncoder,
      input_size,
      num_columns,
      num_rows,
      num_subtasks,
      scalar_chunks_sb,
      cpu_timer,
      context,
      curveConfig.id,
      chunk_size,
      // When fused_col_ptr_sb is set, decompose has already populated it
      // — transpose skips its standalone count dispatch.
      fused_col_ptr_sb,
      fused_col_ptr_sb !== undefined ? undefined : profiler.stage('transpose_count'),
      profiler.stage('transpose_scan'),
      profiler.stage('transpose_scatter'),
    );
    all_csc_col_ptr_sb = out.all_csc_col_ptr_sb;
    all_csc_val_idxs_sb = out.all_csc_val_idxs_sb;
  } else {
    const transpose_shader = shaderManager.gen_transpose_shader(num_subtasks);
    const out = await transpose_gpu(
      transpose_shader,
      device,
      commandEncoder,
      input_size,
      num_columns,
      num_rows,
      num_subtasks,
      scalar_chunks_sb,
      false,
      profiler.stage('transpose'),
      cpu_timer,
      context,
      curveConfig.id,
      chunk_size,
    );
    all_csc_col_ptr_sb = out.all_csc_col_ptr_sb;
    all_csc_val_idxs_sb = out.all_csc_val_idxs_sb;
  }
  cpu_timer.phaseFrom('transpose_host_total', 'transpose_host_begin');

  // SMVP dispatch geometry. Per outer-loop iteration we need
  // `smvp_subtasks_per_iter * h` threads, distributed across
  // (num_x_workgroups * workgroup_size, num_y_workgroups, num_z_workgroups).
  // The shader's `id = (gidx*num_y + gidy)*num_z + gidz` then recovers
  // `subtask_idx = id / h`, which lands in [0, smvp_subtasks_per_iter)
  // when num_z is set to smvp_subtasks_per_iter (the high digit of id).
  //
  // smvp_subtasks_per_iter MUST divide num_subtasks so the outer loop
  // covers each subtask exactly once. For chunk_size=15 the natural
  // T=18 has no factor of 4, so we pick the largest divisor ≤ 4 (= 3).
  // For T=16 and T=64 the default 4 divides cleanly.
  const half_num_columns = num_columns / 2;
  const default_smvp_subtasks_per_iter = 4;
  let smvp_subtasks_per_iter = default_smvp_subtasks_per_iter;
  while (smvp_subtasks_per_iter > 1 && num_subtasks % smvp_subtasks_per_iter !== 0) {
    smvp_subtasks_per_iter--;
  }

  let s_workgroup_size: number;
  let s_num_x_workgroups: number;
  let s_num_y_workgroups: number;
  const s_num_z_workgroups = smvp_subtasks_per_iter;

  if (half_num_columns >= 32768) {
    // chunk_size ≥ 16 path. 256-thread workgroups, keep enough X
    // parallelism for occupancy on dGPU.
    s_workgroup_size = 256;
    s_num_x_workgroups = 64;
    s_num_y_workgroups = half_num_columns / s_workgroup_size / s_num_x_workgroups;
  } else if (num_columns >= 256) {
    // chunk_size=15 / 14 path. Smaller wg, distribute over Y.
    s_workgroup_size = 32;
    s_num_x_workgroups = 1;
    s_num_y_workgroups = Math.ceil(half_num_columns / s_workgroup_size / s_num_x_workgroups);
  } else {
    // Tiny path (chunk_size ≤ 7). One thread per bucket pair.
    s_workgroup_size = 1;
    s_num_x_workgroups = half_num_columns;
    s_num_y_workgroups = 1;
  }

  cpu_timer.mark('smvp_host_begin');

  if (use_batch_affine_smvp) {
    // Batch-affine SMVP path. Output bucket_x/y/z layout is
    // bit-identical to the legacy SMVP, so the downstream BPR is
    // unaffected. See src/submission/implementation/cuzk/batch_affine.ts
    // for the dispatch sequence.
    if (curveConfig.id !== 'bn254') {
      throw new Error('use_batch_affine_smvp is currently BN254-only.');
    }
    // TODO(msm-tree-reduce): Swap this call for `runTreeReduce` from
    // `cuzk/smvp_tree.ts` once the affine→Jacobian + T×h fold adapter
    // lands. The orchestrator is correctness-validated end-to-end
    // (Phase 1 + Phase 2 chain, standalone bench
    // `dev/msm-webgpu/bench-smvp-tree.html` matches CPU full-reduce
    // bit-for-bit on Apple M2 BS, 4 layers, 5 buckets, ~5.9 ms).
    // Wiring checklist:
    //   1. Compute `entry_bucket_id[]` from `all_csc_col_ptr_sb` (the
    //      bucketStart array) via a one-pass scan kernel OR a host
    //      readback (cold-path only; cache when externals_persistent).
    //   2. Call `runTreeReduce(device, p1Pipeline, p1Layout,
    //      p2Pipeline, p2Layout, all_csc_val_idxs_sb, entryBucketId,
    //      point_x_sb, point_y_sb, total_entries, bucketStart,
    //      {tpb, maxSliceEntries})`.
    //   3. Convert affine partials to the T×h×BigInt Jacobian layout
    //      expected by downstream BPR: for each `(bucket_id, P)` write
    //      `(P.x, P.y, R)` (Mont-form 1) into the slot keyed by
    //      bucket_id; zero out empty slots.
    //   4. Run Quick Sanity Check at logN=16 via Playwright to confirm
    //      end-to-end correctness, then open perf gates.
    await smvp_batch_affine_gpu(
      shaderManager,
      device,
      commandEncoderRef,
      num_subtasks,
      num_columns,
      input_size,
      all_csc_col_ptr_sb,
      point_x_sb,
      point_y_sb,
      all_csc_val_idxs_sb,
      bucket_sum_x_sb,
      bucket_sum_y_sb,
      bucket_sum_z_sb,
      cpu_timer,
      context,
      profiler,
      // External buffers (point_x/y from cached_bases, all_csc_* from
      // persistent transpose, bucket_sum_* from persistent workspace)
      // are all stable across calls when both `context` and
      // `cached_bases` are present — that's the warm benchmark loop.
      // Tells smvp_batch_affine_gpu it can cache its bind groups.
      cached_bases !== undefined && context !== undefined,
      use_tree_reduce,
      fused_revcarry,
    );
    // Tree-reduce path may have replaced the encoder; re-bind so
    // subsequent BPR / readback operations target the active encoder.
    commandEncoder = commandEncoderRef.current;
  } else {
    const smvp_shader = shaderManager.gen_smvp_shader(s_workgroup_size, num_columns);

    // SMVP and multiplication by the bucket index.
    //
    // Per iter we dispatch the full pre-computed geometry
    // (s_num_x_workgroups, s_num_y_workgroups, s_num_z_workgroups), which
    // is sized for exactly `smvp_subtasks_per_iter * h` threads — one per
    // (subtask_idx ∈ [0, smvp_subtasks_per_iter), bucket_pair_idx ∈ [0, h)).
    // The shader recovers subtask_idx via `id / h` and offsets into the
    // global bucket array with `bi = id + subtask_offset * h`.
    for (let offset = 0; offset < num_subtasks; offset += smvp_subtasks_per_iter) {
      await smvp_gpu(
        smvp_shader,
        s_num_x_workgroups,
        s_num_y_workgroups,
        s_num_z_workgroups,
        offset,
        device,
        commandEncoder,
        num_subtasks,
        num_columns,
        input_size,
        chunk_size,
        all_csc_col_ptr_sb,
        point_x_sb,
        point_y_sb,
        all_csc_val_idxs_sb,
        bucket_sum_x_sb,
        bucket_sum_y_sb,
        bucket_sum_z_sb,
        false,
        profiler.stage(`smvp[offset=${offset}]`),
        cpu_timer,
        context,
        curveConfig.id,
        s_workgroup_size,
      );
    }
  }
  cpu_timer.phaseFrom('smvp_host_total', 'smvp_host_begin');

  if (debug_trace) {
    const bx = mkStaging(bucket_sum_x_sb.size);
    const by = mkStaging(bucket_sum_y_sb.size);
    const bz = mkStaging(bucket_sum_z_sb.size);
    copyToStaging(bucket_sum_x_sb, bx);
    copyToStaging(bucket_sum_y_sb, by);
    copyToStaging(bucket_sum_z_sb, bz);
    debug_stagings.smvp = { bucket_x: bx, bucket_y: by, bucket_z: bz };
  }

  /// This is a dynamic variable that determines the number of CSR
  /// matrices processed per invocation of the BPR shader. A safe default is 1.
  // BPR dispatches one workgroup per subtask in the X dimension. The
  // original code hard-coded 16 because the default BN254 pipeline uses
  // T=16 subtasks; the GLV path uses T=8, so we adapt to whatever
  // num_subtasks is.
  // Dispatch ALL subtasks at once, regardless of T. The previous
  // `Math.min(16, T)` policy was correct only for T ≤ 16 — at T > 16 it
  // forced a second outer iteration with subtask_idx=16 that dispatched
  // 16 workgroups for fewer remaining subtasks, writing past the end of
  // bucket_sum_/g_points_ buffers (multiplier=17..31 with only T=17
  // valid). Setting num_subtasks_per_bpr_1 = T eliminates the outer
  // loop's wraparound bug AND keeps the simpler one-iteration dispatch
  // that the warm-cached bind-group cache already assumes.
  const num_subtasks_per_bpr_1 = num_subtasks;
  // BPR_WINDOWS_PER_BATCH: each workgroup handles WPB consecutive
  // subtasks via an in-kernel const-bounded loop. WPB=1 = legacy
  // dispatch shape (X = num_subtasks). WPB > 1 trades thread count for
  // per-thread work — see bpr_bn254.template.wgsl stage_1 comment for
  // the register-pressure tradeoff. Override per call via the
  // bpr_inner_loop knob downstream if needed.
  const BPR_WINDOWS_PER_BATCH = 1;
  const b_num_x_workgroups = Math.ceil(num_subtasks_per_bpr_1 / BPR_WINDOWS_PER_BATCH);
  const b_workgroup_size = 256;

  // Output of the parallel bucket points reduction (BPR) shader
  const g_points_coord_bytelength = num_subtasks * b_workgroup_size * field_elem_bytes;
  const g_points_x_sb = acquire_msm_ws('g_points_x', g_points_coord_bytelength);
  const g_points_y_sb = acquire_msm_ws('g_points_y', g_points_coord_bytelength);
  const g_points_z_sb = acquire_msm_ws('g_points_z', g_points_coord_bytelength);

  // Bucket points reduction (BPR) - stage 1
  // When debug_trace is requested, compile the BPR shader with the
  // `capture_debug` Mustache flag enabled. This adds a 7th storage binding
  // (debug_capture: array<BigInt>) and stage_2 writes 8 intermediate
  // BigInts per thread to it. Both stage_1 and stage_2 pipelines must use
  // a bind group layout that includes this binding because they share the
  // shader source. Stage_1 just declares it (no writes).
  cpu_timer.mark('bpr_host_begin');
  // BPR stage_1 optimisation flags (mutually exclusive). Both require
  // batch-affine SMVP (non-identity buckets have Z = R). Default OFF
  // for safety; the user can flip individually after re-bench.
  //
  //   bpr_assume_affine: ~25 ms saved. Highest risk — the previous two
  //     attempts crashed Dawn/Tint, root cause not fully diagnosed.
  //     Algorithm CPU-validated (see bpr_assume_affine_sim.test.ts).
  //
  //   bpr_mixed_safe: ~8 ms saved. Conservative middle ground — uses
  //     add_points_mixed_no_collision for m only, keeps full safe
  //     add_points for g. Avoids the no_collision-on-g pattern that
  //     tripped the GPU previously. Recommended first attempt.
  // The two flags are derived from the caller's `bpr_inner_loop`
  // parameter. They were previously hard-coded `false`; routing them
  // through a single tri-state argument lets callers (e.g. the
  // roofline bench) flip between variants without touching this file.
  const bpr_assume_affine = bpr_inner_loop === 'assume_affine';
  const bpr_mixed_safe = bpr_inner_loop === 'mixed_safe';
  // `safe_first_add_no_collision`: replaces only the FIRST add (m += b)
  // in the legacy path with `add_points_no_collision` (general — same
  // function used by stage_2's double_and_add). For batch-affine SMVP
  // the buckets are different sums, so the collision case never fires.
  // The second add (g += m) keeps full add_points because iter-0 has a
  // genuine same-point case when b is identity.
  //
  // Default ON for the BN254 batch-affine path (cached_bases !== undef
  // — i.e. the warm bench path). Saves ~2-3 ms per call by skipping
  // the bigint_eq pair + the warp-divergent fallback. Disable by
  // setting `bpr_inner_loop` to anything else.
  const bpr_safe_first = use_batch_affine_smvp && curveConfig.id === 'bn254' && bpr_inner_loop === 'legacy';
  const bpr_shader = shaderManager.gen_bpr_shader(
    b_workgroup_size,
    /* capture_debug */ !!debug_trace,
    /* assume_affine_buckets */ bpr_assume_affine,
    /* mixed_safe_buckets */ bpr_mixed_safe,
    /* bench_flags */ bpr_bench_flags,
    /* safe_first_add_no_collision */ bpr_safe_first,
    /* windows_per_batch */ BPR_WINDOWS_PER_BATCH,
    /* packed */ packed,
  );
  // Compact key derived from the bench flags. Forwarded into the bpr_1
  // and bpr_2 pipeline cache keys so each variant compiles its own
  // pipeline. Without this, V0's cached pipeline would be returned for
  // V1's compile request and the bench-variant shader would never run.
  const bpr_bench_key =
    (bpr_bench_flags.bench_null ? 'n' : '') +
    (bpr_bench_flags.bench_compute_only ? 'c' : '') +
    (bpr_bench_flags.bench_memory_only ? 'm' : '') +
    (bpr_bench_flags.bench_no_store ? 's' : '') +
    (bpr_safe_first ? 'f' : '') +
    (packed ? 'P' : '');
  // 8 BigInts per thread × workgroup_size threads (subtask 0 only — the
  // diagnostic only inspects subtask 0). One BigInt = num_words u32s.
  const debug_capture_sb = debug_trace ? create_sb(device, b_workgroup_size * 8 * num_words * 4) : undefined;
  for (let subtask_idx = 0; subtask_idx < num_subtasks; subtask_idx += num_subtasks_per_bpr_1) {
    await bpr_1(
      bpr_shader,
      subtask_idx,
      b_num_x_workgroups,
      b_workgroup_size,
      num_columns,
      device,
      commandEncoder,
      bucket_sum_x_sb,
      bucket_sum_y_sb,
      bucket_sum_z_sb,
      g_points_x_sb,
      g_points_y_sb,
      g_points_z_sb,
      false,
      profiler.stage(`bpr_1[subtask=${subtask_idx}]`),
      debug_capture_sb,
      cpu_timer,
      context,
      curveConfig.id,
      bpr_assume_affine,
      bpr_mixed_safe,
      bpr_bench_key,
      input_size,
      num_subtasks,
      BPR_WINDOWS_PER_BATCH,
    );
  }

  if (debug_trace) {
    const bx = mkStaging(bucket_sum_x_sb.size);
    const by = mkStaging(bucket_sum_y_sb.size);
    const bz = mkStaging(bucket_sum_z_sb.size);
    const gx = mkStaging(g_points_x_sb.size);
    const gy = mkStaging(g_points_y_sb.size);
    const gz = mkStaging(g_points_z_sb.size);
    copyToStaging(bucket_sum_x_sb, bx);
    copyToStaging(bucket_sum_y_sb, by);
    copyToStaging(bucket_sum_z_sb, bz);
    copyToStaging(g_points_x_sb, gx);
    copyToStaging(g_points_y_sb, gy);
    copyToStaging(g_points_z_sb, gz);
    debug_stagings.bpr1 = {
      bucket_x: bx,
      bucket_y: by,
      bucket_z: bz,
      g_x: gx,
      g_y: gy,
      g_z: gz,
    };
  }

  // Bucket points reduction (BPR) - stage 2
  // Same as bpr_1: dispatch all T subtasks in one outer iter.
  const num_subtasks_per_bpr_2 = num_subtasks;
  const b_2_num_x_workgroups = Math.ceil(num_subtasks_per_bpr_2 / BPR_WINDOWS_PER_BATCH);
  for (let subtask_idx = 0; subtask_idx < num_subtasks; subtask_idx += num_subtasks_per_bpr_2) {
    await bpr_2(
      bpr_shader,
      subtask_idx,
      b_2_num_x_workgroups,
      b_workgroup_size,
      num_columns,
      device,
      commandEncoder,
      bucket_sum_x_sb,
      bucket_sum_y_sb,
      bucket_sum_z_sb,
      g_points_x_sb,
      g_points_y_sb,
      g_points_z_sb,
      false,
      profiler.stage(`bpr_2[subtask=${subtask_idx}]`),
      debug_capture_sb,
      cpu_timer,
      context,
      curveConfig.id,
      bpr_assume_affine,
      bpr_mixed_safe,
      bpr_bench_key,
      input_size,
      num_subtasks,
      BPR_WINDOWS_PER_BATCH,
    );
  }
  cpu_timer.phaseFrom('bpr_host_total', 'bpr_host_begin');

  // GPU-side Horner reduction. When enabled, replaces the post-BPR CPU
  // path that reads back T*b_workgroup_size partial sums (~400 KB) and
  // does the subtask-reduce + Horner chain in JS (~32 ms total). The
  // GPU kernel does both phases in a single workgroup of T threads;
  // CPU readback shrinks to 3 BigInts (~240 bytes), and cpu_horner_total
  // collapses to ~5 ms (just Mont→affine + final inversion).
  //
  // SAFETY: default OFF. The kernel is structurally simple (one
  // workgroup, no atomics, no exotic branching, only safe add_points)
  // but flipping the flag is the user's call.
  const gpu_horner_enabled = true;
  let gpu_horner_sums_x_sb: GPUBuffer | undefined;
  let gpu_horner_sums_y_sb: GPUBuffer | undefined;
  let gpu_horner_sums_z_sb: GPUBuffer | undefined;
  if (gpu_horner_enabled && curveConfig.id === 'bn254') {
    // Combined scratch+result buffer: (T+1) BigInts per coordinate.
    // Slots 0..T-1 hold per-subtask partial sums (subtask_reduce writes,
    // horner_chain reads). Slot T holds the final Horner result
    // (horner_chain writes, CPU reads).
    //
    // Packing scratch and result into the same buffer keeps the shader
    // at 6 storage bindings, well under the 8-per-stage WebGPU baseline.
    // Three separate buffers (one per coordinate) instead of one combined
    // because BigInt array indexing in WGSL requires homogeneous element
    // type and the existing add_points API operates on BigInt fields.
    const sums_buf_size = (num_subtasks + 1) * field_elem_bytes;
    gpu_horner_sums_x_sb = acquire_msm_ws('gpu_horner_x', sums_buf_size);
    gpu_horner_sums_y_sb = acquire_msm_ws('gpu_horner_y', sums_buf_size);
    gpu_horner_sums_z_sb = acquire_msm_ws('gpu_horner_z', sums_buf_size);

    const horner_shader = shaderManager.gen_horner_reduce_shader(num_subtasks, b_workgroup_size, chunk_size, packed);

    // Both entry points share the same WGSL source + bind group layout.
    const horner_layout: Array<'storage' | 'read-only-storage' | 'uniform'> = [
      'read-only-storage', // 0 g_points_x
      'read-only-storage', // 1 g_points_y
      'read-only-storage', // 2 g_points_z
      'storage', // 3 sums_x  (T scratch + 1 result slot)
      'storage', // 4 sums_y
      'storage', // 5 sums_z
    ];
    const subtask_reduce_pipe = await compile_pipeline_cached(
      device,
      horner_layout,
      horner_shader,
      'subtask_reduce',
      context,
      `bn254:subtask_reduce:v2-packed:T=${num_subtasks}:bwg=${b_workgroup_size}:${packed ? 'pk' : 'bi'}`,
    );
    // horner_chain pipeline used to be compiled here but it's never
    // dispatched (CPU walks the Horner chain — the serial 240-doubling
    // chain is single-warp-bound on the GPU at ~14 ms but cheap on CPU
    // at ~250 µs). Skipping the compile saves first-run cost.
    // Cache horner bind group: all buffers are persistent on the warm
    // path (g_points_* and gpu_horner_sums_* both come from
    // acquire_msm_ws above). Local non-undefined refs satisfy TS's
    // narrow-after-conditional flow (the outer `if (gpu_horner_enabled
    // && curve === bn254)` already ensures these are defined).
    const horner_x = gpu_horner_sums_x_sb!;
    const horner_y = gpu_horner_sums_y_sb!;
    const horner_z = gpu_horner_sums_z_sb!;
    const horner_bg_key = `${ws_key}:horner_bg:T=${num_subtasks}`;
    const horner_bg =
      context !== undefined
        ? context.getOrCreatePersistentBindGroup(horner_bg_key, () =>
            create_bind_group(device, subtask_reduce_pipe.bindGroupLayout, [
              g_points_x_sb,
              g_points_y_sb,
              g_points_z_sb,
              horner_x,
              horner_y,
              horner_z,
            ]),
          )
        : create_bind_group(device, subtask_reduce_pipe.bindGroupLayout, [
            g_points_x_sb,
            g_points_y_sb,
            g_points_z_sb,
            horner_x,
            horner_y,
            horner_z,
          ]);

    // Phase A: T workgroups in parallel, each reduces its subtask's slice.
    await execute_pipeline(
      commandEncoder,
      subtask_reduce_pipe.pipeline,
      horner_bg,
      num_subtasks,
      1,
      1,
      profiler.stage('subtask_reduce'),
    );
    // Phase B (Horner chain) runs on CPU instead of GPU. The serial
    // 240-doubling chain is inherently single-warp-bound on the GPU
    // (~14 ms even with parallel scaling tricks), but cheap on CPU
    // (~250 µs). Readback already drains the pipeline regardless of
    // payload size; pulling T BigInts (~3 KB) instead of 1 (~80 B)
    // costs no measurable extra wait at this scale.
  }

  if (debug_trace && debug_capture_sb) {
    const gx = mkStaging(g_points_x_sb.size);
    const gy = mkStaging(g_points_y_sb.size);
    const gz = mkStaging(g_points_z_sb.size);
    copyToStaging(g_points_x_sb, gx);
    copyToStaging(g_points_y_sb, gy);
    copyToStaging(g_points_z_sb, gz);
    const dbg = mkStaging(debug_capture_sb.size);
    copyToStaging(debug_capture_sb, dbg);
    debug_stagings.bpr2 = { g_x: gx, g_y: gy, g_z: gz, debug_capture: dbg };
  }

  // Resolve profiling queries before the encoder is finished inside
  // read_from_gpu. Safe to call unconditionally — no-ops when timestamps
  // are unavailable.
  profiler.resolve(commandEncoder);

  // Map results back from GPU. When gpu_horner_enabled, read just the
  // 3 BigInts of the final Jacobian sum (~240 bytes); otherwise read
  // the full T*b_workgroup_size partial-sum buffers (~400 KB).
  // For gpu_horner: read T subtask sums (~3 KB) — CPU walks the
  // 15-segment Horner chain, which is single-warp-bound on GPU
  // (~14 ms) but cheap on CPU (~250 µs). The pipeline drain
  // dominates either way, so the extra 3 KB payload is free.
  cpu_timer.mark('readback_begin');
  const data =
    gpu_horner_enabled && curveConfig.id === 'bn254'
      ? await read_from_gpu(
          device,
          commandEncoder,
          [gpu_horner_sums_x_sb!, gpu_horner_sums_y_sb!, gpu_horner_sums_z_sb!],
          /* custom_size */ num_subtasks * num_words * 4,
          /* source_offset */ 0,
          /* dest_offset */ 0,
          cpu_timer,
        )
      : await read_from_gpu(
          device,
          commandEncoder,
          [g_points_x_sb, g_points_y_sb, g_points_z_sb],
          /* custom_size */ 0,
          /* source_offset */ 0,
          /* dest_offset */ 0,
          cpu_timer,
        );
  cpu_timer.phaseFrom('readback_total', 'readback_begin');

  // Read profiling timings and log a per-stage breakdown before we destroy
  // the device. Must run after submit() inside read_from_gpu but before
  // device.destroy() invalidates the readback buffer.
  const profile = await profiler.report();
  // Sum the per-pass ms regardless of log_result — both the console
  // dump (gated below) and the structured profile_capture downstream
  // need this value to compute the readback breakdown. Region entries
  // (e.g. `encoder_all`) are excluded: they overlap and would
  // double-count their inner stages.
  let gpu_profiled_total_ms: number | undefined;
  if (profile) {
    gpu_profiled_total_ms = profile.reduce((acc, e) => acc + (e.kind === 'region' ? 0 : e.ms), 0);
  }
  if (profile && log_result) {
    log_profile_report(profile, curveConfig.id, input_size);
  }
  if (profile_capture !== undefined) {
    profile_capture.profile = profile;
  }
  // Release the QuerySet + readback buffers. Without this, repeated
  // MSM calls exhaust Metal's counter-sample-buffer pool after ~50
  // invocations, making the next pass silently no-op (1-2 ms wall).
  profiler.destroy();

  // Decode intermediate debug-trace staging buffers (if requested) before
  // we destroy the device and invalidate them.
  if (debug_trace) {
    const mapAll = async (buf: GPUBuffer): Promise<Uint8Array> => {
      await buf.mapAsync(GPUMapMode.READ, 0, buf.size);
      const out = new Uint8Array(buf.getMappedRange(0, buf.size).slice(0));
      buf.unmap();
      return out;
    };
    if (debug_stagings.convert) {
      debug_trace.convert = {
        point_x_mont: await mapAll(debug_stagings.convert.point_x),
        point_y_mont: await mapAll(debug_stagings.convert.point_y),
      };
    }
    if (debug_stagings.smvp) {
      debug_trace.smvp = {
        bucket_x_mont: await mapAll(debug_stagings.smvp.bucket_x),
        bucket_y_mont: await mapAll(debug_stagings.smvp.bucket_y),
        bucket_z_mont: await mapAll(debug_stagings.smvp.bucket_z),
      };
    }
    if (debug_stagings.bpr1) {
      debug_trace.bpr1 = {
        bucket_x_mont: await mapAll(debug_stagings.bpr1.bucket_x),
        bucket_y_mont: await mapAll(debug_stagings.bpr1.bucket_y),
        bucket_z_mont: await mapAll(debug_stagings.bpr1.bucket_z),
        g_points_x_mont: await mapAll(debug_stagings.bpr1.g_x),
        g_points_y_mont: await mapAll(debug_stagings.bpr1.g_y),
        g_points_z_mont: await mapAll(debug_stagings.bpr1.g_z),
      };
    }
    if (debug_stagings.bpr2) {
      debug_trace.bpr2 = {
        g_points_x_mont: await mapAll(debug_stagings.bpr2.g_x),
        g_points_y_mont: await mapAll(debug_stagings.bpr2.g_y),
        g_points_z_mont: await mapAll(debug_stagings.bpr2.g_z),
      };
      if (debug_stagings.bpr2.debug_capture) {
        debug_trace.bpr2.debug_capture = await mapAll(debug_stagings.bpr2.debug_capture);
      }
    }
    debug_trace.params = {
      input_size,
      chunk_size,
      num_columns,
      num_subtasks,
      num_words,
      word_size: curveConfig.wordSize,
      bpr_workgroup_size: b_workgroup_size,
    };
  }

  // Destroy the GPU device object — only when we own it. If the caller
  // supplied a persistent context, they own the lifecycle; destroying
  // here would invalidate their cached pipelines and buffers.
  if (context === undefined) {
    device.destroy();
  }

  cpu_timer.mark('cpu_horner_begin');
  // On the packed path the GPU g_points buffers are 32-byte packed
  // 8×u32 little-endian (one 256-bit field value per element), not the
  // num_words 13-bit-limb BigInt layout. Decode accordingly.
  const decode_field_coords = (buf: Uint8Array): bigint[] => {
    if (!packed) {
      return u8s_to_bigints_without_assertion(buf, num_words, curveConfig.wordSize);
    }
    const count = Math.floor(buf.length / 32);
    const out = new Array<bigint>(count);
    for (let e = 0; e < count; e++) {
      let v = 0n;
      for (let b = 31; b >= 0; b--) v = (v << 8n) | BigInt(buf[e * 32 + b]);
      out[e] = v;
    }
    return out;
  };
  const g_points_x_mont_coords = decode_field_coords(data[0]);
  const g_points_y_mont_coords = decode_field_coords(data[1]);
  const g_points_z_mont_coords = decode_field_coords(data[2]);

  let r: { x: bigint; y: bigint };

  if (curveConfig.id === 'bn254') {
    const q = curveConfig.baseFieldModulus;
    let resultJ: Bn254Jacobian;

    if (gpu_horner_enabled) {
      // GPU did the subtask-reduce; CPU walks the Horner chain.
      // data[0..2] hold T subtask sums in Montgomery form.
      const subtask_sums: Bn254Jacobian[] = [];
      for (let i = 0; i < num_subtasks; i++) {
        subtask_sums.push({
          x: (g_points_x_mont_coords[i] * rinv) % q,
          y: (g_points_y_mont_coords[i] * rinv) % q,
          z: (g_points_z_mont_coords[i] * rinv) % q,
        });
      }
      // Horner: result = s[T-1]; for j=T-2..0: result = result*2^cs + s[j].
      resultJ = subtask_sums[subtask_sums.length - 1];
      for (let i = subtask_sums.length - 2; i >= 0; i--) {
        for (let b = 0; b < chunk_size; b++) {
          resultJ = doubleBn254Jacobian(resultJ);
        }
        resultJ = addBn254Jacobian(resultJ, subtask_sums[i]);
      }
    } else {
      // BN254 CPU Horner — run the entire subtask-reduce + Horner chain
      // in Jacobian coordinates, with a SINGLE final modular inversion
      // instead of ~8000 per MSM.
      const subtask_sums: Bn254Jacobian[] = [];
      for (let i = 0; i < num_subtasks; i++) {
        let acc: Bn254Jacobian = BN254_JACOBIAN_ZERO;
        for (let j = 0; j < b_workgroup_size; j++) {
          const idx = i * b_workgroup_size + j;
          const jp: Bn254Jacobian = {
            x: (g_points_x_mont_coords[idx] * rinv) % q,
            y: (g_points_y_mont_coords[idx] * rinv) % q,
            z: (g_points_z_mont_coords[idx] * rinv) % q,
          };
          acc = addBn254Jacobian(acc, jp);
        }
        subtask_sums.push(acc);
      }

      // Horner: result = G[T-1], then result = result * 2^s + G[j] for j = T-2 .. 0.
      resultJ = subtask_sums[subtask_sums.length - 1];
      for (let i = subtask_sums.length - 2; i >= 0; i--) {
        for (let b = 0; b < chunk_size; b++) {
          resultJ = doubleBn254Jacobian(resultJ);
        }
        resultJ = addBn254Jacobian(resultJ, subtask_sums[i]);
      }
    }

    const finalAffine = toAffineBn254Jacobian(resultJ);
    r = { x: finalAffine.x, y: finalAffine.y };
    // Silence unused-import warnings.
    void createBn254AffinePointFromJacobian;
    void scalarMultBn254Jacobian;
  } else {
    // BLS12-377 path — projective coordinates, preserves the original
    // affine-add-per-thread structure. Not on the hot prover path for
    // this branch, so no refactor yet.
    const points: CpuPoint[] = [];
    const toAffine = (x: bigint, y: bigint, z: bigint) => curveConfig.createAffinePoint(x, y, z);

    for (let i = 0; i < num_subtasks; i++) {
      let point = curveConfig.zero;
      for (let j = 0; j < b_workgroup_size; j++) {
        const reduced_point = toAffine(
          (g_points_x_mont_coords[i * b_workgroup_size + j] * rinv) % curveConfig.baseFieldModulus,
          (g_points_y_mont_coords[i * b_workgroup_size + j] * rinv) % curveConfig.baseFieldModulus,
          (g_points_z_mont_coords[i * b_workgroup_size + j] * rinv) % curveConfig.baseFieldModulus,
        );
        point = curveConfig.addPoints(point, reduced_point);
      }
      points.push(point);
    }

    const m = BigInt(2) ** BigInt(chunk_size);
    let result = points[points.length - 1];
    for (let i = points.length - 2; i >= 0; i--) {
      result = curveConfig.scalarMult(result, m);
      result = curveConfig.addPoints(result, points[i]);
    }
    r = curveConfig.getBigIntXY(curveConfig.toAffine(result));
  }
  cpu_timer.phaseFrom('cpu_horner_total', 'cpu_horner_begin');

  // Capture CPU phases + GPU readback decomposition for programmatic
  // consumers. Done unconditionally (cheap — small object copies) so
  // the UI can render structured tables without paying the console-log
  // toll. The console report itself is gated on log_result below.
  const cpu_report_for_capture = cpu_timer.report();
  if (profile_capture !== undefined) {
    profile_capture.cpu_phases = {
      phases: cpu_report_for_capture.phases.slice().sort((a, b) => b.ms - a.ms),
      total_wall_ms: cpu_report_for_capture.total_wall_ms,
    };
    const findPhase = (label: string): number | undefined =>
      cpu_report_for_capture.phases.find(p => p.label === label)?.ms;
    const gpu_compute_wall = findPhase('gpu_compute_wall');
    if (gpu_compute_wall !== undefined && gpu_profiled_total_ms !== undefined) {
      profile_capture.gpu_readback = {
        gpu_compute_wall,
        profiled_passes_sum: gpu_profiled_total_ms,
        untimestamped: Math.max(0, gpu_compute_wall - gpu_profiled_total_ms),
        mapasync_overhead: findPhase('mapasync_overhead'),
        readback_total: findPhase('readback_total'),
      };
    }
  }

  if (log_result) {
    log_cpu_phase_report(cpu_report_for_capture, curveConfig.id, input_size, gpu_profiled_total_ms);
    console.log(r);
  }

  return r;
};

// Print CPU-side per-phase timing report alongside the GPU timestamp
// breakdown. Sorted by descending duration so the dominant phase jumps
// out, with % of wall time per phase.
//
// `gpu_profiled_total_ms` (when provided) is the sum of every
// profiler.stage() / profiler.bracket() pair the encoder produced.
// With it we can compute and label `gpu_untimestamped` =
// `gpu_compute_wall − gpu_profiled_total`, the residual slice of GPU
// work that wasn't captured by an individual timestamp pair. Every
// known kernel and `clearBuffer` is now timestamped, so this row only
// captures (a) the trailing `profiler.resolve()` (resolveQuerySet +
// 12.8 KB copyBufferToBuffer) and `read_from_gpu`'s staging copies
// that run after the last bracket, plus (b) Dawn/driver inter-pass
// overhead that is invisible to WebGPU timestamps.
const log_cpu_phase_report = (
  report: { phases: { label: string; ms: number }[]; total_wall_ms: number },
  curveId: string,
  input_size: number,
  gpu_profiled_total_ms?: number,
): void => {
  console.log(`[cpu-phases] curve=${curveId} N=${input_size}`);
  // Pull out the OSWD-derived diagnostic phases so we can present them
  // in a structured way alongside the rest.
  const findPhase = (label: string): number | undefined => report.phases.find(p => p.label === label)?.ms;
  const gpu_compute_wall = findPhase('gpu_compute_wall');
  const mapasync_overhead = findPhase('mapasync_overhead');
  const readback_total = findPhase('readback_total');

  const sorted = report.phases.slice().sort((a, b) => b.ms - a.ms);
  const wall = report.total_wall_ms;
  let accounted = 0;
  for (const { label, ms } of sorted) {
    const pct = wall > 0 ? (100 * ms) / wall : 0;
    console.log(`  ${label.padEnd(24)} ${ms.toFixed(2).padStart(7)} ms  ${pct.toFixed(1).padStart(5)}%`);
    accounted += ms;
  }
  console.log(`  ${'wall (total)'.padEnd(24)} ${wall.toFixed(2).padStart(7)} ms`);
  console.log(`  ${'accounted'.padEnd(24)} ${accounted.toFixed(2).padStart(7)} ms (phases may overlap / nest)`);

  // GPU time decomposition: only printable when we got a ground-truth
  // gpu_compute_wall from `device.queue.onSubmittedWorkDone()` and a
  // sum of profiled passes from the GPU profile report.
  if (gpu_compute_wall !== undefined && gpu_profiled_total_ms !== undefined) {
    const untimestamped = Math.max(0, gpu_compute_wall - gpu_profiled_total_ms);
    console.log('[gpu-readback-decomposition]');
    console.log(
      `  ${'gpu_compute_wall'.padEnd(28)} ${gpu_compute_wall.toFixed(2).padStart(7)} ms  (ground truth: submit -> onSubmittedWorkDone)`,
    );
    console.log(
      `  ${'  profiled passes (sum)'.padEnd(28)} ${gpu_profiled_total_ms.toFixed(2).padStart(7)} ms  (sum of every profiler.stage())`,
    );
    console.log(
      `  ${'  untimestamped'.padEnd(28)} ${untimestamped.toFixed(2).padStart(7)} ms  (post-bracket resolve + readback copies + driver barriers)`,
    );
    if (mapasync_overhead !== undefined) {
      console.log(
        `  ${'mapasync_overhead'.padEnd(28)} ${mapasync_overhead.toFixed(2).padStart(7)} ms  (DMA + Chrome event-loop polling)`,
      );
    }
    if (readback_total !== undefined) {
      console.log(
        `  ${'readback_total'.padEnd(28)} ${readback_total.toFixed(2).padStart(7)} ms  (= gpu_compute_wall + mapasync_overhead + ~staging alloc)`,
      );
    }
  }
};

// Stage families that may be partially sampled inside batch_affine.ts —
// when their `count` < MAX_ROUNDS the sum is NOT representative of total
// round cost. The profiling budget per family lives in batch_affine.ts
// (PROFILE_*_ROUNDS); we annotate any row whose count is less than what
// it ought to be so the reader doesn't misinterpret the sum as a total.
const SAMPLED_FAMILY_BUDGETS: Record<string, number> = {
  ba_schedule: PROFILE_SCHEDULE_ROUNDS,
  ba_inverse: PROFILE_INVERSE_ROUNDS,
  ba_apply: PROFILE_APPLY_ROUNDS,
};

// Group per-pass timings by stage family (everything before the first `[`)
// and print a compact, sorted-by-cost breakdown with % of total. The
// dominant family appears first so picking the next optimization target
// is a one-glance read.
//
// Returns the sum of all profiled-pass durations so the caller can pass
// it into log_cpu_phase_report for the gpu_compute_wall decomposition.
const log_profile_report = (
  entries: { label: string; ms: number; kind: ProfileEntryKind }[],
  curveId: string,
  input_size: number,
): number => {
  const groups = new Map<string, { count: number; sum: number }>();
  const regions: { label: string; ms: number }[] = [];
  let total = 0;
  for (const e of entries) {
    if (e.kind === 'region') {
      regions.push({ label: e.label, ms: e.ms });
      continue;
    }
    const family = e.label.split('[', 1)[0];
    const g = groups.get(family) ?? { count: 0, sum: 0 };
    g.count += 1;
    g.sum += e.ms;
    groups.set(family, g);
    total += e.ms;
  }
  const rows = Array.from(groups.entries())
    .map(([family, { count, sum }]) => ({ family, count, sum }))
    .sort((a, b) => b.sum - a.sum);
  console.log(`[gpu-profile] curve=${curveId} N=${input_size}`);
  for (const { family, count, sum } of rows) {
    const countStr = count > 1 ? `x${count}` : '';
    const pct = total > 0 ? (100 * sum) / total : 0;
    const budget = SAMPLED_FAMILY_BUDGETS[family];
    const sampled = budget !== undefined ? ` (sampled, first ${budget} rounds)` : '';
    console.log(
      `  ${family.padEnd(18)} ${countStr.padEnd(4)} ${sum.toFixed(2).padStart(7)} ms  ${pct.toFixed(1).padStart(5)}%${sampled}`,
    );
  }
  console.log(`  ${'total (passes)'.padEnd(23)} ${total.toFixed(2).padStart(7)} ms`);
  for (const { label, ms } of regions) {
    const innerSum = total > 0 ? (100 * ms) / total : 0;
    console.log(
      `  ${('[region] ' + label).padEnd(23)} ${ms.toFixed(2).padStart(7)} ms  (overlaps inner stages; inner_sum/region = ${innerSum.toFixed(1)}%)`,
    );
  }
  return total;
};

export const calculate_workgoups = async (input_size: number) => {
  let c_workgroup_size = 256;
  let c_num_x_workgroups = 1;
  let c_num_y_workgroups = input_size / c_workgroup_size / c_num_x_workgroups;

  if (input_size <= 256) {
    c_workgroup_size = input_size;
    c_num_x_workgroups = 1;
    c_num_y_workgroups = 1;
  } else if (input_size > 256 && input_size <= 32768) {
    c_workgroup_size = 64;
    c_num_x_workgroups = 4;
    c_num_y_workgroups = input_size / c_workgroup_size / c_num_x_workgroups;
  } else if (input_size > 32768 && input_size <= 65536) {
    c_workgroup_size = 256;
    c_num_x_workgroups = 8;
    c_num_y_workgroups = input_size / c_workgroup_size / c_num_x_workgroups;
  } else if (input_size > 65536 && input_size <= 131072) {
    c_workgroup_size = 256;
    c_num_x_workgroups = 8;
    c_num_y_workgroups = input_size / c_workgroup_size / c_num_x_workgroups;
  } else if (input_size > 131072 && input_size <= 262144) {
    c_workgroup_size = 256;
    c_num_x_workgroups = 32;
    c_num_y_workgroups = input_size / c_workgroup_size / c_num_x_workgroups;
  } else if (input_size > 262144 && input_size <= 524288) {
    c_workgroup_size = 256;
    c_num_x_workgroups = 32;
    c_num_y_workgroups = input_size / c_workgroup_size / c_num_x_workgroups;
  } else if (input_size > 524288 && input_size <= 1048576) {
    c_workgroup_size = 256;
    c_num_x_workgroups = 32;
    c_num_y_workgroups = input_size / c_workgroup_size / c_num_x_workgroups;
  }

  return { c_workgroup_size, c_num_x_workgroups, c_num_y_workgroups };
};

/*
 * Convert the affine points to Montgomery form, and decompose scalars into
 * chunk_size windows using the signed bucket index technique.

 * ASSUMPTION: the vast majority of WebGPU-enabled consumer devices have a
 * maximum buffer size of at least 268435456 bytes.
 * 
 * The default maximum buffer size is 268435456 bytes. Since each point
 * consumes 320 bytes, a maximum of around 2 ** 19 points can be stored in a
 * single buffer. If, however, we use 2 buffers - one for each point coordinate
 * X and Y - we can support larger input sizes.
 * Our implementation, however, will only support up to 2 ** 20 points as that
 * is the maximum input size for the ZPrize competition.
 *
 * Furthremore, there is a limit of 8 storage buffers per shader. As such, we
 * do not calculate the T and Z coordinates in this shader. Rather, we do so in
 * the SMVP shader.
 * 
 * Note that The test harness readme at
 * https://github.com/demox-labs/webgpu-msm states: "The submission should
 * produce correct outputs on input vectors with length up to 2^20. The
 * evaluation will be using input randomly sampled from size 2^16 ~ 2^20."
 */
export const convert_point_coords_and_decompose_shaders = async (
  shaderCode: string,
  num_x_workgroups: number,
  num_y_workgroups: number,
  device: GPUDevice,
  commandEncoder: GPUCommandEncoder,
  points_buffer: Buffer,
  num_words: number,
  word_size: number,
  scalars_buffer: Buffer,
  num_subtasks: number,
  chunk_size: number,
  curveConfig = BN254_CURVE_CONFIG,
  curveParams = params,
  debug = false,
  timestampWrites?: GPUComputePassTimestampWrites,
  cpu_timer?: CpuTimer,
  context?: GpuContext,
  scalar_byte_length_override?: number,
  // When true, the point_x/point_y output buffers are stored PACKED as
  // 8×u32 (32 bytes/element) instead of the num_words-limb BigInt layout.
  // The supplied `shaderCode` MUST have been generated with the matching
  // `packed` flag so its store_packed writes agree with this sizing.
  packed = false,
) => {
  const r = curveParams.r;
  // GLV path passes a 128-bit override; the assertion only holds for the
  // default-curve path.
  if (scalar_byte_length_override === undefined) {
    assert(num_subtasks * chunk_size === curveConfig.scalarBitLength);
  }
  const effective_scalar_byte_length = scalar_byte_length_override ?? curveConfig.scalarByteLength;
  const input_size = scalars_buffer.length / effective_scalar_byte_length;

  assert(points_buffer.length === input_size * curveConfig.coordinateByteLength * 2);

  // The X and Y coordiantes are arranged in points_buffer as
  // [x, y, x, y, ...], with each coordinate using coordinateByteLength bytes.

  cpu_timer?.mark('split_begin');
  const half_length = points_buffer.length / 2;
  const first_half_bytes = points_buffer.slice(0, half_length);
  const second_half_bytes = points_buffer.slice(half_length, points_buffer.length);
  cpu_timer?.phaseFrom('split_host_copy', 'split_begin');

  // Input buffers
  cpu_timer?.mark('upload_begin');
  const first_half_coords_sb = create_and_write_sb(device, first_half_bytes);
  const second_half_coords_sb = create_and_write_sb(device, second_half_bytes);
  const scalars_sb = create_and_write_sb(device, scalars_buffer);
  cpu_timer?.phaseFrom('upload_inputs', 'upload_begin');

  // Output buffers. Packed field elements are two vec4<u32> = 32 bytes;
  // the BigInt-layout baseline is num_words 32-bit limbs.
  const field_elem_bytes = packed ? 32 : num_words * 4;
  const point_x_sb = create_sb(device, input_size * field_elem_bytes);
  const point_y_sb = create_sb(device, input_size * field_elem_bytes);
  const scalar_chunks_sb = create_sb(device, input_size * num_subtasks * 4);

  // Uniform param buffer
  const params_bytes = numbers_to_u8s_for_gpu([input_size]);
  const params_ub = create_and_write_ub(device, params_bytes);

  cpu_timer?.mark('compile_begin');
  const { pipeline: computePipeline, bindGroupLayout } = await compile_pipeline_cached(
    device,
    ['read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage', 'storage', 'uniform'],
    shaderCode,
    'main',
    context,
    `${curveConfig.id}:convert:${num_x_workgroups}:${num_y_workgroups}:${chunk_size}:${input_size}:${num_subtasks}:sbl${effective_scalar_byte_length}:${packed ? 'pk' : 'bi'}`,
  );
  cpu_timer?.phaseFrom('compile_convert_shader', 'compile_begin');

  const bindGroup = create_bind_group(device, bindGroupLayout, [
    first_half_coords_sb,
    second_half_coords_sb,
    scalars_sb,
    point_x_sb,
    point_y_sb,
    scalar_chunks_sb,
    params_ub,
  ]);

  execute_pipeline(commandEncoder, computePipeline, bindGroup, num_x_workgroups, num_y_workgroups, 1, timestampWrites);

  // Debug the output of the shader. This should **not** be run in
  // production.
  if (debug) {
    const data = await read_from_gpu(device, commandEncoder, [point_x_sb, point_y_sb, scalar_chunks_sb]);

    // Verify point coords
    const computed_x_coords = u8s_to_bigints(data[0], num_words, word_size);
    const computed_y_coords = u8s_to_bigints(data[1], num_words, word_size);

    const x_coords: bigint[] = [];
    const y_coords: bigint[] = [];

    const all_coords = readBigIntsFromBufferLE(points_buffer, curveConfig.coordinateBitLength);
    for (let i = 0; i < input_size; i++) {
      x_coords.push(all_coords[i * 2]);
      y_coords.push(all_coords[i * 2 + 1]);
    }

    for (let i = 0; i < input_size; i++) {
      const expected_x = (x_coords[i] * r) % curveConfig.baseFieldModulus;
      const expected_y = (y_coords[i] * r) % curveConfig.baseFieldModulus;

      if (!(expected_x === computed_x_coords[i] && expected_y === computed_y_coords[i])) {
        throw Error(`point coord mismatch at ${i}`);
      }
    }

    // Verify scalar chunks
    const computed_chunks = u8s_to_numbers(data[2]);

    const scalars = readBigIntsFromBufferLE(scalars_buffer, curveConfig.scalarBitLength);

    const expected = decompose_scalars_signed(scalars, num_subtasks, chunk_size);

    for (let j = 0; j < expected.length; j++) {
      let z = 0;
      for (let i = j * input_size; i < (j + 1) * input_size; i++) {
        if (computed_chunks[i] !== expected[j][z]) {
          throw Error(`scalar decomp mismatch at ${i}`);
        }
        z++;
      }
    }
  }

  return { point_x_sb, point_y_sb, scalar_chunks_sb };
};

/**
 * Warm-path Stage-1 replacement: decompose scalars only, skipping the
 * point-side Barrett + Montgomery conversion entirely. Called by
 * `compute_curve_msm` when a `CachedBases` is supplied.
 *
 * The output `scalar_chunks_sb` is bit-identical to what the full
 * convert shader would have produced for the same scalars, so the
 * downstream transpose/SMVP/BPR stages are untouched.
 */
const decompose_scalars_only_gpu = async (
  shaderManager: ShaderManager,
  workgroup_size: number,
  num_x_workgroups: number,
  num_y_workgroups: number,
  device: GPUDevice,
  commandEncoder: GPUCommandEncoder,
  scalars_buffer: Buffer,
  num_subtasks: number,
  num_columns: number,
  input_size: number,
  curveConfig: CurveConfig,
  timestampWrites?: GPUComputePassTimestampWrites,
  cpu_timer?: CpuTimer,
  context?: GpuContext,
  // When provided, this kernel additionally atomicAdds the per-input
  // chunk indices into `count_col_ptr_sb`, eliminating the separate
  // transpose_count dispatch. Caller MUST zero `count_col_ptr_sb`
  // before this kernel runs (the orchestrator handles that via
  // commandEncoder.clearBuffer). Saves ~3 ms at N=2^16 by avoiding
  // a full pass over scalar_chunks_sb.
  count_col_ptr_sb?: GPUBuffer,
): Promise<GPUBuffer> => {
  const fuse_count = count_col_ptr_sb !== undefined;
  const shaderCode = shaderManager.gen_decompose_scalars_signed_only_shader(
    workgroup_size,
    num_y_workgroups,
    num_subtasks,
    num_columns,
    undefined,
    undefined,
    fuse_count,
  );

  // Scalar upload: contents change every call (different scalars), but
  // the buffer size is constant. Cache the buffer object on the context
  // and re-upload only the contents per call. Saves the per-call
  // device.createBuffer / GC churn on the ~2 MB scalar buffer at N=2^16.
  cpu_timer?.mark('upload_scalars_begin');
  const decomp_key = `${curveConfig.id}:decomp:${num_subtasks}:${num_columns}:${input_size}`;
  let scalars_sb: GPUBuffer;
  if (context !== undefined) {
    scalars_sb = context.acquirePersistentBuffer(`${decomp_key}:scalars`, scalars_buffer.length);
    device.queue.writeBuffer(scalars_sb, 0, scalars_buffer as unknown as BufferSource);
  } else {
    scalars_sb = create_and_write_sb(device, scalars_buffer);
  }
  cpu_timer?.phaseFrom('upload_scalars', 'upload_scalars_begin');

  // Output buffer: fully written by the kernel, no clear needed. Cache
  // when context provided.
  const scalar_chunks_sb =
    context !== undefined
      ? context.acquirePersistentBuffer(`${decomp_key}:scalar_chunks`, input_size * num_subtasks * 4)
      : create_sb(device, input_size * num_subtasks * 4);

  const params_bytes = numbers_to_u8s_for_gpu([input_size]);
  let params_ub: GPUBuffer;
  if (context !== undefined) {
    const got = context.acquirePersistentUniform(`${decomp_key}:params_ub`, params_bytes.length);
    params_ub = got.buffer;
    if (got.created) device.queue.writeBuffer(params_ub, 0, params_bytes as BufferSource);
  } else {
    params_ub = create_and_write_ub(device, params_bytes);
  }

  cpu_timer?.mark('compile_scalars_only_begin');
  // Pipeline layout depends on whether we fuse the count phase. The
  // fused variant adds a 4th binding (col_ptr) and produces a different
  // pipeline (different cache key suffix).
  const layoutTypes: Array<'read-only-storage' | 'storage' | 'uniform'> = fuse_count
    ? ['read-only-storage', 'storage', 'uniform', 'storage']
    : ['read-only-storage', 'storage', 'uniform'];
  const pipeKeySuffix = fuse_count ? ':fused-count' : '';
  const { pipeline: computePipeline, bindGroupLayout } = await compile_pipeline_cached(
    device,
    layoutTypes,
    shaderCode,
    'main',
    context,
    `${curveConfig.id}:decompose_scalars_only${pipeKeySuffix}:${workgroup_size}:${num_y_workgroups}:${num_subtasks}:${num_columns}:${input_size}`,
  );
  cpu_timer?.phaseFrom('compile_scalars_only_shader', 'compile_scalars_only_begin');

  const bgBuffers: GPUBuffer[] = fuse_count
    ? [scalars_sb, scalar_chunks_sb, params_ub, count_col_ptr_sb!]
    : [scalars_sb, scalar_chunks_sb, params_ub];
  const bgKey = `${decomp_key}:bg${pipeKeySuffix}`;
  const bindGroup =
    context !== undefined
      ? context.getOrCreatePersistentBindGroup(bgKey, () => create_bind_group(device, bindGroupLayout, bgBuffers))
      : create_bind_group(device, bindGroupLayout, bgBuffers);

  execute_pipeline(commandEncoder, computePipeline, bindGroup, num_x_workgroups, num_y_workgroups, 1, timestampWrites);

  return scalar_chunks_sb;
};

/**
 * Three-phase parallel CSR→CSC transpose: count → scan → scatter.
 *
 * Replaces the single-thread-per-subtask serial transpose
 * (transpose_serial.wgsl) for the BN254 hot path. The serial variant
 * measured ~65 ms of GPU time at N=2^16 — a quarter of total GPU time
 * at that size — because it dispatches only T threads (16 at s=16) and
 * each does O(n) sequential work. The parallel variant moves the
 * O(n*T) count and scatter passes to n*T threads (≈1M at N=2^16) and
 * keeps the prefix-sum scan in T threads, which is fine because each
 * scan is ~O(n_cols+1) ≈ 65k ops, ~1 ms total at T=16.
 *
 * Bit-for-bit equivalent CSR→CSC mapping to the serial version, modulo
 * within-column ordering (parallel scatter delivers points in
 * thread-arrival order rather than i-ascending order). SMVP iterates
 * the entire bucket and is order-independent, so this is invisible
 * downstream.
 */
export const transpose_gpu_parallel = async (
  countShader: string,
  scanShader: string,
  scatterShader: string,
  device: GPUDevice,
  commandEncoder: GPUCommandEncoder,
  input_size: number,
  num_columns: number,
  num_rows: number,
  num_subtasks: number,
  scalar_chunks_sb: GPUBuffer,
  cpu_timer: CpuTimer | undefined,
  context: GpuContext | undefined,
  curveId: string,
  chunk_size: number,
  // When provided, the caller has already populated the per-subtask
  // column counts (via a fused decompose+count pass). This function
  // skips the standalone count dispatch and uses the supplied buffer
  // directly. The buffer's contents must hold the same layout as
  // transpose_count's output (slot k+1 of each subtask's slice = count
  // of column k).
  prepopulated_col_ptr_sb?: GPUBuffer,
  timestampWritesCount?: GPUComputePassTimestampWrites,
  timestampWritesScan?: GPUComputePassTimestampWrites,
  timestampWritesScatter?: GPUComputePassTimestampWrites,
): Promise<{
  all_csc_col_ptr_sb: GPUBuffer;
  all_csc_val_idxs_sb: GPUBuffer;
}> => {
  // Cache the transpose workspace on the persistent context when possible.
  // col_ptr and all_curr are atomicAdd targets and MUST be zeroed before
  // each call — added explicit clearBuffer dispatches below. val_idxs is
  // fully overwritten by the scatter phase so no clear is needed.
  const xpose_key = `${curveId}:xpose:${num_subtasks}:${num_columns}:${input_size}`;
  const acquire_xpose = (suffix: string, size: number): GPUBuffer =>
    context !== undefined ? context.acquirePersistentBuffer(`${xpose_key}:${suffix}`, size) : create_sb(device, size);
  // When a pre-populated col_ptr is passed in, reuse it directly so the
  // fused decompose-count kernel's atomicAdd output flows straight into
  // the scan + scatter phases here.
  const all_csc_col_ptr_sb = prepopulated_col_ptr_sb ?? acquire_xpose('col_ptr', num_subtasks * (num_columns + 1) * 4);
  const all_csc_val_idxs_sb = acquire_xpose('val_idxs', scalar_chunks_sb.size);
  const all_curr_sb = acquire_xpose('curr', num_subtasks * num_columns * 4);

  // atomicAdd needs zero start. When the caller pre-populated col_ptr,
  // they're responsible for zeroing it before their decompose kernel
  // runs (the orchestrator clears it before decompose); skip clearing
  // it again here.
  if (context !== undefined) {
    if (prepopulated_col_ptr_sb === undefined) {
      commandEncoder.clearBuffer(all_csc_col_ptr_sb);
    }
    commandEncoder.clearBuffer(all_curr_sb);
  }

  const params_bytes = numbers_to_u8s_for_gpu([num_rows, num_columns, input_size]);
  // Cache the params uniform too — its values are constant for a given
  // (num_rows, num_columns, input_size) tuple.
  let params_ub: GPUBuffer;
  if (context !== undefined) {
    const got = context.acquirePersistentUniform(`${xpose_key}:params_ub`, params_bytes.length);
    params_ub = got.buffer;
    if (got.created) device.queue.writeBuffer(params_ub, 0, params_bytes as BufferSource);
  } else {
    params_ub = create_and_write_ub(device, params_bytes);
  }

  // Workgroup shape: 64 threads in X (one per input index), one wg per subtask
  // in Y. Allows max parallelism for count/scatter while keeping each row's
  // work fits in a single wg's hardware allocation.
  const phase_workgroup_size = 64;
  const phase_x_workgroups = Math.ceil(input_size / phase_workgroup_size);
  const phase_y_workgroups = num_subtasks;

  // Phase 1: count. n*T threads, each atomicAdd to the column counter.
  // SKIPPED when the caller pre-populated col_ptr via a fused
  // decompose+count pass — same atomicAdd happens there, just inline
  // with the scalar decomposition.
  if (prepopulated_col_ptr_sb === undefined) {
    cpu_timer?.mark('compile_xpose_count_begin');
    const count_pipe = await compile_pipeline_cached(
      device,
      ['read-only-storage', 'storage', 'uniform'],
      countShader,
      'main',
      context,
      `${curveId}:transpose_count:${phase_workgroup_size}:${chunk_size}:${num_subtasks}:${input_size}`,
    );
    cpu_timer?.phaseFrom('compile_transpose_count_shader', 'compile_xpose_count_begin');
    // Bind groups can be cached when the underlying buffers are persistent
    // (i.e. context is provided). scalar_chunks_sb is also persistent —
    // see decompose_scalars_only_gpu — so the count_bg is fully stable.
    const count_bg =
      context !== undefined
        ? context.getOrCreatePersistentBindGroup(`${xpose_key}:count_bg`, () =>
            create_bind_group(device, count_pipe.bindGroupLayout, [scalar_chunks_sb, all_csc_col_ptr_sb, params_ub]),
          )
        : create_bind_group(device, count_pipe.bindGroupLayout, [scalar_chunks_sb, all_csc_col_ptr_sb, params_ub]);
    execute_pipeline(
      commandEncoder,
      count_pipe.pipeline,
      count_bg,
      phase_x_workgroups,
      phase_y_workgroups,
      1,
      timestampWritesCount,
    );
  }

  // Phase 2: scan. ONE workgroup of 256 threads PER subtask. Each
  // workgroup runs a chunked Hillis–Steele inclusive scan over its
  // (n_cols + 1)-element slice. The previous single-thread-per-subtask
  // scan measured 37 ms at N=2^16; a proper workgroup scan should drop
  // it under 5 ms.
  cpu_timer?.mark('compile_xpose_scan_begin');
  const scan_pipe = await compile_pipeline_cached(
    device,
    ['storage', 'uniform'],
    scanShader,
    'main',
    context,
    `${curveId}:transpose_scan_v2:${chunk_size}:${num_subtasks}:${num_columns}`,
  );
  cpu_timer?.phaseFrom('compile_transpose_scan_shader', 'compile_xpose_scan_begin');
  const scan_bg =
    context !== undefined
      ? context.getOrCreatePersistentBindGroup(`${xpose_key}:scan_bg`, () =>
          create_bind_group(device, scan_pipe.bindGroupLayout, [all_csc_col_ptr_sb, params_ub]),
        )
      : create_bind_group(device, scan_pipe.bindGroupLayout, [all_csc_col_ptr_sb, params_ub]);
  execute_pipeline(
    commandEncoder,
    scan_pipe.pipeline,
    scan_bg,
    num_subtasks, // T workgroups, one per subtask
    1,
    1,
    timestampWritesScan,
  );

  // Phase 3: scatter. n*T threads, each looks up its column's offset and
  // its slot within that column (via atomicAdd on all_curr), then writes
  // its index into all_csc_val_idxs.
  cpu_timer?.mark('compile_xpose_scatter_begin');
  const scatter_pipe = await compile_pipeline_cached(
    device,
    ['read-only-storage', 'read-only-storage', 'storage', 'storage', 'uniform'],
    scatterShader,
    'main',
    context,
    `${curveId}:transpose_scatter:${phase_workgroup_size}:${chunk_size}:${num_subtasks}:${input_size}`,
  );
  cpu_timer?.phaseFrom('compile_transpose_scatter_shader', 'compile_xpose_scatter_begin');
  const scatter_bg =
    context !== undefined
      ? context.getOrCreatePersistentBindGroup(`${xpose_key}:scatter_bg`, () =>
          create_bind_group(device, scatter_pipe.bindGroupLayout, [
            scalar_chunks_sb,
            all_csc_col_ptr_sb,
            all_csc_val_idxs_sb,
            all_curr_sb,
            params_ub,
          ]),
        )
      : create_bind_group(device, scatter_pipe.bindGroupLayout, [
          scalar_chunks_sb,
          all_csc_col_ptr_sb,
          all_csc_val_idxs_sb,
          all_curr_sb,
          params_ub,
        ]);
  execute_pipeline(
    commandEncoder,
    scatter_pipe.pipeline,
    scatter_bg,
    phase_x_workgroups,
    phase_y_workgroups,
    1,
    timestampWritesScatter,
  );

  return { all_csc_col_ptr_sb, all_csc_val_idxs_sb };
};

/*
 * Perform a modified version of CSR matrix transposition, which comes before
 * SMVP. Essentially, this step generates the point indices for each thread in
 * the SMVP step which corresponds to a particular bucket.
 */
export const transpose_gpu = async (
  shaderCode: string,
  device: GPUDevice,
  commandEncoder: GPUCommandEncoder,
  input_size: number,
  num_columns: number,
  num_rows: number,
  num_subtasks: number,
  scalar_chunks_sb: GPUBuffer,
  debug = false,
  timestampWrites?: GPUComputePassTimestampWrites,
  cpu_timer?: CpuTimer,
  context?: GpuContext,
  curveId?: string,
  chunk_size?: number,
): Promise<{
  all_csc_col_ptr_sb: GPUBuffer;
  all_csc_val_idxs_sb: GPUBuffer;
}> => {
  /*
   * n = number of columns (before transposition)
   * m = number of rows (before transposition)
   * nnz = number of nonzero elements
   *
   * Given:
   *   - csr_col_idx (nnz) (aka the new_scalar_chunks)
   *
   * Output the transpose of the above:
   *   - csc_col_ptr (m + 1)
   *      - The column index of each nonzero element
   *   - csc_val_idxs (nnz)
   *      - The new index of each nonzero element
   *
   * Not computed as it's not used:
   *   - csc_row_idx (nnz)
   *      - The cumulative sum of the number of nonzero elements per row
   */

  const all_csc_col_ptr_sb = create_sb(device, num_subtasks * (num_columns + 1) * 4);
  const all_csc_val_idxs_sb = create_sb(device, scalar_chunks_sb.size);
  const all_curr_sb = create_sb(device, num_subtasks * num_columns * 4);

  const params_bytes = numbers_to_u8s_for_gpu([num_rows, num_columns, input_size]);
  const params_ub = create_and_write_ub(device, params_bytes);

  const num_x_workgroups = 1;
  const num_y_workgroups = 1;

  cpu_timer?.mark('compile_begin_t');
  const { pipeline: computePipeline, bindGroupLayout } = await compile_pipeline_cached(
    device,
    ['read-only-storage', 'storage', 'storage', 'storage', 'uniform'],
    shaderCode,
    'main',
    context,
    `${curveId ?? 'x'}:transpose:${chunk_size ?? 0}:${num_subtasks}:${input_size}`,
  );
  cpu_timer?.phaseFrom('compile_transpose_shader', 'compile_begin_t');

  const bindGroup = create_bind_group(device, bindGroupLayout, [
    scalar_chunks_sb,
    all_csc_col_ptr_sb,
    all_csc_val_idxs_sb,
    all_curr_sb,
    params_ub,
  ]);

  execute_pipeline(commandEncoder, computePipeline, bindGroup, num_x_workgroups, num_y_workgroups, 1, timestampWrites);

  // Debug the output of the shader. This should **not** be run in production
  if (debug) {
    const data = await read_from_gpu(device, commandEncoder, [
      all_csc_col_ptr_sb,
      all_csc_val_idxs_sb,
      scalar_chunks_sb,
    ]);

    const all_csc_col_ptr_result = u8s_to_numbers_32(data[0]);
    const all_csc_val_idxs_result = u8s_to_numbers_32(data[1]);
    const new_scalar_chunks = u8s_to_numbers_32(data[2]);

    // Verify the output of the shader
    const expected = cpu_transpose(new_scalar_chunks, num_columns, num_rows, num_subtasks, input_size);

    assert(expected.all_csc_col_ptr.toString() === all_csc_col_ptr_result.toString(), 'all_csc_col_ptr mismatch');
    assert(expected.all_csc_vals.toString() === all_csc_val_idxs_result.toString(), 'all_csc_vals mismatch');
  }

  return {
    all_csc_col_ptr_sb,
    all_csc_val_idxs_sb,
  };
};

/*
 * Compute the bucket sums and perform scalar multiplication with the bucket
 * indices.
 */
export const smvp_gpu = async (
  shaderCode: string,
  num_x_workgroups: number,
  num_y_workgroups: number,
  num_z_workgroups: number,
  offset: number,
  device: GPUDevice,
  commandEncoder: GPUCommandEncoder,
  num_subtasks: number,
  num_csr_cols: number,
  input_size: number,
  chunk_size: number,
  all_csc_col_ptr_sb: GPUBuffer,
  point_x_sb: GPUBuffer,
  point_y_sb: GPUBuffer,
  all_csc_val_idxs_sb: GPUBuffer,
  bucket_sum_x_sb: GPUBuffer,
  bucket_sum_y_sb: GPUBuffer,
  bucket_sum_z_sb: GPUBuffer,
  debug = false,
  timestampWrites?: GPUComputePassTimestampWrites,
  cpu_timer?: CpuTimer,
  context?: GpuContext,
  curveId?: string,
  workgroup_size?: number,
) => {
  const num_words = params.num_words;
  const word_size = params.word_size;
  const rinv = params.rinv;
  const params_bytes = numbers_to_u8s_for_gpu([input_size, num_y_workgroups, num_z_workgroups, offset]);
  const params_ub = create_and_write_ub(device, params_bytes);

  const _compile_t0 = performance.now();
  const { pipeline: computePipeline, bindGroupLayout } = await compile_pipeline_cached(
    device,
    [
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'read-only-storage',
      'storage',
      'storage',
      'storage',
      'uniform',
    ],
    shaderCode,
    'main',
    context,
    `${curveId ?? 'x'}:smvp:${workgroup_size ?? 0}:${num_csr_cols}:${input_size}`,
  );
  cpu_timer?.accumulate('compile_smvp_shader', performance.now() - _compile_t0);

  const bindGroup = create_bind_group(device, bindGroupLayout, [
    all_csc_col_ptr_sb,
    all_csc_val_idxs_sb,
    point_x_sb,
    point_y_sb,
    bucket_sum_x_sb,
    bucket_sum_y_sb,
    bucket_sum_z_sb,
    params_ub,
  ]);

  execute_pipeline(
    commandEncoder,
    computePipeline,
    bindGroup,
    num_x_workgroups,
    num_y_workgroups,
    num_z_workgroups,
    timestampWrites,
  );

  // Debug the output of the shader. This should **not** be run in production
  if (debug) {
    const data = await read_from_gpu(device, commandEncoder, [
      all_csc_col_ptr_sb,
      all_csc_val_idxs_sb,
      point_x_sb,
      point_y_sb,
      bucket_sum_x_sb,
      bucket_sum_y_sb,
      bucket_sum_z_sb,
    ]);

    const all_csc_col_ptr_sb_result = u8s_to_numbers_32(data[0]);
    const all_csc_val_idxs_result = u8s_to_numbers_32(data[1]);
    const point_x_sb_result = u8s_to_bigints(data[2], num_words, word_size);
    const point_y_sb_result = u8s_to_bigints(data[3], num_words, word_size);
    const bucket_sum_x_sb_result = u8s_to_bigints(data[4], num_words, word_size);
    const bucket_sum_y_sb_result = u8s_to_bigints(data[5], num_words, word_size);
    const bucket_sum_z_sb_result = u8s_to_bigints(data[6], num_words, word_size);

    // Assertion checks take a long time!
    for (let subtask_idx = 0; subtask_idx < num_subtasks; subtask_idx++) {
      // Convert GPU output out of Montgomery coordinates
      const output_points_gpu: G1[] = [];
      for (let i = subtask_idx * (num_csr_cols / 2); i < subtask_idx * (num_csr_cols / 2) + num_csr_cols / 2; i++) {
        const x = (bucket_sum_x_sb_result[i] * rinv) % p;
        const y = (bucket_sum_y_sb_result[i] * rinv) % p;
        const z = (bucket_sum_z_sb_result[i] * rinv) % p;
        output_points_gpu.push(createAffinePoint(x, y, z));
      }

      // Convert CPU output out of Montgomery coordinates
      const output_points_cpu_out_of_mont: G1[] = [];
      for (let i = 0; i < input_size; i++) {
        const x = (point_x_sb_result[i] * rinv) % p;
        const y = (point_y_sb_result[i] * rinv) % p;
        const pt = createAffinePoint(x, y, BigInt(1));
        output_points_cpu_out_of_mont.push(pt);
      }

      // Calculate SMVP in CPU
      const output_points_cpu: G1[] = cpu_smvp_signed(
        subtask_idx,
        input_size,
        num_csr_cols,
        chunk_size,
        all_csc_col_ptr_sb_result,
        all_csc_val_idxs_result,
        output_points_cpu_out_of_mont,
      );

      // Assert CPU and GPU output
      for (let i = 0; i < output_points_gpu.length; i++) {
        assert(output_points_gpu[i].equals(output_points_cpu[i]), `failed at ${i}`);
      }
    }
  }

  return {
    bucket_sum_x_sb,
    bucket_sum_y_sb,
    bucket_sum_z_sb,
  };
};

const bpr_1 = async (
  shaderCode: string,
  subtask_idx: number,
  num_x_workgroups: number,
  workgroup_size: number,
  num_columns: number,
  device: GPUDevice,
  commandEncoder: GPUCommandEncoder,
  bucket_sum_x_sb: GPUBuffer,
  bucket_sum_y_sb: GPUBuffer,
  bucket_sum_z_sb: GPUBuffer,
  g_points_x_sb: GPUBuffer,
  g_points_y_sb: GPUBuffer,
  g_points_z_sb: GPUBuffer,
  debug = false,
  timestampWrites?: GPUComputePassTimestampWrites,
  debug_capture_sb?: GPUBuffer,
  cpu_timer?: CpuTimer,
  context?: GpuContext,
  curveId?: string,
  assume_affine_buckets = false,
  mixed_safe_buckets = false,
  // Microbench-only. Passed through purely so the cache key can
  // distinguish different bench-variant shaders. The shader CODE
  // produced from these flags is built upstream and passed in
  // as `shaderCode`.
  bench_flags_key = '',
  // Identifies the per-call workspace buffer set the bind group is being
  // bound against. Sizes of bucket_sum_*_sb and g_points_*_sb are
  // independent of `input_size` (they're driven by num_columns,
  // num_subtasks, num_words), so without this, two MSM calls at
  // different `input_size` produce identical `bpr1_key`s but different
  // GPUBuffer objects — the cached bind group would still reference the
  // first call's buffers, BPR would read stale data, and downstream
  // Horner would read an unwritten g_points buffer and return identity.
  input_size_key = 0,
  // Total subtask count + WPB. Passed to the shader as params[3] so
  // multi-window dispatches with WPB > 1 can skip out-of-range subtasks
  // in the tail batch (when num_subtasks is not a multiple of WPB).
  num_subtasks_total = 0,
  windows_per_batch = 1,
) => {
  let original_bucket_sum_x_sb;
  let original_bucket_sum_y_sb;
  let original_bucket_sum_z_sb;

  // Debug the output of the shader. This should **not** be run in production
  if (debug) {
    original_bucket_sum_x_sb = create_sb(device, bucket_sum_x_sb.size);
    original_bucket_sum_y_sb = create_sb(device, bucket_sum_y_sb.size);
    original_bucket_sum_z_sb = create_sb(device, bucket_sum_z_sb.size);

    commandEncoder.copyBufferToBuffer(bucket_sum_x_sb, 0, original_bucket_sum_x_sb, 0, bucket_sum_x_sb.size);
    commandEncoder.copyBufferToBuffer(bucket_sum_y_sb, 0, original_bucket_sum_y_sb, 0, bucket_sum_y_sb.size);
    commandEncoder.copyBufferToBuffer(bucket_sum_z_sb, 0, original_bucket_sum_z_sb, 0, bucket_sum_z_sb.size);
  }

  // Parameters as a uniform buffer. Layout: (subtask_idx_base,
  // num_columns, num_subtasks_per_bpr, num_subtasks_total). The 4th
  // slot lets the WPB-aware shader skip out-of-range subtasks in tail
  // batches. Constant per (subtask_idx, layout, WPB) tuple, so we cache
  // it on the context when one is provided.
  const params_bytes = numbers_to_u8s_for_gpu([subtask_idx, num_columns, num_x_workgroups, num_subtasks_total]);
  const bpr1_key = `${curveId ?? 'x'}:bpr1:wpb${windows_per_batch}:${workgroup_size}:${num_columns}:${num_x_workgroups}:${subtask_idx}:N=${input_size_key}`;
  let params_ub: GPUBuffer;
  if (context !== undefined && !debug && !debug_capture_sb) {
    const got = context.acquirePersistentUniform(`${bpr1_key}:params_ub`, params_bytes.length);
    params_ub = got.buffer;
    if (got.created) device.queue.writeBuffer(params_ub, 0, params_bytes as BufferSource);
  } else {
    params_ub = create_and_write_ub(device, params_bytes);
  }

  // When debug_capture_sb is provided, the BPR shader was compiled with the
  // capture_debug Mustache flag, which adds @binding(7) for debug_capture.
  // Both pipelines (stage_1 and stage_2) must include it in their bind
  // group layout because they share the shader source.
  const bindLayoutTypes: Array<'storage' | 'uniform' | 'read-only-storage'> = debug_capture_sb
    ? ['storage', 'storage', 'storage', 'storage', 'storage', 'storage', 'uniform', 'storage']
    : ['storage', 'storage', 'storage', 'storage', 'storage', 'storage', 'uniform'];

  const _b1_compile_t0 = performance.now();
  const { pipeline: computePipeline, bindGroupLayout } = await compile_pipeline_cached(
    device,
    bindLayoutTypes,
    shaderCode,
    'stage_1',
    // Debug-capture variant compiles a different shader (Mustache flag),
    // so keys must not collide with the non-debug one.
    context,
    `${curveId ?? 'x'}:bpr1:wpb${windows_per_batch}:${workgroup_size}:${num_columns}:${debug_capture_sb ? 'dbg' : 'nodbg'}:${assume_affine_buckets ? 'aff' : mixed_safe_buckets ? 'mxs-v2' : 'gen'}:bench=${bench_flags_key || 'none'}`,
  );
  cpu_timer?.accumulate('compile_bpr1_shader', performance.now() - _b1_compile_t0);

  // Cache bind group when buffers are persistent (warm-cached path).
  // Non-debug path only — debug variants use transient copies.
  const bg_buffers = debug_capture_sb
    ? [
        bucket_sum_x_sb,
        bucket_sum_y_sb,
        bucket_sum_z_sb,
        g_points_x_sb,
        g_points_y_sb,
        g_points_z_sb,
        params_ub,
        debug_capture_sb,
      ]
    : [bucket_sum_x_sb, bucket_sum_y_sb, bucket_sum_z_sb, g_points_x_sb, g_points_y_sb, g_points_z_sb, params_ub];
  const bindGroup =
    context !== undefined && !debug && !debug_capture_sb
      ? context.getOrCreatePersistentBindGroup(
          `${bpr1_key}:bg:${assume_affine_buckets ? 'aff' : mixed_safe_buckets ? 'mxs' : 'gen'}:bench=${bench_flags_key || 'none'}`,
          () => create_bind_group(device, bindGroupLayout, bg_buffers),
        )
      : create_bind_group(device, bindGroupLayout, bg_buffers);

  const num_threads = num_x_workgroups * workgroup_size;
  const num_y_workgroups = 1;
  const num_z_workgroups = 1;

  execute_pipeline(
    commandEncoder,
    computePipeline,
    bindGroup,
    num_x_workgroups,
    num_y_workgroups,
    num_z_workgroups,
    timestampWrites,
  );

  if (
    debug &&
    original_bucket_sum_x_sb != undefined && // prevent TS warnings
    original_bucket_sum_y_sb != undefined &&
    original_bucket_sum_z_sb != undefined
  ) {
    const data = await read_from_gpu(device, commandEncoder, [
      bucket_sum_x_sb,
      bucket_sum_y_sb,
      bucket_sum_z_sb,
      g_points_x_sb,
      g_points_y_sb,
      g_points_z_sb,
      original_bucket_sum_x_sb,
      original_bucket_sum_y_sb,
      original_bucket_sum_z_sb,
    ]);

    // The number of buckets per subtask
    const n = num_columns / 2;
    const start = subtask_idx * n * num_words * 4;
    const end = (subtask_idx * n + n) * num_words * 4;

    const m_points_x_mont_coords = u8s_to_bigints(data[0].slice(start, end), num_words, word_size);
    const m_points_y_mont_coords = u8s_to_bigints(data[1].slice(start, end), num_words, word_size);
    const m_points_z_mont_coords = u8s_to_bigints(data[2].slice(start, end), num_words, word_size);

    const g_points_x_mont_coords = u8s_to_bigints(data[3], num_words, word_size);
    const g_points_y_mont_coords = u8s_to_bigints(data[4], num_words, word_size);
    const g_points_z_mont_coords = u8s_to_bigints(data[5], num_words, word_size);

    const original_bucket_sum_x_mont_coords = u8s_to_bigints(data[6].slice(start, end), num_words, word_size);
    const original_bucket_sum_y_mont_coords = u8s_to_bigints(data[7].slice(start, end), num_words, word_size);
    const original_bucket_sum_z_mont_coords = u8s_to_bigints(data[8].slice(start, end), num_words, word_size);

    // Convert the bucket sums out of Montgomery form
    const original_bucket_sums: G1[] = [];
    for (let i = 0; i < n; i++) {
      const pt = createAffinePoint(
        (original_bucket_sum_x_mont_coords[i] * rinv) % p,
        (original_bucket_sum_y_mont_coords[i] * rinv) % p,
        (original_bucket_sum_z_mont_coords[i] * rinv) % p,
      );
      original_bucket_sums.push(pt);
    }

    const m_points: G1[] = [];
    for (let i = 0; i < n; i++) {
      const pt = createAffinePoint(
        (m_points_x_mont_coords[i] * rinv) % p,
        (m_points_y_mont_coords[i] * rinv) % p,
        (m_points_z_mont_coords[i] * rinv) % p,
      );
      m_points.push(pt);
    }

    // Convert the reduced buckets out of Montgomery form
    const g_points: G1[] = [];
    for (let i = 0; i < num_threads; i++) {
      const idx = subtask_idx * num_threads + i;
      const pt = createAffinePoint(
        (g_points_x_mont_coords[idx] * rinv) % p,
        (g_points_y_mont_coords[idx] * rinv) % p,
        (g_points_z_mont_coords[idx] * rinv) % p,
      );
      g_points.push(pt);
    }

    const expected = parallel_bucket_reduction_1(original_bucket_sums, num_threads);
    for (let i = 0; i < expected.g_points.length; i++) {
      assert(g_points[i].equals(expected.g_points[i]), `mismatch at ${i}`);
    }
  }
};

const bpr_2 = async (
  shaderCode: string,
  subtask_idx: number,
  num_x_workgroups: number,
  workgroup_size: number,
  num_columns: number,
  device: GPUDevice,
  commandEncoder: GPUCommandEncoder,
  bucket_sum_x_sb: GPUBuffer,
  bucket_sum_y_sb: GPUBuffer,
  bucket_sum_z_sb: GPUBuffer,
  g_points_x_sb: GPUBuffer,
  g_points_y_sb: GPUBuffer,
  g_points_z_sb: GPUBuffer,
  debug = false,
  timestampWrites?: GPUComputePassTimestampWrites,
  debug_capture_sb?: GPUBuffer,
  cpu_timer?: CpuTimer,
  context?: GpuContext,
  curveId?: string,
  assume_affine_buckets = false,
  mixed_safe_buckets = false,
  // Microbench-only — see bpr_1 for the rationale. stage_1 and
  // stage_2 share the SAME shader source (one Mustache render
  // produces both entry points), so the cache key must include the
  // bench flags here too. Otherwise a V0 stage_2 pipeline would be
  // returned for V1's compile request and the bench-flag changes to
  // stage_1 would never take effect on the GPU.
  bench_flags_key = '',
  // See bpr_1 for the rationale: disambiguates the persistent bind
  // group across MSM calls with different `input_size`, whose
  // workspace buffers are equally sized but distinct GPUBuffer objects.
  input_size_key = 0,
  // See bpr_1: total subtasks (4th param slot) + WPB (cache key).
  num_subtasks_total = 0,
  windows_per_batch = 1,
) => {
  // Parameters as a uniform buffer (cached on context when not debug).
  // Layout: (subtask_idx_base, num_columns, num_subtasks_per_bpr,
  // num_subtasks_total). See bpr_1 for the layout rationale.
  const params_bytes = numbers_to_u8s_for_gpu([subtask_idx, num_columns, num_x_workgroups, num_subtasks_total]);
  const bpr2_key = `${curveId ?? 'x'}:bpr2:wpb${windows_per_batch}:${workgroup_size}:${num_columns}:${num_x_workgroups}:${subtask_idx}:N=${input_size_key}`;
  let params_ub: GPUBuffer;
  if (context !== undefined && !debug && !debug_capture_sb) {
    const got = context.acquirePersistentUniform(`${bpr2_key}:params_ub`, params_bytes.length);
    params_ub = got.buffer;
    if (got.created) device.queue.writeBuffer(params_ub, 0, params_bytes as BufferSource);
  } else {
    params_ub = create_and_write_ub(device, params_bytes);
  }

  const bindLayoutTypes: Array<'storage' | 'uniform' | 'read-only-storage'> = debug_capture_sb
    ? ['storage', 'storage', 'storage', 'storage', 'storage', 'storage', 'uniform', 'storage']
    : ['storage', 'storage', 'storage', 'storage', 'storage', 'storage', 'uniform'];

  const _b2_compile_t0 = performance.now();
  const { pipeline: computePipeline, bindGroupLayout } = await compile_pipeline_cached(
    device,
    bindLayoutTypes,
    shaderCode,
    'stage_2',
    context,
    `${curveId ?? 'x'}:bpr2:wpb${windows_per_batch}:${workgroup_size}:${num_columns}:${debug_capture_sb ? 'dbg' : 'nodbg'}:${assume_affine_buckets ? 'aff' : mixed_safe_buckets ? 'mxs-v2' : 'gen'}:bench=${bench_flags_key || 'none'}`,
  );
  cpu_timer?.accumulate('compile_bpr2_shader', performance.now() - _b2_compile_t0);

  // Cache the bind group when buffers are persistent.
  const bg_buffers = debug_capture_sb
    ? [
        bucket_sum_x_sb,
        bucket_sum_y_sb,
        bucket_sum_z_sb,
        g_points_x_sb,
        g_points_y_sb,
        g_points_z_sb,
        params_ub,
        debug_capture_sb,
      ]
    : [bucket_sum_x_sb, bucket_sum_y_sb, bucket_sum_z_sb, g_points_x_sb, g_points_y_sb, g_points_z_sb, params_ub];
  const bindGroup =
    context !== undefined && !debug && !debug_capture_sb
      ? context.getOrCreatePersistentBindGroup(
          `${bpr2_key}:bg:${assume_affine_buckets ? 'aff' : mixed_safe_buckets ? 'mxs' : 'gen'}:bench=${bench_flags_key || 'none'}`,
          () => create_bind_group(device, bindGroupLayout, bg_buffers),
        )
      : create_bind_group(device, bindGroupLayout, bg_buffers);

  const num_threads = num_x_workgroups * workgroup_size;
  const num_y_workgroups = 1;
  const num_z_workgroups = 1;

  execute_pipeline(
    commandEncoder,
    computePipeline,
    bindGroup,
    num_x_workgroups,
    num_y_workgroups,
    num_z_workgroups,
    timestampWrites,
  );

  if (debug) {
    const data = await read_from_gpu(device, commandEncoder, [
      bucket_sum_x_sb,
      bucket_sum_y_sb,
      bucket_sum_z_sb,
      g_points_x_sb,
      g_points_y_sb,
      g_points_z_sb,
    ]);

    // The number of buckets per subtask
    const n = num_columns / 2;

    const start = subtask_idx * n * num_words * 4;
    const end = (subtask_idx * n + n) * num_words * 4;

    const m_points_x_mont_coords = u8s_to_bigints(data[0].slice(start, end), num_words, word_size);
    const m_points_y_mont_coords = u8s_to_bigints(data[1].slice(start, end), num_words, word_size);
    const m_points_z_mont_coords = u8s_to_bigints(data[2].slice(start, end), num_words, word_size);

    const g_points_x_mont_coords = u8s_to_bigints(data[3], num_words, word_size);
    const g_points_y_mont_coords = u8s_to_bigints(data[4], num_words, word_size);
    const g_points_z_mont_coords = u8s_to_bigints(data[5], num_words, word_size);

    const m_points: G1[] = [];
    for (let i = 0; i < n; i++) {
      const pt = createAffinePoint(
        (m_points_x_mont_coords[i] * rinv) % p,
        (m_points_y_mont_coords[i] * rinv) % p,
        (m_points_z_mont_coords[i] * rinv) % p,
      );
      m_points.push(pt);
    }

    // Convert the reduced buckets out of Montgomery form
    const g_points: G1[] = [];
    for (let i = 0; i < num_threads; i++) {
      const pt = createAffinePoint(
        (g_points_x_mont_coords[i] * rinv) % p,
        (g_points_y_mont_coords[i] * rinv) % p,
        (g_points_z_mont_coords[i] * rinv) % p,
      );
      g_points.push(pt);
    }

    const expected = parallel_bucket_reduction_2(g_points, m_points, n, num_threads);

    // TODO: figure out why the following fails at index 0
    for (let i = 0; i < expected.length; i++) {
      assert(g_points[i].equals(expected[i]), `mismatch at ${i}`);
    }
  }
};
