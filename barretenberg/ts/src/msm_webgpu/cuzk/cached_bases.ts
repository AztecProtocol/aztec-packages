/**
 * SRS-aware BN254 MSM: precompute bases once, skip Stage-1 on every call.
 *
 * Honk / chonk proving issues 20–50 MSMs per proof against the *same*
 * SRS. The previous pipeline paid Stage-1 (point upload + Barrett
 * reduction + Montgomery conversion) on every one of those calls. This
 * module splits that work into two pieces:
 *
 *   1. `precompute_bn254_bases(context, points_buffer)`
 *      - Uploads the raw affine SRS once.
 *      - Dispatches a point-only variant of the Stage-1 shader that
 *        writes Montgomery-form (x, y) BigInt buffers and nothing else.
 *      - Returns a `CachedBases` handle that holds both storage buffers
 *        on the context's device.
 *
 *   2. `compute_bn254_msm_cached(context, handle, scalars_buffer)`
 *      - Uploads the scalars only (~32 bytes per scalar vs ~112 bytes
 *        per scalar when points must also be uploaded).
 *      - Dispatches a scalars-only signed-digit decomposition shader.
 *      - Reuses the existing transpose → SMVP → BPR → Horner tail,
 *        threading in `context` so pipelines are fetched from cache.
 *
 * The caller owns the `CachedBases` lifetime. `handle.destroy()` frees
 * the two storage buffers; `context.destroy()` implicitly frees them
 * too when the device goes away.
 */

import { GpuContext } from "./gpu_context.js";
import { CurveConfig, BN254_CURVE_CONFIG } from "./curve_config.js";
import {
  create_and_write_sb,
  create_and_write_ub,
  create_bind_group,
  create_bind_group_layout,
  create_compute_pipeline,
  create_sb,
  execute_pipeline,
  CpuTimer,
} from "./gpu.js";
import { compute_misc_params, numbers_to_u8s_for_gpu } from "./utils.js";

/**
 * Handle to pre-Montgomerised SRS bases residing on the GPU.
 *
 * `point_x_sb` and `point_y_sb` are packed arrays of `num_words` u32
 * limbs in 13-bit little-endian form, one BigInt per point, indexed
 * by SRS position. Both buffers live on `context.device` and must not
 * be freed while MSM calls referencing them are in flight.
 */
export class CachedBases {
  readonly context: GpuContext;
  readonly curveConfig: CurveConfig;
  readonly input_size: number;
  readonly num_words: number;
  readonly word_size: number;
  readonly point_x_sb: GPUBuffer;
  readonly point_y_sb: GPUBuffer;

  constructor(
    context: GpuContext,
    curveConfig: CurveConfig,
    input_size: number,
    num_words: number,
    word_size: number,
    point_x_sb: GPUBuffer,
    point_y_sb: GPUBuffer,
  ) {
    this.context = context;
    this.curveConfig = curveConfig;
    this.input_size = input_size;
    this.num_words = num_words;
    this.word_size = word_size;
    this.point_x_sb = point_x_sb;
    this.point_y_sb = point_y_sb;
  }

  destroy(): void {
    this.point_x_sb.destroy();
    this.point_y_sb.destroy();
  }
}

/**
 * Upload `points_buffer` to the GPU and produce Montgomery-form
 * coordinate buffers that can be reused by many subsequent MSMs.
 *
 * `points_buffer` uses the same layout as the existing
 * `compute_bn254_msm`: alternating x, y, x, y, ... with
 * `curveConfig.coordinateByteLength` bytes per coordinate.
 */
export const precompute_bn254_bases = async (
  context: GpuContext,
  points_buffer: Buffer,
  log_progress = false,
  curveConfig: CurveConfig = BN254_CURVE_CONFIG,
): Promise<CachedBases> => {
  const curveParams = compute_misc_params(
    curveConfig.baseFieldModulus,
    curveConfig.wordSize,
  );
  const num_words = curveParams.num_words;
  const input_size =
    points_buffer.length / (curveConfig.coordinateByteLength * 2);

  const device = context.device;
  const commandEncoder = device.createCommandEncoder();
  const cpu_timer = new CpuTimer(log_progress);
  cpu_timer.mark("precompute_begin");

  // Split the raw input across two storage buffers so we stay under
  // `maxStorageBufferBindingSize`. Same layout as the original Stage-1
  // convert path, so the point-only shader can be a near-verbatim fork.
  const half_length = points_buffer.length / 2;
  const first_half_bytes = points_buffer.slice(0, half_length);
  const second_half_bytes = points_buffer.slice(half_length);

  cpu_timer.mark("upload_begin");
  const first_half_sb = create_and_write_sb(device, first_half_bytes);
  const second_half_sb = create_and_write_sb(device, second_half_bytes);
  cpu_timer.phaseFrom("upload_srs_raw", "upload_begin");

  // Output buffers — Montgomery-form x and y. Persisted on the context;
  // returned via `CachedBases`.
  const point_x_sb = create_sb(device, input_size * num_words * 4);
  const point_y_sb = create_sb(device, input_size * num_words * 4);

  // Uniform: input_size. Everything else is template-substituted.
  const params_bytes = numbers_to_u8s_for_gpu([input_size]);
  const params_ub = create_and_write_ub(device, params_bytes);

  // Pick a workgroup shape that covers `input_size`. The math here mirrors
  // `calculate_workgoups` but is duplicated because the point-only shader
  // has a different binding layout (5 bindings instead of 7), so a
  // different template-substituted `num_y_workgroups` is needed and is
  // baked into the cache key.
  let workgroup_size = 256;
  let num_x_workgroups = 1;
  let num_y_workgroups = input_size / workgroup_size / num_x_workgroups;
  if (input_size <= 256) {
    workgroup_size = input_size;
    num_x_workgroups = 1;
    num_y_workgroups = 1;
  } else if (input_size <= 32768) {
    workgroup_size = 64;
    num_x_workgroups = 4;
    num_y_workgroups = input_size / workgroup_size / num_x_workgroups;
  } else if (input_size <= 131072) {
    workgroup_size = 256;
    num_x_workgroups = 8;
    num_y_workgroups = input_size / workgroup_size / num_x_workgroups;
  } else if (input_size <= 524288) {
    workgroup_size = 256;
    num_x_workgroups = 32;
    num_y_workgroups = input_size / workgroup_size / num_x_workgroups;
  } else {
    workgroup_size = 256;
    num_x_workgroups = 32;
    num_y_workgroups = input_size / workgroup_size / num_x_workgroups;
  }

  const sm = context.getShaderManager(
    curveConfig,
    input_size >= 65536 ? 16 : 4,
    input_size,
  );
  const shaderCode = context.getOrRenderShaderCode(
    `${curveConfig.id}:convert_points_only:${workgroup_size}:${num_y_workgroups}:${input_size}`,
    () => sm.gen_convert_points_only_shader(workgroup_size, num_y_workgroups),
  );

  const bindLayoutTypes: Array<"read-only-storage" | "storage" | "uniform"> = [
    "read-only-storage",
    "read-only-storage",
    "storage",
    "storage",
    "uniform",
  ];

  const { pipeline, bindGroupLayout } = await context.getOrCreatePipeline(
    `${curveConfig.id}:convert_points_only:${workgroup_size}:${num_y_workgroups}:${input_size}`,
    async () => {
      const bindGroupLayout = create_bind_group_layout(device, bindLayoutTypes);
      const pipeline = await create_compute_pipeline(
        device,
        [bindGroupLayout],
        shaderCode,
        "main",
      );
      return { pipeline, bindGroupLayout };
    },
  );

  const bindGroup = create_bind_group(device, bindGroupLayout, [
    first_half_sb,
    second_half_sb,
    point_x_sb,
    point_y_sb,
    params_ub,
  ]);

  execute_pipeline(
    commandEncoder,
    pipeline,
    bindGroup,
    num_x_workgroups,
    num_y_workgroups,
    1,
  );

  device.queue.submit([commandEncoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  cpu_timer.phaseFrom("precompute_total", "precompute_begin");

  // We can release the raw-upload buffers now that the shader has
  // read them and written the Montgomery-form output. Keeping them
  // around would waste 80 MB at n=2^20.
  first_half_sb.destroy();
  second_half_sb.destroy();
  params_ub.destroy();

  if (log_progress) {
    const r = cpu_timer.report();
    console.log(`[precompute_bases] curve=${curveConfig.id} N=${input_size}`);
    for (const { label, ms } of r.phases) {
      console.log(`  ${label.padEnd(22)} ${ms.toFixed(2)} ms`);
    }
    console.log(`  ${"wall".padEnd(22)} ${r.total_wall_ms.toFixed(2)} ms`);
  }

  return new CachedBases(
    context,
    curveConfig,
    input_size,
    num_words,
    curveConfig.wordSize,
    point_x_sb,
    point_y_sb,
  );
};
