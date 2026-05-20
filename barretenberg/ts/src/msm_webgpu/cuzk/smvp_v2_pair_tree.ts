/// <reference types="@webgpu/types" />

/**
 * v2 bin-packed pair-tree MSM bucket-accumulate orchestrator.
 *
 * Drop-in replacement for the cuZK round-loop (`smvp_batch_affine_gpu`'s
 * schedule + batch_inverse_parallel + apply_scatter per round) for the
 * Pippenger bucket-accumulate phase. For each window:
 *
 *   csr_to_v2_meta            row_ptr -> per-bucket count + offset
 *   csr_to_v2_active_sums     val_idx + cached bases -> bucket-major
 *                             active_sums (combined SoA, packed 8x u32)
 *   for level in 0..max_levels:
 *     ba_planner_v2_prod      counts/offsets -> chunk_plan / scatter_plan
 *                             / carry_plan + new_counts/new_offsets +
 *                             totals (incl. per-level dispatch_args
 *                             triples at totals[4..6] and totals[7..9])
 *     ba_marshal_pairs_prod   indirect dispatch off totals[4..6]
 *     ba_pair_disjoint_tree_prod  indirect dispatch off totals[4..6]
 *     ba_scatter_pairs_prod   indirect dispatch off totals[4..6]
 *     ba_carry_copy_prod      indirect dispatch off totals[7..9]
 *   v2_to_running             final active_sums slot per non-empty
 *                             bucket -> running_x / running_y /
 *                             bucket_active in production layout
 *
 * The prod kernels read num_chunks (= ceil(total_pairs / S)) and
 * num_carries from the planner's totals storage output; the host
 * dispatches them via dispatchWorkgroupsIndirect. Each level's
 * downstream dispatch is sized to EXACTLY the chunks/carries the
 * planner produced — zero pad-chunk waste, the runtime advantage
 * over the pad-fill alternative.
 *
 * All dispatches for all windows are recorded onto one command encoder
 * and submitted once. Submit overhead is paid once per MSM, not once
 * per window or once per level.
 *
 * Layout boundaries:
 *   active_sums (combined SoA, one buffer per ping-pong copy):
 *     plane 0 (x) at vec4 indices [0, PG * M)
 *     plane 1 (y) at vec4 indices [PG * M, 2 * PG * M)
 *     element layout: PG=2 vec4 at [PG*elem, PG*elem+1]
 *     M = input_size + 2 (last 2 slots are the pad pair the planner
 *     emits into the chunk-tail for filler pairs — we initialise the
 *     pad pair once at orchestrator start with distinct-x Montgomery-
 *     form values so the disjoint kernel's lean affine add is well-
 *     defined on pad chunks even though they get scattered to the
 *     discard slot)
 *   running_x / running_y (production, separate buffers):
 *     packed 8x u32 = 2 vec4 per (subtask, bucket_local), at
 *     [PG * bucket_global, PG * bucket_global + 1] with
 *     bucket_global = subtask_idx * num_columns + bucket_local
 *   bucket_active: u32 per bucket_global
 *   v2_to_running binds running_x / running_y / bucket_active with a
 *   subtask_idx * num_columns byte offset so a single per-window
 *   dispatch lands the result at the right slab.
 */

import { ShaderManager } from './shader_manager.js';

const PG = 2;
const PG_VEC4_BYTES = 16;
const ELEMENT_BYTES = PG * PG_VEC4_BYTES;

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

  val_idx_buf: GPUBuffer;
  row_ptr_buf: GPUBuffer;
  point_x_buf: GPUBuffer;
  point_y_buf: GPUBuffer;

  running_x_buf: GPUBuffer;
  running_y_buf: GPUBuffer;
  bucket_active_buf: GPUBuffer;
}

export interface SmvpV2PairTreeStats {
  levels_per_window: number;
  num_subtasks: number;
  num_columns: number;
  total_passes: number;
  gpu_wall_ms: number;
}

function roStorageEntry(binding: number): GPUBindGroupLayoutEntry {
  return { binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } };
}
function rwStorageEntry(binding: number): GPUBindGroupLayoutEntry {
  return { binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } };
}
function uniformEntry(binding: number): GPUBindGroupLayoutEntry {
  return { binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } };
}

async function compilePipeline(
  device: GPUDevice,
  layout: GPUBindGroupLayout,
  code: string,
  key: string,
): Promise<GPUComputePipeline> {
  const module = device.createShaderModule({ code });
  const info = await module.getCompilationInfo();
  const errs: string[] = [];
  for (const m of info.messages) {
    const line = `[smvp-v2 ${key}] ${m.type}: ${m.message} (line ${m.lineNum}, col ${m.linePos})`;
    if (m.type === 'error') {
      console.error(line);
      errs.push(line);
    } else {
      console.warn(line);
    }
  }
  if (errs.length > 0) {
    throw new Error(`WGSL compile failed for ${key}: ${errs.slice(0, 4).join(' | ')}`);
  }
  return device.createComputePipelineAsync({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module, entryPoint: 'main' },
  });
}

interface Pipelines {
  csrMeta: GPUComputePipeline;
  csrActive: GPUComputePipeline;
  planner: GPUComputePipeline;
  marshal: GPUComputePipeline;
  disjoint: GPUComputePipeline;
  scatter: GPUComputePipeline;
  carry: GPUComputePipeline;
  v2ToRunning: GPUComputePipeline;
  layouts: {
    meta: GPUBindGroupLayout;
    active: GPUBindGroupLayout;
    planner: GPUBindGroupLayout;
    marshal: GPUBindGroupLayout;
    disjoint: GPUBindGroupLayout;
    scatter: GPUBindGroupLayout;
    carry: GPUBindGroupLayout;
    v2Run: GPUBindGroupLayout;
  };
}

async function compileAll(
  device: GPUDevice,
  sm: ShaderManager,
  wgi: number,
  s: number,
  tpb: number,
  per_thread: number,
): Promise<Pipelines> {
  const layouts: Pipelines['layouts'] = {
    meta: device.createBindGroupLayout({
      entries: [roStorageEntry(0), rwStorageEntry(1), rwStorageEntry(2), uniformEntry(3)],
    }),
    active: device.createBindGroupLayout({
      entries: [
        roStorageEntry(0),
        roStorageEntry(1),
        roStorageEntry(2),
        rwStorageEntry(3),
        rwStorageEntry(4),
        uniformEntry(5),
      ],
    }),
    planner: device.createBindGroupLayout({
      entries: [
        roStorageEntry(0),
        roStorageEntry(1),
        rwStorageEntry(2),
        rwStorageEntry(3),
        rwStorageEntry(4),
        rwStorageEntry(5),
        rwStorageEntry(6),
        rwStorageEntry(7),
        uniformEntry(8),
      ],
    }),
    marshal: device.createBindGroupLayout({
      entries: [roStorageEntry(0), roStorageEntry(1), rwStorageEntry(2), roStorageEntry(3), uniformEntry(4)],
    }),
    disjoint: device.createBindGroupLayout({
      entries: [roStorageEntry(0), roStorageEntry(1), rwStorageEntry(2), roStorageEntry(3)],
    }),
    scatter: device.createBindGroupLayout({
      entries: [roStorageEntry(0), roStorageEntry(1), rwStorageEntry(2), roStorageEntry(3), uniformEntry(4)],
    }),
    carry: device.createBindGroupLayout({
      entries: [roStorageEntry(0), roStorageEntry(1), rwStorageEntry(2), roStorageEntry(3), uniformEntry(4)],
    }),
    v2Run: device.createBindGroupLayout({
      entries: [
        roStorageEntry(0),
        roStorageEntry(1),
        roStorageEntry(2),
        rwStorageEntry(3),
        rwStorageEntry(4),
        rwStorageEntry(5),
        uniformEntry(6),
      ],
    }),
  };

  const [csrMeta, csrActive, planner, marshal, disjoint, scatter, carry, v2ToRunning] = await Promise.all([
    compilePipeline(device, layouts.meta, sm.gen_csr_to_v2_meta_shader(wgi), `csr-meta-wg${wgi}`),
    compilePipeline(device, layouts.active, sm.gen_csr_to_v2_active_sums_shader(wgi), `csr-active-wg${wgi}`),
    compilePipeline(
      device,
      layouts.planner,
      sm.gen_ba_planner_v2_prod_shader(tpb, per_thread, s, wgi, 64),
      `planner-v2-prod-T${tpb}-P${per_thread}-S${s}-W${wgi}`,
    ),
    compilePipeline(device, layouts.marshal, sm.gen_ba_marshal_pairs_prod_shader(wgi, s), `marshal-prod-W${wgi}-S${s}`),
    compilePipeline(device, layouts.disjoint, sm.gen_ba_pair_disjoint_tree_prod_shader(wgi, s), `disjoint-prod-W${wgi}-S${s}`),
    compilePipeline(device, layouts.scatter, sm.gen_ba_scatter_pairs_prod_shader(wgi, s), `scatter-prod-W${wgi}-S${s}`),
    compilePipeline(device, layouts.carry, sm.gen_ba_carry_copy_prod_shader(wgi), `carry-prod-W${wgi}`),
    compilePipeline(device, layouts.v2Run, sm.gen_v2_to_running_shader(wgi), `v2-to-running-wg${wgi}`),
  ]);
  return { csrMeta, csrActive, planner, marshal, disjoint, scatter, carry, v2ToRunning, layouts };
}

interface Scratch {
  activeA: GPUBuffer;
  activeB: GPUBuffer;
  chainBuf: GPUBuffer;
  tempOut: GPUBuffer;
  countsA: GPUBuffer;
  countsB: GPUBuffer;
  offsetsA: GPUBuffer;
  offsetsB: GPUBuffer;
  perLevelChunkPlan: GPUBuffer[];
  perLevelScatterPlan: GPUBuffer[];
  perLevelCarryPlan: GPUBuffer[];
  perLevelTotals: GPUBuffer[];
  metaParams: GPUBuffer;
  activeParams: GPUBuffer;
  plannerParams: GPUBuffer;
  marshalConsts: GPUBuffer;
  scatterConsts: GPUBuffer;
  carryConsts: GPUBuffer;
  v2RunParams: GPUBuffer;
  M: number;
  maxChunks: number;
  perThread: number;
}

function allocScratch(
  device: GPUDevice,
  num_columns: number,
  input_size: number,
  s: number,
  max_levels: number,
  tpb: number,
  per_thread: number,
): Scratch {
  const M = input_size + 2;
  const maxChunks = Math.max(1, Math.ceil(input_size / 2 / s) + 1);

  const mk = (bytes: number, extra: GPUBufferUsageFlags = 0): GPUBuffer =>
    device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | extra });

  const activeBytes = 2 * PG * M * PG_VEC4_BYTES;
  const activeA = mk(activeBytes, GPUBufferUsage.COPY_DST);
  const activeB = mk(activeBytes, GPUBufferUsage.COPY_DST);

  const chainBuf = mk(2 * PG * (2 * s * maxChunks) * PG_VEC4_BYTES);
  const tempOut = mk(2 * PG * (s * maxChunks) * PG_VEC4_BYTES);

  const countsBytes = num_columns * 4;
  const offsetsBytes = num_columns * 4;
  const countsA = mk(countsBytes);
  const countsB = mk(countsBytes);
  const offsetsA = mk(offsetsBytes);
  const offsetsB = mk(offsetsBytes);

  const perLevelChunkPlan: GPUBuffer[] = [];
  const perLevelScatterPlan: GPUBuffer[] = [];
  const perLevelCarryPlan: GPUBuffer[] = [];
  const perLevelTotals: GPUBuffer[] = [];
  const chunkPlanBytes = 2 * s * maxChunks * 4;
  const scatterPlanBytes = s * maxChunks * 4;
  const carryPlanBytes = 2 * num_columns * 4;
  const totalsBytes = Math.max(40, Math.ceil(40 / 16) * 16);
  for (let lvl = 0; lvl < max_levels; lvl++) {
    perLevelChunkPlan.push(mk(chunkPlanBytes));
    perLevelScatterPlan.push(mk(scatterPlanBytes));
    perLevelCarryPlan.push(mk(carryPlanBytes));
    perLevelTotals.push(mk(totalsBytes, GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST));
  }

  const ub = (bytes: number): GPUBuffer =>
    device.createBuffer({ size: Math.max(16, bytes), usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const metaParams = ub(16);
  const activeParams = ub(16);
  const plannerParams = ub(16);
  const marshalConsts = ub(16);
  const scatterConsts = ub(16);
  const carryConsts = ub(16);
  const v2RunParams = ub(16);

  return {
    activeA, activeB, chainBuf, tempOut,
    countsA, countsB, offsetsA, offsetsB,
    perLevelChunkPlan, perLevelScatterPlan, perLevelCarryPlan, perLevelTotals,
    metaParams, activeParams, plannerParams,
    marshalConsts, scatterConsts, carryConsts, v2RunParams,
    M, maxChunks, perThread: per_thread,
  };
}

function destroyScratch(scratch: Scratch): void {
  scratch.activeA.destroy();
  scratch.activeB.destroy();
  scratch.chainBuf.destroy();
  scratch.tempOut.destroy();
  scratch.countsA.destroy();
  scratch.countsB.destroy();
  scratch.offsetsA.destroy();
  scratch.offsetsB.destroy();
  for (const b of scratch.perLevelChunkPlan) b.destroy();
  for (const b of scratch.perLevelScatterPlan) b.destroy();
  for (const b of scratch.perLevelCarryPlan) b.destroy();
  for (const b of scratch.perLevelTotals) b.destroy();
  scratch.metaParams.destroy();
  scratch.activeParams.destroy();
  scratch.plannerParams.destroy();
  scratch.marshalConsts.destroy();
  scratch.scatterConsts.destroy();
  scratch.carryConsts.destroy();
  scratch.v2RunParams.destroy();
}

function buildPadPair(M: number): Uint32Array {
  const padPair = new Uint32Array(2 * PG * 2 * 4);
  for (let i = 0; i < padPair.length; i++) {
    padPair[i] = (0x9e3779b9 * (i + 1)) >>> 0;
  }
  if (padPair[0] === padPair[PG * 4]) padPair[PG * 4] ^= 1;
  return padPair;
}

/**
 * Run the v2 pair-tree MSM bucket-accumulate for ALL pippenger windows
 * in a single GPU submit.
 *
 * On return the caller's running_x / running_y / bucket_active buffers
 * hold each bucket's reduced packed point (or 0/inactive marker) ready
 * for batch_affine_finalize_collect to consume. The caller's val_idx /
 * row_ptr / cached-bases buffers are read-only.
 */
export async function runSmvpV2PairTree(opts: SmvpV2PairTreeOptions): Promise<SmvpV2PairTreeStats> {
  const {
    device, shaderManager, num_subtasks, num_columns, input_size,
    val_idx_buf, row_ptr_buf, point_x_buf, point_y_buf,
    running_x_buf, running_y_buf, bucket_active_buf,
  } = opts;
  const s = opts.s ?? 16;
  const tpb = opts.tpb ?? 256;
  const per_thread = opts.per_thread ?? Math.max(1, Math.ceil(num_columns / tpb));
  const wgi = opts.wgi ?? 64;
  const max_levels = opts.max_levels ?? 8;
  if (tpb * per_thread < num_columns) {
    throw new Error(`smvp_v2_pair_tree: tpb*per_thread (${tpb}*${per_thread}=${tpb * per_thread}) must be >= num_columns (${num_columns}).`);
  }

  const pipelines = await compileAll(device, shaderManager, wgi, s, tpb, per_thread);
  const scratch = allocScratch(device, num_columns, input_size, s, max_levels, tpb, per_thread);
  const M = scratch.M;

  device.queue.writeBuffer(scratch.metaParams, 0, new Uint32Array([num_columns, num_columns, 0, 0]));
  device.queue.writeBuffer(scratch.activeParams, 0, new Uint32Array([input_size, 0, 0, 0]));
  device.queue.writeBuffer(scratch.plannerParams, 0, new Uint32Array([num_columns, 0, 0, 0]));
  device.queue.writeBuffer(scratch.marshalConsts, 0, new Uint32Array([M, 0, 0, 0]));
  device.queue.writeBuffer(scratch.scatterConsts, 0, new Uint32Array([M, 0, 0, 0]));
  device.queue.writeBuffer(scratch.carryConsts, 0, new Uint32Array([M, M, 0, 0]));
  device.queue.writeBuffer(scratch.v2RunParams, 0, new Uint32Array([num_columns, M, 0, 0]));

  const padPair = buildPadPair(M);
  const padOff = PG * (M - 2) * PG_VEC4_BYTES;
  device.queue.writeBuffer(scratch.activeA, padOff, padPair as BufferSource);
  device.queue.writeBuffer(scratch.activeB, padOff, padPair as BufferSource);
  device.queue.writeBuffer(scratch.activeA, PG * M * PG_VEC4_BYTES + padOff, padPair as BufferSource);
  device.queue.writeBuffer(scratch.activeB, PG * M * PG_VEC4_BYTES + padOff, padPair as BufferSource);

  const encoder = device.createCommandEncoder();
  let totalPasses = 0;
  const directPass = (pipe: GPUComputePipeline, bind: GPUBindGroup, x: number, y = 1, z = 1): void => {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipe);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(x, y, z);
    pass.end();
    totalPasses++;
  };
  const indirectPass = (pipe: GPUComputePipeline, bind: GPUBindGroup, argsBuf: GPUBuffer, byteOffset: number): void => {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipe);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroupsIndirect(argsBuf, byteOffset);
    pass.end();
    totalPasses++;
  };

  const valIdxStride = input_size * 4;
  const rowPtrStride = (num_columns + 1) * 4;
  const runningStride = num_columns * ELEMENT_BYTES;
  const bucketActiveStride = num_columns * 4;

  for (let st = 0; st < num_subtasks; st++) {
    const valIdxView = { buffer: val_idx_buf, offset: st * valIdxStride, size: valIdxStride } as const;
    const rowPtrView = { buffer: row_ptr_buf, offset: st * rowPtrStride, size: rowPtrStride } as const;

    const metaBind = device.createBindGroup({
      layout: pipelines.layouts.meta,
      entries: [
        { binding: 0, resource: rowPtrView },
        { binding: 1, resource: { buffer: scratch.countsA } },
        { binding: 2, resource: { buffer: scratch.offsetsA } },
        { binding: 3, resource: { buffer: scratch.metaParams } },
      ],
    });
    directPass(pipelines.csrMeta, metaBind, Math.ceil(num_columns / wgi));

    const activeBind = device.createBindGroup({
      layout: pipelines.layouts.active,
      entries: [
        { binding: 0, resource: valIdxView },
        { binding: 1, resource: { buffer: point_x_buf } },
        { binding: 2, resource: { buffer: point_y_buf } },
        { binding: 3, resource: { buffer: scratch.activeA, offset: 0, size: PG * M * PG_VEC4_BYTES } },
        { binding: 4, resource: { buffer: scratch.activeA, offset: PG * M * PG_VEC4_BYTES, size: PG * M * PG_VEC4_BYTES } },
        { binding: 5, resource: { buffer: scratch.activeParams } },
      ],
    });
    directPass(pipelines.csrActive, activeBind, Math.ceil(input_size / wgi));

    let curActive: GPUBuffer = scratch.activeA;
    let nextActive: GPUBuffer = scratch.activeB;
    let curCounts: GPUBuffer = scratch.countsA;
    let curOffsets: GPUBuffer = scratch.offsetsA;
    let nextCounts: GPUBuffer = scratch.countsB;
    let nextOffsets: GPUBuffer = scratch.offsetsB;

    for (let lvl = 0; lvl < max_levels; lvl++) {
      const chunkPlanBuf = scratch.perLevelChunkPlan[lvl];
      const scatterPlanBuf = scratch.perLevelScatterPlan[lvl];
      const carryPlanBuf = scratch.perLevelCarryPlan[lvl];
      const totalsBuf = scratch.perLevelTotals[lvl];

      const plannerBind = device.createBindGroup({
        layout: pipelines.layouts.planner,
        entries: [
          { binding: 0, resource: { buffer: curCounts } },
          { binding: 1, resource: { buffer: curOffsets } },
          { binding: 2, resource: { buffer: chunkPlanBuf } },
          { binding: 3, resource: { buffer: scatterPlanBuf } },
          { binding: 4, resource: { buffer: carryPlanBuf } },
          { binding: 5, resource: { buffer: nextCounts } },
          { binding: 6, resource: { buffer: nextOffsets } },
          { binding: 7, resource: { buffer: totalsBuf } },
          { binding: 8, resource: { buffer: scratch.plannerParams } },
        ],
      });
      directPass(pipelines.planner, plannerBind, 1);

      const marshalBind = device.createBindGroup({
        layout: pipelines.layouts.marshal,
        entries: [
          { binding: 0, resource: { buffer: chunkPlanBuf } },
          { binding: 1, resource: { buffer: curActive } },
          { binding: 2, resource: { buffer: scratch.chainBuf } },
          { binding: 3, resource: { buffer: totalsBuf } },
          { binding: 4, resource: { buffer: scratch.marshalConsts } },
        ],
      });
      indirectPass(pipelines.marshal, marshalBind, totalsBuf, 16);

      const disjointBind = device.createBindGroup({
        layout: pipelines.layouts.disjoint,
        entries: [
          { binding: 0, resource: { buffer: scratch.chainBuf } },
          { binding: 1, resource: { buffer: scratch.chainBuf } },
          { binding: 2, resource: { buffer: scratch.tempOut } },
          { binding: 3, resource: { buffer: totalsBuf } },
        ],
      });
      indirectPass(pipelines.disjoint, disjointBind, totalsBuf, 16);

      const scatterBind = device.createBindGroup({
        layout: pipelines.layouts.scatter,
        entries: [
          { binding: 0, resource: { buffer: scatterPlanBuf } },
          { binding: 1, resource: { buffer: scratch.tempOut } },
          { binding: 2, resource: { buffer: nextActive } },
          { binding: 3, resource: { buffer: totalsBuf } },
          { binding: 4, resource: { buffer: scratch.scatterConsts } },
        ],
      });
      indirectPass(pipelines.scatter, scatterBind, totalsBuf, 16);

      const carryBind = device.createBindGroup({
        layout: pipelines.layouts.carry,
        entries: [
          { binding: 0, resource: { buffer: carryPlanBuf } },
          { binding: 1, resource: { buffer: curActive } },
          { binding: 2, resource: { buffer: nextActive } },
          { binding: 3, resource: { buffer: totalsBuf } },
          { binding: 4, resource: { buffer: scratch.carryConsts } },
        ],
      });
      indirectPass(pipelines.carry, carryBind, totalsBuf, 28);

      [curActive, nextActive] = [nextActive, curActive];
      [curCounts, nextCounts] = [nextCounts, curCounts];
      [curOffsets, nextOffsets] = [nextOffsets, curOffsets];
    }

    const subtaskBucketOff = st * num_columns;
    const v2RunBind = device.createBindGroup({
      layout: pipelines.layouts.v2Run,
      entries: [
        { binding: 0, resource: { buffer: curActive } },
        { binding: 1, resource: { buffer: curCounts } },
        { binding: 2, resource: { buffer: curOffsets } },
        { binding: 3, resource: { buffer: running_x_buf, offset: subtaskBucketOff * ELEMENT_BYTES, size: runningStride } },
        { binding: 4, resource: { buffer: running_y_buf, offset: subtaskBucketOff * ELEMENT_BYTES, size: runningStride } },
        { binding: 5, resource: { buffer: bucket_active_buf, offset: subtaskBucketOff * 4, size: bucketActiveStride } },
        { binding: 6, resource: { buffer: scratch.v2RunParams } },
      ],
    });
    directPass(pipelines.v2ToRunning, v2RunBind, Math.ceil(num_columns / wgi));
  }

  const t0 = performance.now();
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();
  const gpu_wall_ms = performance.now() - t0;

  destroyScratch(scratch);

  return {
    levels_per_window: max_levels,
    num_subtasks,
    num_columns,
    total_passes: totalPasses,
    gpu_wall_ms,
  };
}

export function maxChunksUpperBound(input_size: number, num_columns: number, s: number): number {
  return Math.max(1, Math.ceil(input_size / 2 / s) + num_columns);
}

export const sizes = {
  activeSumsBytes(input_size: number): number {
    const M = input_size + 2;
    return 2 * PG * M * 16;
  },
  chainBufBytes(input_size: number, num_columns: number, s: number): number {
    const T = maxChunksUpperBound(input_size, num_columns, s);
    return 2 * PG * (2 * s * T) * 16;
  },
  tempOutBytes(input_size: number, num_columns: number, s: number): number {
    const T = maxChunksUpperBound(input_size, num_columns, s);
    return 2 * PG * (s * T) * 16;
  },
  chunkPlanBytes(input_size: number, num_columns: number, s: number): number {
    const T = maxChunksUpperBound(input_size, num_columns, s);
    return 2 * s * T * 4;
  },
  scatterPlanBytes(input_size: number, num_columns: number, s: number): number {
    const T = maxChunksUpperBound(input_size, num_columns, s);
    return s * T * 4;
  },
  carryPlanBytes(num_columns: number): number {
    return 2 * num_columns * 4;
  },
  countsBytes(num_columns: number): number {
    return num_columns * 4;
  },
  offsetsBytes(num_columns: number): number {
    return num_columns * 4;
  },
};
