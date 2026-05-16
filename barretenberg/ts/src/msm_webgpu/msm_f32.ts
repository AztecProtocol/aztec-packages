// f32-Montgomery (23-bit limb) end-to-end BN254 MSM driver.
//
// Parallel A/B path next to `compute_bn254_msm` in `msm.ts`. Wire format
// throughout is `BigIntF32 = array<f32, NUM_LIMBS_F32 = 12>`, in
// Montgomery form for the f32 ring (radix R_f = 2^276 mod p). Host packs
// raw affine points and unpacks Jacobian subtask sums; the GPU never
// touches u32-Mont data and never converts between the two encodings.
//
// Pipeline:
//   1. Host decodes raw affine bytes -> bigint pairs.
//   2. Host packs each coord into 12-limb f32-Mont form.
//   3. Decompose scalars via the encoding-agnostic u32 shader (chunks
//      are small unsigned integers, not field elements).
//   4. Transpose (encoding-agnostic).
//   5. SMVP f32, BPR1 f32, BPR2 f32, Horner subtask_reduce f32.
//   6. Read back T BigIntF32 sums; CPU un-Mont via R_f^-1 mod p;
//      Jacobian Horner chain; single final affine inversion.

import { assert } from './assert.js';
import { readBigIntsFromBufferLE } from './types.js';
import { ShaderManager } from './cuzk/shader_manager.js';
import {
  get_device,
  create_and_write_sb,
  create_and_write_ub,
  create_bind_group,
  create_bind_group_layout,
  create_sb,
  create_compute_pipeline,
  execute_pipeline,
  execute_pipeline_indirect,
  read_from_gpu,
} from './cuzk/gpu.js';
import { GpuContext } from './cuzk/gpu_context.js';
import {
  compute_misc_params,
  numbers_to_u8s_for_gpu,
} from './cuzk/utils.js';
import { BN254_CURVE_CONFIG, CurveConfig } from './cuzk/curve_config.js';
import {
  addBn254Jacobian,
  doubleBn254Jacobian,
  toAffineBn254Jacobian,
  BN254_JACOBIAN_ZERO,
  Bn254Jacobian,
} from './cuzk/bn254.js';
import { transpose_gpu_parallel } from './msm.js';

// 23-bit f32 limb constants. Single source of truth on the host side
// for the f32 wire format. Kept here (rather than re-derived per call)
// because they're fixed by the FMA-Montgomery design and never change.
const WORD_SIZE_F32 = 23;
const NUM_LIMBS_F32 = 12;
const W_F32 = BigInt(1) << BigInt(WORD_SIZE_F32);
const LIMB_MASK_F32 = W_F32 - BigInt(1);
const COORD_BYTES_F32 = NUM_LIMBS_F32 * 4;

// Encode a canonical (non-Mont) bigint into 12 × f32 limbs (each
// integer-valued in [0, 2^23)) in Montgomery form for the f32 ring.
// Returns a Float32Array of length NUM_LIMBS_F32.
function bigintToF32MontLimbs(value: bigint, R_f: bigint, p: bigint): Float32Array {
  const mont = (value * R_f) % p;
  const out = new Float32Array(NUM_LIMBS_F32);
  let v = mont;
  for (let i = 0; i < NUM_LIMBS_F32; i++) {
    out[i] = Number(v & LIMB_MASK_F32);
    v >>= BigInt(WORD_SIZE_F32);
  }
  return out;
}

// Inverse of bigintToF32MontLimbs: read 12 f32 limbs back into a Mont
// bigint (no R^-1 multiply applied; caller decides whether to un-Mont).
function f32LimbsToBigint(limbs: ArrayLike<number>): bigint {
  let v = 0n;
  for (let i = NUM_LIMBS_F32 - 1; i >= 0; i--) {
    v = (v << BigInt(WORD_SIZE_F32)) | BigInt(limbs[i] | 0);
  }
  return v;
}

// Pack `input_size` affine points (interleaved x, y, x, y, ...) into two
// parallel Float32Arrays — one for x, one for y. Each entry occupies
// `NUM_LIMBS_F32` f32s and is the f32-Mont representation of that
// coordinate. Identity points are encoded as Z=0 in the f32 pipeline;
// the SRS input format used here is non-zero affine, so this routine
// doesn't have an "identity in" code path.
function pack_affine_to_f32_mont(
  points_buffer: Buffer,
  input_size: number,
  curveConfig: CurveConfig,
  R_f: bigint,
): { point_x_f32: Float32Array; point_y_f32: Float32Array } {
  const coord_bytes = curveConfig.coordinateByteLength;
  if (points_buffer.length !== input_size * coord_bytes * 2) {
    throw new Error(
      `pack_affine_to_f32_mont: expected ${input_size * coord_bytes * 2} bytes, got ${points_buffer.length}`,
    );
  }
  const bits = curveConfig.coordinateBitLength;
  const coords = readBigIntsFromBufferLE(points_buffer, bits);
  const p = curveConfig.baseFieldModulus;
  const point_x_f32 = new Float32Array(input_size * NUM_LIMBS_F32);
  const point_y_f32 = new Float32Array(input_size * NUM_LIMBS_F32);
  for (let i = 0; i < input_size; i++) {
    const xLimbs = bigintToF32MontLimbs(coords[i * 2], R_f, p);
    const yLimbs = bigintToF32MontLimbs(coords[i * 2 + 1], R_f, p);
    point_x_f32.set(xLimbs, i * NUM_LIMBS_F32);
    point_y_f32.set(yLimbs, i * NUM_LIMBS_F32);
  }
  return { point_x_f32, point_y_f32 };
}

// Workgroup geometry for the convert / decompose stage. Mirrors the
// `calculate_workgoups` table in msm.ts so the decompose dispatch picks
// the same shape the u32 path uses.
function calc_decompose_workgroups(input_size: number): {
  c_workgroup_size: number;
  c_num_x_workgroups: number;
  c_num_y_workgroups: number;
} {
  let c_workgroup_size = 256;
  let c_num_x_workgroups = 1;
  let c_num_y_workgroups = input_size / c_workgroup_size / c_num_x_workgroups;

  if (input_size <= 256) {
    c_workgroup_size = input_size;
    c_num_x_workgroups = 1;
    c_num_y_workgroups = 1;
  } else if (input_size <= 32768) {
    c_workgroup_size = 64;
    c_num_x_workgroups = 4;
    c_num_y_workgroups = input_size / c_workgroup_size / c_num_x_workgroups;
  } else if (input_size <= 65536) {
    c_workgroup_size = 256;
    c_num_x_workgroups = 8;
    c_num_y_workgroups = input_size / c_workgroup_size / c_num_x_workgroups;
  } else if (input_size <= 131072) {
    c_workgroup_size = 256;
    c_num_x_workgroups = 8;
    c_num_y_workgroups = input_size / c_workgroup_size / c_num_x_workgroups;
  } else if (input_size <= 262144) {
    c_workgroup_size = 256;
    c_num_x_workgroups = 32;
    c_num_y_workgroups = input_size / c_workgroup_size / c_num_x_workgroups;
  } else if (input_size <= 524288) {
    c_workgroup_size = 256;
    c_num_x_workgroups = 32;
    c_num_y_workgroups = input_size / c_workgroup_size / c_num_x_workgroups;
  } else {
    c_workgroup_size = 256;
    c_num_x_workgroups = 32;
    c_num_y_workgroups = input_size / c_workgroup_size / c_num_x_workgroups;
  }
  return { c_workgroup_size, c_num_x_workgroups, c_num_y_workgroups };
}

// Run only the scalar-decomposition shader (encoding-agnostic — chunk
// values are small unsigned integers, not field elements). Writes one
// shifted-signed bucket index per (scalar, subtask) into a freshly
// created storage buffer.
//
// When `fused_col_ptr_sb` is provided, the decompose shader is compiled
// with `count_into_col_ptr = true` — every thread atomicAdds into the
// CSC column-counter buffer inline, so the standalone transpose_count
// dispatch can be skipped downstream. Mirrors the u32 warm batch-affine
// path's fused-count variant (msm.ts: decompose_scalars_only_gpu).
// Caller MUST zero `fused_col_ptr_sb` before this kernel runs.
async function decompose_scalars_only_f32(
  shaderManager: ShaderManager,
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  scalars_buffer: Buffer,
  input_size: number,
  num_subtasks: number,
  num_columns: number,
  curveConfig: CurveConfig,
  fused_col_ptr_sb?: GPUBuffer,
): Promise<GPUBuffer> {
  const fuse_count = fused_col_ptr_sb !== undefined;
  const wg = calc_decompose_workgroups(input_size);
  const shader = shaderManager.gen_decompose_scalars_signed_only_shader(
    wg.c_workgroup_size,
    wg.c_num_y_workgroups,
    num_subtasks,
    num_columns,
    undefined,
    undefined,
    fuse_count,
  );

  const scalars_sb = create_and_write_sb(device, scalars_buffer as unknown as Uint8Array);
  const chunks_sb = create_sb(device, input_size * num_subtasks * 4);
  const params_ub = create_and_write_ub(device, numbers_to_u8s_for_gpu([input_size]));

  const layoutTypes: Array<'read-only-storage' | 'storage' | 'uniform'> = fuse_count
    ? ['read-only-storage', 'storage', 'uniform', 'storage']
    : ['read-only-storage', 'storage', 'uniform'];
  const layout = create_bind_group_layout(device, layoutTypes);
  const pipeline = await create_compute_pipeline(
    device,
    [layout],
    shader,
    'main',
    `${curveConfig.id}:decompose_scalars_only_f32${fuse_count ? ':fused-count' : ''}`,
  );
  const bgBuffers = fuse_count
    ? [scalars_sb, chunks_sb, params_ub, fused_col_ptr_sb!]
    : [scalars_sb, chunks_sb, params_ub];
  const bg = create_bind_group(device, layout, bgBuffers);

  execute_pipeline(encoder, pipeline, bg, wg.c_num_x_workgroups, wg.c_num_y_workgroups, 1);
  return chunks_sb;
}

// SMVP geometry: same policy as msm.ts for chunk_size in {15, 16, ≤7}.
function pick_smvp_geometry(num_columns: number, smvp_subtasks_per_iter: number): {
  s_workgroup_size: number;
  s_num_x_workgroups: number;
  s_num_y_workgroups: number;
  s_num_z_workgroups: number;
} {
  const half_num_columns = num_columns / 2;
  let s_workgroup_size: number;
  let s_num_x_workgroups: number;
  let s_num_y_workgroups: number;
  if (half_num_columns >= 32768) {
    s_workgroup_size = 256;
    s_num_x_workgroups = 64;
    s_num_y_workgroups = half_num_columns / s_workgroup_size / s_num_x_workgroups;
  } else if (num_columns >= 256) {
    s_workgroup_size = 32;
    s_num_x_workgroups = 1;
    s_num_y_workgroups = Math.ceil(half_num_columns / s_workgroup_size / s_num_x_workgroups);
  } else {
    s_workgroup_size = 1;
    s_num_x_workgroups = half_num_columns;
    s_num_y_workgroups = 1;
  }
  return {
    s_workgroup_size,
    s_num_x_workgroups,
    s_num_y_workgroups,
    s_num_z_workgroups: smvp_subtasks_per_iter,
  };
}

// One iteration of the f32 SMVP outer loop. Bind-group + dispatch only;
// the persistent buffers are owned by the caller.
async function smvp_f32_dispatch(
  shaderCode: string,
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  geom: {
    s_num_x_workgroups: number;
    s_num_y_workgroups: number;
    s_num_z_workgroups: number;
  },
  offset: number,
  input_size: number,
  all_csc_col_ptr_sb: GPUBuffer,
  point_x_sb: GPUBuffer,
  point_y_sb: GPUBuffer,
  all_csc_val_idxs_sb: GPUBuffer,
  bucket_x_sb: GPUBuffer,
  bucket_y_sb: GPUBuffer,
  bucket_z_sb: GPUBuffer,
): Promise<void> {
  const params_bytes = numbers_to_u8s_for_gpu([
    input_size,
    geom.s_num_y_workgroups,
    geom.s_num_z_workgroups,
    offset,
  ]);
  const params_ub = create_and_write_ub(device, params_bytes);

  const layout = create_bind_group_layout(device, [
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'storage',
    'storage',
    'uniform',
  ]);
  const pipeline = await create_compute_pipeline(device, [layout], shaderCode, 'main', 'smvp_f32');
  const bg = create_bind_group(device, layout, [
    all_csc_col_ptr_sb,
    all_csc_val_idxs_sb,
    point_x_sb,
    point_y_sb,
    bucket_x_sb,
    bucket_y_sb,
    bucket_z_sb,
    params_ub,
  ]);
  execute_pipeline(
    encoder,
    pipeline,
    bg,
    geom.s_num_x_workgroups,
    geom.s_num_y_workgroups,
    geom.s_num_z_workgroups,
  );
}

async function bpr_f32_dispatch(
  shaderCode: string,
  entryPoint: 'stage_1' | 'stage_2',
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  subtask_idx: number,
  num_x_workgroups: number,
  workgroup_size: number,
  num_columns: number,
  bucket_x_sb: GPUBuffer,
  bucket_y_sb: GPUBuffer,
  bucket_z_sb: GPUBuffer,
  g_points_x_sb: GPUBuffer,
  g_points_y_sb: GPUBuffer,
  g_points_z_sb: GPUBuffer,
): Promise<void> {
  const params_bytes = numbers_to_u8s_for_gpu([subtask_idx, num_columns, num_x_workgroups]);
  const params_ub = create_and_write_ub(device, params_bytes);
  const layout = create_bind_group_layout(device, [
    'storage',
    'storage',
    'storage',
    'storage',
    'storage',
    'storage',
    'uniform',
  ]);
  const pipeline = await create_compute_pipeline(device, [layout], shaderCode, entryPoint, `bpr_f32:${entryPoint}`);
  const bg = create_bind_group(device, layout, [
    bucket_x_sb,
    bucket_y_sb,
    bucket_z_sb,
    g_points_x_sb,
    g_points_y_sb,
    g_points_z_sb,
    params_ub,
  ]);
  execute_pipeline(encoder, pipeline, bg, num_x_workgroups, 1, 1);
}

async function horner_subtask_reduce_f32(
  shaderCode: string,
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  num_subtasks: number,
  g_points_x_sb: GPUBuffer,
  g_points_y_sb: GPUBuffer,
  g_points_z_sb: GPUBuffer,
  sums_x_sb: GPUBuffer,
  sums_y_sb: GPUBuffer,
  sums_z_sb: GPUBuffer,
): Promise<void> {
  const layout = create_bind_group_layout(device, [
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'storage',
    'storage',
  ]);
  const pipeline = await create_compute_pipeline(
    device,
    [layout],
    shaderCode,
    'subtask_reduce',
    'horner_subtask_reduce_f32',
  );
  const bg = create_bind_group(device, layout, [
    g_points_x_sb,
    g_points_y_sb,
    g_points_z_sb,
    sums_x_sb,
    sums_y_sb,
    sums_z_sb,
  ]);
  execute_pipeline(encoder, pipeline, bg, num_subtasks, 1, 1);
}

/**
 * BN254 MSM via the f32-Montgomery (23-bit limb) pipeline. Pure A/B
 * variant of `compute_bn254_msm`: no shared state, no encoding
 * conversion. Returns affine (x, y) of Σ s_i · P_i.
 *
 * Inputs:
 *   - `baseAffinePoints`: raw bytes, interleaved [x, y, x, y, ...] with
 *     `coordinateByteLength` bytes per coordinate (same as the u32 path).
 *   - `scalars`: raw bytes, 32 LE per scalar.
 *
 * Pre-existing GPU context not supported on this entry — every call
 * builds a fresh device. This mirrors `compute_bn254_msm`'s default
 * behaviour and keeps the f32 path simple while it stabilises. A
 * persistent-context variant can be added once perf testing locks the
 * f32 path in (step 5).
 */
export const compute_bn254_msm_f32 = async (
  baseAffinePoints: Buffer,
  scalars: Buffer,
): Promise<{ x: bigint; y: bigint }> => {
  const curveConfig: CurveConfig = BN254_CURVE_CONFIG;
  const p = curveConfig.baseFieldModulus;
  const params_f32 = compute_misc_params(p, WORD_SIZE_F32);
  const R_f = params_f32.r; // R_f = 2^276 mod p
  const Rinv_f = params_f32.rinv; // R_f^-1 mod p

  const input_size = scalars.length / curveConfig.scalarByteLength;
  if (input_size === 0) {
    return { x: 0n, y: 1n };
  }

  // Chunk-size policy: same as msm.ts (15 at N >= 65536, 4 below).
  const chunk_size = input_size >= 65536 ? 15 : 4;
  const num_columns = 2 ** chunk_size;
  const num_rows = Math.ceil(input_size / num_columns);
  const num_subtasks = Math.ceil(curveConfig.scalarBitLength / chunk_size);

  const shaderManager = new ShaderManager(chunk_size, input_size, curveConfig, false);

  // Pack the affine points to f32-Mont on the host. Option 2 per the
  // step plan: re-decode the raw input on the host into canonical
  // bigints, multiply by R_f, serialise into 12-limb f32 form. Cheap
  // for the smoke-test sizes targeted at this step; option 1 (a
  // dedicated GPU decompression shader producing f32-Mont) is left as
  // a perf optimisation for step 5.
  const { point_x_f32, point_y_f32 } = pack_affine_to_f32_mont(
    baseAffinePoints,
    input_size,
    curveConfig,
    R_f,
  );

  const device = await get_device();
  const encoder = device.createCommandEncoder();

  const point_x_bytes = new Uint8Array(point_x_f32.buffer, point_x_f32.byteOffset, point_x_f32.byteLength);
  const point_y_bytes = new Uint8Array(point_y_f32.buffer, point_y_f32.byteOffset, point_y_f32.byteLength);
  const point_x_sb = create_and_write_sb(device, point_x_bytes);
  const point_y_sb = create_and_write_sb(device, point_y_bytes);

  // Scalar decomposition — encoding-agnostic, runs the same u32 shader
  // as the production path.
  const scalar_chunks_sb = await decompose_scalars_only_f32(
    shaderManager,
    device,
    encoder,
    scalars,
    input_size,
    num_subtasks,
    num_columns,
    curveConfig,
  );

  // Transpose — encoding-agnostic.
  const countShader = shaderManager.gen_transpose_count_shader(64);
  const scanShader = shaderManager.gen_transpose_scan_shader(num_subtasks);
  const scatterShader = shaderManager.gen_transpose_scatter_shader(64);
  const xpose = await transpose_gpu_parallel(
    countShader,
    scanShader,
    scatterShader,
    device,
    encoder,
    input_size,
    num_columns,
    num_rows,
    num_subtasks,
    scalar_chunks_sb,
    undefined,
    undefined,
    curveConfig.id,
    chunk_size,
  );

  // SMVP geometry: same divisor policy as msm.ts.
  const default_smvp_subtasks_per_iter = 4;
  let smvp_subtasks_per_iter = default_smvp_subtasks_per_iter;
  while (smvp_subtasks_per_iter > 1 && num_subtasks % smvp_subtasks_per_iter !== 0) {
    smvp_subtasks_per_iter--;
  }
  const half_num_columns = num_columns / 2;
  const bucket_coord_bytes = half_num_columns * COORD_BYTES_F32 * num_subtasks;
  const bucket_x_sb = create_sb(device, bucket_coord_bytes);
  const bucket_y_sb = create_sb(device, bucket_coord_bytes);
  const bucket_z_sb = create_sb(device, bucket_coord_bytes);
  // Bucket buffers must start at zero: identity sentinel is Z=0, and
  // the SMVP shader only writes slots with bucket_idx > 0. Slot 0
  // (the j=0 "id%h==0" sentinel for row_idx=0) is also a no-write when
  // its row is empty, so we rely on a clean zero start.
  encoder.clearBuffer(bucket_x_sb);
  encoder.clearBuffer(bucket_y_sb);
  encoder.clearBuffer(bucket_z_sb);

  const smvp_geom = pick_smvp_geometry(num_columns, smvp_subtasks_per_iter);
  const smvp_shader = shaderManager.gen_smvp_f32_shader(
    smvp_geom.s_workgroup_size,
    num_columns,
  );
  for (let offset = 0; offset < num_subtasks; offset += smvp_subtasks_per_iter) {
    await smvp_f32_dispatch(
      smvp_shader,
      device,
      encoder,
      smvp_geom,
      offset,
      input_size,
      xpose.all_csc_col_ptr_sb,
      point_x_sb,
      point_y_sb,
      xpose.all_csc_val_idxs_sb,
      bucket_x_sb,
      bucket_y_sb,
      bucket_z_sb,
    );
  }

  // BPR. Dispatch all T subtasks in one outer iteration, like msm.ts.
  const num_subtasks_per_bpr = num_subtasks;
  const b_num_x_workgroups = num_subtasks_per_bpr;
  const b_workgroup_size = 256;
  const g_points_bytes = num_subtasks * b_workgroup_size * COORD_BYTES_F32;
  const g_points_x_sb = create_sb(device, g_points_bytes);
  const g_points_y_sb = create_sb(device, g_points_bytes);
  const g_points_z_sb = create_sb(device, g_points_bytes);
  encoder.clearBuffer(g_points_x_sb);
  encoder.clearBuffer(g_points_y_sb);
  encoder.clearBuffer(g_points_z_sb);

  const bpr_shader = shaderManager.gen_bpr_f32_shader(b_workgroup_size);
  for (let subtask_idx = 0; subtask_idx < num_subtasks; subtask_idx += num_subtasks_per_bpr) {
    await bpr_f32_dispatch(
      bpr_shader,
      'stage_1',
      device,
      encoder,
      subtask_idx,
      b_num_x_workgroups,
      b_workgroup_size,
      num_columns,
      bucket_x_sb,
      bucket_y_sb,
      bucket_z_sb,
      g_points_x_sb,
      g_points_y_sb,
      g_points_z_sb,
    );
  }
  for (let subtask_idx = 0; subtask_idx < num_subtasks; subtask_idx += num_subtasks_per_bpr) {
    await bpr_f32_dispatch(
      bpr_shader,
      'stage_2',
      device,
      encoder,
      subtask_idx,
      b_num_x_workgroups,
      b_workgroup_size,
      num_columns,
      bucket_x_sb,
      bucket_y_sb,
      bucket_z_sb,
      g_points_x_sb,
      g_points_y_sb,
      g_points_z_sb,
    );
  }

  // Subtask reduce on the GPU. CPU walks the final Horner chain (cheap;
  // T ≤ 17 doublings + adds).
  const sums_buf_size = (num_subtasks + 1) * COORD_BYTES_F32;
  const sums_x_sb = create_sb(device, sums_buf_size);
  const sums_y_sb = create_sb(device, sums_buf_size);
  const sums_z_sb = create_sb(device, sums_buf_size);
  encoder.clearBuffer(sums_x_sb);
  encoder.clearBuffer(sums_y_sb);
  encoder.clearBuffer(sums_z_sb);
  const horner_shader = shaderManager.gen_horner_reduce_f32_shader(
    num_subtasks,
    b_workgroup_size,
    chunk_size,
  );
  await horner_subtask_reduce_f32(
    horner_shader,
    device,
    encoder,
    num_subtasks,
    g_points_x_sb,
    g_points_y_sb,
    g_points_z_sb,
    sums_x_sb,
    sums_y_sb,
    sums_z_sb,
  );

  // Readback: T subtask sums × 3 coordinates × NUM_LIMBS_F32 × 4 bytes.
  const data = await read_from_gpu(
    device,
    encoder,
    [sums_x_sb, sums_y_sb, sums_z_sb],
    /* custom_size */ num_subtasks * COORD_BYTES_F32,
    /* source_offset */ 0,
    /* dest_offset */ 0,
  );

  device.destroy();

  // Decode T × BigIntF32 (Montgomery form), un-Mont via R_f^-1 mod p,
  // then run the Horner chain in Jacobian coordinates and convert the
  // final result to affine.
  const decode_f32 = (buf: Uint8Array): Float32Array =>
    new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const subtask_x_f32 = decode_f32(data[0]);
  const subtask_y_f32 = decode_f32(data[1]);
  const subtask_z_f32 = decode_f32(data[2]);
  assert(subtask_x_f32.length >= num_subtasks * NUM_LIMBS_F32);

  const subtask_sums: Bn254Jacobian[] = [];
  for (let i = 0; i < num_subtasks; i++) {
    const off = i * NUM_LIMBS_F32;
    const xMont = f32LimbsToBigint(subtask_x_f32.subarray(off, off + NUM_LIMBS_F32));
    const yMont = f32LimbsToBigint(subtask_y_f32.subarray(off, off + NUM_LIMBS_F32));
    const zMont = f32LimbsToBigint(subtask_z_f32.subarray(off, off + NUM_LIMBS_F32));
    subtask_sums.push({
      x: (xMont * Rinv_f) % p,
      y: (yMont * Rinv_f) % p,
      z: (zMont * Rinv_f) % p,
    });
  }

  // Horner chain: result = s[T-1]; for j=T-2..0: result = result * 2^cs + s[j].
  let resultJ: Bn254Jacobian = subtask_sums[subtask_sums.length - 1];
  for (let i = subtask_sums.length - 2; i >= 0; i--) {
    for (let b = 0; b < chunk_size; b++) {
      resultJ = doubleBn254Jacobian(resultJ);
    }
    resultJ = addBn254Jacobian(resultJ, subtask_sums[i]);
  }

  if (resultJ.z === 0n) {
    return { x: 0n, y: 0n };
  }
  const finalAffine = toAffineBn254Jacobian(resultJ);
  // Silence unused-import warnings if BN254_JACOBIAN_ZERO isn't referenced
  // directly in this file (it lives behind the addBn254Jacobian identity
  // short-circuit). Removing the var keeps the file lint-clean.
  void BN254_JACOBIAN_ZERO;
  return { x: finalAffine.x, y: finalAffine.y };
};

// Subset of helpers exported for unit-test reach-around. Used by
// `testMsmF32End2End` to spot-check host packing without sending data
// through the GPU.
export const __internal_f32 = {
  NUM_LIMBS_F32,
  WORD_SIZE_F32,
  bigintToF32MontLimbs,
  f32LimbsToBigint,
  pack_affine_to_f32_mont,
};

// --------- batch-affine f32 path ----------
//
// Mirror of the u32 path's `compute_bn254_msm_batch_affine` family. The
// architecture mirrors `compute_bn254_msm_cached`:
//
//   CachedBasesF32         — SRS bases in f32-Mont, GPU-resident, reused
//                            across many MSM calls (one per SRS, not
//                            per scalar set).
//   precompute_bn254_bases_f32
//                          — host-pack canonical affine bytes into
//                            f32-Mont and upload. Same input shape as
//                            `precompute_bn254_bases` (the u32 sibling).
//   precompute_bn254_bases_f32_from_compressed
//                          — production-path entry that takes compressed
//                            BN254 G1 bytes and runs the GPU f32
//                            decompress shader to produce f32-Mont bases
//                            directly. No host packing.
//   compute_bn254_msm_batch_affine_f32
//                          — main entry. Mirrors the u32 batch-affine
//                            dispatch sequence verbatim:
//                              decompose_scalars (encoding-agnostic) →
//                              transpose (encoding-agnostic) →
//                              ba_init_f32 →
//                              [ ba_schedule_f32 → ba_dispatch_args →
//                                ba_inverse_f32 → ba_apply_scatter_f32 ]
//                                  × MAX_ROUNDS →
//                              ba_finalize_collect_f32 →
//                              ba_finalize_inverse_f32 →
//                              ba_finalize_apply_f32 →
//                              bpr_stage_1_f32 → bpr_stage_2_f32 →
//                              horner_subtask_reduce_f32 → CPU Horner.

// Handle to f32-Mont SRS bases resident on the GPU. Same lifecycle
// semantics as `CachedBases`: caller owns it; `destroy()` frees the two
// storage buffers. `point_x_sb` / `point_y_sb` each pack
// `input_size × NUM_LIMBS_F32` f32 limbs (12 × 4 = 48 B per point).
export class CachedBasesF32 {
  readonly context: GpuContext;
  readonly input_size: number;
  readonly point_x_sb: GPUBuffer;
  readonly point_y_sb: GPUBuffer;

  constructor(context: GpuContext, input_size: number, point_x_sb: GPUBuffer, point_y_sb: GPUBuffer) {
    this.context = context;
    this.input_size = input_size;
    this.point_x_sb = point_x_sb;
    this.point_y_sb = point_y_sb;
  }

  destroy(): void {
    // See CachedBases.destroy() — persistent bind groups inside batch-
    // affine SMVP reference these buffers directly; invalidate them so
    // the next call rebuilds against live storage.
    this.context.invalidateAllBindGroups();
    this.point_x_sb.destroy();
    this.point_y_sb.destroy();
  }
}

/**
 * Pack the canonical-affine SRS buffer (same layout as
 * `precompute_bn254_bases`: alternating x, y, x, y, …) into f32-Mont GPU
 * buffers and return a `CachedBasesF32` handle.
 *
 * Host-pack path. Mirrors the u32 `precompute_bn254_bases` signature so
 * the dev page can A/B-swap them. The production entry that takes
 * compressed bytes and runs a GPU decompress shader is
 * `precompute_bn254_bases_f32_from_compressed`.
 */
export const precompute_bn254_bases_f32 = async (
  context: GpuContext,
  points_buffer: Buffer,
  curveConfig: CurveConfig = BN254_CURVE_CONFIG,
): Promise<CachedBasesF32> => {
  const p = curveConfig.baseFieldModulus;
  const R_f = compute_misc_params(p, WORD_SIZE_F32).r;
  const input_size = points_buffer.length / (curveConfig.coordinateByteLength * 2);
  const { point_x_f32, point_y_f32 } = pack_affine_to_f32_mont(points_buffer, input_size, curveConfig, R_f);

  const device = context.device;
  const x_bytes = new Uint8Array(point_x_f32.buffer, point_x_f32.byteOffset, point_x_f32.byteLength);
  const y_bytes = new Uint8Array(point_y_f32.buffer, point_y_f32.byteOffset, point_y_f32.byteLength);
  const point_x_sb = create_and_write_sb(device, x_bytes);
  const point_y_sb = create_and_write_sb(device, y_bytes);
  return new CachedBasesF32(context, input_size, point_x_sb, point_y_sb);
};

// Reverse the 32 BE bytes of each compressed point so the on-GPU u32[i]
// read at little-endian word index i yields the i'th 32-bit chunk of
// the value. Same convention as `gpu_decompress.ts`.
function pack_compressed_as_le_u32(compressed: Uint8Array, num_points: number): Uint8Array {
  const out = new Uint8Array(num_points * 32);
  for (let p = 0; p < num_points; p++) {
    for (let k = 0; k < 32; k++) {
      out[p * 32 + k] = compressed[p * 32 + 31 - k];
    }
  }
  return out;
}

/**
 * Production f32 SRS precompute: takes compressed BN254 G1 bytes (32 BE
 * per point, top bit = parity of y) and runs the GPU f32 decompress
 * shader to produce f32-Mont resident bases. No host packing.
 *
 * Output layout: same as `precompute_bn254_bases_f32` — two split
 * `array<BigIntF32>` storage buffers (one per coordinate). The
 * decompress shader emits an interleaved [x_mont | y_mont] buffer; we
 * split it on the host via two `copyBufferToBuffer` strides into the
 * final per-coordinate buffers, so the rest of the batch-affine f32
 * pipeline can bind them the same way it does for the host-pack path.
 */
export const precompute_bn254_bases_f32_from_compressed = async (
  context: GpuContext,
  compressed_buffer: Uint8Array,
  num_points: number,
): Promise<CachedBasesF32> => {
  if (compressed_buffer.length < num_points * 32) {
    throw new Error(
      `precompute_bn254_bases_f32_from_compressed: input too small (${compressed_buffer.length} < ${num_points * 32})`,
    );
  }
  const device = context.device;

  // Shader manager: chunk_size/input_size are irrelevant for decompress.
  const sm = context.getShaderManager(BN254_CURVE_CONFIG, num_points >= 65536 ? 15 : 4, num_points);
  const WORKGROUP_SIZE = 64;
  const shaderCode = context.getOrRenderShaderCode(
    `bn254:decompress_g1_f32:${WORKGROUP_SIZE}:${num_points}`,
    () => sm.gen_decompress_g1_bn254_f32_shader(WORKGROUP_SIZE),
  );

  const in_bytes = pack_compressed_as_le_u32(compressed_buffer.subarray(0, num_points * 32), num_points);
  const interleaved_bytes = num_points * 2 * COORD_BYTES_F32;

  const in_sb = create_and_write_sb(device, in_bytes);
  const interleaved_sb = create_sb(device, interleaved_bytes);
  // input_size uniform; pad to 16 bytes to satisfy std140 alignment.
  const u_bytes = new Uint8Array(16);
  new DataView(u_bytes.buffer).setUint32(0, num_points, true);
  const u_ub = create_and_write_ub(device, u_bytes);

  const layout = create_bind_group_layout(device, ['read-only-storage', 'storage', 'uniform']);
  const { pipeline } = await context.getOrCreatePipeline(
    `bn254:decompress_g1_f32:${WORKGROUP_SIZE}:${num_points}`,
    async () => {
      const bindGroupLayout = layout;
      const p = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        shaderCode,
        'main',
        `bn254:decompress_g1_f32:${num_points}`,
      );
      return { pipeline: p, bindGroupLayout };
    },
  );
  const bg = create_bind_group(device, layout, [in_sb, interleaved_sb, u_ub]);

  // Final per-coordinate buffers — same shape as `precompute_bn254_bases_f32`.
  const point_x_sb = create_sb(device, num_points * COORD_BYTES_F32);
  const point_y_sb = create_sb(device, num_points * COORD_BYTES_F32);

  const encoder = device.createCommandEncoder();
  const num_groups_x = Math.ceil(num_points / WORKGROUP_SIZE);
  const MAX_X = 65535;
  if (num_groups_x > MAX_X) {
    throw new Error(`precompute_bn254_bases_f32_from_compressed: ${num_groups_x} workgroups exceeds per-dim cap ${MAX_X}`);
  }
  execute_pipeline(encoder, pipeline, bg, num_groups_x, 1, 1);

  // Split interleaved [x|y] into the two per-coord buffers. Each point
  // owns 2*COORD_BYTES_F32 contiguous bytes in `interleaved_sb`; we copy
  // the x half into point_x_sb[i*COORD_BYTES_F32 ..] and the y half into
  // point_y_sb[i*COORD_BYTES_F32 ..]. copyBufferToBuffer is per-point
  // (num_points calls); each call is a small DMA fence. For SRS sizes
  // (≤2^21 = 2M points), this runs in the background while the rest of
  // the page is responsive.
  for (let i = 0; i < num_points; i++) {
    const src_off = i * 2 * COORD_BYTES_F32;
    const dst_off = i * COORD_BYTES_F32;
    encoder.copyBufferToBuffer(interleaved_sb, src_off, point_x_sb, dst_off, COORD_BYTES_F32);
    encoder.copyBufferToBuffer(interleaved_sb, src_off + COORD_BYTES_F32, point_y_sb, dst_off, COORD_BYTES_F32);
  }

  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();

  in_sb.destroy();
  interleaved_sb.destroy();
  u_ub.destroy();

  return new CachedBasesF32(context, num_points, point_x_sb, point_y_sb);
};

// Helper: pick finalize geometry the same way batch_affine.ts does.
function pick_finalize_geometry(num_columns: number, half_num_columns: number, num_subtasks: number): {
  f_workgroup_size: number;
  f_num_x_workgroups: number;
  f_num_y_workgroups: number;
  f_num_z_workgroups: number;
} {
  let f_workgroup_size = 256;
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
  return { f_workgroup_size, f_num_x_workgroups, f_num_y_workgroups, f_num_z_workgroups };
}

// Helper: per-N MAX_ROUNDS table, identical to batch_affine.ts.
function pick_max_rounds(num_columns: number, input_size: number): number {
  const cs15 = num_columns === 1 << 15;
  if (cs15) {
    if (input_size >= 1 << 20) return 192;
    if (input_size >= 1 << 19) return 128;
    if (input_size >= 1 << 18) return 64;
    if (input_size >= 1 << 17) return 48;
    return 32;
  }
  if (input_size >= 1 << 20) return 256;
  if (input_size >= 1 << 19) return 192;
  if (input_size >= 1 << 18) return 96;
  return 64;
}

/**
 * BN254 MSM via the batch-affine f32-Montgomery pipeline. Same I/O
 * contract as `compute_bn254_msm_batch_affine` (warm SRS path):
 *
 *   - `context` — persistent GpuContext (caller owns lifecycle).
 *   - `cachedBases` — CachedBasesF32 from `precompute_bn254_bases_f32`
 *                    (or `..._from_compressed`).
 *   - `scalars` — raw bytes, 32 LE per scalar.
 *
 * Returns affine (x, y) of Σ s_i · P_i.
 *
 * The dispatch sequence mirrors the u32 path verbatim — same shader
 * stages, same workgroup sizes, same indirect-dispatch flow — but every
 * field-element buffer is `array<BigIntF32>` and every Mont arithmetic
 * routine is `_f32`. Zero u32↔f32 encoding conversions on any path.
 */
export const compute_bn254_msm_batch_affine_f32 = async (
  context: GpuContext,
  cachedBases: CachedBasesF32,
  scalars: Buffer,
): Promise<{ x: bigint; y: bigint }> => {
  if (cachedBases.context !== context) {
    throw new Error('compute_bn254_msm_batch_affine_f32: cachedBases.context must equal the passed-in context');
  }
  const curveConfig: CurveConfig = BN254_CURVE_CONFIG;
  const p = curveConfig.baseFieldModulus;
  const params_f32 = compute_misc_params(p, WORD_SIZE_F32);
  const R_f = params_f32.r;
  const Rinv_f = params_f32.rinv;

  const input_size = cachedBases.input_size;
  if (input_size === 0) {
    return { x: 0n, y: 1n };
  }
  if (scalars.length / curveConfig.scalarByteLength !== input_size) {
    throw new Error(
      `compute_bn254_msm_batch_affine_f32: scalar count ${
        scalars.length / curveConfig.scalarByteLength
      } does not match cached base count ${input_size}`,
    );
  }

  // Same chunk_size policy as the u32 path.
  const chunk_size = input_size >= 65536 ? 15 : 4;
  const num_columns = 2 ** chunk_size;
  const num_rows = Math.ceil(input_size / num_columns);
  const num_subtasks = Math.ceil(curveConfig.scalarBitLength / chunk_size);
  const half_num_columns = num_columns / 2;

  const shaderManager = context.getShaderManager(curveConfig, chunk_size, input_size);
  const device = context.device;
  const encoder = device.createCommandEncoder();

  // ----- Stage 1: scalar decompose (encoding-agnostic u32 shader).
  //
  // Warm-batch-affine variant: the decompose shader is compiled with
  // `count_into_col_ptr = true` (the only variant the u32 batch-affine
  // path actually exercises), so the kernel atomicAdds into the CSC
  // column counter inline. transpose_count is then elided in
  // `transpose_gpu_parallel`. Matches msm.ts: lines 656-686.
  const fused_col_ptr_sb = create_sb(device, num_subtasks * (num_columns + 1) * 4);
  encoder.clearBuffer(fused_col_ptr_sb);
  const scalar_chunks_sb = await decompose_scalars_only_f32(
    shaderManager,
    device,
    encoder,
    scalars,
    input_size,
    num_subtasks,
    num_columns,
    curveConfig,
    fused_col_ptr_sb,
  );

  // ----- Stage 2: transpose (encoding-agnostic).
  // transpose_count is skipped because decompose already populated col_ptr.
  const countShader = shaderManager.gen_transpose_count_shader(64);
  const scanShader = shaderManager.gen_transpose_scan_shader(num_subtasks);
  const scatterShader = shaderManager.gen_transpose_scatter_shader(64);
  const xpose = await transpose_gpu_parallel(
    countShader,
    scanShader,
    scatterShader,
    device,
    encoder,
    input_size,
    num_columns,
    num_rows,
    num_subtasks,
    scalar_chunks_sb,
    undefined,
    undefined,
    curveConfig.id,
    chunk_size,
    fused_col_ptr_sb,
  );
  const all_csc_col_ptr_sb = xpose.all_csc_col_ptr_sb;
  const all_csc_val_idxs_sb = xpose.all_csc_val_idxs_sb;

  // ----- Stage 3: batch-affine SMVP (init → round loop → finalize).
  const total_buckets = num_subtasks * num_columns;
  const limb_byte_length = COORD_BYTES_F32;
  const ws_byte_len = total_buckets * limb_byte_length;

  // Workspace buffers — fresh per call (no persistent context support in
  // the f32 path yet; the dev page wraps each call in its own command
  // encoder anyway, so persistence buys nothing until step 5).
  const running_x_sb = create_sb(device, ws_byte_len);
  const running_y_sb = create_sb(device, ws_byte_len);
  const bucket_cursor_sb = create_sb(device, total_buckets * 4);
  const bucket_active_sb = create_sb(device, total_buckets * 4);

  const MAX_PAIRS_PER_SUBTASK = num_columns;
  const pool_capacity = num_subtasks * MAX_PAIRS_PER_SUBTASK;
  const pair_buf_size = pool_capacity * limb_byte_length;
  const pair_delta_sb = create_sb(device, pair_buf_size);
  const pair_inv_sb = create_sb(device, pair_buf_size);
  const pair_prefix_sb = create_sb(device, pair_buf_size);
  const pair_target_meta_sb = create_sb(device, pool_capacity * 8);
  const pair_counter_sb = create_sb(device, num_subtasks * 4);
  const round_count_sb = create_sb(device, num_subtasks * 4);
  const dispatch_args_sb = device.createBuffer({
    size: 36,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST | GPUBufferUsage.INDIRECT,
  });
  const finalize_count_sb = create_and_write_sb(
    device,
    new Uint8Array(new Uint32Array(new Array(num_subtasks).fill(half_num_columns)).buffer),
  );

  // Output bucket sums (per-subtask Jacobian sums, written by finalize).
  const bucket_sum_bytes = half_num_columns * COORD_BYTES_F32 * num_subtasks;
  const bucket_sum_x_sb = create_sb(device, bucket_sum_bytes);
  const bucket_sum_y_sb = create_sb(device, bucket_sum_bytes);
  const bucket_sum_z_sb = create_sb(device, bucket_sum_bytes);

  // Workgroup sizes — same as batch_affine.ts.
  const init_workgroup_size = 256;
  const schedule_workgroup_size = 256;
  const apply_workgroup_size = 64;
  const NUM_SUB_WGS_PER_SUBTASK = 8;
  const finalize_geom = pick_finalize_geometry(num_columns, half_num_columns, num_subtasks);

  // Shader sources.
  const init_shader = shaderManager.gen_batch_affine_init_f32_shader(init_workgroup_size);
  const schedule_shader = shaderManager.gen_batch_affine_schedule_f32_shader(schedule_workgroup_size);
  const inverse_shader = shaderManager.gen_batch_inverse_parallel_f32_shader(NUM_SUB_WGS_PER_SUBTASK);
  const apply_shader = shaderManager.gen_batch_affine_apply_scatter_f32_shader(apply_workgroup_size);
  const dispatch_args_shader = shaderManager.gen_batch_affine_dispatch_args_f32_shader();
  const finalize_collect_shader = shaderManager.gen_batch_affine_finalize_collect_f32_shader(
    finalize_geom.f_workgroup_size,
    num_columns,
  );
  const finalize_apply_shader = shaderManager.gen_batch_affine_finalize_apply_f32_shader(
    finalize_geom.f_workgroup_size,
    num_columns,
  );

  // Pipelines + bind-group layouts.
  const init_layout = create_bind_group_layout(device, [
    'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage',
    'storage', 'storage', 'storage', 'storage', 'uniform',
  ]);
  const schedule_layout = create_bind_group_layout(device, [
    'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage',
    'storage', 'storage', 'storage', 'storage', 'uniform',
  ]);
  const inverse_layout = create_bind_group_layout(device, [
    'read-only-storage', 'storage', 'storage', 'storage', 'uniform',
  ]);
  const apply_layout = create_bind_group_layout(device, [
    'read-only-storage', 'read-only-storage', 'read-only-storage',
    'storage', 'storage', 'read-only-storage', 'read-only-storage', 'storage', 'uniform',
  ]);
  const dispatch_args_layout = create_bind_group_layout(device, [
    'storage', 'storage', 'storage', 'uniform',
  ]);
  const finalize_collect_layout = create_bind_group_layout(device, [
    'read-only-storage', 'read-only-storage', 'read-only-storage',
    'storage', 'storage', 'storage', 'storage', 'uniform',
  ]);
  const finalize_apply_layout = create_bind_group_layout(device, [
    'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage',
    'storage', 'storage', 'storage', 'uniform',
  ]);

  const init_pipe = await create_compute_pipeline(device, [init_layout], init_shader, 'main', 'bn254:ba_init_f32');
  const schedule_pipe = await create_compute_pipeline(device, [schedule_layout], schedule_shader, 'main', 'bn254:ba_schedule_f32');
  const inverse_pipe = await create_compute_pipeline(device, [inverse_layout], inverse_shader, 'main', 'bn254:ba_inverse_f32');
  const apply_pipe = await create_compute_pipeline(device, [apply_layout], apply_shader, 'main', 'bn254:ba_apply_f32');
  const dispatch_args_pipe = await create_compute_pipeline(
    device, [dispatch_args_layout], dispatch_args_shader, 'main', 'bn254:ba_dispatch_args_f32',
  );
  const finalize_collect_pipe = await create_compute_pipeline(
    device, [finalize_collect_layout], finalize_collect_shader, 'main', 'bn254:ba_finalize_collect_f32',
  );
  const finalize_apply_pipe = await create_compute_pipeline(
    device, [finalize_apply_layout], finalize_apply_shader, 'main', 'bn254:ba_finalize_apply_f32',
  );

  // Uniforms.
  const init_ub = create_and_write_ub(device, numbers_to_u8s_for_gpu([total_buckets, num_columns, input_size, 0]));
  const schedule_ub = create_and_write_ub(device, numbers_to_u8s_for_gpu([num_columns, input_size, 0, 0]));
  const apply_ub = create_and_write_ub(device, numbers_to_u8s_for_gpu([num_columns, input_size, 0, 0]));
  const sched_x_groups = Math.ceil(num_columns / schedule_workgroup_size);
  const dispatch_args_ub = create_and_write_ub(
    device,
    numbers_to_u8s_for_gpu([num_subtasks, apply_workgroup_size, sched_x_groups, NUM_SUB_WGS_PER_SUBTASK]),
  );
  const inverse_smvp_ub = create_and_write_ub(device, numbers_to_u8s_for_gpu([num_columns, 0, 0, 0]));
  const inverse_finalize_ub = create_and_write_ub(device, numbers_to_u8s_for_gpu([half_num_columns, 0, 0, 0]));
  const finalize_ub = create_and_write_ub(
    device,
    numbers_to_u8s_for_gpu([finalize_geom.f_num_y_workgroups, finalize_geom.f_num_z_workgroups, 0, num_columns]),
  );

  // Bind groups.
  const init_bg = create_bind_group(device, init_layout, [
    all_csc_col_ptr_sb, all_csc_val_idxs_sb, cachedBases.point_x_sb, cachedBases.point_y_sb,
    running_x_sb, running_y_sb, bucket_cursor_sb, bucket_active_sb, init_ub,
  ]);
  const schedule_bg = create_bind_group(device, schedule_layout, [
    all_csc_col_ptr_sb, all_csc_val_idxs_sb, cachedBases.point_x_sb, running_x_sb,
    bucket_cursor_sb, pair_delta_sb, pair_target_meta_sb, pair_counter_sb, schedule_ub,
  ]);
  const inverse_bg = create_bind_group(device, inverse_layout, [
    pair_delta_sb, pair_prefix_sb, pair_inv_sb, round_count_sb, inverse_smvp_ub,
  ]);
  const apply_bg = create_bind_group(device, apply_layout, [
    all_csc_val_idxs_sb, cachedBases.point_x_sb, cachedBases.point_y_sb,
    running_x_sb, running_y_sb, pair_target_meta_sb, pair_inv_sb, round_count_sb, apply_ub,
  ]);
  const dispatch_args_bg = create_bind_group(device, dispatch_args_layout, [
    pair_counter_sb, round_count_sb, dispatch_args_sb, dispatch_args_ub,
  ]);
  const finalize_collect_bg = create_bind_group(device, finalize_collect_layout, [
    running_x_sb, running_y_sb, bucket_active_sb,
    bucket_sum_x_sb, bucket_sum_y_sb, bucket_sum_z_sb, pair_delta_sb, finalize_ub,
  ]);
  const finalize_inverse_bg = create_bind_group(device, inverse_layout, [
    pair_delta_sb, pair_prefix_sb, pair_inv_sb, finalize_count_sb, inverse_finalize_ub,
  ]);
  const finalize_apply_bg = create_bind_group(device, finalize_apply_layout, [
    running_x_sb, running_y_sb, bucket_active_sb, pair_inv_sb,
    bucket_sum_x_sb, bucket_sum_y_sb, bucket_sum_z_sb, finalize_ub,
  ]);

  // 1. Init.
  const init_x_groups = Math.ceil(total_buckets / init_workgroup_size);
  await execute_pipeline(encoder, init_pipe, init_bg, init_x_groups, 1, 1);

  // 2. Round loop (indirect dispatch).
  const MAX_ROUNDS = pick_max_rounds(num_columns, input_size);
  // pair_counter starts at zero — startup clear.
  encoder.clearBuffer(pair_counter_sb, 0, num_subtasks * 4);
  // Pre-seed dispatch_args with round 0's schedule arg triple.
  const initial_args = new Uint32Array([
    sched_x_groups, 1, num_subtasks,
    0, 0, 0,
    0, 0, 0,
  ]);
  device.queue.writeBuffer(dispatch_args_sb, 0, initial_args.buffer);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    execute_pipeline_indirect(encoder, schedule_pipe, schedule_bg, dispatch_args_sb, 0);
    await execute_pipeline(encoder, dispatch_args_pipe, dispatch_args_bg, 1, 1, 1);
    execute_pipeline_indirect(encoder, inverse_pipe, inverse_bg, dispatch_args_sb, 12);
    execute_pipeline_indirect(encoder, apply_pipe, apply_bg, dispatch_args_sb, 24);
  }

  // 3. Finalize: collect → batch_inverse → apply.
  await execute_pipeline(
    encoder,
    finalize_collect_pipe,
    finalize_collect_bg,
    finalize_geom.f_num_x_workgroups,
    finalize_geom.f_num_y_workgroups,
    finalize_geom.f_num_z_workgroups,
  );
  await execute_pipeline(encoder, inverse_pipe, finalize_inverse_bg, NUM_SUB_WGS_PER_SUBTASK, 1, num_subtasks);
  await execute_pipeline(
    encoder,
    finalize_apply_pipe,
    finalize_apply_bg,
    finalize_geom.f_num_x_workgroups,
    finalize_geom.f_num_y_workgroups,
    finalize_geom.f_num_z_workgroups,
  );

  // ----- Stage 4: BPR (two stages). Same dispatch shape as the u32 path.
  const num_subtasks_per_bpr = num_subtasks;
  const b_num_x_workgroups = num_subtasks_per_bpr;
  const b_workgroup_size = 256;
  const g_points_bytes = num_subtasks * b_workgroup_size * COORD_BYTES_F32;
  const g_points_x_sb = create_sb(device, g_points_bytes);
  const g_points_y_sb = create_sb(device, g_points_bytes);
  const g_points_z_sb = create_sb(device, g_points_bytes);
  encoder.clearBuffer(g_points_x_sb);
  encoder.clearBuffer(g_points_y_sb);
  encoder.clearBuffer(g_points_z_sb);

  // Batch-affine SMVP buckets carry Z = R_f (Mont-1) on the affine path
  // and Z = 0 on identity. The u32 batch-affine path picks the
  // `safe_first_add_no_collision` BPR variant to skip the bigint_eq
  // pair in the first add. Match that policy.
  const bpr_shader = shaderManager.gen_bpr_f32_shader(
    b_workgroup_size,
    /* assume_affine_buckets */ false,
    /* mixed_safe_buckets */ false,
    /* safe_first_add_no_collision */ true,
  );

  for (let subtask_idx = 0; subtask_idx < num_subtasks; subtask_idx += num_subtasks_per_bpr) {
    await bpr_f32_dispatch(
      bpr_shader, 'stage_1', device, encoder, subtask_idx,
      b_num_x_workgroups, b_workgroup_size, num_columns,
      bucket_sum_x_sb, bucket_sum_y_sb, bucket_sum_z_sb,
      g_points_x_sb, g_points_y_sb, g_points_z_sb,
    );
  }
  for (let subtask_idx = 0; subtask_idx < num_subtasks; subtask_idx += num_subtasks_per_bpr) {
    await bpr_f32_dispatch(
      bpr_shader, 'stage_2', device, encoder, subtask_idx,
      b_num_x_workgroups, b_workgroup_size, num_columns,
      bucket_sum_x_sb, bucket_sum_y_sb, bucket_sum_z_sb,
      g_points_x_sb, g_points_y_sb, g_points_z_sb,
    );
  }

  // ----- Stage 5: GPU subtask-reduce (CPU runs the Horner chain).
  const sums_buf_size = (num_subtasks + 1) * COORD_BYTES_F32;
  const sums_x_sb = create_sb(device, sums_buf_size);
  const sums_y_sb = create_sb(device, sums_buf_size);
  const sums_z_sb = create_sb(device, sums_buf_size);
  encoder.clearBuffer(sums_x_sb);
  encoder.clearBuffer(sums_y_sb);
  encoder.clearBuffer(sums_z_sb);
  const horner_shader = shaderManager.gen_horner_reduce_f32_shader(num_subtasks, b_workgroup_size, chunk_size);
  await horner_subtask_reduce_f32(
    horner_shader, device, encoder, num_subtasks,
    g_points_x_sb, g_points_y_sb, g_points_z_sb,
    sums_x_sb, sums_y_sb, sums_z_sb,
  );

  // ----- Readback + CPU Horner.
  const data = await read_from_gpu(
    device, encoder,
    [sums_x_sb, sums_y_sb, sums_z_sb],
    /* custom_size */ num_subtasks * COORD_BYTES_F32,
    /* source_offset */ 0,
    /* dest_offset */ 0,
  );

  const decode_f32 = (buf: Uint8Array): Float32Array =>
    new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const subtask_x_f32 = decode_f32(data[0]);
  const subtask_y_f32 = decode_f32(data[1]);
  const subtask_z_f32 = decode_f32(data[2]);
  assert(subtask_x_f32.length >= num_subtasks * NUM_LIMBS_F32);

  const subtask_sums: Bn254Jacobian[] = [];
  for (let i = 0; i < num_subtasks; i++) {
    const off = i * NUM_LIMBS_F32;
    const xMont = f32LimbsToBigint(subtask_x_f32.subarray(off, off + NUM_LIMBS_F32));
    const yMont = f32LimbsToBigint(subtask_y_f32.subarray(off, off + NUM_LIMBS_F32));
    const zMont = f32LimbsToBigint(subtask_z_f32.subarray(off, off + NUM_LIMBS_F32));
    subtask_sums.push({
      x: (xMont * Rinv_f) % p,
      y: (yMont * Rinv_f) % p,
      z: (zMont * Rinv_f) % p,
    });
  }

  let resultJ: Bn254Jacobian = subtask_sums[subtask_sums.length - 1];
  for (let i = subtask_sums.length - 2; i >= 0; i--) {
    for (let b = 0; b < chunk_size; b++) {
      resultJ = doubleBn254Jacobian(resultJ);
    }
    resultJ = addBn254Jacobian(resultJ, subtask_sums[i]);
  }

  if (resultJ.z === 0n) {
    return { x: 0n, y: 0n };
  }
  const finalAffine = toAffineBn254Jacobian(resultJ);
  // R_f, sched_x_groups, num_rows are referenced via constants — keep
  // them from being lint-flagged when the helper imports change.
  void R_f;
  void num_rows;
  return { x: finalAffine.x, y: finalAffine.y };
};
