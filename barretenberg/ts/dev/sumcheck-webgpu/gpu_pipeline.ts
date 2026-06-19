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
  execute_pipeline, create_readback_buffer, Profiler, setAllocCategory,
} from '../../src/msm_webgpu/cuzk/gpu.js';
import { runSumcheckRounds } from '../../src/msm_webgpu/multiround.js';
import { NUM_RELATIONS, assembleAccumulator } from '../../src/msm_webgpu/accumulator.js';
import { ALL_RELATIONS, NUM_GLOBAL_ENTITIES } from './descriptors.js';
import {
  type PipelineCache, type RelationDescriptor,
  WG, sm, mod, packParams, toMont, fromMont, writeLe32, le32ToBi,
} from './harness.js';
import type { CompactionPlan } from './sparsity.js';
import { injectSkipPrelude, injectCompaction, effPairsForRound } from './skip_inject.js';
export { injectSkipPrelude, injectCompaction, effPairsForRound } from './skip_inject.js';

const REDUCE_WG = 128; // >= largest relation out_len (90)
const REDUCE_GROUPS = 64;

export interface FoldRunner { layout: GPUBindGroupLayout; pipeline: GPUComputePipeline }
export interface ReduceRunner { layout: GPUBindGroupLayout; pipeline: GPUComputePipeline }
export interface KernelRunner { layout: GPUBindGroupLayout; pipeline: GPUComputePipeline }

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
/** Gate-separator beta_products scan: beta_buf (read_write), scalars, params. */
export async function makeScanRunner(device: GPUDevice): Promise<KernelRunner> {
  const layout = create_bind_group_layout(device, ['storage', 'read-only-storage', 'uniform']);
  const code = sm.gen_gate_separator_scan_test_shader(WG);
  const pipeline = await create_compute_pipeline(device, [layout], code, 'gate_separator_scan_main', 'gate_separator_scan_main');
  return { layout, pipeline };
}
/** Gate-separator per-round edge-scaling gather: beta_buf, out_buf (read_write), params. */
export async function makeGatherRunner(device: GPUDevice): Promise<KernelRunner> {
  const layout = create_bind_group_layout(device, ['read-only-storage', 'storage', 'uniform']);
  const code = sm.gen_gate_separator_gather_test_shader(WG);
  const pipeline = await create_compute_pipeline(device, [layout], code, 'gate_separator_gather_main', 'gate_separator_gather_main');
  return { layout, pipeline };
}

/** Pack a relation's globalEntityIndices as a u32 storage buffer (the entity_map binding
 * for the shared-column accumulate variant). */
export function entityMapBytes(indices: number[]): Uint8Array {
  const out = new Uint8Array(indices.length * 4);
  const dv = new DataView(out.buffer);
  indices.forEach((g, i) => dv.setUint32(i * 4, g, true));
  return out;
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
  /** One-time host precompute before the rounds loop: column/param uploads and the
   * GPU beta_products scan (encode + submit). Symmetric with the single-submission
   * engine's setupMs, so the two e2e timelines line up phase-for-phase. */
  setupMs: number;
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
  // Idea 1: read all 14 relations from ONE resident set of NUM_GLOBAL_ENTITIES (67)
  // columns (each relation gathers its entities via globalEntityIndices through an
  // entity_map binding) instead of 185 per-relation copies. `sharedColBytes` are the
  // 67 column-major Montgomery columns (length n). Off by default.
  sharedColumns?: boolean;
  sharedColBytes?: Uint8Array;
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
  skip = false,
  usedLen?: number,
  usedLensByRel?: number[],
  compaction?: CompactionPlan,
): Promise<ResidentSumcheckResult> {
  const d = Math.round(Math.log2(n));
  const rounds = Math.max(1, Math.min(maxRounds ?? d, d));
  // Skip path (Tier 0/1/2) — all inert when `skip` is false (dense; shaders + dispatch
  // byte/size-identical to before this option). Effective used length for Tier-0 trim
  // (default = n => no trim); the column stride stays full `n`. `usedLensByRel` (block
  // sparsity) overrides this per relation in the accumulate loop.
  const effUsedLen = skip ? Math.max(2, Math.min(n, usedLen ?? n)) : n;
  // Tier 1 (per-edge skip prelude) is the global-dispatch (scattered) path only: there
  // the dispatched grid still straddles inactive edges. Block (`usedLensByRel`) dispatches
  // exactly the active prefix and compaction gathers exactly the active pairs — both make
  // the prelude never fire, so it is dropped (plain kernel, cache shared with dense runs).
  const inject = skip && !usedLensByRel && !compaction;
  const relCache: PipelineCache = shared?.cache ?? new Map();
  const foldRunner = shared?.foldRunner ?? (await makeFoldRunner(device));
  const reduceRunner = shared?.reduceRunner ?? (await makeReduceRunner(device));

  // Opt-in per-kernel GPU timing, round 0 only (its gather + acc+reduce+fold passes
  // total 1 + 14*3 + 14 = 57 stages, under the 64 default and Metal's sample-buffer
  // limit). No-ops (stage() -> undefined) when the device lacks timestamp-query.
  const profiler = profile ? new Profiler(device, 64) : null;
  const prof = (round: number, label: string) => (round === 0 ? profiler?.stage(label) : undefined);

  const tSetup = performance.now();

  // Upload relation parameters once; columns become resident GPU buffers. Columns
  // ping-pong between two reused sets (colBuf full length n, colAlt half length n/2)
  // exactly like the single-submission engine: fold(round) writes colBuf -> colAlt,
  // the two swap, and the next fold writes back into the first half of the larger
  // buffer. This bounds the resident column footprint to 1.5x the witness instead of
  // the ~2x of allocating a fresh fold output every round (which were never freed).
  // In shared mode the 185 per-relation columns collapse to ONE set of
  // NUM_GLOBAL_ENTITIES (67) columns that every relation reads through its entity_map;
  // otherwise each relation keeps its own colBuf/colAlt ping-pong.
  const useShared = !!(shared?.sharedColumns && shared.sharedColBytes);
  // Compaction rewrites the per-relation kernel's read indexing and binds sk_active_idx
  // where the shared variant binds entity_map (the "two-index" landmine). The bench never
  // sets both — sparsity builds per-relation columns — but assert it so a future caller can't.
  if (compaction && useShared) throw new Error('compaction (Tier 2) is incompatible with shared 67-column mode');
  const relParamBufs: (GPUBuffer | undefined)[] = new Array(NUM_RELATIONS).fill(undefined);
  let colBuf: GPUBuffer[] = new Array(NUM_RELATIONS);
  let colAlt: GPUBuffer[] = new Array(NUM_RELATIONS);
  const entityMapBufs: GPUBuffer[] = new Array(NUM_RELATIONS);
  let curS: GPUBuffer | undefined;
  let otherS: GPUBuffer | undefined;
  for (const desc of ALL_RELATIONS) {
    const r = desc.relationIndex;
    const rp = relParamBytes[r];
    if (rp) { setAllocCategory('relparams'); relParamBufs[r] = create_and_write_sb(device, rp); }
  }
  if (useShared) {
    setAllocCategory('columns');
    curS = create_and_write_sb(device, shared!.sharedColBytes!); // 67 columns, length n
    otherS = create_sb(device, NUM_GLOBAL_ENTITIES * (n >> 1) * 32); // ping-pong half
    setAllocCategory('relparams');
    for (const desc of ALL_RELATIONS) entityMapBufs[desc.relationIndex] = create_and_write_sb(device, entityMapBytes(desc.globalEntityIndices));
  } else {
    for (const desc of ALL_RELATIONS) {
      const r = desc.relationIndex;
      setAllocCategory('columns');
      colBuf[r] = create_and_write_sb(device, initColBytes[r]);
      colAlt[r] = create_sb(device, desc.numEdges * (n >> 1) * 32);
    }
  }

  // Per-relation active-pair index lists (Tier 2 compaction): uploaded once, sliced per
  // round by (base, count). Only the relations the plan covers (density < threshold) get a
  // buffer; the rest fall back to the Tier-0 prefix dispatch. Compaction implies !useShared.
  const activeIdxBuf: (GPUBuffer | undefined)[] = new Array(NUM_RELATIONS).fill(undefined);
  if (compaction) {
    setAllocCategory('scratch');
    for (const desc of ALL_RELATIONS) {
      const idx = compaction.idxByRel[desc.relationIndex];
      if (idx && idx.length > 0) {
        activeIdxBuf[desc.relationIndex] = create_and_write_sb(device, new Uint8Array(idx.buffer, idx.byteOffset, idx.byteLength));
      }
    }
  }

  // Scratch buffers sized for round 0, reused for every relation and round.
  setAllocCategory('scratch');
  const pairs0 = n >> 1;
  let maxPerEdge = 0, totalOutLen = 0, maxOutLen = 0;
  for (const desc of ALL_RELATIONS) {
    maxPerEdge = Math.max(maxPerEdge, pairs0 * desc.outLen);
    maxOutLen = Math.max(maxOutLen, desc.outLen);
    totalOutLen += desc.outLen;
  }
  const perEdge = create_sb(device, maxPerEdge * 32);
  // Per-round gate-separator edge scaling, gathered on the GPU into this reused
  // scratch (sized for round 0) — the relation accumulate kernels read it unchanged.
  const scalScratch = create_sb(device, pairs0 * 32);
  // Two-level on-GPU reduction: pass 1 sums edges -> up to REDUCE_GROUPS partials per
  // column (partsScratch, reused per relation); pass 2 sums those -> ONE Fr per column
  // into finalParts (the whole 345-Fr accumulator). Only finalParts (~11 KB) is read
  // back, so the host decodes totalOutLen Fr/round instead of REDUCE_GROUPS*totalOutLen.
  const partsScratch = create_sb(device, REDUCE_GROUPS * maxOutLen * 32);
  setAllocCategory('accum');
  const finalParts = create_sb(device, totalOutLen * 32);
  const finalBase: number[] = new Array(NUM_RELATIONS); // each relation's Fr offset in finalParts
  { let b = 0; for (const desc of ALL_RELATIONS) { finalBase[desc.relationIndex] = b; b += desc.outLen; } }
  // Reused per-round readback staging (one round-trip: a bare mapAsync waits for the
  // copy that fills it — no onSubmittedWorkDone fence, no per-round allocation).
  const readbackBytes = totalOutLen * 32;
  const stagingBuf = create_readback_buffer(device, readbackBytes);

  // Resident Montgomery beta_products table, built once on the GPU. A doubling
  // subset-product scan (gate_separator_scan) fills beta_products[2^k + r] =
  // beta_products[r] * betas[k] in d ordered passes, replacing the host's
  // O(n log n) computeBetaProducts + the per-round toMont loop. Each round then
  // gathers its strided slice (beta_products[p * 2^{round+1}]) off this buffer.
  // Empty betas degenerate to beta_products = [0] (no passes; zero-initialized).
  const scanRunner = relCache.get('gs:scan') ?? await makeScanRunner(device);
  relCache.set('gs:scan', scanRunner);
  const gatherRunner = relCache.get('gs:gather') ?? await makeGatherRunner(device);
  relCache.set('gs:gather', gatherRunner);
  setAllocCategory('beta');
  const betaMontBuf = create_sb(device, n * 32); // zero-init == Montgomery 0 everywhere
  if (betas.length > 0) {
    const seed = new Uint8Array(32);
    writeLe32(seed, 0, toMont(1n)); // beta_products[0] = Montgomery 1
    device.queue.writeBuffer(betaMontBuf, 0, seed);
    const scalarBuf = create_and_write_sb(device, packParams(betas.slice(0, d).map(mod)));
    const scanEnc = device.createCommandEncoder();
    for (let k = 0; k < d; k++) {
      const count = 1 << k; // lower-half length / write offset / thread bound for pass k
      const sBg = create_bind_group(device, scanRunner.layout, [
        betaMontBuf, scalarBuf, create_and_write_ub(device, u32x4(count, k)),
      ]);
      await execute_pipeline(scanEnc, scanRunner.pipeline, sBg, Math.ceil(count / WG), 1, 1);
    }
    device.queue.submit([scanEnc.finish()]);
  }

  // Cached accumulate pipeline per relation. Bindings: col_buf (resident columns),
  // out_buf (per-edge output), params, scaling, and param_buf for the four
  // parameter-bearing relations — the accumulate kernel gathers edges from the
  // resident columns itself, so there is no separate gather pass / edge buffer.
  const accPipeline = async (desc: RelationDescriptor, compact: boolean) => {
    const hasParams = relParamBufs[desc.relationIndex] !== undefined;
    const mode = compact ? 'comp' : inject ? 'sk' : 'pl';
    const key = `acc:${desc.entry}|${hasParams ? 5 : 4}|wg${accWG}|s${useShared ? 1 : 0}|${mode}`;
    let p = relCache.get(key);
    if (!p) {
      const types = ['read-only-storage', 'storage', 'uniform', 'read-only-storage'];
      if (hasParams) types.push('read-only-storage');
      if (useShared) types.push('read-only-storage'); // entity_map (bound last)
      if (compact) types.push('read-only-storage'); // sk_active_idx (binding 4 or 5; !useShared)
      const layout = create_bind_group_layout(device, types);
      // The relation shaders render at the global WG; retarget only the accumulate
      // kernel's workgroup size so the benchmark can sweep occupancy in isolation.
      const base = desc.shader(useShared);
      let code = accWG === WG ? base : base.replace(`@workgroup_size(${WG})`, `@workgroup_size(${accWG})`);
      if (compact) code = injectCompaction(code, desc, hasParams); // Tier 2 active-edge gather
      else if (inject) code = injectSkipPrelude(code, desc); // Tier 1 per-edge skip early-out
      const pipeline = await create_compute_pipeline(device, [layout], code, desc.entry, desc.entry);
      p = { layout, pipeline };
      relCache.set(key, p);
    }
    return p;
  };

  let curLen = n;
  let gpuMs = 0, scalingMs = 0, decodeMs = 0;
  const setupMs = performance.now() - tSetup;
  const t0 = performance.now();
  const { univariates, challenges: used } = await runSumcheckRounds(betas, d, {
    numRounds: rounds,
    challenges,
    accumulate: async (_round, gs) => {
      const m = curLen;
      const pairs = m >> 1;
      // Tier 0 (global, sized by the densest relation): sizes only the shared scaling
      // gather. == pairs when skip is off. Per-relation dispatch is sized below.
      const effPairs = effPairsForRound(effUsedLen, _round, m);

      const enc = device.createCommandEncoder();
      // Gather this round's per-pair edge scaling off the resident beta_products
      // table: scalScratch[p] = beta_products[p * periodicity], periodicity =
      // gs.periodicity = 2^{round+1}. No host bigint — the only per-round scaling
      // work is encoding this one GPU copy, so scalingMs collapses toward 0.
      const ts = performance.now();
      const gBg = create_bind_group(device, gatherRunner.layout, [
        betaMontBuf, scalScratch, create_and_write_ub(device, u32x4(effPairs, gs.periodicity)),
      ]);
      await execute_pipeline(enc, gatherRunner.pipeline, gBg, Math.ceil(effPairs / WG), 1, 1, prof(_round, 'gather'));
      scalingMs += performance.now() - ts;

      // params.n = pairs (full column stride) is shared by every non-compacted relation.
      const accParam = create_and_write_ub(device, u32x4(pairs));
      // With a compaction plan, a relation with zero active pairs this round is skipped
      // entirely (no dispatch), so pre-clear finalParts to keep its slice zero rather
      // than carrying the prior round's value.
      if (compaction) enc.clearBuffer(finalParts);

      for (const desc of ALL_RELATIONS) {
        const r = desc.relationIndex;
        const compIdx = activeIdxBuf[r];
        const compact = compIdx !== undefined;
        // Edge-pairs this relation contributes this round: the gathered active count
        // (Tier 2 compaction, scattered) or its own active prefix length (Tier 0/1).
        // params.n stays = pairs (full column stride) in both cases.
        let dispatchPairs: number;
        const aBufs: GPUBuffer[] = [useShared ? curS! : colBuf[r], perEdge];
        if (compact) {
          const { base, count } = compaction!.roundsByRel[r]![_round];
          if (count === 0) continue; // no active pairs -> 0 contribution (finalParts pre-cleared)
          dispatchPairs = count;
          aBufs.push(create_and_write_ub(device, u32x4(pairs, count, base)), scalScratch);
          if (relParamBufs[r]) aBufs.push(relParamBufs[r]!);
          aBufs.push(compIdx); // sk_active_idx (gathered pair indices)
        } else {
          dispatchPairs = effPairsForRound(usedLensByRel ? Math.max(2, Math.min(n, usedLensByRel[r])) : effUsedLen, _round, m);
          aBufs.push(accParam, scalScratch);
          if (relParamBufs[r]) aBufs.push(relParamBufs[r]!);
          if (useShared) aBufs.push(entityMapBufs[r]);
        }
        const chunk = Math.max(1, Math.ceil(dispatchPairs / REDUCE_GROUPS));
        const groups = Math.ceil(dispatchPairs / chunk);
        // accumulate: gather edges from resident columns + scaling -> per-edge output (perEdge)
        const acc = await accPipeline(desc, compact);
        const aBg = create_bind_group(device, acc.layout, aBufs);
        await execute_pipeline(enc, acc.pipeline, aBg, Math.ceil(dispatchPairs / accWG), 1, 1, prof(_round, `acc:${desc.id}`));
        // reduce pass 1: per-edge output -> up to `groups` partials per column (partsScratch, offset 0)
        const r1 = create_bind_group(device, reduceRunner.layout, [
          perEdge, partsScratch, create_and_write_ub(device, u32x4(dispatchPairs, desc.outLen, chunk, 0)),
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
      setAllocCategory('transcript');
      const uBuf = create_and_write_sb(device, packParams([u]));
      const enc = device.createCommandEncoder();
      // Fold cur -> other (both resident, reused across rounds); the two swap below so
      // the next round folds back into the larger buffer's first half.
      if (useShared) {
        // Fold all 67 columns, chunked by columns so no dispatch exceeds
        // maxComputeWorkgroupsPerDimension (one 67*half dispatch overflows it at
        // n>=2^17). Each chunk binds a column-range sub-slice (whole-column offsets are
        // storage-offset-aligned) and folds independently.
        const maxCols = Math.max(1, Math.floor((device.limits.maxComputeWorkgroupsPerDimension * WG) / Math.max(1, half)));
        const inStride = m * 32;     // input column stride (length m = 2*half)
        const outStride = half * 32; // output column stride (length half)
        for (let c0 = 0; c0 < NUM_GLOBAL_ENTITIES; c0 += maxCols) {
          const cc = Math.min(maxCols, NUM_GLOBAL_ENTITIES - c0);
          const numOut = cc * half;
          const fBg = device.createBindGroup({
            layout: foldRunner.layout,
            entries: [
              { binding: 0, resource: { buffer: curS!, offset: c0 * inStride, size: cc * inStride } },
              { binding: 1, resource: { buffer: otherS!, offset: c0 * outStride, size: cc * outStride } },
              { binding: 2, resource: { buffer: create_and_write_ub(device, u32x4(numOut, half)) } },
              { binding: 3, resource: { buffer: uBuf } },
            ],
          });
          await execute_pipeline(enc, foldRunner.pipeline, fBg, Math.ceil(numOut / WG), 1, 1, prof(_round, 'fold:shared'));
        }
      } else {
        for (const desc of ALL_RELATIONS) {
          const r = desc.relationIndex;
          const numOut = desc.numEdges * half;
          const fBg = create_bind_group(device, foldRunner.layout, [
            colBuf[r], colAlt[r], create_and_write_ub(device, u32x4(numOut, half)), uBuf,
          ]);
          await execute_pipeline(enc, foldRunner.pipeline, fBg, Math.ceil(numOut / WG), 1, 1, prof(_round, `fold:${desc.id}`));
        }
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
      if (useShared) { [curS, otherS] = [otherS, curS]; }
      else { [colBuf, colAlt] = [colAlt, colBuf]; }
      curLen = half;
    },
  });
  const totalMs = performance.now() - t0;
  const profileReport = profiler ? (await profiler.report())?.map(e => ({ label: e.label, ms: e.ms })) ?? null : null;
  profiler?.destroy();

  // Trailing readback of the resident columns: length-1 for a full run (the
  // purported-value anchor), or the folded columns (size 2^(d-rounds)) for a
  // partial run — the GPU->WASM handoff payload in the hybrid bench. Only the first
  // numEdges*curLen elements of each ping-pong buffer are meaningful (the fold packs
  // column c at c*curLen), so copy exactly that — reading the whole reused buffer
  // would stage the full-length (n or n/2) buffer back, not the folded columns.
  const tReadback = performance.now();
  const finalColBytes: Uint8Array[] = new Array(NUM_RELATIONS);
  if (useShared) {
    // Read the folded 67-column shared buffer once, then gather each relation's slice
    // (its globalEntityIndices) into the per-relation layout the caller expects.
    const colBytes = curLen * 32;
    const totalShared = NUM_GLOBAL_ENTITIES * colBytes;
    if (totalShared > 0) {
      const fStaging = create_readback_buffer(device, totalShared);
      const finalEnc = device.createCommandEncoder();
      finalEnc.copyBufferToBuffer(curS!, 0, fStaging, 0, totalShared);
      device.queue.submit([finalEnc.finish()]);
      await fStaging.mapAsync(GPUMapMode.READ, 0, totalShared);
      const all = new Uint8Array(fStaging.getMappedRange(0, totalShared).slice(0));
      fStaging.unmap();
      for (const desc of ALL_RELATIONS) {
        const buf = new Uint8Array(desc.numEdges * colBytes);
        desc.globalEntityIndices.forEach((g, j) => buf.set(all.subarray(g * colBytes, (g + 1) * colBytes), j * colBytes));
        finalColBytes[desc.relationIndex] = buf;
      }
    }
  } else {
    const sizes = ALL_RELATIONS.map(desc => desc.numEdges * curLen * 32);
    const offs: number[] = [];
    { let o = 0; for (const s of sizes) { offs.push(o); o += s; } }
    const totalFinal = offs.length ? offs[offs.length - 1] + sizes[sizes.length - 1] : 0;
    if (totalFinal > 0) {
      const fStaging = create_readback_buffer(device, totalFinal);
      const finalEnc = device.createCommandEncoder();
      ALL_RELATIONS.forEach((desc, idx) => finalEnc.copyBufferToBuffer(colBuf[desc.relationIndex], 0, fStaging, offs[idx], sizes[idx]));
      device.queue.submit([finalEnc.finish()]);
      await fStaging.mapAsync(GPUMapMode.READ, 0, totalFinal);
      const all = new Uint8Array(fStaging.getMappedRange(0, totalFinal).slice(0));
      fStaging.unmap();
      ALL_RELATIONS.forEach((desc, idx) => { finalColBytes[desc.relationIndex] = all.slice(offs[idx], offs[idx] + sizes[idx]); });
    }
  }
  const finalReadbackMs = performance.now() - tReadback;

  return { univariates, challenges: used, finalColBytes, gpuMs, totalMs, finalReadbackMs, setupMs, scalingMs, decodeMs, profile: profileReport };
}
