// Shared GPU sumcheck engine — fully GPU-resident across rounds, used by both the
// validation suite (suite_rounds.ts) and the benchmark (bench.ts).
//
// The polynomial columns live in GPU buffers for the whole run and never come back
// to the host between rounds. Per round:
//   - one command encoder runs, for all 14 relations: the relation accumulate
//     kernel (which gathers each edge straight from the resident column-major
//     columns + the per-edge scaling — no separate gather pass / edge buffer), then
//     the edge-reduction kernel (sums per-edge outputs into <=64 workgroup
//     partials). All relations write into ONE partials buffer, read back in a
//     SINGLE transfer (~0.7 MB) — the only per-round data trip.
//   - the host finishes the partial sums, forms the round univariate, draws the
//     challenge, and a second encoder folds every column resident->resident (no
//     readback, just a fence).
// One per-edge scratch buffer is reused across relations to bound VRAM
// (WebGPU serializes passes within an encoder, so reuse is safe).

import {
  create_and_write_sb, create_and_write_ub, create_sb,
  create_bind_group_layout, create_bind_group, create_compute_pipeline,
  execute_pipeline, read_from_gpu, create_readback_buffer, Profiler,
} from '../../src/msm_webgpu/cuzk/gpu.js';
import { runSumcheckRounds } from '../../src/msm_webgpu/multiround.js';
import { NUM_RELATIONS, assembleAccumulator } from '../../src/msm_webgpu/accumulator.js';
import { ALL_RELATIONS } from './descriptors.js';
import {
  type PipelineCache, type RelationDescriptor,
  WG, sm, packParams, toMont, fromMont, writeLe32, le32ToBi,
} from './harness.js';

const REDUCE_WG = 128; // >= largest relation out_len (90)
const REDUCE_GROUPS = 64;

export interface FoldRunner { layout: GPUBindGroupLayout; pipeline: GPUComputePipeline }
export interface ReduceRunner { layout: GPUBindGroupLayout; pipeline: GPUComputePipeline }

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
  /** GPU-bound blocking time: the per-round accumulate readback await, summed. The
   * fold is no longer fenced (its execution is absorbed by the next readback). */
  gpuMs: number;
  /** Wall time for the whole multi-round run (rounds only, not setup/upload). */
  totalMs: number;
  /** Wall time for the trailing readback of the resident columns after the last
   * round ran (length-1 for a full run; length 2^(d-maxRounds) for a partial run).
   * For the hybrid bench this is the GPU->WASM handoff cost of the folded columns. */
  finalReadbackMs: number;
  /** Host-side per-phase diagnostics (ms, summed over rounds). */
  scalingMs: number;
  decodeMs: number;
  /** Per-kernel GPU timing for round 0 (only when `profile` is set and the device
   * supports timestamp-query); null otherwise. Labels: acc:/r1:/r2:/fold:<id>. */
  profile: { label: string; ms: number }[] | null;
}

interface Shared {
  cache?: PipelineCache;
  foldRunner?: FoldRunner;
  reduceRunner?: ReduceRunner;
}

/**
 * Run a full d = log2(n) round MegaFlavor sumcheck on the GPU with the columns
 * GPU-resident across rounds. `initColBytes[relationIndex]` are column-major
 * Montgomery bytes of length n (encode with encodeColumnsToBytes); they are
 * uploaded once and never read back until the final length-1 columns (for the
 * caller's purported-value anchor).
 *
 * `maxRounds` (default = d) stops the run after that many rounds and reads back the
 * partially-folded columns (size 2^(d-maxRounds)) instead of the length-1 ones —
 * this is the GPU front of the hybrid GPU/WASM split, where the heavy early rounds
 * run here and the cheaper tail is handed to the WASM prover.
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
  accWG: number = WG,
  profile = false,
  maxRounds?: number,
): Promise<ResidentSumcheckResult> {
  const d = Math.round(Math.log2(n));
  const rounds = Math.max(1, Math.min(maxRounds ?? d, d));
  const relCache: PipelineCache = shared?.cache ?? new Map();
  const foldRunner = shared?.foldRunner ?? (await makeFoldRunner(device));
  const reduceRunner = shared?.reduceRunner ?? (await makeReduceRunner(device));

  // Opt-in per-kernel GPU timing, round 0 only (its acc+reduce+fold passes total
  // 14*3 + 14 = 56 stages, under the 64 default and Metal's sample-buffer limit).
  // No-ops (stage() -> undefined) when the device lacks timestamp-query.
  const profiler = profile ? new Profiler(device, 64) : null;
  const prof = (round: number, label: string) => (round === 0 ? profiler?.stage(label) : undefined);

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
  let maxPerEdge = 0, totalOutLen = 0, maxOutLen = 0;
  for (const desc of ALL_RELATIONS) {
    maxPerEdge = Math.max(maxPerEdge, pairs0 * desc.outLen);
    maxOutLen = Math.max(maxOutLen, desc.outLen);
    totalOutLen += desc.outLen;
  }
  const perEdge = create_sb(device, maxPerEdge * 32);
  // Two-level on-GPU reduction: pass 1 sums edges -> up to REDUCE_GROUPS partials per
  // column (partsScratch, reused per relation); pass 2 sums those -> ONE Fr per column
  // into finalParts (the whole 345-Fr accumulator). Only finalParts (~11 KB) is read
  // back, so the host decodes totalOutLen Fr/round instead of REDUCE_GROUPS*totalOutLen.
  const partsScratch = create_sb(device, REDUCE_GROUPS * maxOutLen * 32);
  const finalParts = create_sb(device, totalOutLen * 32);
  const finalBase: number[] = new Array(NUM_RELATIONS); // each relation's Fr offset in finalParts
  { let b = 0; for (const desc of ALL_RELATIONS) { finalBase[desc.relationIndex] = b; b += desc.outLen; } }
  // Reused per-round readback staging (one round-trip: a bare mapAsync waits for the
  // copy that fills it — no onSubmittedWorkDone fence, no per-round allocation).
  const readbackBytes = totalOutLen * 32;
  const stagingBuf = create_readback_buffer(device, readbackBytes);

  // Cached accumulate pipeline per relation. Bindings: col_buf (resident columns),
  // out_buf (per-edge output), params, scaling, and param_buf for the four
  // parameter-bearing relations — the accumulate kernel gathers edges from the
  // resident columns itself, so there is no separate gather pass / edge buffer.
  const accPipeline = async (desc: RelationDescriptor) => {
    const hasParams = relParamBufs[desc.relationIndex] !== undefined;
    const key = `acc:${desc.entry}|${hasParams ? 5 : 4}|wg${accWG}`;
    let p = relCache.get(key);
    if (!p) {
      const types = ['read-only-storage', 'storage', 'uniform', 'read-only-storage'];
      if (hasParams) types.push('read-only-storage');
      const layout = create_bind_group_layout(device, types);
      // The relation shaders render at the global WG; retarget only the accumulate
      // kernel's workgroup size so the benchmark can sweep occupancy in isolation.
      const code = accWG === WG ? desc.shader() : desc.shader().replace(`@workgroup_size(${WG})`, `@workgroup_size(${accWG})`);
      const pipeline = await create_compute_pipeline(device, [layout], code, desc.entry, desc.entry);
      p = { layout, pipeline };
      relCache.set(key, p);
    }
    return p;
  };

  let curLen = n;
  let gpuMs = 0, scalingMs = 0, decodeMs = 0;
  const t0 = performance.now();
  const { univariates, challenges: used } = await runSumcheckRounds(betas, d, {
    numRounds: rounds,
    challenges,
    accumulate: async (_round, gs) => {
      const m = curLen;
      const pairs = m >> 1;
      const chunk = Math.max(1, Math.ceil(pairs / REDUCE_GROUPS));
      const groups = Math.ceil(pairs / chunk);

      const ts = performance.now();
      const scal = new Uint8Array(pairs * 32);
      for (let p = 0; p < pairs; p++) writeLe32(scal, p * 32, toMont(gs.edgeScaling(p)));
      const scalBuf = create_and_write_sb(device, scal);
      scalingMs += performance.now() - ts;

      const enc = device.createCommandEncoder();
      for (const desc of ALL_RELATIONS) {
        const r = desc.relationIndex;
        // accumulate: gather edges from resident columns + scaling -> per-edge output (perEdge)
        const acc = await accPipeline(desc);
        const aBufs: GPUBuffer[] = [colBuf[r], perEdge, create_and_write_ub(device, u32x4(pairs)), scalBuf];
        if (relParamBufs[r]) aBufs.push(relParamBufs[r]!);
        const aBg = create_bind_group(device, acc.layout, aBufs);
        await execute_pipeline(enc, acc.pipeline, aBg, Math.ceil(pairs / accWG), 1, 1, prof(_round, `acc:${desc.id}`));
        // reduce pass 1: per-edge output -> up to `groups` partials per column (partsScratch, offset 0)
        const r1 = create_bind_group(device, reduceRunner.layout, [
          perEdge, partsScratch, create_and_write_ub(device, u32x4(pairs, desc.outLen, chunk, 0)),
        ]);
        await execute_pipeline(enc, reduceRunner.pipeline, r1, groups, 1, 1, prof(_round, `r1:${desc.id}`));
        // reduce pass 2: those `groups` partials -> ONE Fr per column, into finalParts at finalBase[r]
        const r2 = create_bind_group(device, reduceRunner.layout, [
          partsScratch, finalParts, create_and_write_ub(device, u32x4(groups, desc.outLen, groups, finalBase[r])),
        ]);
        await execute_pipeline(enc, reduceRunner.pipeline, r2, 1, 1, 1, prof(_round, `r2:${desc.id}`));
      }
      const tg = performance.now();
      enc.copyBufferToBuffer(finalParts, 0, stagingBuf, 0, readbackBytes);
      device.queue.submit([enc.finish()]);
      await stagingBuf.mapAsync(GPUMapMode.READ, 0, readbackBytes);
      const pbytes = new Uint8Array(stagingBuf.getMappedRange(0, readbackBytes).slice(0));
      stagingBuf.unmap();
      gpuMs += performance.now() - tg;

      // finalParts already holds the cross-edge sum (one Fr per column), so the host
      // just decodes totalOutLen Fr — no per-group summing.
      const td = performance.now();
      const slices: (bigint[] | null)[] = new Array(NUM_RELATIONS).fill(null);
      for (const desc of ALL_RELATIONS) {
        const r = desc.relationIndex;
        const base = finalBase[r];
        const slice = new Array<bigint>(desc.outLen);
        for (let k = 0; k < desc.outLen; k++) slice[k] = fromMont(le32ToBi(pbytes, (base + k) * 32));
        slices[r] = slice;
      }
      decodeMs += performance.now() - td;
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
        await execute_pipeline(enc, foldRunner.pipeline, fBg, Math.ceil(numOut / WG), 1, 1, prof(_round, `fold:${desc.id}`));
        newCol[r] = nb;
      }
      // Round 0 is the only profiled round; resolve its query set into this encoder
      // before submit so report() can read it afterwards.
      if (_round === 0) profiler?.resolve(enc);
      // No fence here. Fold and the next round's accumulate share device.queue, which
      // serializes fold-before-read and tracks the colBuf write->read hazard, so the
      // next readback's await already covers fold's execution. The per-round fold
      // fence was pure blocking CPU<->GPU sync latency — the profiler showed sync,
      // not compute, dominates the wall (~4 ms/await x 28 awaits/run) — so dropping
      // it removes one of the two blocking syncs per round. The final length-1
      // readback after the loop awaits, covering the last round's fold.
      device.queue.submit([enc.finish()]);
      colBuf = newCol;
      curLen = half;
    },
  });
  const totalMs = performance.now() - t0;
  const profileReport = profiler ? (await profiler.report())?.map(e => ({ label: e.label, ms: e.ms })) ?? null : null;
  profiler?.destroy();

  // Trailing readback of the resident columns: length-1 for a full run (the
  // purported-value anchor), or the folded columns (size 2^(d-rounds)) for a
  // partial run — the GPU->WASM handoff payload in the hybrid bench.
  const tReadback = performance.now();
  const finalEnc = device.createCommandEncoder();
  const finalBytes = await read_from_gpu(device, finalEnc, ALL_RELATIONS.map(desc => colBuf[desc.relationIndex]));
  const finalReadbackMs = performance.now() - tReadback;
  const finalColBytes: Uint8Array[] = new Array(NUM_RELATIONS);
  ALL_RELATIONS.forEach((desc, i) => { finalColBytes[desc.relationIndex] = finalBytes[i]; });

  return { univariates, challenges: used, finalColBytes, gpuMs, totalMs, finalReadbackMs, scalingMs, decodeMs, profile: profileReport };
}
