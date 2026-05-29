// Runnable §11 correctness gates (G1-G5) for the stream-walker MSM
// accumulator (plan: STREAM_WALKER_PLAN.md). Test-first: each gate's CPU
// oracle is real and runs against the live planner output; the GPU side of
// gates whose kernel does not exist yet throws `NotImplemented`, so the
// suite is RED until each kernel is built and wired. Implementing a kernel
// = replacing its NotImplemented stub with the buffer readback + the
// comparison already written here.
//
// Gate → kernel under test → oracle:
//   G1  ba_planner_split_detect  vs  CPU split-detect from thread_cuts
//   G2  ba_stream_walker (logn=8, single bucket)   vs cpuReferenceAccumulate
//   G3  ba_stream_walker (logn=10, no splits)      vs cpuReferenceAccumulate
//   G4  ba_stream_walker (logn=10, forced splits)  vs cpuReferenceAccumulate + host fixup
//   G5  WebGPU stream-walker  vs  WASM MT MSM (final point)
import { cpuReferenceAccumulate } from '../../src/msm_webgpu/cuzk/ba_stream_plan.js';
import { BN254_BASE_FIELD } from '../../src/msm_webgpu/cuzk/bn254.js';

export class NotImplemented extends Error {
  constructor(what: string) {
    super(`${what}: not yet implemented`);
    this.name = 'NotImplemented';
  }
}

export type GateStatus = 'PASS' | 'FAIL' | 'NYI';
export interface GateResult {
  id: string;
  title: string;
  status: GateStatus;
  detail: string;
}

const FP = BN254_BASE_FIELD;

/** Per-bucket sums the walker must reproduce, computed directly from the
 *  planner's CSR (l0Idx + counts + offsets) and the affine SRS points. */
export function cpuBucketSums(
  points: { x: bigint; y: bigint }[],
  l0Idx: Uint32Array,
  counts: Uint32Array,
  offsets: Uint32Array,
  bTotal: number,
): Map<number, { x: bigint; y: bigint }> {
  const srsX = points.map(p => p.x);
  const srsY = points.map(p => p.y);
  return cpuReferenceAccumulate(srsX, srsY, l0Idx, counts, offsets, bTotal, FP);
}

/**
 * CPU reference for `ba_planner_split_detect` (plan §5.2): scan thread_cuts
 * and, for every active thread t≥1 whose offset > 0, emit one inter-thread
 * split record `[sorted_bucket_list[cb], 8*(t-1)+7, 2]`. Returns records as
 * a flat Uint32Array (3 u32 each), matching the kernel's `split_records`.
 */
export function expectedSplitRecords(
  threadCuts: Uint32Array,
  sortedBucketList: Uint32Array,
  numActiveThreads: number,
): Uint32Array {
  const recs: number[] = [];
  for (let t = 1; t < numActiveThreads; t++) {
    const cb = threadCuts[2 * t + 0];
    const co = threadCuts[2 * t + 1];
    if (co > 0) {
      recs.push(sortedBucketList[cb], 8 * (t - 1) + 7, 2);
    }
  }
  return Uint32Array.from(recs);
}

/** Order-insensitive compare of two split_records sets (3 u32 per record). */
export function compareSplitRecords(
  expected: Uint32Array,
  actual: Uint32Array,
): { ok: boolean; detail: string } {
  const key = (a: Uint32Array, i: number) => `${a[i]},${a[i + 1]},${a[i + 2]}`;
  const eset = new Map<string, number>();
  for (let i = 0; i + 2 < expected.length; i += 3) eset.set(key(expected, i), (eset.get(key(expected, i)) ?? 0) + 1);
  const aset = new Map<string, number>();
  for (let i = 0; i + 2 < actual.length; i += 3) aset.set(key(actual, i), (aset.get(key(actual, i)) ?? 0) + 1);
  let missing = 0;
  let extra = 0;
  for (const [k, n] of eset) missing += Math.max(0, n - (aset.get(k) ?? 0));
  for (const [k, n] of aset) extra += Math.max(0, n - (eset.get(k) ?? 0));
  const ok = missing === 0 && extra === 0 && expected.length === actual.length;
  return {
    ok,
    detail: `expected=${expected.length / 3} actual=${actual.length / 3} missing=${missing} extra=${extra}`,
  };
}

/** Bit-equal compare of two bucket-sum maps. */
export function compareBucketSums(
  cpu: Map<number, { x: bigint; y: bigint }>,
  gpu: Map<number, { x: bigint; y: bigint }>,
): { ok: boolean; detail: string } {
  let mismatch = 0;
  let firstBad = -1;
  for (const [b, c] of cpu) {
    const g = gpu.get(b);
    if (!g || g.x !== c.x || g.y !== c.y) {
      mismatch++;
      if (firstBad < 0) firstBad = b;
    }
  }
  let extra = 0;
  for (const b of gpu.keys()) if (!cpu.has(b)) extra++;
  const ok = mismatch === 0 && extra === 0;
  return {
    ok,
    detail: `cpuBuckets=${cpu.size} gpuBuckets=${gpu.size} mismatch=${mismatch} extra=${extra}` +
      (firstBad >= 0 ? ` firstBad=${firstBad}` : ''),
  };
}

async function runGate(
  id: string,
  title: string,
  fn: () => Promise<{ ok: boolean; detail: string }>,
): Promise<GateResult> {
  try {
    const { ok, detail } = await fn();
    return { id, title, status: ok ? 'PASS' : 'FAIL', detail };
  } catch (e) {
    if (e instanceof NotImplemented) return { id, title, status: 'NYI', detail: (e as Error).message };
    return { id, title, status: 'FAIL', detail: e instanceof Error ? e.message : String(e) };
  }
}

export interface GatePlannerData {
  bTotal: number;
  totalAdds: number;
  streamNumThreads: number;
  plannerNwg: number;
  splitCount: number;
  counts: Uint32Array;
  offsets: Uint32Array;
  l0Idx: Uint32Array;
  threadCuts: Uint32Array;
  sortedBucketList: Uint32Array;
}

/** GPU side of each gate — built lazily as kernels land. Until then the
 *  hooks throw NotImplemented and their gates report NYI (RED). */
export interface GateGpuHooks {
  /** ba_planner_split_detect output (flat 3-u32 records). */
  splitRecords(): Promise<Uint32Array>;
  /** ba_stream_walker bucket_sums (decoded affine), no host fixup. */
  walkerBucketSums(): Promise<Map<number, { x: bigint; y: bigint }>>;
  /** ba_stream_walker bucket_sums after host-side partials fixup. */
  walkerBucketSumsWithFixup(): Promise<Map<number, { x: bigint; y: bigint }>>;
  /** Final MSM point from the WebGPU stream-walker path. */
  walkerFinalPoint(): Promise<{ x: bigint; y: bigint }>;
  /** Final MSM point from the WASM MT reference path. */
  wasmFinalPoint(): Promise<{ x: bigint; y: bigint }>;
}

export const NOT_IMPLEMENTED_HOOKS: GateGpuHooks = {
  splitRecords: () => Promise.reject(new NotImplemented('ba_planner_split_detect')),
  walkerBucketSums: () => Promise.reject(new NotImplemented('ba_stream_walker')),
  walkerBucketSumsWithFixup: () => Promise.reject(new NotImplemented('ba_stream_walker + host fixup')),
  walkerFinalPoint: () => Promise.reject(new NotImplemented('ba_stream_walker (final point)')),
  wasmFinalPoint: () => Promise.reject(new NotImplemented('WASM MT reference (barretenberg.wasm not built)')),
};

/**
 * Run gates G1-G5 against the live planner output and the (possibly stubbed)
 * GPU hooks. `points` are the affine SRS points used for this MSM; `logn`
 * selects which gates are in scope per the plan's table.
 */
export async function runGates(
  logn: number,
  points: { x: bigint; y: bigint }[],
  planner: GatePlannerData,
  hooks: GateGpuHooks = NOT_IMPLEMENTED_HOOKS,
): Promise<GateResult[]> {
  const results: GateResult[] = [];
  const numActive = planner.plannerNwg > 0 ? planner.plannerNwg * 256 : planner.streamNumThreads;
  const cpuBuckets = cpuBucketSums(points, planner.l0Idx, planner.counts, planner.offsets, planner.bTotal);

  // G1 — split detection vs CPU reference derived from thread_cuts.
  results.push(
    await runGate('G1', 'ba_planner_split_detect ↔ CPU split-detect from thread_cuts', async () => {
      const expected = expectedSplitRecords(planner.threadCuts, planner.sortedBucketList, numActive);
      const actual = await hooks.splitRecords();
      return compareSplitRecords(expected, actual);
    }),
  );

  // G2 — walker bucket_sums at logn=8 (single workgroup / single bucket).
  results.push(
    await runGate('G2', 'walker bucket_sums (logn=8) ↔ cpuReferenceAccumulate', async () => {
      const gpu = await hooks.walkerBucketSums();
      return compareBucketSums(cpuBuckets, gpu);
    }),
  );

  // G3 — walker bucket_sums at logn=10, no forced splits.
  results.push(
    await runGate('G3', 'walker bucket_sums (logn=10, no splits) ↔ cpuReferenceAccumulate', async () => {
      const gpu = await hooks.walkerBucketSums();
      return compareBucketSums(cpuBuckets, gpu);
    }),
  );

  // G4 — walker bucket_sums at logn=10 with splits forced; host fixup applied.
  results.push(
    await runGate('G4', 'walker + host fixup (logn=10, forced splits) ↔ cpuReferenceAccumulate', async () => {
      const gpu = await hooks.walkerBucketSumsWithFixup();
      return compareBucketSums(cpuBuckets, gpu);
    }),
  );

  // G5 — WebGPU stream-walker final point ↔ WASM MT final point.
  results.push(
    await runGate('G5', 'WebGPU stream-walker ↔ WASM MT (final point)', async () => {
      const gpu = await hooks.walkerFinalPoint();
      const wasm = await hooks.wasmFinalPoint();
      const ok = gpu.x === wasm.x && gpu.y === wasm.y;
      return { ok, detail: ok ? 'WebGPU and WASM MT agree' : `disagree: gpu.x=${gpu.x} wasm.x=${wasm.x}` };
    }),
  );

  return results;
}
