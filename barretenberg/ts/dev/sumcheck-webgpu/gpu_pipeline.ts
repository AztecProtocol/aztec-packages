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
import {
  scaleUnivariates, extendAndBatch, resetExtendStats, disableExtendStats, extendStats,
} from '../../src/msm_webgpu/batch_tail.js';
import { NUM_RELATIONS, assembleAccumulator } from '../../src/msm_webgpu/accumulator.js';
import type { GateUberGate } from '../../src/msm_webgpu/cuzk/shader_manager.js';
import { ALL_RELATIONS, NUM_GLOBAL_ENTITIES } from './descriptors.js';
import {
  type PipelineCache, type RelationDescriptor,
  WG, sm, mod, packParams, toMont, fromMont, writeLe32, le32ToBi,
} from './harness.js';
import type { CompactionPlan, BandPlan } from './sparsity.js';

const REDUCE_WG = 128; // >= largest relation out_len (90)
const REDUCE_GROUPS = 64;

/** How the gate relations are dispatched in band mode (realistic-band profile only).
 *  'perRelation' = one band-trimmed dispatch per relation (the default; what every
 *  other profile uses). 'uber' = fuse the register-light gate relations into ONE
 *  occupancy-filling dispatch (gen_gate_uber_shader), leaving permutation and the
 *  register-heavy gates on the per-relation path. Bit-identical to 'perRelation'. */
export type GateMode = 'perRelation' | 'uber';

/** Relation indices fused by the 'uber' gate mode, grouped into INDEPENDENT fused
 *  dispatches (one pipeline each, so register pressure is isolated per group — Metal
 *  allocates the register file at a pipeline's worst switch arm). Group 0 is the
 *  register-light gates; group 1 is the register-heavy trio (databus 8 / poseidon2
 *  quad 11 / quad-terminal 12), which are still small occupancy-bound band dispatches
 *  worth fusing but kept off the light pipeline. Excluded entirely: permutation (1,
 *  dense — already full-occupancy) and arithmetic (0, its 40% band already fills the
 *  GPU). Order within a group is its slot order in that uber kernel. */
const UBER_GROUPS: number[][] = [
  [2, 3, 4, 5, 6, 7, 9, 10, 13], // register-light gates
  [8, 11, 12],                   // register-heavy trio (isolated pipeline)
];
// Min storage-binding offset alignment (WebGPU default): a perEdge sub-region bound to
// the reduce must start on a 256-byte (= 8 Fr) boundary, so each gate's perEdge band is
// padded up to a multiple of 8 Fr.
const FR_ALIGN = 8;

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

const ZERO8_WGSL = 'array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u)';

/**
 * Inject a relation's skip predicate (Tier 1) into its generated accumulate WGSL: a
 * per-edge early-out that mirrors C++ `Relation::skip()`. Each thread tests its own
 * edge-pair's selector via the existing `ld(row, j)` accessor (an entity column c's two
 * edge evals are `ld(row, 2c)` and `ld(row, 2c+1)`); Montgomery 0 is all-zero bytes, so
 * the test is `is_zero_f8` (no fromMont). On a skipped edge the prelude writes OUT_LEN
 * zeros and returns — the zero-write is REQUIRED because the reduce sums over every
 * edge slot and the per-edge scratch is reused across relations, so a skipped slot must
 * not carry stale data. For block-contiguous sparsity an entire workgroup of inactive
 * edges takes this cheap branch uniformly (no divergence); scattered sparsity diverges,
 * which is why it is the worst case. Inserted after the `row >= params.n` guard so
 * out-of-range threads are unaffected; the column stride (`ld`) is unchanged.
 */
export function injectSkipPrelude(code: string, desc: RelationDescriptor): string {
  const guard = 'if (row >= params.n) { return; }';
  if (!code.includes(guard)) throw new Error(`injectSkipPrelude: guard not found in ${desc.entry}`);
  // WGSL reserves the `__` identifier prefix, so injected names use `sk_`.
  const sk = desc.skip;
  let pred: string;
  let out = code;
  if (sk.kind === 'allZero') {
    pred = sk.cols.map(c => `is_zero_f8(ld(row, ${2 * c}u)) && is_zero_f8(ld(row, ${2 * c + 1}u))`).join(' && ');
  } else {
    const [a, b] = sk.cols;
    pred = `sk_eq8(ld(row, ${2 * a}u), ld(row, ${2 * b}u)) && sk_eq8(ld(row, ${2 * a + 1}u), ld(row, ${2 * b + 1}u))`;
    // eqPair needs a byte-equality helper; declare it before the (single) compute entry.
    const helper =
      'fn sk_eq8(a: array<u32, 8>, b: array<u32, 8>) -> bool {\n' +
      '  return a[0] == b[0] && a[1] == b[1] && a[2] == b[2] && a[3] == b[3] && a[4] == b[4] && a[5] == b[5] && a[6] == b[6] && a[7] == b[7];\n' +
      '}\n';
    out = out.replace('@compute', helper + '@compute');
  }
  const prelude =
    `\n  if (${pred}) {\n` +
    `    let sk_zero8 = ${ZERO8_WGSL};\n` +
    '    for (var sk_k: u32 = 0u; sk_k < OUT_LEN; sk_k = sk_k + 1u) { write_eval(row, sk_k, sk_zero8); }\n' +
    '    return;\n' +
    '  }';
  return out.replace(guard, guard + prelude);
}

/**
 * Inject active-edge compaction (Phase 2) into a relation's generated accumulate WGSL:
 * each thread handles one ACTIVE edge-pair, gathered from a precomputed dense index list,
 * instead of one grid position + a per-edge skip test. Reads stay indexed by the gathered
 * pair `row`, so the columns AND the gate-separator scaling — both read via `ld(row, ·)` —
 * are gathered for free; only the OUTPUT is redirected to the compacted slot `sk_t`, so the
 * reduce sums a dense `[0, count)` range. This removes the SIMD divergence that neuters
 * per-edge skip on scattered instances (no inactive lane is ever dispatched). The thread
 * bound becomes `params.sk_active` (the round's active count); `params.n` (= pairs, the
 * full column stride that `ld` uses) is unchanged. Mutually exclusive with injectSkipPrelude.
 */
export function injectCompaction(code: string, desc: RelationDescriptor, hasParams: boolean): string {
  const ldSig = 'fn ld(row: u32, j: u32) -> array<u32, 8> {';
  const guard = 'if (row >= params.n) { return; }';
  if (!code.includes(ldSig) || !code.includes(guard)) throw new Error(`injectCompaction: anchors not found in ${desc.entry}`);
  const idxBinding = hasParams ? 5 : 4; // sk_active_idx after param_buf(4) or scaling(3) — must match the engine's bind-group layout
  let out = code;
  out = out.replace('@compute', `@group(0) @binding(${idxBinding}) var<storage, read> sk_active_idx: array<u32>;\n@compute`);
  // Round's active count + base offset into the index list.
  out = out.replace('struct Params {\n  n: u32,\n}', 'struct Params {\n  n: u32,\n  sk_active: u32,\n  sk_base: u32,\n}');
  // Thread bound is the compacted active count; `row` (= gid.x) stays the COMPACTED slot, so
  // writes (write_eval(row, ·), incl. those inside per-relation output helpers) land in a
  // dense [0, sk_active) range that the reduce sums unchanged.
  out = out.replace(guard, 'if (row >= params.sk_active) { return; }');
  // Only the READ path is gathered: `ld` maps the compacted `row` to its active edge-pair `g`,
  // so both the column reads (2u*g) and the gate-separator scaling (g*8u, the else branch) pull
  // the active pair. `params.n` (= pairs, the column stride in col_len) is unchanged.
  out = out.replace(ldSig, ldSig + '\n  let g = sk_active_idx[params.sk_base + row];');
  out = out.replace('2u * row + (j & 1u)', '2u * g + (j & 1u)');
  out = out.replace('let base = row * 8u;', 'let base = g * 8u;');
  return out;
}

/**
 * Inject a contiguous-band range dispatch (the realistic trace layout: each relation occupies
 * one block at an OFFSET). Identical to injectCompaction except the gathered pair is computed
 * by ARITHMETIC — `g = sk_start + row` — instead of an index buffer: a real block is contiguous,
 * so consecutive threads read consecutive rows (coalesced) and no index list is needed. The
 * thread bound is `params.sk_count`; `row` (= gid.x) stays the compacted write slot, so the reduce
 * reads a dense [0, count). `params.n` (= pairs, column stride) is unchanged. Adds NO binding, so
 * the bind-group layout is the plain one. Subsumes Phase 1's prefix dispatch (offset 0).
 */
export function injectBand(code: string, desc: RelationDescriptor): string {
  const ldSig = 'fn ld(row: u32, j: u32) -> array<u32, 8> {';
  const guard = 'if (row >= params.n) { return; }';
  if (!code.includes(ldSig) || !code.includes(guard)) throw new Error(`injectBand: anchors not found in ${desc.entry}`);
  let out = code;
  out = out.replace('struct Params {\n  n: u32,\n}', 'struct Params {\n  n: u32,\n  sk_count: u32,\n  sk_start: u32,\n}');
  out = out.replace(guard, 'if (row >= params.sk_count) { return; }');
  out = out.replace(ldSig, ldSig + '\n  let g = params.sk_start + row;');
  out = out.replace('2u * row + (j & 1u)', '2u * g + (j & 1u)');
  out = out.replace('let base = row * 8u;', 'let base = g * 8u;');
  return out;
}

/**
 * Active edge-pairs to accumulate this round under effective-size trimming (Tier 0,
 * mirrors `compute_effective_round_size`). After `round` folds, only the first
 * ceil(usedLen / 2^round) rows can be nonzero; the rest are the folded zero tail and
 * contribute exactly zero, so the accumulate/reduce/gather are trimmed to them. The
 * column stride (params.n = full `pairs`) is unchanged — this is purely a smaller
 * dispatch. Dense (usedLen == n) yields effPairs == pairs (no trim).
 */
export function effPairsForRound(usedLen: number, round: number, curLen: number): number {
  const usedThisRound = Math.ceil(usedLen / 2 ** round);
  const effLen = Math.min(curLen, usedThisRound + (usedThisRound & 1));
  return Math.max(1, effLen >> 1);
}

/** Per-fused-gate metadata the engine needs to lay out fused_col / uber_param /
 *  perEdge and to drive the per-gate reduce (a superset of GateUberGate). */
export interface FusedGateMeta {
  relIdx: number;
  desc: RelationDescriptor;
  slot: number;
  numEdgesPrefix: number; // entity-column offset of this gate inside fused_col
  numEdges: number;
  outLen: number;
  hasParam: boolean;
}

/**
 * Lay out the fused-gate set for the 'uber' gate mode: the concatenated column buffer
 * order (`numEdgesPrefix`), the concatenated relation_parameters buffer (`uberParamBytes`
 * + per-gate `paramBase`), and the slot order. Returns the GateUberGate specs (for
 * gen_gate_uber_shader) alongside the engine-side metadata.
 */
function buildUberLayout(
  fusedRelIdx: number[],
  relParamBytes: (Uint8Array | undefined)[],
): { gates: GateUberGate[]; meta: FusedGateMeta[]; uberParamBytes: Uint8Array } {
  const byIdx = new Map(ALL_RELATIONS.map(d => [d.relationIndex, d] as const));
  const gates: GateUberGate[] = [];
  const meta: FusedGateMeta[] = [];
  const paramChunks: Uint8Array[] = [];
  let numEdgesPrefix = 0, paramBase = 0;
  fusedRelIdx.forEach((relIdx, slot) => {
    const desc = byIdx.get(relIdx);
    if (!desc) throw new Error(`buildUberLayout: no descriptor for relation ${relIdx}`);
    const rp = relParamBytes[relIdx];
    const hasParam = rp !== undefined && rp.length > 0;
    gates.push({ id: desc.id, entry: desc.entry, hasParam, numEdgesPrefix, paramBase: hasParam ? paramBase : 0, standalone: desc.shader() });
    meta.push({ relIdx, desc, slot, numEdgesPrefix, numEdges: desc.numEdges, outLen: desc.outLen, hasParam });
    if (hasParam) { paramChunks.push(rp!); paramBase += rp!.length / 32; }
    numEdgesPrefix += desc.numEdges;
  });
  const totalParamFr = paramChunks.reduce((a, c) => a + c.length / 32, 0);
  const uberParamBytes = new Uint8Array(Math.max(1, totalParamFr) * 32); // >=1 Fr so the binding is non-empty
  let off = 0;
  for (const c of paramChunks) { uberParamBytes.set(c, off); off += c.length; }
  return { gates, meta, uberParamBytes };
}

/** A compiled fused-gate uber group: pipeline + constant param buffer (+ a concat scratch
 *  when `direct` is false). The per-round BandTable buffers are created fresh each round in
 *  dispatchUberGroups. Shared by both engines via buildUberGroups. */
export interface UberGroup {
  meta: FusedGateMeta[];
  runner: KernelRunner;
  direct: boolean;          // bind resident col_bufs directly (no per-round copy)
  fusedColBuf?: GPUBuffer;  // concat scratch (only when !direct)
  uberParamBuf: GPUBuffer;  // concatenated relation_parameters (constant across rounds)
}

/**
 * Build the fused-gate uber groups (UBER_GROUPS) for either engine: one occupancy-filling
 * pipeline per group. Each group binds its gates' resident column buffers DIRECTLY (zero
 * copy) when the device exposes enough storage bindings (N+6 per group); otherwise it falls
 * back to a per-round concat copy into fusedColBuf. Pipelines are cached in `relCache`.
 * Returns [] when not fusing.
 */
export async function buildUberGroups(
  device: GPUDevice,
  relCache: PipelineCache,
  relParamBytes: (Uint8Array | undefined)[],
  n: number,
): Promise<UberGroup[]> {
  const groups: UberGroup[] = [];
  const maxStorage = device.limits.maxStorageBuffersPerShaderStage ?? 8;
  for (const relIdxList of UBER_GROUPS) {
    const layout0 = buildUberLayout(relIdxList, relParamBytes);
    const N = layout0.meta.length;
    const direct = N + 6 <= maxStorage; // N gcol + perEdge/scaling/uber_param/cum_bound/band_start/pe_base
    const cacheKey = `uber:${relIdxList.join(',')}|wg${WG}|${direct ? 'd' : 'c'}`;
    let runner = relCache.get(cacheKey);
    if (!runner) {
      const types = direct
        ? [...Array(N).fill('read-only-storage'), 'storage', 'uniform', 'read-only-storage',
          'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage']
        : ['read-only-storage', 'storage', 'uniform', 'read-only-storage',
          'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage'];
      const layout = create_bind_group_layout(device, types);
      const code = sm.gen_gate_uber_shader(WG, layout0.gates, direct);
      const pipeline = await create_compute_pipeline(device, [layout], code, 'gate_uber_main', cacheKey);
      runner = { layout, pipeline };
      relCache.set(cacheKey, runner);
    }
    let fusedColBuf: GPUBuffer | undefined;
    if (!direct) {
      const totalFusedEdges = layout0.meta.reduce((a, g) => a + g.numEdges, 0);
      setAllocCategory('columns');
      fusedColBuf = create_sb(device, totalFusedEdges * n * 32);
    }
    setAllocCategory('relparams');
    const uberParamBuf = create_and_write_sb(device, layout0.uberParamBytes);
    groups.push({ meta: layout0.meta, runner, direct, fusedColBuf, uberParamBuf });
  }
  return groups;
}

/** Union of relation indices covered by the uber groups (skip these on the per-relation path). */
export function uberFusedSet(groups: UberGroup[]): Set<number> {
  const s = new Set<number>();
  for (const g of groups) for (const m of g.meta) s.add(m.relIdx);
  return s;
}

/** Per-round context for dispatchUberGroups — the few buffers/values that differ between
 *  the two engines (current columns + the accumulator target + the profiler labelling). */
export interface UberDispatchCtx {
  device: GPUDevice;
  enc: GPUCommandEncoder;
  groups: UberGroup[];
  round: number;
  m: number;     // curLen (column length this round)
  pairs: number; // m >> 1 (= params.n, the column stride)
  cols: GPUBuffer[];       // current resident columns (colBuf for multi-pass, cur for single-submit)
  perEdge: GPUBuffer;
  partsScratch: GPUBuffer;
  scalScratch: GPUBuffer;
  finalBuf: GPUBuffer;     // finalParts (multi-pass) / accBuf (single-submit)
  finalBase: number[];
  reduceRunner: ReduceRunner;
  bands: BandPlan;
  maxPerEdge: number;
  profAcc: (groupIdx: number) => GPUComputePassTimestampWrites | undefined;
  profReduce: (gateId: string, pass: 'r1' | 'r2') => GPUComputePassTimestampWrites | undefined;
}

/**
 * Dispatch every uber group this round: per group, build the BandTable, (copy columns
 * into fusedColBuf unless direct), run ONE fused accumulate over all the group's active
 * pairs, then the existing reduce per gate over its compacted perEdge sub-region into
 * `finalBuf`. `finalBuf` must already be cleared this round (both engines clear it when
 * bands are set), so a gate with an empty band contributes its pre-cleared zero slice.
 */
export async function dispatchUberGroups(ctx: UberDispatchCtx): Promise<void> {
  const { device, enc, groups, round, m, pairs, cols, perEdge, partsScratch, scalScratch,
    finalBuf, finalBase, reduceRunner, bands, maxPerEdge, profAcc, profReduce } = ctx;
  for (let gi = 0; gi < groups.length; gi++) {
    const grp = groups[gi];
    const N = grp.meta.length;
    const cumBound = new Uint32Array(N + 1);
    const bandStartArr = new Uint32Array(N);
    const peBaseArr = new Uint32Array(N);
    let peBase = 0, gateTotal = 0;
    for (let s = 0; s < N; s++) {
      const g = grp.meta[s];
      const b = bands.roundsByRel[g.relIdx]?.[round];
      const count = b ? b.count : 0;
      bandStartArr[s] = b ? b.start : 0;
      peBaseArr[s] = peBase;
      cumBound[s] = gateTotal;
      gateTotal += count;
      peBase += Math.ceil((count * g.outLen) / FR_ALIGN) * FR_ALIGN; // 256-byte (8-Fr) aligned for the reduce sub-view
    }
    cumBound[N] = gateTotal;
    if (peBase > maxPerEdge) throw new Error(`uber perEdge overflow: ${peBase} Fr > ${maxPerEdge} capacity`);
    if (gateTotal === 0) continue;
    // FRESH per-round BandTable buffers, NOT a reused buffer written via queue.writeBuffer:
    // the single-submission engine encodes every round before ONE submit, so all rounds'
    // queue writes would land before any GPU work and only the last round's values would
    // survive. Baking each round's values into its own buffer keeps both engines correct.
    const cumBoundBuf = create_and_write_sb(device, new Uint8Array(cumBound.buffer, 0, (N + 1) * 4));
    const bandStartBuf = create_and_write_sb(device, new Uint8Array(bandStartArr.buffer, 0, N * 4));
    const peBaseBuf = create_and_write_sb(device, new Uint8Array(peBaseArr.buffer, 0, N * 4));
    const accUB = create_and_write_ub(device, u32x4(pairs, gateTotal));
    let uBg: GPUBindGroup;
    if (grp.direct) {
      uBg = create_bind_group(device, grp.runner.layout, [
        ...grp.meta.map(g => cols[g.relIdx]),
        perEdge, accUB, scalScratch, grp.uberParamBuf, cumBoundBuf, bandStartBuf, peBaseBuf,
      ]);
    } else {
      // Concat fallback: ONE contiguous copy per gate (its numEdges columns are contiguous
      // in cols[r]); a per-column band-only copy issues numEdges× more blits, and Metal
      // serializes disjoint blits to one buffer, costing far more than the bandwidth saved.
      for (let s = 0; s < N; s++) {
        const g = grp.meta[s];
        if (cumBound[s + 1] - cumBound[s] === 0) continue;
        enc.copyBufferToBuffer(cols[g.relIdx], 0, grp.fusedColBuf!, g.numEdgesPrefix * m * 32, g.numEdges * m * 32);
      }
      uBg = create_bind_group(device, grp.runner.layout, [
        grp.fusedColBuf!, perEdge, accUB, scalScratch, grp.uberParamBuf, cumBoundBuf, bandStartBuf, peBaseBuf,
      ]);
    }
    await execute_pipeline(enc, grp.runner.pipeline, uBg, Math.ceil(gateTotal / WG), 1, 1, profAcc(gi));
    for (let s = 0; s < N; s++) {
      const g = grp.meta[s];
      const count = cumBound[s + 1] - cumBound[s];
      if (count === 0) continue; // empty band this round -> pre-cleared zero slice
      const chunk = Math.max(1, Math.ceil(count / REDUCE_GROUPS));
      const groupsR = Math.ceil(count / chunk);
      const r1 = device.createBindGroup({ layout: reduceRunner.layout, entries: [
        { binding: 0, resource: { buffer: perEdge, offset: peBaseArr[s] * 32, size: count * g.outLen * 32 } },
        { binding: 1, resource: { buffer: partsScratch } },
        { binding: 2, resource: { buffer: create_and_write_ub(device, u32x4(count, g.outLen, chunk, 0)) } },
      ] });
      await execute_pipeline(enc, reduceRunner.pipeline, r1, groupsR, 1, 1, profReduce(g.desc.id, 'r1'));
      const r2 = create_bind_group(device, reduceRunner.layout, [
        partsScratch, finalBuf, create_and_write_ub(device, u32x4(groupsR, g.outLen, groupsR, finalBase[g.relIdx])),
      ]);
      await execute_pipeline(enc, reduceRunner.pipeline, r2, 1, 1, 1, profReduce(g.desc.id, 'r2'));
    }
  }
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
  /** Per-round fine attribution (only when `fineProfile` is set); null otherwise.
   * One entry per round splitting the wall into host phases (encode / decode /
   * univariate sub-steps / fold-encode) and, when timestamp-query is available, the
   * GPU-active span of that round's accumulate encoder (so gpu-wait can be split
   * into real GPU compute vs idle/transfer bubble). */
  fine: FineRoundProfile[] | null;
}

/** Per-round attribution emitted by the fine profiler. All ms are host wall unless
 * noted. `gpuActiveMs`/`perRelAccMs` are null when the device lacks timestamp-query. */
export interface FineRoundProfile {
  round: number;
  edges: number; // gather grid this round = densest relation's active edge-pairs (== n>>(round+1) when dense)
  encodeAccMs: number; // host time building the gather+accumulate+reduce command buffer
  gpuWaitMs: number; // submit + blocking mapAsync readback of the 345-Fr accumulator
  gpuActiveMs: number | null; // timestamped GPU span of the accumulate encoder
  decodeMs: number; // fromMont decode of the 345-Fr accumulator
  scaleMs: number; // scaleUnivariates (alpha powers)
  extendMs: number; // extendTo barycentric interpolation (the modular inversions)
  batchMs: number; // extendAndBatch minus the extend time (the pow/c_i batching)
  invCount: number; // modular inversions performed this round
  encodeFoldMs: number; // host time building the fold command buffer
  perRelAccMs: { id: string; ms: number }[] | null; // per-relation accumulate GPU time
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
  bands?: BandPlan,
  gateMode: GateMode = 'perRelation',
  fineProfile = false,
): Promise<ResidentSumcheckResult> {
  const d = Math.round(Math.log2(n));
  const rounds = Math.max(1, Math.min(maxRounds ?? d, d));
  // Effective used length for Tier-0 trimming (default = n => no trim). Only consulted
  // when `skip` is on; the column stride stays full `n` regardless. `usedLensByRel`
  // (block sparsity) overrides this per relation in the accumulate loop.
  const effUsedLen = skip ? Math.max(2, Math.min(n, usedLen ?? n)) : n;
  // Tier 1 (per-edge skip prelude) is needed only for the global-dispatch skip path
  // (scattered): there the dispatched grid still straddles inactive edges. With
  // per-relation prefix dispatch (`usedLensByRel`, block) the dispatched edges are
  // exactly the active ones, so the prelude would never fire — drop it and run the plain
  // kernel (no per-edge selector read/branch, and the cache is shared with dense runs).
  // Compaction (Phase 2, scattered) replaces the per-edge skip for the relations it covers:
  // each thread handles one ACTIVE pair gathered from a precomputed index list, so Tier 1 is
  // off for those and the global-skip prelude is off entirely when a compaction plan is given.
  const inject = skip && !usedLensByRel && !compaction && !bands;
  const relCache: PipelineCache = shared?.cache ?? new Map();
  const foldRunner = shared?.foldRunner ?? (await makeFoldRunner(device));
  const reduceRunner = shared?.reduceRunner ?? (await makeReduceRunner(device));

  // Opt-in per-kernel GPU timing, round 0 only (its gather + acc+reduce+fold passes
  // total 1 + 14*3 + 14 = 57 stages, under the 64 default and Metal's sample-buffer
  // limit). No-ops (stage() -> undefined) when the device lacks timestamp-query.
  const profiler = profile ? new Profiler(device, 64) : null;
  // Fine profiler: a fresh Profiler per round times ONLY that round's accumulate
  // encoder (gather+acc+reduce, never the fold), and is resolved + read back +
  // DESTROYED within the same round (below) so at most ONE QuerySet is ever live.
  // Apple Metal draws QuerySets from a small shared pool and silently no-ops a whole
  // CommandBuffer once it is exhausted, so keeping d of them alive would corrupt both
  // the profile and the computed univariates on the measurement device (gpu.ts:583).
  let roundProfiler: Profiler | null = null;
  const fine: FineRoundProfile[] = [];
  let curFine: Partial<FineRoundProfile> = {};
  const prof = (round: number, label: string) => {
    if (fineProfile) return label.startsWith('fold') ? undefined : roundProfiler?.stage(label);
    return round === 0 ? profiler?.stage(label) : undefined;
  };

  const tSetup = performance.now();

  // Upload relation parameters once; columns become resident GPU buffers. In shared mode
  // the 185 per-relation columns collapse to ONE set of NUM_GLOBAL_ENTITIES (67) columns
  // that every relation reads through its entity_map (a curS/otherS ping-pong); otherwise
  // each relation keeps its own colBuf, folded fresh each round (the band-trim fold path).
  const useShared = !!(shared?.sharedColumns && shared.sharedColBytes);
  const relParamBufs: (GPUBuffer | undefined)[] = new Array(NUM_RELATIONS).fill(undefined);
  let colBuf: GPUBuffer[] = new Array(NUM_RELATIONS);
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
    }
  }

  // Per-relation active-pair index lists (compaction): uploaded once, sliced per round by
  // (base, count). Only the relations the plan covers (density < 1) get a buffer.
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
  type AccMode = 'comp' | 'band' | 'sk' | 'pl';
  const accPipeline = async (desc: RelationDescriptor, mode: AccMode) => {
    const hasParams = relParamBufs[desc.relationIndex] !== undefined;
    const key = `acc:${desc.entry}|${hasParams ? 5 : 4}|wg${accWG}|${mode}|s${useShared ? 1 : 0}`;
    let p = relCache.get(key);
    if (!p) {
      const types = ['read-only-storage', 'storage', 'uniform', 'read-only-storage'];
      if (hasParams) types.push('read-only-storage');
      if (mode === 'comp') types.push('read-only-storage'); // sk_active_idx (band/sk/pl add no binding)
      if (useShared) types.push('read-only-storage'); // entity_map (bound last)
      const layout = create_bind_group_layout(device, types);
      // The relation shaders render at the global WG; retarget only the accumulate
      // kernel's workgroup size so the benchmark can sweep occupancy in isolation.
      const base = desc.shader(useShared);
      let code = accWG === WG ? base : base.replace(`@workgroup_size(${WG})`, `@workgroup_size(${accWG})`);
      if (mode === 'comp') code = injectCompaction(code, desc, hasParams); // Phase 2 active-edge gather (scattered)
      else if (mode === 'band') code = injectBand(code, desc); // contiguous-band range dispatch (realistic)
      else if (mode === 'sk') code = injectSkipPrelude(code, desc); // Tier 1 per-edge skip early-out
      const pipeline = await create_compute_pipeline(device, [layout], code, desc.entry, desc.entry);
      p = { layout, pipeline };
      relCache.set(key, p);
    }
    return p;
  };

  // ── Fused gate "uber" accumulate (realistic-band only) ───────────────────────
  // On a sparse band trace each gate relation dispatches a tiny, occupancy-bound grid
  // and serializes on the shared scratch. Each uber group fuses its gates into ONE
  // occupancy-filling dispatch (gen_gate_uber_shader), binding resident columns directly
  // (zero copy) when the device allows. permutation and arithmetic stay per-relation.
  const uberOn = gateMode === 'uber' && !!bands;
  const uberGroups = uberOn ? await buildUberGroups(device, relCache, relParamBytes, n) : [];
  const fusedSet = uberFusedSet(uberGroups);

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
      // Tier 0, per relation: each relation accumulates/reduces only over ITS active
      // prefix (round(density_r·L) edge-pairs) — a 1%-active relation launches a 1% grid.
      // The folded zero tail contributes exactly zero; params.n stays = pairs (the full
      // column stride), so this is purely a smaller dispatch. `effPairs` (global, the
      // densest relation) sizes only the shared gather below; == pairs when dense/off.
      const effPairs = effPairsForRound(effUsedLen, _round, m);

      // Fine path stages gather+acc+reduce (not fold) -> at most 1+14*3 = 43 stages < 64.
      if (fineProfile) roundProfiler = new Profiler(device, 64);
      const tAccStart = performance.now();
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

      // The accumulate uniform (params.n = pairs = full column stride) is identical for the
      // non-compacted relations; allocate it once. With a compaction plan, a relation with
      // zero active pairs this round contributes nothing — pre-clear finalParts so its
      // (skipped) slice stays zero rather than holding the prior round's value.
      const accParam = create_and_write_ub(device, u32x4(pairs));
      if (compaction || bands) enc.clearBuffer(finalParts);
      for (const desc of ALL_RELATIONS) {
        const r = desc.relationIndex;
        if (fusedSet.has(r)) continue; // handled by the fused uber dispatch below
        const compIdx = activeIdxBuf[r];
        const band = bands?.roundsByRel[r];
        const mode: AccMode = compIdx ? 'comp' : band ? 'band' : inject ? 'sk' : 'pl';
        // Edge-pairs this relation contributes to this round: a gathered active count
        // (compaction, scattered), a contiguous band range (realistic trace), its own active
        // prefix (Phase 1), or the global used prefix. params.n stays = pairs (column stride).
        // Shared mode binds the one resident 67-column buffer + this relation's entity_map.
        let dispatchPairs: number;
        const aBufs: GPUBuffer[] = [useShared ? curS! : colBuf[r], perEdge];
        if (mode === 'comp') {
          const { base, count } = compaction!.roundsByRel[r]![_round];
          if (count === 0) continue; // no active pairs -> 0 contribution (finalParts pre-cleared)
          dispatchPairs = count;
          aBufs.push(create_and_write_ub(device, u32x4(pairs, count, base)), scalScratch);
          if (relParamBufs[r]) aBufs.push(relParamBufs[r]!);
          aBufs.push(compIdx!); // sk_active_idx (gathered pair indices; defined when mode === 'comp')
        } else if (mode === 'band') {
          const { start, count } = band![_round];
          if (count === 0) continue; // empty band this round -> 0 contribution (finalParts pre-cleared)
          dispatchPairs = count;
          aBufs.push(create_and_write_ub(device, u32x4(pairs, count, start)), scalScratch);
          if (relParamBufs[r]) aBufs.push(relParamBufs[r]!);
        } else {
          dispatchPairs = effPairsForRound(usedLensByRel ? Math.max(2, Math.min(n, usedLensByRel[r])) : effUsedLen, _round, m);
          aBufs.push(accParam, scalScratch);
          if (relParamBufs[r]) aBufs.push(relParamBufs[r]!);
        }
        if (useShared) aBufs.push(entityMapBufs[r]); // entity_map bound last
        const chunk = Math.max(1, Math.ceil(dispatchPairs / REDUCE_GROUPS));
        const groups = Math.ceil(dispatchPairs / chunk);
        const acc = await accPipeline(desc, mode);
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

      // Fused gate uber dispatches: per group, ONE occupancy-filling acc over all its
      // gates, then the existing reduce per gate into finalParts (shared helper).
      if (uberGroups.length > 0) {
        await dispatchUberGroups({
          device, enc, groups: uberGroups, round: _round, m, pairs,
          cols: colBuf, perEdge, partsScratch, scalScratch, finalBuf: finalParts, finalBase,
          reduceRunner, bands: bands!, maxPerEdge,
          profAcc: gi => prof(_round, `acc:uber${gi}`),
          profReduce: (id, pass) => prof(_round, `${pass}:${id}`),
        });
      }
      enc.copyBufferToBuffer(finalParts, 0, stagingBuf, 0, readbackBytes);
      if (fineProfile && roundProfiler) roundProfiler.resolve(enc); // timestamp resolve encoded into the acc encoder
      const tg = performance.now(); // after the copy+resolve ENCODE: gpuWait is pure submit + blocking map
      device.queue.submit([enc.finish()]);
      await stagingBuf.mapAsync(GPUMapMode.READ, 0, readbackBytes);
      const pbytes = new Uint8Array(stagingBuf.getMappedRange(0, readbackBytes).slice(0));
      stagingBuf.unmap();
      const waitMs = performance.now() - tg;
      gpuMs += waitMs;
      if (fineProfile) {
        // The acc submit has completed, so this round's timestamps are ready: read them
        // and DESTROY the QuerySet now (only one is ever live). gpuActiveMs is the
        // acc-encoder GPU span; fold is NOT timestamped (it runs un-fenced and its GPU
        // time drains into the NEXT round's gpuWait), so gpuActiveMs is acc-only.
        let gpuActiveMs: number | null = null;
        let perRelAccMs: { id: string; ms: number }[] | null = null;
        if (roundProfiler) {
          const rep = await roundProfiler.report();
          if (rep) {
            gpuActiveMs = rep.find(e => e.label === 'encoder_all')?.ms ?? null;
            perRelAccMs = rep.filter(e => e.label.startsWith('acc:')).map(e => ({ id: e.label.slice(4), ms: e.ms }));
          }
          roundProfiler.destroy();
          roundProfiler = null;
        }
        curFine = { round: _round, edges: effPairs, encodeAccMs: tg - tAccStart, gpuWaitMs: waitMs, gpuActiveMs, perRelAccMs };
      }

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
      const decMs = performance.now() - td;
      decodeMs += decMs;
      if (fineProfile) curFine.decodeMs = decMs;
      return assembleAccumulator(slices);
    },
    roundUnivariate: (acc, gs) => {
      if (!fineProfile) return gs.roundUnivariate(acc, alpha);
      // Replicate batchOverRelations = extendAndBatch(scaleUnivariates(acc, alpha), ...)
      // with the scale / extend (barycentric inversions) / batch sub-steps timed.
      // resetExtendStats() (enable+zero the extend counters) sits OUTSIDE [tsc,teb] so it
      // is not charged to batchMs; it calls no extendTo, so scaleMs absorbing its sub-µs
      // cost is harmless. batchMs is clamped: extendMs is a sum of inner now() deltas
      // that timer quantization can push just past the single outer delta.
      const ts = performance.now();
      const scaled = scaleUnivariates(acc, alpha);
      resetExtendStats();
      const tsc = performance.now();
      const uni = extendAndBatch(scaled, gs.currentElement(), gs.partialEvaluationResult);
      const teb = performance.now();
      const { extendMs, invCount } = extendStats();
      curFine.scaleMs = tsc - ts;
      curFine.extendMs = extendMs;
      curFine.batchMs = Math.max(0, teb - tsc - extendMs);
      curFine.invCount = invCount;
      return uni;
    },
    fold: async (_round, u) => {
      const tFoldStart = performance.now();
      const m = curLen;
      const half = m >> 1;
      setAllocCategory('transcript');
      const uBuf = create_and_write_sb(device, packParams([u]));
      const enc = device.createCommandEncoder();
      // Fold cur -> other. Shared mode folds the whole 67-column ping-pong buffer (chunked
      // by columns); non-shared allocates a fresh band-trimmed column per relation.
      const newCol: GPUBuffer[] = new Array(NUM_RELATIONS);
      if (useShared) {
        // Fold all 67 columns, chunked by columns so no dispatch exceeds
        // maxComputeWorkgroupsPerDimension (one 67*half dispatch overflows it at
        // n>=2^17). Each chunk binds a column-range sub-slice (whole-column offsets are
        // storage-offset-aligned) and folds independently. Full fold per chunk
        // (band_count = half, band_start = 0): the band-aware fold shader requires both.
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
              { binding: 2, resource: { buffer: create_and_write_ub(device, u32x4(numOut, half, half, 0)) } },
              { binding: 3, resource: { buffer: uBuf } },
            ],
          });
          await execute_pipeline(enc, foldRunner.pipeline, fBg, Math.ceil(numOut / WG), 1, 1, prof(_round, 'fold:shared'));
        }
      } else {
        setAllocCategory('columns');
        for (const desc of ALL_RELATIONS) {
          const r = desc.relationIndex;
          // New column is always full-size + zero-initialized; a band fold writes only its
          // active sub-range [start, start+count) of each column (the rest stays the folded
          // zero tail). The fold-output band equals this round's accumulate band.
          const nb = create_sb(device, desc.numEdges * half * 32);
          const fb = bands?.roundsByRel[r]?.[_round];
          const bandStart = fb ? fb.start : 0;
          const bandCount = fb ? fb.count : half;
          if (bandCount > 0) {
            const numOut = desc.numEdges * bandCount;
            const fBg = create_bind_group(device, foldRunner.layout, [
              colBuf[r], nb, create_and_write_ub(device, u32x4(numOut, half, bandCount, bandStart)), uBuf,
            ]);
            await execute_pipeline(enc, foldRunner.pipeline, fBg, Math.ceil(numOut / WG), 1, 1, prof(_round, `fold:${desc.id}`));
          }
          newCol[r] = nb;
        }
      }
      // Round 0 is the only profiled round; resolve its query set into this encoder
      // before submit so report() can read it afterwards.
      if (_round === 0) profiler?.resolve(enc);
      if (fineProfile) {
        curFine.encodeFoldMs = performance.now() - tFoldStart;
        fine.push(curFine as FineRoundProfile);
      }
      // No fence here. Fold and the next round's accumulate share device.queue, which
      // serializes fold-before-read and tracks the colBuf write->read hazard, so the
      // next readback's await already covers fold's execution. The per-round fold
      // fence was pure blocking CPU<->GPU sync latency — the profiler showed sync,
      // not compute, dominates the wall (~4 ms/await x 28 awaits/run) — so dropping
      // it removes one of the two blocking syncs per round. The final length-1
      // readback after the loop awaits, covering the last round's fold.
      device.queue.submit([enc.finish()]);
      if (useShared) { [curS, otherS] = [otherS, curS]; }
      else { colBuf = newCol; }
      curLen = half;
    },
  });
  const totalMs = performance.now() - t0;
  const profileReport = profiler ? (await profiler.report())?.map(e => ({ label: e.label, ms: e.ms })) ?? null : null;
  profiler?.destroy();

  // Per-round timestamps were already read back and the QuerySets destroyed in-round
  // (above). Turn the extendTo instrumentation back off so it never taxes a later run.
  if (fineProfile) disableExtendStats();

  // Trailing readback of the resident columns: length-1 for a full run (the
  // purported-value anchor), or the folded columns (size 2^(d-rounds)) for a
  // partial run — the GPU->WASM handoff payload in the hybrid bench.
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

  return { univariates, challenges: used, finalColBytes, gpuMs, totalMs, finalReadbackMs, setupMs, scalingMs, decodeMs, profile: profileReport, fine: fineProfile ? fine : null };
}
