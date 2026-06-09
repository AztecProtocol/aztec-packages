// Shared resident-byte GPU sumcheck engine, used by both the validation suite
// (suite_rounds.ts) and the benchmark tab (bench.ts). Runs all d = log2(n) rounds
// with the polynomial columns kept GPU-resident in Montgomery byte form: columns
// are encoded once, each round's accumulate input is assembled by byte-copy, and
// the fold kernel's byte output IS the next round's columns (no per-round
// toMont/fromMont). See suite_rounds.ts for the validation rationale.

import {
  create_and_write_sb, create_and_write_ub, create_sb,
  create_bind_group_layout, create_bind_group, create_compute_pipeline,
  execute_pipeline, read_from_gpu,
} from '../../src/msm_webgpu/cuzk/gpu.js';
import { runSumcheckRounds } from '../../src/msm_webgpu/multiround.js';
import { NUM_RELATIONS, assembleAccumulator } from '../../src/msm_webgpu/accumulator.js';
import { ALL_RELATIONS } from './descriptors.js';
import {
  type PipelineCache, type RelationDescriptor,
  WG, sm, mod, packParams, toMont, fromMont, writeLe32, le32ToBi,
} from './harness.js';

// The edge-reduction kernel runs one thread per output column, so its workgroup
// size must be >= the largest relation out_len (90 for DatabusLookup). Each round
// is reduced into at most REDUCE_GROUPS workgroup partials, read back and summed
// on the host — turning the readback from O(edges) to O(REDUCE_GROUPS).
const REDUCE_WG = 128;
const REDUCE_GROUPS = 64;

export interface FoldRunner { layout: GPUBindGroupLayout; pipeline: GPUComputePipeline }
export interface ReduceRunner { layout: GPUBindGroupLayout; pipeline: GPUComputePipeline }

/** Compile the edge-reduction kernel once; reused for every round and relation. */
export async function makeReduceRunner(device: GPUDevice): Promise<ReduceRunner> {
  const layout = create_bind_group_layout(device, ['read-only-storage', 'storage', 'uniform']);
  const pipeline = await create_compute_pipeline(device, [layout], sm.gen_reduce_test_shader(REDUCE_WG), 'reduce_main', 'reduce_main');
  return { layout, pipeline };
}

/** Compile the fold kernel once; reused for every round and every relation. */
export async function makeFoldRunner(device: GPUDevice): Promise<FoldRunner> {
  const layout = create_bind_group_layout(device, ['read-only-storage', 'storage', 'uniform', 'read-only-storage']);
  const pipeline = await create_compute_pipeline(device, [layout], sm.gen_fold_test_shader(WG), 'fold_main', 'fold_main');
  return { layout, pipeline };
}

/**
 * Fold `numCols` column-major Montgomery-byte columns of length `len` on the GPU,
 * returning the folded columns as Montgomery bytes (numCols x len/2). No canonical
 * conversion: the bytes go straight back in as the next round's columns.
 */
export async function gpuFoldBytes(
  device: GPUDevice, fold: FoldRunner, inBytes: Uint8Array, numCols: number, len: number, uBytes: Uint8Array,
): Promise<Uint8Array> {
  const half = len >> 1;
  const numOut = numCols * half;
  const inBuf = create_and_write_sb(device, inBytes);
  const outBuf = create_sb(device, numOut * 32);
  const params = new Uint8Array(16);
  const dv = new DataView(params.buffer);
  dv.setUint32(0, numOut, true);
  dv.setUint32(4, half, true);
  const bg = create_bind_group(device, fold.layout, [
    inBuf, outBuf, create_and_write_ub(device, params), create_and_write_sb(device, uBytes),
  ]);
  const enc = device.createCommandEncoder();
  await execute_pipeline(enc, fold.pipeline, bg, Math.ceil(numOut / WG));
  const [bytes] = await read_from_gpu(device, enc, [outBuf]);
  return bytes;
}

/**
 * Assemble a relation's packed edge-row input (numPairs x inLen Fr) from its
 * resident column-major Montgomery bytes by byte-copy — entity j's pair at slots
 * 2j/2j+1, the round's edge scaling at the last slot. No toMont.
 */
export function packEdgesFromBytes(
  colBytes: Uint8Array, numEdges: number, len: number, inLen: number, numPairs: number, scal: Uint8Array,
): Uint8Array {
  const inB = new Uint8Array(numPairs * inLen * 32);
  for (let p = 0; p < numPairs; p++) {
    const rowBase = p * inLen;
    for (let j = 0; j < numEdges; j++) {
      const src = (j * len + 2 * p) * 32;
      inB.set(colBytes.subarray(src, src + 32), (rowBase + 2 * j) * 32);
      inB.set(colBytes.subarray(src + 32, src + 64), (rowBase + 2 * j + 1) * 32);
    }
    inB.set(scal.subarray(p * 32, p * 32 + 32), (rowBase + 2 * numEdges) * 32);
  }
  return inB;
}

/**
 * Dispatch one relation's accumulate kernel then reduce its per-edge output over
 * edges on the GPU, reading back only the workgroup partials and finishing the sum
 * on the host. The per-edge buffer stays in VRAM (never transferred). Returns the
 * relation's 345-Fr slice contribution and the GPU compute+readback time.
 */
async function dispatchAccumulateReduced(
  device: GPUDevice, numPairs: number, desc: RelationDescriptor, inBytes: Uint8Array,
  relParams: Uint8Array | undefined, cache: PipelineCache, reduce: ReduceRunner,
): Promise<{ slice: bigint[]; ms: number }> {
  const outLen = desc.outLen;
  // Accumulate pipeline (cached): same binding scheme as dispatchRelation.
  const types = ['read-only-storage', 'storage', 'uniform'];
  if (relParams) types.push('read-only-storage');
  const accKey = `acc:${desc.entry}|${types.length}`;
  let acc = cache.get(accKey);
  if (!acc) {
    const layout = create_bind_group_layout(device, types);
    const pipeline = await create_compute_pipeline(device, [layout], desc.shader(), desc.entry, desc.entry);
    acc = { layout, pipeline };
    cache.set(accKey, acc);
  }
  const inBuf = create_and_write_sb(device, inBytes);
  const accOut = create_sb(device, numPairs * outLen * 32); // per-edge output; stays on GPU
  const accParams = new Uint8Array(16);
  new DataView(accParams.buffer).setUint32(0, numPairs, true);
  const accBufs = [inBuf, accOut, create_and_write_ub(device, accParams)];
  if (relParams) accBufs.push(create_and_write_sb(device, relParams));
  const accBg = create_bind_group(device, acc.layout, accBufs);

  // Reduce: G workgroups, each summing `chunk` edges into out_len partials.
  const chunk = Math.max(1, Math.ceil(numPairs / REDUCE_GROUPS));
  const groups = Math.ceil(numPairs / chunk);
  const partials = create_sb(device, groups * outLen * 32);
  const rParams = new Uint8Array(16);
  const rdv = new DataView(rParams.buffer);
  rdv.setUint32(0, numPairs, true);
  rdv.setUint32(4, outLen, true);
  rdv.setUint32(8, chunk, true);
  const rBg = create_bind_group(device, reduce.layout, [accOut, partials, create_and_write_ub(device, rParams)]);

  const t0 = performance.now();
  const enc = device.createCommandEncoder();
  await execute_pipeline(enc, acc.pipeline, accBg, Math.ceil(numPairs / WG));
  await execute_pipeline(enc, reduce.pipeline, rBg, groups);
  const [pbytes] = await read_from_gpu(device, enc, [partials]);
  const ms = performance.now() - t0;

  const slice = new Array<bigint>(outLen).fill(0n);
  for (let g = 0; g < groups; g++) {
    for (let k = 0; k < outLen; k++) {
      slice[k] = mod(slice[k] + fromMont(le32ToBi(pbytes, (g * outLen + k) * 32)));
    }
  }
  return { slice, ms };
}

/** Encode canonical bigint columns to column-major Montgomery bytes (length n). */
export function encodeColumnsToBytes(cols: bigint[][], n: number): Uint8Array {
  const ne = cols.length;
  const buf = new Uint8Array(ne * n * 32);
  for (let j = 0; j < ne; j++) for (let i = 0; i < n; i++) writeLe32(buf, (j * n + i) * 32, toMont(cols[j][i]));
  return buf;
}

export interface ResidentSumcheckResult {
  univariates: bigint[][];
  challenges: bigint[];
  /** Per relation, the fully folded length-1 columns as Montgomery bytes. */
  finalColBytes: Uint8Array[];
  /** Sum of per-dispatch (accumulate) compute+readback time, ms. */
  gpuMs: number;
  /** Wall time for the whole multi-round run (rounds only, not the initial encode), ms. */
  totalMs: number;
}

/**
 * Run a full d = log2(n) round MegaFlavor sumcheck on the GPU over resident
 * Montgomery-byte columns. `initColBytes[relationIndex]` are column-major Montgomery
 * bytes of length n (encode with encodeColumnsToBytes); they are replaced in place
 * by the folded bytes each round. Only the multi-round work is timed, not the
 * caller's one-time column encode.
 */
export async function runResidentGpuSumcheck(
  device: GPUDevice,
  n: number,
  alpha: bigint,
  betas: bigint[],
  challenges: bigint[],
  relParamBytes: (Uint8Array | undefined)[],
  initColBytes: Uint8Array[],
  shared?: { cache?: PipelineCache; foldRunner?: FoldRunner; reduceRunner?: ReduceRunner },
): Promise<ResidentSumcheckResult> {
  const d = Math.round(Math.log2(n));
  const colBytes = initColBytes;
  const relCache: PipelineCache = shared?.cache ?? new Map();
  const foldRunner = shared?.foldRunner ?? (await makeFoldRunner(device));
  const reduceRunner = shared?.reduceRunner ?? (await makeReduceRunner(device));
  let curLen = n;
  let gpuMs = 0;

  const t0 = performance.now();
  const { univariates, challenges: used } = await runSumcheckRounds(betas, d, {
    numRounds: d,
    challenges,
    accumulate: async (_round, gs) => {
      const m = curLen;
      const pairs = m >> 1;
      const scal = new Uint8Array(pairs * 32);
      for (let p = 0; p < pairs; p++) writeLe32(scal, p * 32, toMont(gs.edgeScaling(p)));
      const slices: (bigint[] | null)[] = new Array(NUM_RELATIONS).fill(null);
      for (const desc of ALL_RELATIONS) {
        const r = desc.relationIndex;
        const inB = packEdgesFromBytes(colBytes[r], desc.numEdges, m, desc.inLen, pairs, scal);
        const { slice, ms } = await dispatchAccumulateReduced(device, pairs, desc, inB, relParamBytes[r], relCache, reduceRunner);
        gpuMs += ms;
        slices[r] = slice;
      }
      return assembleAccumulator(slices);
    },
    roundUnivariate: (acc, gs) => gs.roundUnivariate(acc, alpha),
    fold: async (_round, u) => {
      const uBytes = packParams([u]);
      for (const desc of ALL_RELATIONS) {
        const r = desc.relationIndex;
        colBytes[r] = await gpuFoldBytes(device, foldRunner, colBytes[r], desc.numEdges, curLen, uBytes);
      }
      curLen >>= 1;
    },
  });
  const totalMs = performance.now() - t0;

  return { univariates, challenges: used, finalColBytes: colBytes, gpuMs, totalMs };
}
