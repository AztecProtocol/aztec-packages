// Host orchestrator for the tree-reduce SMVP.
//
// Wires together the host partition + Phase 1 + Phase 2 (recursed)
// kernels. Drives buffer allocation, dispatch sizing, and the resort
// between phases.
//
// Step 4 of the plan (GPU K-way merge resort) is deferred to a perf
// follow-up; this v0 sorts partials CPU-side via a readback +
// in-memory sort + upload between phases. Correctness is identical;
// the perf cost is acceptable for the standalone bench and Quick
// Sanity Check (logN<=16) but must be replaced with GPU resort
// before the production logN=20 path is enabled.

import { ShaderManager } from './shader_manager.js';
import { buildSliceLayout, type BucketStart, type SliceLayout } from './smvp_tree_partition.js';

const NUM_LIMBS_U32 = 20;

export interface TreePhase1Buffers {
  schedule: GPUBuffer;          // u32 per entry (sign | scalar_idx)
  entry_bucket_id: GPUBuffer;   // u32 per entry
  point_x: GPUBuffer;           // BigInt per scalar
  point_y: GPUBuffer;
}

export interface TreeRunResult {
  outputBucketId: GPUBuffer;
  outputX: GPUBuffer;
  outputY: GPUBuffer;
  totalOutputs: number;
  phaseTimingsMs: { phase: string; ms: number }[];
  layers: number;
}

export interface TreeRunConfig {
  tpb: number;             // workgroup size for phases (e.g. 64)
  maxSliceEntries: number; // baked compile-time bound (e.g. 128)
}

interface BufPair {
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

async function readbackPartials(
  device: GPUDevice,
  pair: BufPair,
): Promise<{ bucketId: Uint32Array; x: Uint32Array; y: Uint32Array }> {
  const n = pair.count;
  const bucketBytes = n * 4;
  const pointBytes = n * NUM_LIMBS_U32 * 4;
  const stagingB = makeBuf(device, bucketBytes, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
  const stagingX = makeBuf(device, pointBytes, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
  const stagingY = makeBuf(device, pointBytes, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(pair.bucketId, 0, stagingB, 0, bucketBytes);
  enc.copyBufferToBuffer(pair.x, 0, stagingX, 0, pointBytes);
  enc.copyBufferToBuffer(pair.y, 0, stagingY, 0, pointBytes);
  device.queue.submit([enc.finish()]);
  await device.queue.onSubmittedWorkDone();
  await Promise.all([stagingB.mapAsync(GPUMapMode.READ), stagingX.mapAsync(GPUMapMode.READ), stagingY.mapAsync(GPUMapMode.READ)]);
  const bucketId = new Uint32Array(stagingB.getMappedRange().slice(0));
  const x = new Uint32Array(stagingX.getMappedRange().slice(0));
  const y = new Uint32Array(stagingY.getMappedRange().slice(0));
  stagingB.unmap(); stagingX.unmap(); stagingY.unmap();
  stagingB.destroy(); stagingX.destroy(); stagingY.destroy();
  return { bucketId, x, y };
}

function cpuSortByBucket(
  partials: { bucketId: Uint32Array; x: Uint32Array; y: Uint32Array },
): { bucketId: Uint32Array; x: Uint32Array; y: Uint32Array } {
  const n = partials.bucketId.length;
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  // Stable sort by bucket_id (so within-bucket order is preserved —
  // important for the math: we want left-to-right order to match the
  // original schedule, not random).
  Array.prototype.sort.call(order, (a: number, b: number) => partials.bucketId[a] - partials.bucketId[b]);
  const outB = new Uint32Array(n);
  const outX = new Uint32Array(n * NUM_LIMBS_U32);
  const outY = new Uint32Array(n * NUM_LIMBS_U32);
  for (let k = 0; k < n; k++) {
    const src = order[k];
    outB[k] = partials.bucketId[src];
    outX.set(partials.x.subarray(src * NUM_LIMBS_U32, (src + 1) * NUM_LIMBS_U32), k * NUM_LIMBS_U32);
    outY.set(partials.y.subarray(src * NUM_LIMBS_U32, (src + 1) * NUM_LIMBS_U32), k * NUM_LIMBS_U32);
  }
  return { bucketId: outB, x: outX, y: outY };
}

function totalPairsPossible(bucketIds: Uint32Array): number {
  // Total pair-adds possible = total entries - active bucket count.
  // A "phase done" check: when this equals 0, every bucket has 1
  // partial and recursion terminates.
  if (bucketIds.length === 0) return 0;
  let active = 1;
  for (let i = 1; i < bucketIds.length; i++) {
    if (bucketIds[i] !== bucketIds[i - 1]) active++;
  }
  return bucketIds.length - active;
}

/**
 * Drive the tree-reduce SMVP end-to-end given a precompiled phase1 and
 * phase2 pipeline. Returns the final per-bucket partials (one per
 * active bucket).
 *
 * The caller owns the input buffers; the function allocates output
 * buffers internally and returns the handles for further use.
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
  bucketStart: BucketStart,
  cfg: TreeRunConfig,
): Promise<TreeRunResult> {
  const phaseTimingsMs: { phase: string; ms: number }[] = [];

  const numWgsPhase1 = pickNumWgs(totalEntries, cfg.maxSliceEntries);
  const phase1Slices = evenSliceBounds(totalEntries, numWgsPhase1, cfg.maxSliceEntries);

  // Pull bucket ids from entryBucketId for the host pair-count + offset.
  const bucketIdHostBuf = makeBuf(device, totalEntries * 4, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
  {
    const enc = device.createCommandEncoder();
    enc.copyBufferToBuffer(entryBucketId, 0, bucketIdHostBuf, 0, totalEntries * 4);
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
    await bucketIdHostBuf.mapAsync(GPUMapMode.READ);
  }
  const entryBucketIdHost = new Uint32Array(bucketIdHostBuf.getMappedRange().slice(0));
  bucketIdHostBuf.unmap(); bucketIdHostBuf.destroy();

  void buildSliceLayout(bucketStart, numWgsPhase1); // available if a non-uniform slice scheme is later needed.

  // Phase 1 dispatch.
  const wgPairCountP1 = cpuPairCountPerSlice(entryBucketIdHost, phase1Slices);
  const wgOutputOffsetP1 = offsetsFromCounts(wgPairCountP1);
  const phase1Outputs = wgOutputOffsetP1[wgOutputOffsetP1.length - 1];

  const p1SliceBoundsBuf = makeBufWithData(device, phase1Slices, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  const p1OutputOffsetBuf = makeBufWithData(device, wgOutputOffsetP1, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  const p1PrefixBytes = numWgsPhase1 * cfg.maxSliceEntries * NUM_LIMBS_U32 * 4;
  const p1PrefixBuf = makeBuf(device, p1PrefixBytes, GPUBufferUsage.STORAGE);
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
    pass.dispatchWorkgroups(numWgsPhase1, 1, 1);
    pass.end();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
  }
  phaseTimingsMs.push({ phase: 'phase1', ms: performance.now() - t0 });

  let current: BufPair = { bucketId: p1OutBucketBuf, x: p1OutXBuf, y: p1OutYBuf, count: phase1Outputs };

  // Recursive Phase 2 loop with CPU sort between layers.
  let layer = 1;
  while (true) {
    // Readback + count remaining pair-adds.
    const readback = await readbackPartials(device, current);
    const pairsRemaining = totalPairsPossible(readback.bucketId);
    if (pairsRemaining === 0) {
      // Every bucket has exactly one partial; we're done.
      break;
    }
    layer++;

    // CPU sort by bucket_id (stable).
    const sorted = cpuSortByBucket(readback);

    // Upload sorted partials.
    const inBucketBuf = makeBufWithData(device, sorted.bucketId, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const inXBuf = makeBufWithData(device, sorted.x, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const inYBuf = makeBufWithData(device, sorted.y, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const totalEntriesP2 = sorted.bucketId.length;
    const numWgsP2 = pickNumWgs(totalEntriesP2, cfg.maxSliceEntries);
    const sliceP2 = evenSliceBounds(totalEntriesP2, numWgsP2, cfg.maxSliceEntries);
    const pairsP2 = cpuPairCountPerSlice(sorted.bucketId, sliceP2);
    const offsetsP2 = offsetsFromCounts(pairsP2);
    const outsP2 = offsetsP2[offsetsP2.length - 1];

    const sliceBoundsBuf = makeBufWithData(device, sliceP2, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const outputOffsetBuf = makeBufWithData(device, offsetsP2, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const prefixBytes = numWgsP2 * cfg.maxSliceEntries * NUM_LIMBS_U32 * 4;
    const prefixBuf = makeBuf(device, prefixBytes, GPUBufferUsage.STORAGE);
    const outBucketBuf = makeBuf(device, outsP2 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    const outXBuf = makeBuf(device, outsP2 * NUM_LIMBS_U32 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    const outYBuf = makeBuf(device, outsP2 * NUM_LIMBS_U32 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);

    const bg = device.createBindGroup({
      layout: phase2Layout,
      entries: [
        { binding: 0, resource: { buffer: inBucketBuf } },
        { binding: 1, resource: { buffer: inXBuf } },
        { binding: 2, resource: { buffer: inYBuf } },
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

    // Free previous layer's outputs + this layer's input scratch.
    current.bucketId.destroy(); current.x.destroy(); current.y.destroy();
    inBucketBuf.destroy(); inXBuf.destroy(); inYBuf.destroy();
    sliceBoundsBuf.destroy(); outputOffsetBuf.destroy(); prefixBuf.destroy();

    current = { bucketId: outBucketBuf, x: outXBuf, y: outYBuf, count: outsP2 };

    // Hard cap: log2(N) layers should be more than enough; bail if we
    // exceed it to avoid runaway loops on a buggy kernel.
    if (layer > 32) throw new Error(`runTreeReduce: layer cap (32) exceeded — kernel not reducing`);
  }

  // Free intermediate Phase 1 scratch.
  p1SliceBoundsBuf.destroy();
  p1OutputOffsetBuf.destroy();
  p1PrefixBuf.destroy();
  void bucketStart; void ShaderManager; // silence "imported but unused" lints

  return {
    outputBucketId: current.bucketId,
    outputX: current.x,
    outputY: current.y,
    totalOutputs: current.count,
    phaseTimingsMs,
    layers: layer,
  };
}
