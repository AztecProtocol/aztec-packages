// Host orchestrator for the tree-reduce SMVP.
//
// First-principles observation that eliminates the resort step:
// Phase 1 / Phase 2 outputs are already globally bucket-sorted.
//   * Input entry_bucket_id is monotone non-decreasing (CSR layout).
//   * Each WG walks its non-overlapping contiguous slice left-to-right,
//     emitting PAIR results and UNPAIRED carries in walk order.
//   * Concatenated WG outputs therefore preserve monotone bucket_id
//     ordering with no overlap and no resort.
//
// So a phase's output buffers feed the next phase's input buffers
// directly — no GPU readback, no JS sort, no upload between layers.
// The only host coordination is computing per-WG pair_count + output
// offsets from the bucket_id stream, and that we do once per phase
// from a single bucket_id readback (4 B per partial, dominated by the
// MUCH heavier per-partial point data which never moves).
//
// MAX_SLICE_ENTRIES = SWEET_B = 1024 in the v2 shaders, so per-WG
// work is exactly the plan's amortisation target and total threads
// (num_wgs × TPB) saturates ~40 K on a logN ≥ 14 workload.

import { ShaderManager } from './shader_manager.js';

const NUM_LIMBS_U32 = 20;

export interface TreeRunResult {
  outputBucketId: GPUBuffer;
  outputX: GPUBuffer;
  outputY: GPUBuffer;
  totalOutputs: number;
  phaseTimingsMs: { phase: string; ms: number }[];
  layers: number;
}

export interface TreeRunConfig {
  tpb: number;
  maxSliceEntries: number;
}

interface BufTrio {
  bucketId: GPUBuffer;
  x: GPUBuffer;
  y: GPUBuffer;
  count: number;
}

function makeBuf(device: GPUDevice, size: number, usage: number): GPUBuffer {
  return device.createBuffer({ size, usage });
}

function makeBufWithData(device: GPUDevice, data: BufferSource, usage: number): GPUBuffer {
  const buf = device.createBuffer({ size: (data as ArrayBufferView).byteLength, usage });
  device.queue.writeBuffer(buf, 0, data);
  return buf;
}

function pickNumWgs(totalEntries: number, maxSliceEntries: number): number {
  return Math.max(1, Math.ceil(totalEntries / maxSliceEntries));
}

function evenSliceBounds(totalEntries: number, numWgs: number, maxSliceEntries: number): Uint32Array {
  const perWg = Math.min(maxSliceEntries, Math.ceil(totalEntries / numWgs));
  const out = new Uint32Array(numWgs + 1);
  for (let k = 0; k <= numWgs; k++) out[k] = Math.min(k * perWg, totalEntries);
  return out;
}

function cpuPairCountPerSlice(bucketIds: Uint32Array, sliceBounds: Uint32Array): Uint32Array {
  const numWgs = sliceBounds.length - 1;
  const counts = new Uint32Array(numWgs);
  for (let s = 0; s < numWgs; s++) {
    const lo = sliceBounds[s];
    const hi = sliceBounds[s + 1];
    let count = 0;
    let open = false;
    let openBucket = -1;
    for (let i = lo; i < hi; i++) {
      const b = bucketIds[i];
      if (open && b === openBucket) { count++; open = false; openBucket = -1; }
      else { if (open) count++; open = true; openBucket = b; }
    }
    if (open) count++;
    counts[s] = count;
  }
  return counts;
}

function offsetsFromCounts(counts: Uint32Array): Uint32Array {
  const out = new Uint32Array(counts.length + 1);
  for (let s = 0; s < counts.length; s++) out[s + 1] = out[s] + counts[s];
  return out;
}

async function readbackU32(device: GPUDevice, buf: GPUBuffer, count: number): Promise<Uint32Array> {
  const staging = makeBuf(device, count * 4, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(buf, 0, staging, 0, count * 4);
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  await staging.mapAsync(GPUMapMode.READ);
  const out = new Uint32Array(staging.getMappedRange().slice(0));
  staging.unmap(); staging.destroy();
  return out;
}

function countActiveBuckets(bucketIds: Uint32Array): number {
  if (bucketIds.length === 0) return 0;
  let active = 1;
  for (let i = 1; i < bucketIds.length; i++) {
    if (bucketIds[i] !== bucketIds[i - 1]) active++;
  }
  return active;
}

/**
 * End-to-end tree-reduce orchestrator. Drives Phase 1 once (on the
 * raw schedule) then iterates Phase 2 over its own outputs until every
 * bucket has exactly one partial. No CPU sort or full point readback
 * between phases — only the small (4 B / partial) bucket-id stream
 * round-trips for per-WG pair-count + offset computation.
 *
 * Caller owns the input buffers; this function allocates intermediate
 * buffers internally and returns the final output handles.
 */
export async function runTreeReduce(
  device: GPUDevice,
  phase1Pipeline: GPUComputePipeline,
  phase1Layout: GPUBindGroupLayout,
  phase2Pipeline: GPUComputePipeline,
  phase2Layout: GPUBindGroupLayout,
  schedule: GPUBuffer,
  entryBucketId: GPUBuffer,
  pointX: GPUBuffer,
  pointY: GPUBuffer,
  totalEntries: number,
  cfg: TreeRunConfig,
): Promise<TreeRunResult> {
  const phaseTimingsMs: { phase: string; ms: number }[] = [];

  const entryBucketIdHost = await readbackU32(device, entryBucketId, totalEntries);
  const numActiveBuckets = countActiveBuckets(entryBucketIdHost);

  const numWgsP1 = pickNumWgs(totalEntries, cfg.maxSliceEntries);
  const phase1Slices = evenSliceBounds(totalEntries, numWgsP1, cfg.maxSliceEntries);
  const wgPairCountP1 = cpuPairCountPerSlice(entryBucketIdHost, phase1Slices);
  const wgOutputOffsetP1 = offsetsFromCounts(wgPairCountP1);
  const phase1Outputs = wgOutputOffsetP1[wgOutputOffsetP1.length - 1];

  const p1SliceBoundsBuf = makeBufWithData(device, phase1Slices, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  const p1OutputOffsetBuf = makeBufWithData(device, wgOutputOffsetP1, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  const p1PrefixBuf = makeBuf(device, numWgsP1 * cfg.maxSliceEntries * NUM_LIMBS_U32 * 4, GPUBufferUsage.STORAGE);
  const p1OutBucketBuf = makeBuf(device, phase1Outputs * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
  const p1OutXBuf = makeBuf(device, phase1Outputs * NUM_LIMBS_U32 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
  const p1OutYBuf = makeBuf(device, phase1Outputs * NUM_LIMBS_U32 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);

  const p1Bg = device.createBindGroup({
    layout: phase1Layout,
    entries: [
      { binding: 0, resource: { buffer: schedule } },
      { binding: 1, resource: { buffer: entryBucketId } },
      { binding: 2, resource: { buffer: pointX } },
      { binding: 3, resource: { buffer: pointY } },
      { binding: 4, resource: { buffer: p1SliceBoundsBuf } },
      { binding: 5, resource: { buffer: p1OutputOffsetBuf } },
      { binding: 6, resource: { buffer: p1PrefixBuf } },
      { binding: 7, resource: { buffer: p1OutBucketBuf } },
      { binding: 8, resource: { buffer: p1OutXBuf } },
      { binding: 9, resource: { buffer: p1OutYBuf } },
    ],
  });

  const t0 = performance.now();
  {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(phase1Pipeline);
    pass.setBindGroup(0, p1Bg);
    pass.dispatchWorkgroups(numWgsP1, 1, 1);
    pass.end();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
  }
  phaseTimingsMs.push({ phase: 'phase1', ms: performance.now() - t0 });

  let current: BufTrio = { bucketId: p1OutBucketBuf, x: p1OutXBuf, y: p1OutYBuf, count: phase1Outputs };

  // Recursive Phase 2 loop. Output count strictly decreases each layer
  // (every PAIR halves the count by 1). Terminate when count equals
  // the input's num_active_buckets — every bucket has exactly one
  // partial and no more PAIRs can be formed.
  let layer = 1;
  while (current.count > numActiveBuckets) {
    layer++;
    const currentBucketHost = await readbackU32(device, current.bucketId, current.count);
    // Sanity: confirm globally bucket-sorted (debug guard — cheap).
    for (let i = 1; i < currentBucketHost.length; i++) {
      if (currentBucketHost[i] < currentBucketHost[i - 1]) {
        throw new Error(`runTreeReduce layer ${layer - 1} output not globally bucket-sorted at i=${i}: ${currentBucketHost[i - 1]} > ${currentBucketHost[i]}`);
      }
    }
    const numWgsP2 = pickNumWgs(current.count, cfg.maxSliceEntries);
    const sliceP2 = evenSliceBounds(current.count, numWgsP2, cfg.maxSliceEntries);
    const pairsP2 = cpuPairCountPerSlice(currentBucketHost, sliceP2);
    const offsetsP2 = offsetsFromCounts(pairsP2);
    const outsP2 = offsetsP2[offsetsP2.length - 1];

    const sliceBoundsBuf = makeBufWithData(device, sliceP2, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const outputOffsetBuf = makeBufWithData(device, offsetsP2, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const prefixBuf = makeBuf(device, numWgsP2 * cfg.maxSliceEntries * NUM_LIMBS_U32 * 4, GPUBufferUsage.STORAGE);
    const outBucketBuf = makeBuf(device, outsP2 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    const outXBuf = makeBuf(device, outsP2 * NUM_LIMBS_U32 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    const outYBuf = makeBuf(device, outsP2 * NUM_LIMBS_U32 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);

    const bg = device.createBindGroup({
      layout: phase2Layout,
      entries: [
        { binding: 0, resource: { buffer: current.bucketId } },
        { binding: 1, resource: { buffer: current.x } },
        { binding: 2, resource: { buffer: current.y } },
        { binding: 3, resource: { buffer: sliceBoundsBuf } },
        { binding: 4, resource: { buffer: outputOffsetBuf } },
        { binding: 5, resource: { buffer: prefixBuf } },
        { binding: 6, resource: { buffer: outBucketBuf } },
        { binding: 7, resource: { buffer: outXBuf } },
        { binding: 8, resource: { buffer: outYBuf } },
      ],
    });
    const tLayer = performance.now();
    {
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(phase2Pipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(numWgsP2, 1, 1);
      pass.end();
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
    }
    phaseTimingsMs.push({ phase: `phase2_layer${layer}`, ms: performance.now() - tLayer });

    current.bucketId.destroy(); current.x.destroy(); current.y.destroy();
    sliceBoundsBuf.destroy(); outputOffsetBuf.destroy(); prefixBuf.destroy();

    current = { bucketId: outBucketBuf, x: outXBuf, y: outYBuf, count: outsP2 };

    if (layer > 64) throw new Error(`runTreeReduce: layer cap (64) exceeded — kernel not reducing`);
  }

  p1SliceBoundsBuf.destroy();
  p1OutputOffsetBuf.destroy();
  p1PrefixBuf.destroy();
  void ShaderManager;

  return {
    outputBucketId: current.bucketId,
    outputX: current.x,
    outputY: current.y,
    totalOutputs: current.count,
    phaseTimingsMs,
    layers: layer,
  };
}
