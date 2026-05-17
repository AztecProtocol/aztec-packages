// Drop-in adapter that matches `smvp_batch_affine_gpu`'s signature
// but routes through the tree-reduce pipeline.
//
// Flow:
//   1. Read CSR row pointers (all_csc_col_ptr_sb) and compute the
//      dense per-entry bucket id array. Upload to GPU.
//   2. Run `runTreeReduce` (Phase 1 + iterated Phase 2). Output is
//      one (bucket_id, AffinePoint) per active bucket.
//   3. Init dense workspace (running_x/y + bucket_active) to zero.
//   4. Scatter the tree-reduce output into the dense workspace at
//      slot bucket_id.
//   5. Hand the dense workspace to the existing finalize_collect →
//      finalize_inverse → finalize_apply pipeline which handles the
//      affine→Jacobian conversion and the magnitude-bucket fold.
//
// This adapter assumes the same buffer ownership model as the
// existing call site: caller-provided input buffers stay live for
// the duration of the call; the adapter allocates internal scratch
// (workspace + tree-reduce intermediates) and frees them on return.
// `externals_persistent` is plumbed through to the inner tree-reduce
// but is currently a no-op there — bind groups are re-created per
// call because the tree-reduce slice layout varies with the schedule.

import { ShaderManager } from './shader_manager.js';
import { runTreeReduce } from './smvp_tree.js';

const NUM_LIMBS_U32 = 20;
const SCATTER_TPB = 64;

export interface TreeAdapterPipelines {
  phase1: { pipeline: GPUComputePipeline; layout: GPUBindGroupLayout };
  phase2: { pipeline: GPUComputePipeline; layout: GPUBindGroupLayout };
  scatterInit: { pipeline: GPUComputePipeline; layout: GPUBindGroupLayout };
  scatter: { pipeline: GPUComputePipeline; layout: GPUBindGroupLayout };
}

/**
 * Build all pipelines needed by `smvp_batch_affine_gpu_tree`. Caller
 * is responsible for caching the returned handles across calls when
 * the shape (num_words, max_slice_entries) is stable — they don't
 * depend on per-call inputs.
 */
export async function buildTreeAdapterPipelines(
  device: GPUDevice,
  shaderManager: ShaderManager,
  tpb: number,
  maxSliceEntries: number,
): Promise<TreeAdapterPipelines> {
  const p1Code = shaderManager.gen_smvp_tree_phase1_shader(tpb, maxSliceEntries);
  const p2Code = shaderManager.gen_smvp_tree_phase2_shader(tpb, maxSliceEntries);
  const scatterCode = shaderManager.gen_smvp_tree_scatter_shader(SCATTER_TPB);
  const scatterInitCode = shaderManager.gen_smvp_tree_scatter_init_shader(SCATTER_TPB);

  const p1Mod = device.createShaderModule({ code: p1Code });
  const p2Mod = device.createShaderModule({ code: p2Code });
  const scatterMod = device.createShaderModule({ code: scatterCode });
  const scatterInitMod = device.createShaderModule({ code: scatterInitCode });

  const p1Layout = device.createBindGroupLayout({
    entries: Array.from({ length: 10 }, (_, i) => ({
      binding: i,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: (i <= 5 ? 'read-only-storage' : 'storage') as GPUBufferBindingType },
    })),
  });
  const p2Layout = device.createBindGroupLayout({
    entries: Array.from({ length: 9 }, (_, i) => ({
      binding: i,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: (i <= 4 ? 'read-only-storage' : 'storage') as GPUBufferBindingType },
    })),
  });
  const scatterLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' as GPUBufferBindingType } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' as GPUBufferBindingType } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' as GPUBufferBindingType } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as GPUBufferBindingType } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as GPUBufferBindingType } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as GPUBufferBindingType } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as GPUBufferBindingType } },
    ],
  });
  const scatterInitLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as GPUBufferBindingType } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as GPUBufferBindingType } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' as GPUBufferBindingType } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as GPUBufferBindingType } },
    ],
  });

  const p1Pipe = await device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [p1Layout] }),
    compute: { module: p1Mod, entryPoint: 'main' },
  });
  const p2Pipe = await device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [p2Layout] }),
    compute: { module: p2Mod, entryPoint: 'main' },
  });
  const scatterPipe = await device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [scatterLayout] }),
    compute: { module: scatterMod, entryPoint: 'main' },
  });
  const scatterInitPipe = await device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [scatterInitLayout] }),
    compute: { module: scatterInitMod, entryPoint: 'main' },
  });

  return {
    phase1: { pipeline: p1Pipe, layout: p1Layout },
    phase2: { pipeline: p2Pipe, layout: p2Layout },
    scatter: { pipeline: scatterPipe, layout: scatterLayout },
    scatterInit: { pipeline: scatterInitPipe, layout: scatterInitLayout },
  };
}

export interface TreeAdapterOptions {
  tpb: number;             // 64
  maxSliceEntries: number; // 1024 (SWEET_B from the plan)
}

/**
 * The post-tree-reduce dense workspace, ready to feed into the
 * existing finalize_collect → finalize_inverse → finalize_apply
 * pipeline. Caller passes its OWN running_x/y_sb + bucket_active_sb
 * buffers (already allocated at total_buckets size); this function
 * fills them.
 */
export async function smvp_batch_affine_gpu_tree(
  device: GPUDevice,
  commandEncoder: GPUCommandEncoder,
  pipelines: TreeAdapterPipelines,
  num_subtasks: number,
  num_columns: number,
  all_csc_col_ptr_sb: GPUBuffer,
  all_csc_val_idxs_sb: GPUBuffer,
  point_x_sb: GPUBuffer,
  point_y_sb: GPUBuffer,
  running_x_sb: GPUBuffer,
  running_y_sb: GPUBuffer,
  bucket_active_sb: GPUBuffer,
  opts: TreeAdapterOptions,
): Promise<void> {
  const total_buckets = num_subtasks * num_columns;

  const csrStaging = device.createBuffer({
    size: (total_buckets + 1) * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
  {
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(all_csc_col_ptr_sb, 0, csrStaging, 0, (total_buckets + 1) * 4);
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
    await csrStaging.mapAsync(GPUMapMode.READ);
  }
  const bucketStart = new Uint32Array(csrStaging.getMappedRange().slice(0));
  csrStaging.unmap(); csrStaging.destroy();
  const totalEntries = bucketStart[bucketStart.length - 1];

  const entryBucketIdHost = new Uint32Array(totalEntries);
  for (let b = 0; b < total_buckets; b++) {
    for (let i = bucketStart[b]; i < bucketStart[b + 1]; i++) entryBucketIdHost[i] = b;
  }
  const entryBucketIdBuf = device.createBuffer({
    size: entryBucketIdHost.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(entryBucketIdBuf, 0, entryBucketIdHost);

  const treeRes = await runTreeReduce(
    device,
    pipelines.phase1.pipeline, pipelines.phase1.layout,
    pipelines.phase2.pipeline, pipelines.phase2.layout,
    all_csc_val_idxs_sb, entryBucketIdBuf, point_x_sb, point_y_sb,
    totalEntries,
    { tpb: opts.tpb, maxSliceEntries: opts.maxSliceEntries },
  );
  void bucketStart;

  const scatterInitParamsBuf = device.createBuffer({
    size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(scatterInitParamsBuf, 0, new Uint32Array([total_buckets, 0, 0, 0]));
  const scatterInitBg = device.createBindGroup({
    layout: pipelines.scatterInit.layout,
    entries: [
      { binding: 0, resource: { buffer: running_x_sb } },
      { binding: 1, resource: { buffer: running_y_sb } },
      { binding: 2, resource: { buffer: bucket_active_sb } },
      { binding: 3, resource: { buffer: scatterInitParamsBuf } },
    ],
  });
  const initPass = commandEncoder.beginComputePass();
  initPass.setPipeline(pipelines.scatterInit.pipeline);
  initPass.setBindGroup(0, scatterInitBg);
  initPass.dispatchWorkgroups(Math.ceil(total_buckets / SCATTER_TPB), 1, 1);
  initPass.end();

  const scatterParamsBuf = device.createBuffer({
    size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(scatterParamsBuf, 0, new Uint32Array([treeRes.totalOutputs, total_buckets, 0, 0]));
  const scatterBg = device.createBindGroup({
    layout: pipelines.scatter.layout,
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
  const scatterPass = commandEncoder.beginComputePass();
  scatterPass.setPipeline(pipelines.scatter.pipeline);
  scatterPass.setBindGroup(0, scatterBg);
  scatterPass.dispatchWorkgroups(Math.ceil(treeRes.totalOutputs / SCATTER_TPB), 1, 1);
  scatterPass.end();

  // The caller continues with the existing finalize_collect →
  // finalize_inverse → finalize_apply pipeline against
  // running_x/y_sb + bucket_active_sb.

  entryBucketIdBuf.destroy();
  scatterInitParamsBuf.destroy();
  scatterParamsBuf.destroy();
  treeRes.outputBucketId.destroy();
  treeRes.outputX.destroy();
  treeRes.outputY.destroy();

  void NUM_LIMBS_U32;
}
