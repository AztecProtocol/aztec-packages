import { ShaderManager } from "./shader_manager.js";

export { fqCubeRootOfUnityMont } from "./straus_constants.js";

export interface CompiledPipeline {
  pipeline: GPUComputePipeline;
  layout: GPUBindGroupLayout;
}

/**
 * Compiled-pipeline factory for the `straus_msm` WebGPU kernels. Each
 * static method renders WGSL via the shared `ShaderManager` and returns a
 * `GPUComputePipeline` paired with its bind-group layout. The renderers
 * are deliberately stateless: per-input-size pipelines are short-lived
 * artefacts owned by the higher-level driver (P6's `TrivialMsm`).
 *
 * P2 only exposes the lookup-precompute pipeline. Subsequent phases extend
 * this class with `compileStrausMain` and `compileStrausCombine`.
 */
export class StrausKernels {
  /**
   * WGSL source for the lookup-precompute kernel at compile-time input
   * size `n`. The shader builds an 8·N Jacobian lookup table where
   * `lut[i*8 + k] = (k+1) · base[i]` for `k ∈ [0, 8)`, one thread per
   * active point.
   */
  static renderLookupPrecompute(
    sm: ShaderManager,
    n: number,
    workgroupSize = 64,
  ): string {
    return sm.gen_straus_lookup_precompute_shader(n, workgroupSize);
  }

  /**
   * WGSL source for the `straus_main` kernel parameterised by compile-time
   * `n` (active point count) and `numThreadMuls` (the per-thread chunk
   * size). One thread per chunk produces the Jacobian partial sum for its
   * `numThreadMuls` `(point, scalar)` pairs.
   */
  static renderStrausMain(
    sm: ShaderManager,
    n: number,
    numThreadMuls: number,
    workgroupSize = 64,
  ): string {
    return sm.gen_straus_main_shader(n, numThreadMuls, workgroupSize);
  }

  /**
   * Compile the lookup-precompute compute pipeline for input size `n`.
   * Bind-group layout (in binding order):
   *   0: base_x (read-only storage, N × BigInt)
   *   1: base_y (read-only storage, N × BigInt)
   *   2: lut_x  (storage,           8·N × BigInt)
   *   3: lut_y  (storage,           8·N × BigInt)
   *   4: lut_z  (storage,           8·N × BigInt)
   *
   * The `gpu` helpers parameter is the `./gpu.js` module — passed in
   * rather than imported so this file remains importable in jest's
   * node environment (where the global `GPUBufferUsage` is undefined).
   */
  static async compileLookupPrecompute(
    device: GPUDevice,
    sm: ShaderManager,
    n: number,
    gpu: {
      create_bind_group_layout: (
        device: GPUDevice,
        types: string[],
      ) => GPUBindGroupLayout;
      create_compute_pipeline: (
        device: GPUDevice,
        layouts: GPUBindGroupLayout[],
        src: string,
        entry: string,
        cacheKey?: string,
      ) => Promise<GPUComputePipeline>;
    },
    workgroupSize = 64,
  ): Promise<CompiledPipeline> {
    const src = StrausKernels.renderLookupPrecompute(sm, n, workgroupSize);
    const layout = gpu.create_bind_group_layout(device, [
      "read-only-storage",
      "read-only-storage",
      "storage",
      "storage",
      "storage",
    ]);
    const pipeline = await gpu.create_compute_pipeline(
      device,
      [layout],
      src,
      "main",
      `straus-lookup-precompute-n${n}`,
    );
    return { pipeline, layout };
  }

  /**
   * Compile the `straus_main` compute pipeline for input size `n` and
   * per-thread chunk size `numThreadMuls`. Bind-group layout (in binding
   * order):
   *   0: lut_x   (read-only storage, 8·N × BigInt)
   *   1: lut_y   (read-only storage, 8·N × BigInt)
   *   2: lut_z   (read-only storage, 8·N × BigInt)
   *   3: k1_lims (read-only storage, 4·N × u32)
   *   4: k2_lims (read-only storage, 4·N × u32)
   *   5: part_x  (storage,           T × BigInt where T = ceil(N / numThreadMuls))
   *   6: part_y  (storage,           T × BigInt)
   *   7: part_z  (storage,           T × BigInt)
   */
  static async compileStrausMain(
    device: GPUDevice,
    sm: ShaderManager,
    n: number,
    numThreadMuls: number,
    gpu: {
      create_bind_group_layout: (
        device: GPUDevice,
        types: string[],
      ) => GPUBindGroupLayout;
      create_compute_pipeline: (
        device: GPUDevice,
        layouts: GPUBindGroupLayout[],
        src: string,
        entry: string,
        cacheKey?: string,
      ) => Promise<GPUComputePipeline>;
    },
    workgroupSize = 64,
  ): Promise<CompiledPipeline> {
    const src = StrausKernels.renderStrausMain(sm, n, numThreadMuls, workgroupSize);
    const layout = gpu.create_bind_group_layout(device, [
      "read-only-storage",
      "read-only-storage",
      "read-only-storage",
      "read-only-storage",
      "read-only-storage",
      "storage",
      "storage",
      "storage",
    ]);
    const pipeline = await gpu.create_compute_pipeline(
      device,
      [layout],
      src,
      "main",
      `straus-main-n${n}-k${numThreadMuls}`,
    );
    return { pipeline, layout };
  }
}
