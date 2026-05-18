// Host orchestrator for the tree-reduce SMVP.
//
// `recordTreeReduce` records the entire ebid+count_active +
// phase1 + N*(layer_prelude+layer_scan+phase2) + scatter_args chain
// into the caller's command encoder. There is no per-layer readback,
// no JS sort, and no intermediate submit. The chain is sized at
// compile time by `MAX_LAYERS`; layers past convergence dispatch zero
// workgroups via indirect dispatch and naturally elide.
//
// The caller (batch_affine.ts) does the upstream init + ebid +
// count_active dispatches and the trailing indirect scatter dispatch.
// `recordTreeReduce` owns everything in between.

import type { GpuContext } from './gpu_context.js';
import { ShaderManager } from './shader_manager.js';
import { create_bind_group_layout, execute_pipeline, execute_pipeline_indirect } from './gpu.js';

const NUM_LIMBS_U32 = 20;

const PRELUDE_BINDINGS: Array<'storage' | 'read-only-storage' | 'uniform'> = [
  'read-only-storage', // 0 current_bucket_id
  'read-only-storage', // 1 layer_counts
  'storage', // 2 slice_bounds_out
  'storage', // 3 wg_pair_count_out
  'storage', // 4 num_wgs_per_layer
  'uniform', // 5 params
];

const SCAN_BINDINGS: Array<'storage' | 'read-only-storage' | 'uniform'> = [
  'read-only-storage', // 0 wg_pair_count_in
  'read-only-storage', // 1 num_wgs_per_layer
  'storage', // 2 layer_counts (also stores final_slot_index at slot final_slot_index_slot)
  'storage', // 3 wg_output_offset_out
  'storage', // 4 dispatch_args_phase2
  'storage', // 5 dispatch_args_prelude
  'read-only-storage', // 6 num_active_buckets
  'uniform', // 7 params
];

const PHASE1_BINDINGS: Array<'storage' | 'read-only-storage' | 'uniform'> = [
  'read-only-storage', // 0 schedule
  'read-only-storage', // 1 entry_bucket_id
  'read-only-storage', // 2 point_x
  'read-only-storage', // 3 point_y
  'read-only-storage', // 4 slice_bounds
  'read-only-storage', // 5 wg_output_offset
  'storage', // 6 prefix_scratch
  'storage', // 7 output_bucket_id
  'storage', // 8 output_x
  'storage', // 9 output_y
];

const PHASE2_BINDINGS: Array<'storage' | 'read-only-storage' | 'uniform'> = [
  'read-only-storage', // 0 input_bucket_id
  'read-only-storage', // 1 input_x
  'read-only-storage', // 2 input_y
  'read-only-storage', // 3 slice_bounds
  'read-only-storage', // 4 wg_output_offset
  'storage', // 5 prefix_scratch
  'storage', // 6 output_bucket_id
  'storage', // 7 output_x
  'storage', // 8 output_y
];

const SCATTER_ARGS_BINDINGS: Array<'storage' | 'read-only-storage' | 'uniform'> = [
  'read-only-storage', // 0 layer_counts
  'storage', // 1 dispatch_args_scatter
  'uniform', // 2 params
];

export interface RecordTreeReduceConfig {
  tpb: number;
  maxSliceEntries: number;
  maxLayers: number;
  preludeWgSize: number;
  scanWgSize: number;
}

export interface RecordTreeReduceResources {
  /** Ping-pong [bucket_id, x, y] storage buffers, one pair per parity. */
  pingBucketId: [GPUBuffer, GPUBuffer];
  pingX: [GPUBuffer, GPUBuffer];
  pingY: [GPUBuffer, GPUBuffer];
  /**
   * Holds the host-recorded total output count after the terminating
   * layer at slot `maxLayers`, plus the ping-pong slot index at
   * `maxLayers + 1`.
   */
  layerCounts: GPUBuffer;
  /** dispatch_args_scatter (X, 1, 1) for the caller's indirect scatter dispatch. */
  dispatchArgsScatter: GPUBuffer;
}

/**
 * Records the entire tree-reduce pipeline into `commandEncoder`. No
 * awaits, no readbacks, no submits — the caller is responsible for the
 * surrounding command encoder lifecycle.
 *
 * Pre-condition: `entryBucketId` is populated and `numActiveBuckets` is
 * filled (single u32 slot) before any dispatch recorded here runs.
 *
 * Post-condition: after the caller submits the encoder, the resources
 * returned hold:
 *   - the final tree-reduce output in ping[finalSlotIndex[0]] (bucket_id,
 *     x, y);
 *   - the final output count at `layerCounts[maxLayers]`;
 *   - the indirect dispatch geometry at `dispatchArgsScatter` for the
 *     scatter pass.
 */
export async function recordTreeReduce(
  device: GPUDevice,
  shaderManager: ShaderManager,
  context: GpuContext,
  commandEncoder: GPUCommandEncoder,
  schedule: GPUBuffer,
  entryBucketId: GPUBuffer,
  pointX: GPUBuffer,
  pointY: GPUBuffer,
  numActiveBuckets: GPUBuffer,
  totalEntries: number,
  cfg: RecordTreeReduceConfig,
  pipelineCacheKeyPrefix: string,
  workspaceCacheKeyPrefix: string,
): Promise<RecordTreeReduceResources> {
  const { tpb, maxSliceEntries, maxLayers, preludeWgSize, scanWgSize } = cfg;
  const numWgsP1 = Math.max(1, Math.ceil(totalEntries / maxSliceEntries));
  const MAX_WGS = numWgsP1;
  const SCATTER_TPB = tpb;

  const limbBytes = NUM_LIMBS_U32 * 4;
  const wsKey = workspaceCacheKeyPrefix;
  const pipeKey = pipelineCacheKeyPrefix;

  // WebGPU minBufferBindingAlignment for storage bindings is 256 bytes.
  // Layer-strided slices of `slice_bounds` and `wg_output_offset` are
  // bound via `{ buffer, offset, size }`, so each layer's start byte must
  // be 256-aligned. Round both strides up.
  const ALIGN = 256;
  const alignUp = (n: number, a: number) => Math.ceil(n / a) * a;
  const sliceBoundsRowBytes = (MAX_WGS + 1) * 4;
  const sliceBoundsStride = alignUp(sliceBoundsRowBytes, ALIGN);
  const wgOutputOffsetRowBytes = (MAX_WGS + 1) * 4;
  const wgOutputOffsetStride = alignUp(wgOutputOffsetRowBytes, ALIGN);

  // ----- Persistent buffer acquisition -----
  const pingBucketId: [GPUBuffer, GPUBuffer] = [
    context.acquirePersistentBuffer(`${wsKey}:tree:ping_bucket_id:0`, totalEntries * 4),
    context.acquirePersistentBuffer(`${wsKey}:tree:ping_bucket_id:1`, totalEntries * 4),
  ];
  const pingX: [GPUBuffer, GPUBuffer] = [
    context.acquirePersistentBuffer(`${wsKey}:tree:ping_x:0`, totalEntries * limbBytes),
    context.acquirePersistentBuffer(`${wsKey}:tree:ping_x:1`, totalEntries * limbBytes),
  ];
  const pingY: [GPUBuffer, GPUBuffer] = [
    context.acquirePersistentBuffer(`${wsKey}:tree:ping_y:0`, totalEntries * limbBytes),
    context.acquirePersistentBuffer(`${wsKey}:tree:ping_y:1`, totalEntries * limbBytes),
  ];
  const prefixScratch = context.acquirePersistentBuffer(
    `${wsKey}:tree:prefix_scratch`,
    MAX_WGS * maxSliceEntries * limbBytes,
  );
  const sliceBounds = context.acquirePersistentBuffer(
    `${wsKey}:tree:slice_bounds`,
    maxLayers * sliceBoundsStride,
  );
  const wgPairCount = context.acquirePersistentBuffer(`${wsKey}:tree:wg_pair_count`, maxLayers * MAX_WGS * 4);
  const wgOutputOffset = context.acquirePersistentBuffer(
    `${wsKey}:tree:wg_output_offset`,
    maxLayers * wgOutputOffsetStride,
  );
  const numWgsPerLayer = context.acquirePersistentBuffer(`${wsKey}:tree:num_wgs_per_layer`, maxLayers * 4);
  // layer_counts layout:
  //   [0..maxLayers): per-layer N counts (input/output sizes).
  //   [maxLayers]: final terminal total (written by terminating scan kernel).
  //   [maxLayers + 1]: ping-pong slot index that holds the final output.
  const layerCountsInit = context.acquirePersistentBufferWithInit(
    `${wsKey}:tree:layer_counts`,
    (maxLayers + 2) * 4,
  );
  const layerCounts = layerCountsInit.buffer;
  const dispatchArgsPhase2 = context.acquirePersistentBuffer(
    `${wsKey}:tree:dispatch_args_phase2`,
    maxLayers * 3 * 4,
    GPUBufferUsage.INDIRECT,
  );
  const dispatchArgsPreludeInit = context.acquirePersistentBufferWithInit(
    `${wsKey}:tree:dispatch_args_prelude`,
    maxLayers * 3 * 4,
    GPUBufferUsage.INDIRECT,
  );
  const dispatchArgsPrelude = dispatchArgsPreludeInit.buffer;
  const dispatchArgsScatter = context.acquirePersistentBuffer(
    `${wsKey}:tree:dispatch_args_scatter`,
    3 * 4,
    GPUBufferUsage.INDIRECT,
  );

  // Per-layer scan/prelude uniform buffers. The scan uniform for layer
  // L encodes (layer_idx=L, max_slice_entries, max_wgs, prelude_wg_size,
  // is_layer_zero, max_layers_slot, _, _). The prelude uniform encodes
  // (layer_idx=L, max_slice_entries, max_wgs, _).
  const preludeUniforms: GPUBuffer[] = [];
  const scanUniforms: GPUBuffer[] = [];
  const sliceBoundsStrideU32 = sliceBoundsStride / 4;
  const wgOutputOffsetStrideU32 = wgOutputOffsetStride / 4;
  for (let L = 0; L < maxLayers; L++) {
    const pu = context.acquirePersistentUniform(`${wsKey}:tree:prelude_ub:L${L}`, 16);
    if (pu.created) {
      device.queue.writeBuffer(
        pu.buffer,
        0,
        new Uint32Array([L, maxSliceEntries, MAX_WGS, sliceBoundsStrideU32]).buffer,
      );
    }
    preludeUniforms.push(pu.buffer);

    const su = context.acquirePersistentUniform(`${wsKey}:tree:scan_ub:L${L}`, 32);
    if (su.created) {
      device.queue.writeBuffer(
        su.buffer,
        0,
        new Uint32Array([
          L,
          maxSliceEntries,
          MAX_WGS,
          preludeWgSize,
          L === 0 ? 1 : 0,
          maxLayers,
          maxLayers + 1,
          wgOutputOffsetStrideU32,
        ]).buffer,
      );
    }
    scanUniforms.push(su.buffer);
  }

  const scatterArgsUniform = context.acquirePersistentUniform(`${wsKey}:tree:scatter_args_ub`, 16);
  if (scatterArgsUniform.created) {
    device.queue.writeBuffer(scatterArgsUniform.buffer, 0, new Uint32Array([maxLayers, SCATTER_TPB, 0, 0]).buffer);
  }

  // Always seed layer_counts[0] = totalEntries and dispatch_args_prelude[0..3].
  // The GPU clobbers these slots in subsequent dispatches each call,
  // so we re-seed every entry — cheap (4 + 12 bytes).
  device.queue.writeBuffer(layerCounts, 0, new Uint32Array([totalEntries]).buffer);
  // Seed the final_slot_index slot at maxLayers + 1 to 1 (layer 0 writes
  // into ping slot 1). If termination happens later, the scan kernel
  // overwrites this slot in-place.
  device.queue.writeBuffer(layerCounts, (maxLayers + 1) * 4, new Uint32Array([1]).buffer);
  // Zero per-layer state that previous MSM calls may have left dirty.
  // - dispatchArgsPrelude: layer 0's slot is seeded via queue.writeBuffer
  //   below; layers 1+ are written by the previous layer's scan when work
  //   remains, but layers past convergence are NOT touched. Zero them so
  //   indirect dispatch elides cleanly.
  // - dispatchArgsPhase2: same reasoning. Layer 0's slot is set by
  //   layer-0 scan before phase1 reads it (encoder ordering), so clear
  //   the whole buffer.
  // - numWgsPerLayer: scan L reads it to size the prefix-scan. If
  //   prelude L didn't dispatch this call, the slot would carry a stale
  //   nw from the previous call and the scan would emit a bogus total.
  commandEncoder.clearBuffer(dispatchArgsPrelude, 12, (maxLayers - 1) * 3 * 4);
  commandEncoder.clearBuffer(dispatchArgsPhase2, 0, maxLayers * 3 * 4);
  commandEncoder.clearBuffer(numWgsPerLayer, 0, maxLayers * 4);
  // Prelude must dispatch enough threads to also write the boundary
  // slot `slice_bounds[num_wgs]` (phase1/2 read it as slice_hi for the
  // last wg). So we dispatch ceil((numWgsP1 + 1) / preludeWgSize) WGs.
  const preludeX0 = Math.max(1, Math.ceil((numWgsP1 + 1) / preludeWgSize));
  device.queue.writeBuffer(dispatchArgsPrelude, 0, new Uint32Array([preludeX0, 1, 1]).buffer);

  // ----- Pipeline compilation (cached) -----
  const compileWithLayout = async (
    bindings: Array<'storage' | 'read-only-storage' | 'uniform'>,
    code: string,
    key: string,
  ) => {
    const layout = create_bind_group_layout(device, bindings);
    const m = device.createShaderModule({ code });
    const info = await m.getCompilationInfo();
    let hasError = false;
    for (const msg of info.messages) {
      if (msg.type === 'error') {
        console.error(`[smvp_tree ${key}] ${msg.message} (line ${msg.lineNum})`);
        hasError = true;
      } else if (msg.type === 'warning') {
        console.warn(`[smvp_tree ${key}] ${msg.message} (line ${msg.lineNum})`);
      }
    }
    if (hasError) throw new Error(`WGSL compile failed for ${key}`);
    const pipeline = await device.createComputePipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module: m, entryPoint: 'main' },
    });
    return { pipeline, bindGroupLayout: layout };
  };

  const preludeKey = `${pipeKey}:smvp_tree_layer_prelude:wg${preludeWgSize}:max_slice${maxSliceEntries}:max_wgs${MAX_WGS}`;
  const scanKey = `${pipeKey}:smvp_tree_layer_scan:wg${scanWgSize}:max_wgs${MAX_WGS}`;
  const phase1Key = `${pipeKey}:smvp_tree_phase1:tpb${tpb}:max${maxSliceEntries}`;
  const phase2Key = `${pipeKey}:smvp_tree_phase2:tpb${tpb}:max${maxSliceEntries}`;
  const scatterArgsKey = `${pipeKey}:smvp_tree_scatter_args`;

  const preludePipe = await context.getOrCreatePipeline(preludeKey, () =>
    compileWithLayout(PRELUDE_BINDINGS, shaderManager.gen_smvp_tree_layer_prelude_shader(preludeWgSize, maxSliceEntries, MAX_WGS), preludeKey),
  );
  const scanPipe = await context.getOrCreatePipeline(scanKey, () =>
    compileWithLayout(SCAN_BINDINGS, shaderManager.gen_smvp_tree_layer_scan_shader(scanWgSize, MAX_WGS), scanKey),
  );
  const phase1Pipe = await context.getOrCreatePipeline(phase1Key, () =>
    compileWithLayout(PHASE1_BINDINGS, shaderManager.gen_smvp_tree_phase1_shader(tpb, maxSliceEntries), phase1Key),
  );
  const phase2Pipe = await context.getOrCreatePipeline(phase2Key, () =>
    compileWithLayout(PHASE2_BINDINGS, shaderManager.gen_smvp_tree_phase2_shader(tpb, maxSliceEntries), phase2Key),
  );
  const scatterArgsPipe = await context.getOrCreatePipeline(scatterArgsKey, () =>
    compileWithLayout(SCATTER_ARGS_BINDINGS, shaderManager.gen_smvp_tree_scatter_args_shader(), scatterArgsKey),
  );

  // ----- Bind groups (cached on context) -----
  // sliceBoundsStride / wgOutputOffsetStride defined above; they are
  // 256-aligned per WebGPU storage-binding alignment.

  const buildPreludeBg = (L: number, currentBucketIdBuf: GPUBuffer) =>
    context.getOrCreatePersistentBindGroup(`${wsKey}:treeBg:prelude:L${L}`, () =>
      device.createBindGroup({
        layout: preludePipe.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: currentBucketIdBuf } },
          { binding: 1, resource: { buffer: layerCounts } },
          { binding: 2, resource: { buffer: sliceBounds } },
          { binding: 3, resource: { buffer: wgPairCount } },
          { binding: 4, resource: { buffer: numWgsPerLayer } },
          { binding: 5, resource: { buffer: preludeUniforms[L] } },
        ],
      }),
    );

  const buildScanBg = (L: number) =>
    context.getOrCreatePersistentBindGroup(`${wsKey}:treeBg:scan:L${L}`, () =>
      device.createBindGroup({
        layout: scanPipe.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: wgPairCount } },
          { binding: 1, resource: { buffer: numWgsPerLayer } },
          { binding: 2, resource: { buffer: layerCounts } },
          { binding: 3, resource: { buffer: wgOutputOffset } },
          { binding: 4, resource: { buffer: dispatchArgsPhase2 } },
          { binding: 5, resource: { buffer: dispatchArgsPrelude } },
          { binding: 6, resource: { buffer: numActiveBuckets } },
          { binding: 7, resource: { buffer: scanUniforms[L] } },
        ],
      }),
    );

  const buildPhase1Bg = (L: number) =>
    context.getOrCreatePersistentBindGroup(`${wsKey}:treeBg:phase1:L${L}`, () =>
      device.createBindGroup({
        layout: phase1Pipe.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: schedule } },
          { binding: 1, resource: { buffer: entryBucketId } },
          { binding: 2, resource: { buffer: pointX } },
          { binding: 3, resource: { buffer: pointY } },
          {
            binding: 4,
            resource: { buffer: sliceBounds, offset: L * sliceBoundsStride, size: sliceBoundsStride },
          },
          {
            binding: 5,
            resource: { buffer: wgOutputOffset, offset: L * wgOutputOffsetStride, size: wgOutputOffsetStride },
          },
          { binding: 6, resource: { buffer: prefixScratch } },
          { binding: 7, resource: { buffer: pingBucketId[(L + 1) & 1] } },
          { binding: 8, resource: { buffer: pingX[(L + 1) & 1] } },
          { binding: 9, resource: { buffer: pingY[(L + 1) & 1] } },
        ],
      }),
    );

  const buildPhase2Bg = (L: number) =>
    context.getOrCreatePersistentBindGroup(`${wsKey}:treeBg:phase2:L${L}`, () =>
      device.createBindGroup({
        layout: phase2Pipe.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: pingBucketId[L & 1] } },
          { binding: 1, resource: { buffer: pingX[L & 1] } },
          { binding: 2, resource: { buffer: pingY[L & 1] } },
          {
            binding: 3,
            resource: { buffer: sliceBounds, offset: L * sliceBoundsStride, size: sliceBoundsStride },
          },
          {
            binding: 4,
            resource: { buffer: wgOutputOffset, offset: L * wgOutputOffsetStride, size: wgOutputOffsetStride },
          },
          { binding: 5, resource: { buffer: prefixScratch } },
          { binding: 6, resource: { buffer: pingBucketId[(L + 1) & 1] } },
          { binding: 7, resource: { buffer: pingX[(L + 1) & 1] } },
          { binding: 8, resource: { buffer: pingY[(L + 1) & 1] } },
        ],
      }),
    );

  const scatterArgsBg = context.getOrCreatePersistentBindGroup(`${wsKey}:treeBg:scatter_args`, () =>
    device.createBindGroup({
      layout: scatterArgsPipe.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: layerCounts } },
        { binding: 1, resource: { buffer: dispatchArgsScatter } },
        { binding: 2, resource: { buffer: scatterArgsUniform.buffer } },
      ],
    }),
  );
  // ----- Record the chain into commandEncoder -----
  for (let L = 0; L < maxLayers; L++) {
    const currentBucketIdBuf = L === 0 ? entryBucketId : pingBucketId[L & 1];
    const preludeBg = buildPreludeBg(L, currentBucketIdBuf);
    const scanBg = buildScanBg(L);

    if (L === 0) {
      // Layer 0 has host-known geometry; dispatch direct to avoid
      // depending on indirect-args visibility for the very first dispatch
      // in the chain (where SwiftShader has been observed to miss the
      // implicit storage→indirect barrier).
      const preludeWgs = Math.max(1, Math.ceil((numWgsP1 + 1) / preludeWgSize));
      await execute_pipeline(commandEncoder, preludePipe.pipeline, preludeBg, preludeWgs, 1, 1);
    } else {
      // Prelude (indirect from dispatch_args_prelude[L*3])
      execute_pipeline_indirect(commandEncoder, preludePipe.pipeline, preludeBg, dispatchArgsPrelude, L * 12);
    }

    // Scan (direct 1,1,1)
    await execute_pipeline(commandEncoder, scanPipe.pipeline, scanBg, 1, 1, 1);

    // Phase1 (L=0) or Phase2 (L>=1).
    if (L === 0) {
      const bg = buildPhase1Bg(L);
      // Layer 0's phase1 has host-known dispatch geometry (num_wgs =
      // numWgsP1 always). Direct dispatch eliminates the first-in-chain
      // indirect-args visibility uncertainty.
      await execute_pipeline(commandEncoder, phase1Pipe.pipeline, bg, numWgsP1, 1, 1);
    } else {
      const bg = buildPhase2Bg(L);
      execute_pipeline_indirect(commandEncoder, phase2Pipe.pipeline, bg, dispatchArgsPhase2, L * 12);
    }
  }

  // scatter_args: direct dispatch, single thread.
  await execute_pipeline(commandEncoder, scatterArgsPipe.pipeline, scatterArgsBg, 1, 1, 1);

  return {
    pingBucketId,
    pingX,
    pingY,
    layerCounts,
    dispatchArgsScatter,
  };
}
