/// <reference types="@webgpu/types" />
import { ShaderManager } from './shader_manager.js';

const PG = 2;
const PLANNER_TPB = 256;
const STREAM_S = 8;
const RADIX_TILE_SIZE = 2048;
const MIN_ITERS_PER_WG = 8;

// === Single source of truth for stream-walker dispatch geometry ===
//
// MAX_PLANNER_WORKGROUPS  — hard cap on cumsum's `nwg` clamp, i.e. how many
//                           partition_thread/partition_task workgroups run.
//                           NOT the walker workgroup count: the walker
//                           workgroup count is num_active_threads /
//                           STREAM_WALKER_TPB which is larger (currently 4x)
//                           because the walker uses a smaller WG size.
//
// STREAM_PLANNER_TPB      — workgroup size of partition_thread/partition_task.
//                           Together with MAX_PLANNER_WORKGROUPS this fixes
//                           STREAM_NUM_THREADS = MAX_PLANNER_WG * PLANNER_TPB.
//
// STREAM_NUM_THREADS      — the live walker thread count cap. Drives all
//                           per-thread buffer sizing (threadCuts, taskCuts,
//                           walkerPartials, walkerPartialDest, walkerNodes*).
//                           = MAX_PLANNER_WORKGROUPS × STREAM_PLANNER_TPB.
//
// STREAM_WALKER_TPB       — workgroup size of the stream_walker kernel.
//                           Bounded by `2 * STREAM_WALKER_TPB * STREAM_S *
//                           16 B <= maxComputeWorkgroupStorageSize` for the
//                           target GPU. M2 fits 32 KB at TPB=64.
//                           Walker workgroup count = STREAM_NUM_THREADS /
//                           STREAM_WALKER_TPB (derived, not a knob).
const MAX_PLANNER_WORKGROUPS = 32;
const STREAM_PLANNER_TPB = PLANNER_TPB;
const STREAM_NUM_THREADS = MAX_PLANNER_WORKGROUPS * STREAM_PLANNER_TPB;
const STREAM_WALKER_TPB = 64;
// Back-compat alias for downstream code that hasn't been renamed yet.
const MAX_STREAM_WORKGROUPS = MAX_PLANNER_WORKGROUPS;

export interface StreamPlannerBuffers {
  plannerMeta: GPUBuffer;
  size1BucketList: GPUBuffer;
  denseBucketList: GPUBuffer;
  denseCountList: GPUBuffer;
  sortedBucketList: GPUBuffer;
  sortedCountList: GPUBuffer;
  radixHist: GPUBuffer;
  cumulativeAdds: GPUBuffer;
  wgCuts: GPUBuffer;
  threadCuts: GPUBuffer;
  queueBuf: GPUBuffer;
  partialsBuf: GPUBuffer;
  partialBucketsList: GPUBuffer;
  accBuf: GPUBuffer;
  prefScratch: GPUBuffer;
  // Stream-walker additions (see STREAM_WALKER_PLAN.md §3.1, §6.1).
  // bucketMeta packs (sorted_bucket_id, count, offset, cum_adds) into one
  // vec4<u32> per bucket so the stream-walker stays within the 8-binding
  // mobile WebGPU limit. Populated by a post-planner pack kernel; consumed
  // by ba_stream_walker.
  bucketMeta: GPUBuffer;
  // splitRecords holds (bucket_idx, first_partial_slot, partial_count)
  // entries — produced by ba_planner_split_detect for inter-thread splits
  // and appended to by ba_stream_walker (atomic per thread) for
  // intra-thread splits. Bounded at ≤ 9 × NUM_THREADS entries.
  splitRecords: GPUBuffer;
}

export interface StreamPlanConfig {
  bTotal: number;
  numThreads: number;
  s: number;
  batchSlots: number;
  invVariant: 'loop' | 'pk';
}

export function computeStreamPlanSizes(cfg: StreamPlanConfig) {
  const { bTotal, numThreads, s } = cfg;
  const queueHeaderLen = 2 * numThreads;
  const maxQueueEntries = bTotal + numThreads * (2 * s - 1);
  const maxPartials = 2 * numThreads;
  const numRadixTiles = Math.ceil(bTotal / RADIX_TILE_SIZE);
  // Stream-walker bounds (STREAM_WALKER_PLAN.md §3.1, §9).
  //   bucketMeta:     bTotal × vec4<u32> = bTotal × 16 B
  //   walkerPartials: each slot writes ≤2 partials (split-start + split-end),
  //                   so 16 slots × numThreads × 2 planes × 32 B per point
  //                 = 1024 × numThreads bytes
  //   splitRecords:   ≤16 (bucket_id, partial_slot) pairs per thread
  //                 = 16 × numThreads × 2 × 4 = 128 × numThreads bytes
  const bucketMetaBytes = bTotal * 4 * 4;
  const walkerPartialsBytes = 16 * numThreads * PG * 2 * 4 * 4;
  const splitRecordsBytes = 16 * numThreads * 2 * 4;
  return {
    plannerMetaBytes: Math.max((20 + numThreads) * 4, 256),
    size1BucketListBytes: bTotal * 2 * 4,
    denseBucketListBytes: bTotal * 4,
    denseCountListBytes: bTotal * 4,
    sortedBucketListBytes: bTotal * 4,
    sortedCountListBytes: bTotal * 4,
    radixHistBytes: numRadixTiles * 256 * 4,
    cumulativeAddsBytes: bTotal * 4,
    wgCutsBytes: MAX_STREAM_WORKGROUPS * 2 * 4,
    threadCutsBytes: numThreads * 2 * 4,
    queueBufBytes: (queueHeaderLen + maxQueueEntries * 3) * 4,
    partialsBufBytes: maxPartials * PG * 2 * 4 * 4,
    partialBucketsListBytes: numThreads * 3 * 4,
    accBufBytes: numThreads * s * PG * 2 * 4 * 4,
    prefScratchBytes: numThreads * s * 2 * 4 * 4,
    bucketMetaBytes,
    walkerPartialsBytes,
    splitRecordsBytes,
    queueHeaderLen,
    maxQueueEntries,
    maxPartials,
    numRadixTiles,
  };
}

// Re-export constants for use by msm_v2.ts pool allocator and shader_manager.
export {
  STREAM_S,
  MIN_ITERS_PER_WG,
  MAX_PLANNER_WORKGROUPS,
  MAX_STREAM_WORKGROUPS, // back-compat alias = MAX_PLANNER_WORKGROUPS
  STREAM_PLANNER_TPB,
  STREAM_NUM_THREADS,
  STREAM_WALKER_TPB,
};

/**
 * CPU reference accumulator for Phase-0 testing. Directly sums each
 * bucket's points into a JS Map keyed by bucket index, for bit-equality
 * comparison with the GPU's bucket_sums.
 */
export function cpuReferenceAccumulate(
  srsX: bigint[],
  srsY: bigint[],
  l0Idx: Uint32Array,
  counts: Uint32Array,
  offsets: Uint32Array,
  bTotal: number,
  p: bigint,
): Map<number, { x: bigint; y: bigint }> {
  const result = new Map<number, { x: bigint; y: bigint }>();
  const SIGN_BIT = 0x80000000;
  const IDX_MASK = 0x7fffffff;

  const modSub = (a: bigint, b: bigint): bigint => ((a - b) % p + p) % p;
  const modAdd = (a: bigint, b: bigint): bigint => (a + b) % p;
  const modMul = (a: bigint, b: bigint): bigint => (a * b) % p;
  const modInv = (a: bigint): bigint => {
    let [old_r, r] = [((a % p) + p) % p, p];
    let [old_s, s] = [1n, 0n];
    while (r !== 0n) {
      const q = old_r / r;
      [old_r, r] = [r, old_r - q * r];
      [old_s, s] = [s, old_s - q * s];
    }
    return ((old_s % p) + p) % p;
  };

  const affineAdd = (
    x1: bigint, y1: bigint, x2: bigint, y2: bigint,
  ): { x: bigint; y: bigint } => {
    const dx = modSub(x2, x1);
    const dy = modSub(y2, y1);
    const lambda = modMul(dy, modInv(dx));
    const rx = modSub(modSub(modMul(lambda, lambda), x1), x2);
    const ry = modSub(modMul(lambda, modSub(x1, rx)), y1);
    return { x: rx, y: ry };
  };

  for (let b = 0; b < bTotal; b++) {
    const count = counts[b];
    if (count === 0) continue;

    const base = offsets[b];
    let accX: bigint | undefined;
    let accY: bigint | undefined;

    for (let j = 0; j < count; j++) {
      const packed = l0Idx[base + j];
      const pt = packed & IDX_MASK;
      const sign = (packed & SIGN_BIT) !== 0;
      let px = srsX[pt];
      let py = srsY[pt];
      if (sign) py = modSub(0n, py);

      if (accX === undefined || accY === undefined) {
        accX = px;
        accY = py;
      } else {
        const r = affineAdd(accX, accY, px, py);
        accX = r.x;
        accY = r.y;
      }
    }

    if (accX !== undefined && accY !== undefined) {
      result.set(b, { x: accX, y: accY });
    }
  }

  return result;
}
