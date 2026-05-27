/// <reference types="@webgpu/types" />
import { ShaderManager } from './shader_manager.js';

const PG = 2;
const PLANNER_TPB = 256;
const STREAM_S = 8;
const RADIX_TILE_SIZE = 2048;
const MIN_ITERS_PER_WG = 8;
const MAX_STREAM_WORKGROUPS = 32;

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
    queueHeaderLen,
    maxQueueEntries,
    maxPartials,
    numRadixTiles,
  };
}

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
