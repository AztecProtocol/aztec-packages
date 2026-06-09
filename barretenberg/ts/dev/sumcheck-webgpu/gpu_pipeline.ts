// Shared GPU sumcheck engine — fully GPU-resident across rounds, used by both the
// validation suite (suite_rounds.ts) and the benchmark (bench.ts).
//
// The polynomial columns live in GPU buffers for the whole run and never come back
// to the host between rounds. Per round:
//   - one command encoder runs, for all 14 relations: a gather kernel (builds the
//     packed edge-row input from the resident column-major columns + the per-edge
//     scaling), the relation accumulate kernel, and the edge-reduction kernel
//     (sums per-edge outputs into <=64 workgroup partials). All relations write
//     into ONE partials buffer, read back in a SINGLE transfer (~0.7 MB) — the
//     only per-round data trip.
//   - the host finishes the partial sums, forms the round univariate, draws the
//     challenge, and a second encoder folds every column resident->resident (no
//     readback, just a fence).
// One edge/per-edge scratch buffer is reused across relations to bound VRAM
// (WebGPU serializes passes within an encoder, so reuse is safe).

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

const REDUCE_WG = 128; // >= largest relation out_len (90)
const REDUCE_GROUPS = 64;

export interface FoldRunner { layout: GPUBindGroupLayout; pipeline: GPUComputePipeline }
export interface ReduceRunner { layout: GPUBindGroupLayout; pipeline: GPUComputePipeline }
export interface GatherRunner { layout: GPUBindGroupLayout; pipeline: GPUComputePipeline }

export async function makeFoldRunner(device: GPUDevice): Promise<FoldRunner> {
  const layout = create_bind_group_layout(device, ['read-only-storage', 'storage', 'uniform', 'read-only-storage']);
  const pipeline = await create_compute_pipeline(device, [layout], sm.gen_fold_test_shader(WG), 'fold_main', 'fold_main');
  return { layout, pipeline };
}
export async function makeReduceRunner(device: GPUDevice): Promise<ReduceRunner> {
  const layout = create_bind_group_layout(device, ['read-only-storage', 'storage', 'uniform']);
  const pipeline = await create_compute_pipeline(device, [layout], sm.gen_reduce_test_shader(REDUCE_WG), 'reduce_main', 'reduce_main');
  return { layout, pipeline };
}
export async function makeGatherRunner(device: GPUDevice): Promise<GatherRunner> {
  const layout = create_bind_group_layout(device, ['read-only-storage', 'read-only-storage', 'storage', 'uniform']);
  const pipeline = await create_compute_pipeline(device, [layout], sm.gen_gather_test_shader(WG), 'gather_main', 'gather_main');
  return { layout, pipeline };
}

/** Encode canonical bigint columns to column-major Montgomery bytes (length n). */
export function encodeColumnsToBytes(cols: bigint[][], n: number): Uint8Array {
  const ne = cols.length;
  const buf = new Uint8Array(ne * n * 32);
  for (let j = 0; j < ne; j++) for (let i = 0; i < n; i++) writeLe32(buf, (j * n + i) * 32, toMont(cols[j][i]));
  return buf;
}

function u32x4(a: number, b = 0, c = 0, d = 0): Uint8Array {
  const out = new Uint8Array(16);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, a, true); dv.setUint32(4, b, true); dv.setUint32(8, c, true); dv.setUint32(12, d, true);
  return out;
}

export interface ResidentSumcheckResult {
  univariates: bigint[][];
  challenges: bigint[];
  /** Per relation, the fully folded length-1 columns as Montgomery bytes. */
  finalColBytes: Uint8Array[];
  /** GPU-bound time: per round, the accumulate readback + the fold fence, summed. */
  gpuMs: number;
  /** Wall time for the whole multi-round run (rounds only, not setup/upload). */
  totalMs: number;
}

interface Shared {
  cache?: PipelineCache;
  foldRunner?: FoldRunner;
  reduceRunner?: ReduceRunner;
  gatherRunner?: GatherRunner;
}

/**
 * Run a full d = log2(n) round MegaFlavor sumcheck on the GPU with the columns
 * GPU-resident across rounds. `initColBytes[relationIndex]` are column-major
 * Montgomery bytes of length n (encode with encodeColumnsToBytes); they are
 * uploaded once and never read back until the final length-1 columns (for the
 * caller's purported-value anchor).
 */
export async function runResidentGpuSumcheck(
  device: GPUDevice,
  n: number,
  alpha: bigint,
  betas: bigint[],
  challenges: bigint[],
  relParamBytes: (Uint8Array | undefined)[],
  initColBytes: Uint8Array[],
  shared?: Shared,
): Promise<ResidentSumcheckResult> {
  const d = Math.round(Math.log2(n));
  const relCache: PipelineCache = shared?.cache ?? new Map();
  const foldRunner = shared?.foldRunner ?? (await makeFoldRunner(device));
  const reduceRunner = shared?.reduceRunner ?? (await makeReduceRunner(device));
  const gatherRunner = shared?.gatherRunner ?? (await makeGatherRunner(device));

  // Upload relation parameters once; columns become resident GPU buffers.
  const relParamBufs: (GPUBuffer | undefined)[] = new Array(NUM_RELATIONS).fill(undefined);
  let colBuf: GPUBuffer[] = new Array(NUM_RELATIONS);
  for (const desc of ALL_RELATIONS) {
    const r = desc.relationIndex;
    const rp = relParamBytes[r];
    if (rp) relParamBufs[r] = create_and_write_sb(device, rp);
    colBuf[r] = create_and_write_sb(device, initColBytes[r]);
  }

  // Scratch buffers sized for round 0, reused for every relation and round.
  const pairs0 = n >> 1;
  let maxEdge = 0, maxPerEdge = 0, totalOutLen = 0;
  for (const desc of ALL_RELATIONS) {
    maxEdge = Math.max(maxEdge, pairs0 * desc.inLen);
    maxPerEdge = Math.max(maxPerEdge, pairs0 * desc.outLen);
    totalOutLen += desc.outLen;
  }
  const edgeBuf = create_sb(device, maxEdge * 32);
  const perEdge = create_sb(device, maxPerEdge * 32);
  const partialsAll = create_sb(device, REDUCE_GROUPS * totalOutLen * 32);

  // Cached accumulate pipeline per relation (same binding scheme as dispatchRelation).
  const accPipeline = async (desc: RelationDescriptor) => {
    const hasParams = relParamBufs[desc.relationIndex] !== undefined;
    const key = `acc:${desc.entry}|${hasParams ? 4 : 3}`;
    let p = relCache.get(key);
    if (!p) {
      const types = ['read-only-storage', 'storage', 'uniform'];
      if (hasParams) types.push('read-only-storage');
      const layout = create_bind_group_layout(device, types);
      const pipeline = await create_compute_pipeline(device, [layout], desc.shader(), desc.entry, desc.entry);
      p = { layout, pipeline };
      relCache.set(key, p);
    }
    return p;
  };

  let curLen = n;
  let gpuMs = 0;
  const t0 = performance.now();
  const { univariates, challenges: used } = await runSumcheckRounds(betas, d, {
    numRounds: d,
    challenges,
    accumulate: async (_round, gs) => {
      const m = curLen;
      const pairs = m >> 1;
      const chunk = Math.max(1, Math.ceil(pairs / REDUCE_GROUPS));
      const groups = Math.ceil(pairs / chunk);

      const scal = new Uint8Array(pairs * 32);
      for (let p = 0; p < pairs; p++) writeLe32(scal, p * 32, toMont(gs.edgeScaling(p)));
      const scalBuf = create_and_write_sb(device, scal);

      const enc = device.createCommandEncoder();
      const outBases: number[] = new Array(NUM_RELATIONS);
      let outBase = 0; // Fr offset into partialsAll
      for (const desc of ALL_RELATIONS) {
        const r = desc.relationIndex;
        // gather: resident columns + scaling -> packed edge rows (edgeBuf)
        const gBg = create_bind_group(device, gatherRunner.layout, [
          colBuf[r], scalBuf, edgeBuf, create_and_write_ub(device, u32x4(desc.numEdges, m, desc.inLen, pairs)),
        ]);
        await execute_pipeline(enc, gatherRunner.pipeline, gBg, Math.ceil((pairs * desc.inLen) / WG));
        // accumulate: edgeBuf -> per-edge output (perEdge)
        const acc = await accPipeline(desc);
        const aBufs: GPUBuffer[] = [edgeBuf, perEdge, create_and_write_ub(device, u32x4(pairs))];
        if (relParamBufs[r]) aBufs.push(relParamBufs[r]!);
        const aBg = create_bind_group(device, acc.layout, aBufs);
        await execute_pipeline(enc, acc.pipeline, aBg, Math.ceil(pairs / WG));
        // reduce: per-edge output -> partials (into the shared buffer at outBase)
        const rBg = create_bind_group(device, reduceRunner.layout, [
          perEdge, partialsAll, create_and_write_ub(device, u32x4(pairs, desc.outLen, chunk, outBase)),
        ]);
        await execute_pipeline(enc, reduceRunner.pipeline, rBg, groups);
        outBases[r] = outBase;
        outBase += groups * desc.outLen;
      }
      const tg = performance.now();
      const [pbytes] = await read_from_gpu(device, enc, [partialsAll], groups * totalOutLen * 32);
      gpuMs += performance.now() - tg;

      const slices: (bigint[] | null)[] = new Array(NUM_RELATIONS).fill(null);
      for (const desc of ALL_RELATIONS) {
        const r = desc.relationIndex;
        const base = outBases[r];
        const slice = new Array<bigint>(desc.outLen).fill(0n);
        for (let g = 0; g < groups; g++) {
          for (let k = 0; k < desc.outLen; k++) {
            slice[k] = mod(slice[k] + fromMont(le32ToBi(pbytes, (base + g * desc.outLen + k) * 32)));
          }
        }
        slices[r] = slice;
      }
      return assembleAccumulator(slices);
    },
    roundUnivariate: (acc, gs) => gs.roundUnivariate(acc, alpha),
    fold: async (_round, u) => {
      const m = curLen;
      const half = m >> 1;
      const uBuf = create_and_write_sb(device, packParams([u]));
      const enc = device.createCommandEncoder();
      const newCol: GPUBuffer[] = new Array(NUM_RELATIONS);
      for (const desc of ALL_RELATIONS) {
        const r = desc.relationIndex;
        const numOut = desc.numEdges * half;
        const nb = create_sb(device, numOut * 32);
        const fBg = create_bind_group(device, foldRunner.layout, [
          colBuf[r], nb, create_and_write_ub(device, u32x4(numOut, half)), uBuf,
        ]);
        await execute_pipeline(enc, foldRunner.pipeline, fBg, Math.ceil(numOut / WG));
        newCol[r] = nb;
      }
      const tf = performance.now();
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      gpuMs += performance.now() - tf;
      colBuf = newCol;
      curLen = half;
    },
  });
  const totalMs = performance.now() - t0;

  // Final (length-1) columns for the purported-value anchor — one small readback.
  const finalEnc = device.createCommandEncoder();
  const finalBytes = await read_from_gpu(device, finalEnc, ALL_RELATIONS.map(desc => colBuf[desc.relationIndex]));
  const finalColBytes: Uint8Array[] = new Array(NUM_RELATIONS);
  ALL_RELATIONS.forEach((desc, i) => { finalColBytes[desc.relationIndex] = finalBytes[i]; });

  return { univariates, challenges: used, finalColBytes, gpuMs, totalMs };
}
