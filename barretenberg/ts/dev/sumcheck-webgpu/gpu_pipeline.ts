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
  execute_pipeline, read_from_gpu, create_readback_buffer, Profiler, setAllocCategory,
} from '../../src/msm_webgpu/cuzk/gpu.js';
import { runSumcheckRounds } from '../../src/msm_webgpu/multiround.js';
import { NUM_RELATIONS, assembleAccumulator } from '../../src/msm_webgpu/accumulator.js';
import { ALL_RELATIONS } from './descriptors.js';
import {
  type PipelineCache, type RelationDescriptor,
  WG, sm, mod, packParams, toMont, fromMont, writeLe32, le32ToBi,
} from './harness.js';
import type { CompactionPlan, BandPlan } from './sparsity.js';

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
  const prof = (round: number, label: string) => (round === 0 ? profiler?.stage(label) : undefined);

  const tSetup = performance.now();

  // Upload relation parameters once; columns become resident GPU buffers.
  const relParamBufs: (GPUBuffer | undefined)[] = new Array(NUM_RELATIONS).fill(undefined);
  let colBuf: GPUBuffer[] = new Array(NUM_RELATIONS);
  for (const desc of ALL_RELATIONS) {
    const r = desc.relationIndex;
    const rp = relParamBytes[r];
    if (rp) { setAllocCategory('relparams'); relParamBufs[r] = create_and_write_sb(device, rp); }
    setAllocCategory('columns');
    colBuf[r] = create_and_write_sb(device, initColBytes[r]);
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
    const key = `acc:${desc.entry}|${hasParams ? 5 : 4}|wg${accWG}|${mode}`;
    let p = relCache.get(key);
    if (!p) {
      const types = ['read-only-storage', 'storage', 'uniform', 'read-only-storage'];
      if (hasParams) types.push('read-only-storage');
      if (mode === 'comp') types.push('read-only-storage'); // sk_active_idx (band/sk/pl add no binding)
      const layout = create_bind_group_layout(device, types);
      // The relation shaders render at the global WG; retarget only the accumulate
      // kernel's workgroup size so the benchmark can sweep occupancy in isolation.
      let code = accWG === WG ? desc.shader() : desc.shader().replace(`@workgroup_size(${WG})`, `@workgroup_size(${accWG})`);
      if (mode === 'comp') code = injectCompaction(code, desc, hasParams); // Phase 2 active-edge gather (scattered)
      else if (mode === 'band') code = injectBand(code, desc); // contiguous-band range dispatch (realistic)
      else if (mode === 'sk') code = injectSkipPrelude(code, desc); // Tier 1 per-edge skip early-out
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
      // Tier 0, per relation: each relation accumulates/reduces only over ITS active
      // prefix (round(density_r·L) edge-pairs) — a 1%-active relation launches a 1% grid.
      // The folded zero tail contributes exactly zero; params.n stays = pairs (the full
      // column stride), so this is purely a smaller dispatch. `effPairs` (global, the
      // densest relation) sizes only the shared gather below; == pairs when dense/off.
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

      // The accumulate uniform (params.n = pairs = full column stride) is identical for the
      // non-compacted relations; allocate it once. With a compaction plan, a relation with
      // zero active pairs this round contributes nothing — pre-clear finalParts so its
      // (skipped) slice stays zero rather than holding the prior round's value.
      const accParam = create_and_write_ub(device, u32x4(pairs));
      if (compaction || bands) enc.clearBuffer(finalParts);
      for (const desc of ALL_RELATIONS) {
        const r = desc.relationIndex;
        const compIdx = activeIdxBuf[r];
        const band = bands?.roundsByRel[r];
        const mode: AccMode = compIdx ? 'comp' : band ? 'band' : inject ? 'sk' : 'pl';
        // Edge-pairs this relation contributes to this round: a gathered active count
        // (compaction, scattered), a contiguous band range (realistic trace), its own active
        // prefix (Phase 1), or the global used prefix. params.n stays = pairs (column stride).
        let dispatchPairs: number;
        const aBufs: GPUBuffer[] = [colBuf[r], perEdge];
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
      const newCol: GPUBuffer[] = new Array(NUM_RELATIONS);
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

  return { univariates, challenges: used, finalColBytes, gpuMs, totalMs, finalReadbackMs, setupMs, scalingMs, decodeMs, profile: profileReport };
}
