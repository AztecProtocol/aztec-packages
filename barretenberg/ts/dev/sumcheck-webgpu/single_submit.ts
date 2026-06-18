// Fully GPU-resident, single-command-buffer MegaFlavor (non-ZK) sumcheck with
// on-GPU Fiat-Shamir. The entire d-round protocol is encoded into ONE command
// buffer and read back ONCE — there is no per-round CPU<->GPU round-trip. Each
// round, on the GPU:
//   accumulate -> two-level reduce -> batch_over_relations (round univariate)
//     -> Poseidon2 transcript (round challenge u_i + gate-separator c_{i+1})
//     -> fold every column at u_i.
// The challenge u_i is derived on the GPU from that round's univariate (real
// Fiat-Shamir, equivalent work to the C++ transcript), so the next round's fold can
// consume it within the same command buffer. The only host work is the one-time
// schedule precompute (gate-separator scaling, batch matrices, Poseidon2 constants)
// and the single final decode of the d univariates + d challenges.
//
// Columns ping-pong between two resident sets; WebGPU intra-encoder hazard tracking
// serializes the dependent chain (fold(i) -> accumulate(i+1), batch reads c_i before
// transcript writes c_{i+1}, etc.) automatically. Correctness is checked by the
// rounds suite (telescoping is challenge-independent; the purported anchor uses the
// GPU-derived challenges) and the standalone batch / poseidon2 suites.

import {
  makeFoldRunner, makeReduceRunner, makeScanRunner, makeGatherRunner, encodeColumnsToBytes,
  injectSkipPrelude, injectBand, effPairsForRound,
  buildUberGroups, uberFusedSet, dispatchUberGroups,
  type FoldRunner, type ReduceRunner, type KernelRunner, type GateMode,
} from './gpu_pipeline.js';
import type { BandPlan } from './sparsity.js';
import { buildBatchConsts } from './batch_gpu.js';
import { poseidon2ConstBytes, POSEIDON2_IV_9, p2ParamsBytes } from './poseidon2_gpu.js';
import { initWasm, runWasmSumcheck } from './bench.js';
import { NUM_RELATIONS } from '../../src/msm_webgpu/accumulator.js';
import { ALL_RELATIONS } from './descriptors.js';
import {
  create_and_write_sb, create_and_write_ub, create_sb, create_bind_group_layout, create_bind_group,
  create_compute_pipeline, execute_pipeline, create_readback_buffer, Profiler, setAllocCategory,
} from '../../src/msm_webgpu/cuzk/gpu.js';
import {
  type PipelineCache, type RelationDescriptor, type Logger,
  WG, sm, mod, packParams, makeRng, toMont, fromMont, writeLe32, le32ToBi,
} from './harness.js';

const REDUCE_WG = 128;
const REDUCE_GROUPS = 64;
const ACC_LEN = 345;
const BATCHED_LEN = 8;

function u32x4(a: number, b = 0, c = 0, d = 0): Uint8Array {
  const out = new Uint8Array(16);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, a, true); dv.setUint32(4, b, true); dv.setUint32(8, c, true); dv.setUint32(12, d, true);
  return out;
}
const frBytes = (x: bigint): Uint8Array => { const o = new Uint8Array(32); writeLe32(o, 0, toMont(mod(x))); return o; };

export interface SingleSubmitResult {
  univariates: bigint[][]; // rounds round univariates (GPU batch output)
  challenges: bigint[];    // rounds GPU-derived Fiat-Shamir challenges
  // Resident columns after `rounds` folds: length-1 for a full run (the
  // purported-value anchor), or the partially-folded columns (length 2^(d-rounds))
  // for a k-round front — the GPU->WASM handoff payload in the hybrid bench.
  finalColBytes: Uint8Array[];
  gpuMs: number;   // submit + the univariate/challenge readback await
  totalMs: number; // rounds wall (encode + submit + readback + decode)
  // Wall for the trailing readback of the resident columns (handoff payload). For a
  // full run this is the tiny length-1 anchor; for a k-round front it is the
  // GPU->WASM handoff of the folded columns at length 2^(d-rounds).
  finalReadbackMs: number;
  setupMs: number; // one-time host precompute (schedule, matrices, constants, uploads)
  // Per-kernel GPU timing across ALL rounds (only when `profile` is set and the
  // device has timestamp-query): one entry per dispatch labelled by kernel type
  // (accumulate/reduce/batch/transcript/fold), plus an `encoder_all` region whose
  // ms is the full GPU span (first pass begin -> last pass end, barriers included).
  profile: { label: string; ms: number }[] | null;
}

interface Shared {
  cache?: PipelineCache;
  foldRunner?: FoldRunner;
  reduceRunner?: ReduceRunner;
  batch?: { layout: GPUBindGroupLayout; pipeline: GPUComputePipeline };
  transcript?: { layout: GPUBindGroupLayout; pipeline: GPUComputePipeline };
}

export async function makeBatchRunner(device: GPUDevice) {
  const layout = create_bind_group_layout(device, [
    'read-only-storage', 'read-only-storage', 'read-only-storage', 'read-only-storage',
    'read-only-storage', 'read-only-storage', 'storage',
  ]);
  const pipeline = await create_compute_pipeline(device, [layout], sm.gen_batch_test_shader(WG), 'batch_main', 'batch_main');
  return { layout, pipeline };
}
// The GPU Fiat-Shamir transcript runner. `parallel` (default) uses the lane-parallel
// Poseidon2 kernel (@workgroup_size(4), one thread per state lane) which cuts the
// formerly serial (@workgroup_size(1)) transcript — the single-largest single-
// submission GPU cost. Both kernels share the exact bindings + single-workgroup
// dispatch and are cross-checked against the CPU Poseidon2 reference by the
// poseidon2 suite; `parallel=false` selects the serial reference kernel.
export async function makeTranscriptRunner(device: GPUDevice, parallel = true) {
  const layout = create_bind_group_layout(device, [
    'read-only-storage', 'read-only-storage', 'read-only-storage', 'storage', 'storage', 'storage', 'read-only-storage', 'uniform',
  ]);
  const code = parallel ? sm.gen_poseidon2_transcript_par_test_shader(WG) : sm.gen_poseidon2_transcript_test_shader(WG);
  const entry = parallel ? 'poseidon2_transcript_par_main' : 'poseidon2_transcript_main';
  const pipeline = await create_compute_pipeline(device, [layout], code, entry, entry);
  return { layout, pipeline };
}

export async function runSingleSubmitSumcheck(
  device: GPUDevice,
  n: number,
  alpha: bigint,
  betas: bigint[],
  relParamBytes: (Uint8Array | undefined)[],
  initColBytes: Uint8Array[],
  shared?: Shared,
  accWG: number = WG,
  profile = false,
  maxRounds?: number,
  skip = false,
  usedLen?: number,
  usedLensByRel?: number[],
  bands?: BandPlan,
  gateMode: GateMode = 'perRelation',
): Promise<SingleSubmitResult> {
  const d = Math.round(Math.log2(n));
  // Effective used length for Tier-0 trimming (default = n => no trim). Only consulted
  // when `skip` is on; the column stride stays full `n` regardless. `usedLensByRel`
  // (block sparsity) overrides this per relation in the round loop.
  const effUsedLen = skip ? Math.max(2, Math.min(n, usedLen ?? n)) : n;
  // Tier 1 prelude only for the global-dispatch skip path (scattered); per-relation
  // prefix dispatch (`usedLensByRel`, block) dispatches exactly the active edges, so the
  // prelude never fires — run the plain kernel (cache shared with dense). See gpu_pipeline.
  const inject = skip && !usedLensByRel && !bands;
  // `maxRounds` (default d) stops the single-command-buffer run after that many
  // rounds and reads back the partially-folded columns (length 2^(d-rounds)) — the
  // GPU front of the single-submission hybrid, where the heavy early rounds run on
  // the GPU (one command buffer, on-GPU Fiat-Shamir) and the cheap tail is handed to
  // the WASM prover.
  const rounds = Math.max(1, Math.min(maxRounds ?? d, d));
  const relCache: PipelineCache = shared?.cache ?? new Map();
  const foldRunner = shared?.foldRunner ?? (await makeFoldRunner(device));
  const reduceRunner = shared?.reduceRunner ?? (await makeReduceRunner(device));
  const batch = shared?.batch ?? (await makeBatchRunner(device));
  const transcript = shared?.transcript ?? (await makeTranscriptRunner(device));
  // Gate-separator scaling runners (GPU-resident beta_products scan + per-round
  // strided gather), cached like the multi-pass engine so they compile once.
  const scanRunner: KernelRunner = relCache.get('gs:scan') ?? await makeScanRunner(device);
  relCache.set('gs:scan', scanRunner);
  const gatherRunner: KernelRunner = relCache.get('gs:gather') ?? await makeGatherRunner(device);
  relCache.set('gs:gather', gatherRunner);

  const tSetup = performance.now();

  // Resident inputs + ping-pong columns.
  const relParamBufs: (GPUBuffer | undefined)[] = new Array(NUM_RELATIONS).fill(undefined);
  const colA: GPUBuffer[] = new Array(NUM_RELATIONS);
  const colB: GPUBuffer[] = new Array(NUM_RELATIONS);
  for (const desc of ALL_RELATIONS) {
    const r = desc.relationIndex;
    if (relParamBytes[r]) { setAllocCategory('relparams'); relParamBufs[r] = create_and_write_sb(device, relParamBytes[r]!); }
    setAllocCategory('columns');
    colA[r] = create_and_write_sb(device, initColBytes[r]);
    colB[r] = create_sb(device, desc.numEdges * (n >> 1) * 32);
  }

  // Scratch + accumulators.
  setAllocCategory('scratch');
  const pairs0 = n >> 1;
  let maxPerEdge = 0, totalOutLen = 0, maxOutLen = 0;
  for (const desc of ALL_RELATIONS) {
    maxPerEdge = Math.max(maxPerEdge, pairs0 * desc.outLen);
    maxOutLen = Math.max(maxOutLen, desc.outLen);
    totalOutLen += desc.outLen;
  }
  if (totalOutLen !== ACC_LEN) throw new Error(`acc length ${totalOutLen} != ${ACC_LEN}`);
  const perEdge = create_sb(device, maxPerEdge * 32);
  // Per-round gate-separator edge scaling, gathered on the GPU off the resident
  // beta_products table into this reused scratch (sized for round 0). WebGPU's
  // intra-encoder hazard tracking serializes gather(i+1) after round i's reads.
  const scalScratch = create_sb(device, pairs0 * 32);
  const partsScratch = create_sb(device, REDUCE_GROUPS * maxOutLen * 32);
  setAllocCategory('accum');
  const accBuf = create_sb(device, ACC_LEN * 32);
  const finalBase: number[] = new Array(NUM_RELATIONS);
  { let b = 0; for (const desc of ALL_RELATIONS) { finalBase[desc.relationIndex] = b; b += desc.outLen; } }

  // Batch matrices (depend on alpha) + Poseidon2 constants (fixed) + IV.
  setAllocCategory('consts');
  const { liBytes, ldBytes, powBytes } = buildBatchConsts(alpha);
  const liBuf = create_and_write_sb(device, liBytes);
  const ldBuf = create_and_write_sb(device, ldBytes);
  const powBuf = create_and_write_sb(device, powBytes);
  const { rcBytes, diagBytes } = poseidon2ConstBytes();
  const rcBuf = create_and_write_sb(device, rcBytes);
  const diagBuf = create_and_write_sb(device, diagBytes);
  const p2pBuf = create_and_write_ub(device, p2ParamsBytes());
  const ivBytes = POSEIDON2_IV_9();

  // Resident Montgomery beta_products table, built once on the GPU by a doubling
  // subset-product scan (gate_separator_scan) — the same kernel the multi-pass engine
  // uses, replacing the host's O(n log n) computeBetaProducts + per-round toMont loop
  // (the dominant single-submit host cliff at large n). Each round gathers its strided
  // slice off this buffer inside the command buffer. The scan runs in its own setup
  // submit so betaMontBuf is fully populated (read-only) before the main encoder.
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

  // Per-round transcript scalars (challenge-independent, O(1)/round): beta_i for the
  // batch kernel and [beta_i, iv] for the Poseidon2 transcript.
  setAllocCategory('transcript');
  const betaBufs: GPUBuffer[] = [];
  const scalarsBufs: GPUBuffer[] = [];
  for (let i = 0; i < rounds; i++) {
    betaBufs.push(create_and_write_sb(device, frBytes(betas[i])));
    const sc = new Uint8Array(2 * 32);
    writeLe32(sc, 0, toMont(mod(betas[i])));
    sc.set(ivBytes, 32);
    scalarsBufs.push(create_and_write_sb(device, sc));
  }

  // GPU-resident transcript state: running (seed 0) and c (gate-separator product, init 1).
  const runBuf = create_and_write_sb(device, frBytes(0n));
  const cBuf = create_and_write_sb(device, frBytes(1n));
  const univBuf = create_sb(device, BATCHED_LEN * 32);
  const uBuf = create_sb(device, 32);

  // One staging buffer collects the run rounds' univariates then challenges.
  const uniOff = 0;
  const chalOff = rounds * BATCHED_LEN * 32;
  const stagingBytes = chalOff + rounds * 32;
  const staging = create_readback_buffer(device, stagingBytes);

  // Cached accumulate pipeline per relation (col_buf, out, params, scaling, [param_buf]).
  const accPipeline = async (desc: RelationDescriptor, band: boolean) => {
    const hasParams = relParamBufs[desc.relationIndex] !== undefined;
    const mode = band ? 'band' : inject ? 'sk' : 'pl';
    const key = `acc:${desc.entry}|${hasParams ? 5 : 4}|wg${accWG}|${mode}`;
    let p = relCache.get(key);
    if (!p) {
      const types = ['read-only-storage', 'storage', 'uniform', 'read-only-storage'];
      if (hasParams) types.push('read-only-storage');
      const layout = create_bind_group_layout(device, types);
      let code = accWG === WG ? desc.shader() : desc.shader().replace(`@workgroup_size(${WG})`, `@workgroup_size(${accWG})`);
      if (band) code = injectBand(code, desc); // contiguous-band range dispatch (realistic trace)
      else if (inject) code = injectSkipPrelude(code, desc); // Tier 1 per-edge skip early-out
      const pipeline = await create_compute_pipeline(device, [layout], code, desc.entry, desc.entry);
      p = { layout, pipeline };
      relCache.set(key, p);
    }
    return p;
  };

  // Fused gate "uber" accumulate (realistic-band only): fuse the register-light /
  // heavy-trio gate relations into ONE occupancy-filling dispatch each, binding the
  // resident ping-pong columns directly (zero copy — they are already GPU-resident and
  // fully folded each round). permutation + arithmetic stay on the per-relation path.
  const uberOn = gateMode === 'uber' && !!bands;
  const uberGroups = uberOn ? await buildUberGroups(device, relCache, relParamBytes, n) : [];
  const fusedSet = uberFusedSet(uberGroups);
  const setupMs = performance.now() - tSetup;

  // Per-kernel profiler: one timestamped stage per dispatch across the run rounds (the
  // transcript cost is per-round, so round-0-only profiling would under-count it).
  const passesPerRound = ALL_RELATIONS.length * 4 + 3; // gather + (acc+r1+r2+fold)/rel + batch + transcript
  const profiler = profile ? new Profiler(device, rounds * passesPerRound + 4) : null;

  // ---- Encode the run rounds into ONE command buffer ----
  const t0 = performance.now();
  const enc = device.createCommandEncoder();
  let cur = colA, other = colB;
  let curLen = n;
  for (let i = 0; i < rounds; i++) {
    const pairs = curLen >> 1;
    // Tier 0, per relation: each relation accumulates/reduces only over ITS active prefix
    // (round(density_r·L) edge-pairs); the folded zero tail contributes exactly zero,
    // params.n = pairs stays the full column stride, and the full-length fold keeps the
    // ping-pong tail consistent for the handoff. `effPairs` (global, densest relation)
    // sizes only the shared gather. == pairs when dense/off.
    const effPairs = effPairsForRound(effUsedLen, i, curLen);

    // Gather this round's per-pair edge scaling off the resident beta_products table:
    // scalScratch[p] = beta_products[p * 2^{i+1}]. Reused across rounds; the WAR hazard
    // (gather(i+1) write vs round i's accumulate reads) is auto-serialized in-encoder.
    const gBg = create_bind_group(device, gatherRunner.layout, [
      betaMontBuf, scalScratch, create_and_write_ub(device, u32x4(effPairs, 1 << (i + 1))),
    ]);
    await execute_pipeline(enc, gatherRunner.pipeline, gBg, Math.ceil(effPairs / WG), 1, 1, profiler?.stage('gather'));

    // accumulate + two-level reduce -> accBuf. Each relation runs over its own active region:
    // a contiguous band range (realistic trace) or its active prefix (Phase 1 / global).
    // params.n = pairs (full column stride) is shared, so allocate that uniform once. With a
    // band plan, a relation whose band is empty this round contributes nothing — pre-clear
    // accBuf so its (skipped) slice stays zero before the batch kernel reads it.
    const accParam = create_and_write_ub(device, u32x4(pairs));
    if (bands) enc.clearBuffer(accBuf);
    for (const desc of ALL_RELATIONS) {
      const r = desc.relationIndex;
      if (fusedSet.has(r)) continue; // handled by the fused uber dispatch below
      const band = bands?.roundsByRel[r];
      let dispatchPairs: number;
      const aBufs: GPUBuffer[] = [cur[r], perEdge];
      if (band) {
        const { start, count } = band[i];
        if (count === 0) continue; // empty band this round -> 0 contribution (accBuf pre-cleared)
        dispatchPairs = count;
        aBufs.push(create_and_write_ub(device, u32x4(pairs, count, start)), scalScratch);
        if (relParamBufs[r]) aBufs.push(relParamBufs[r]!);
      } else {
        dispatchPairs = effPairsForRound(usedLensByRel ? Math.max(2, Math.min(n, usedLensByRel[r])) : effUsedLen, i, curLen);
        aBufs.push(accParam, scalScratch);
        if (relParamBufs[r]) aBufs.push(relParamBufs[r]!);
      }
      const chunk = Math.max(1, Math.ceil(dispatchPairs / REDUCE_GROUPS));
      const groups = Math.ceil(dispatchPairs / chunk);
      const acc = await accPipeline(desc, band !== undefined);
      await execute_pipeline(enc, acc.pipeline, create_bind_group(device, acc.layout, aBufs), Math.ceil(dispatchPairs / accWG), 1, 1, profiler?.stage('accumulate'));
      const r1 = create_bind_group(device, reduceRunner.layout, [
        perEdge, partsScratch, create_and_write_ub(device, u32x4(dispatchPairs, desc.outLen, chunk, 0)),
      ]);
      await execute_pipeline(enc, reduceRunner.pipeline, r1, groups, 1, 1, profiler?.stage('reduce'));
      const r2 = create_bind_group(device, reduceRunner.layout, [
        partsScratch, accBuf, create_and_write_ub(device, u32x4(groups, desc.outLen, groups, finalBase[r])),
      ]);
      await execute_pipeline(enc, reduceRunner.pipeline, r2, 1, 1, 1, profiler?.stage('reduce'));
    }

    // Fused gate uber dispatches into accBuf (before batch reads it). The resident
    // ping-pong columns `cur` are bound directly (zero copy); SS folds them in full each
    // round so any band of cur[r] is valid. No per-round readback amortizes the win here.
    if (uberGroups.length > 0) {
      await dispatchUberGroups({
        device, enc, groups: uberGroups, round: i, m: curLen, pairs,
        cols: cur, perEdge, partsScratch, scalScratch, finalBuf: accBuf, finalBase,
        reduceRunner, bands: bands!, maxPerEdge,
        profAcc: () => profiler?.stage('accumulate'),
        profReduce: () => profiler?.stage('reduce'),
      });
    }

    // batch: accBuf -> univBuf (round univariate); reads beta_i + GPU c_i
    const bBg = create_bind_group(device, batch.layout, [accBuf, liBuf, ldBuf, powBuf, betaBufs[i], cBuf, univBuf]);
    await execute_pipeline(enc, batch.pipeline, bBg, Math.ceil(BATCHED_LEN / WG), 1, 1, profiler?.stage('batch'));
    enc.copyBufferToBuffer(univBuf, 0, staging, uniOff + i * BATCHED_LEN * 32, BATCHED_LEN * 32);

    // transcript: univBuf -> u_i (uBuf), advance running + c
    const tBg = create_bind_group(device, transcript.layout, [univBuf, rcBuf, diagBuf, runBuf, cBuf, uBuf, scalarsBufs[i], p2pBuf]);
    await execute_pipeline(enc, transcript.pipeline, tBg, 1, 1, 1, profiler?.stage('transcript'));
    enc.copyBufferToBuffer(uBuf, 0, staging, chalOff + i * 32, 32);

    // fold every column at u_i (cur -> other)
    for (const desc of ALL_RELATIONS) {
      const r = desc.relationIndex;
      const numOut = desc.numEdges * pairs;
      // Full fold (band_count = pairs, band_start = 0): the ping-pong columns are reused, not
      // freshly zero-initialized, so a band-trimmed fold would leave stale data outside the
      // band and corrupt the GPU->WASM handoff. SS still gets the band accumulate dispatch.
      const fBg = create_bind_group(device, foldRunner.layout, [
        cur[r], other[r], create_and_write_ub(device, u32x4(numOut, pairs, pairs, 0)), uBuf,
      ]);
      await execute_pipeline(enc, foldRunner.pipeline, fBg, Math.ceil(numOut / WG), 1, 1, profiler?.stage('fold'));
    }
    [cur, other] = [other, cur];
    curLen = pairs;
  }

  profiler?.resolve(enc);
  const tg = performance.now();
  device.queue.submit([enc.finish()]);
  await staging.mapAsync(GPUMapMode.READ, 0, stagingBytes);
  const bytes = new Uint8Array(staging.getMappedRange(0, stagingBytes).slice(0));
  staging.unmap();
  const gpuMs = performance.now() - tg;

  // Decode the run rounds' univariates + challenges.
  const univariates: bigint[][] = [];
  const challenges: bigint[] = [];
  for (let i = 0; i < rounds; i++) {
    const u = new Array<bigint>(BATCHED_LEN);
    for (let e = 0; e < BATCHED_LEN; e++) u[e] = fromMont(le32ToBi(bytes, uniOff + (i * BATCHED_LEN + e) * 32));
    univariates.push(u);
    challenges.push(fromMont(le32ToBi(bytes, chalOff + i * 32)));
  }
  const totalMs = performance.now() - t0;

  // Resident columns after `rounds` folds: length-1 for a full run (the purported-
  // value anchor), or the folded columns (length 2^(d-rounds)) for a k-round front —
  // the GPU->WASM handoff payload. Timed separately as finalReadbackMs (the handoff).
  const finalLen = n >> rounds;
  const finalColBytes: Uint8Array[] = new Array(NUM_RELATIONS);
  const sizes = ALL_RELATIONS.map(desc => desc.numEdges * finalLen * 32);
  const offs: number[] = [];
  { let o = 0; for (const s of sizes) { offs.push(o); o += s; } }
  const totalFinal = offs.length ? offs[offs.length - 1] + sizes[sizes.length - 1] : 0;
  const tReadback = performance.now();
  if (totalFinal > 0) {
    const fStaging = create_readback_buffer(device, totalFinal);
    const fEnc = device.createCommandEncoder();
    ALL_RELATIONS.forEach((desc, idx) => fEnc.copyBufferToBuffer(cur[desc.relationIndex], 0, fStaging, offs[idx], sizes[idx]));
    device.queue.submit([fEnc.finish()]);
    await fStaging.mapAsync(GPUMapMode.READ, 0, totalFinal);
    const all = new Uint8Array(fStaging.getMappedRange(0, totalFinal).slice(0));
    fStaging.unmap();
    ALL_RELATIONS.forEach((desc, idx) => { finalColBytes[desc.relationIndex] = all.slice(offs[idx], offs[idx] + sizes[idx]); });
  }
  const finalReadbackMs = performance.now() - tReadback;

  const profileReport = profiler ? (await profiler.report())?.map(e => ({ label: e.label, ms: e.ms })) ?? null : null;
  profiler?.destroy();

  return { univariates, challenges, finalColBytes, gpuMs, totalMs, finalReadbackMs, setupMs, profile: profileReport };
}

// Build random per-relation inputs for one size (deterministic per (size, relation)).
function buildInputs(n: number): { initColBytes: Uint8Array[]; relParamBytes: (Uint8Array | undefined)[] } {
  const initColBytes: Uint8Array[] = [];
  const relParamBytes: (Uint8Array | undefined)[] = [];
  for (const desc of ALL_RELATIONS) {
    const rng = makeRng((desc.seed ^ 0x5151_5151_5151n) + BigInt(n));
    relParamBytes[desc.relationIndex] = desc.makeParams ? packParams(desc.makeParams(rng)) : undefined;
    const cols = Array.from({ length: desc.numEdges }, () => Array.from({ length: n }, () => rng()));
    initColBytes[desc.relationIndex] = encodeColumnsToBytes(cols, n);
  }
  return { initColBytes, relParamBytes };
}

export interface SSBenchRow {
  logN: number;
  gpuMs: number;
  wallMs: number;
  setupMs: number;
  wasmMs: number | null;
  speedup: number | null; // wasmMs / wallMs
}

/**
 * Benchmark the single-submission GPU Fiat-Shamir engine vs threaded WASM across
 * sizes. Runners + Poseidon2/batch constants compile once; a warmup at the smallest
 * size excludes shader compilation from the per-size timing.
 */
export async function runSingleSubmitBench(
  device: GPUDevice, logNs: number[], log: Logger, onRow?: (row: SSBenchRow) => void,
): Promise<SSBenchRow[]> {
  const alpha = makeRng(0xb0_07_5eedn)();
  const shared: Shared = {
    cache: new Map(),
    foldRunner: await makeFoldRunner(device),
    reduceRunner: await makeReduceRunner(device),
    batch: await makeBatchRunner(device),
    transcript: await makeTranscriptRunner(device),
  };
  const wasm = await initWasm(log);
  if (wasm) log('info', '  WASM backend ready (bb.js threads)');

  {
    const wn = 1 << Math.min(...logNs);
    const warm = buildInputs(wn);
    const wb = Array.from({ length: Math.round(Math.log2(wn)) }, (_, i) => makeRng(0x1234n + BigInt(i))());
    await runSingleSubmitSumcheck(device, wn, alpha, wb, warm.relParamBytes, warm.initColBytes, shared);
  }

  const rows: SSBenchRow[] = [];
  for (const logN of logNs) {
    const n = 1 << logN;
    const betas = Array.from({ length: logN }, (_, i) => makeRng(0xbe7a_77n + BigInt(i))());
    const { initColBytes, relParamBytes } = buildInputs(n);
    const gpu = await runSingleSubmitSumcheck(device, n, alpha, betas, relParamBytes, initColBytes, shared);
    const wasmMs = await runWasmSumcheck(wasm, logN);
    const row: SSBenchRow = {
      logN, gpuMs: gpu.gpuMs, wallMs: gpu.totalMs, setupMs: gpu.setupMs, wasmMs,
      speedup: wasmMs === null ? null : wasmMs / gpu.totalMs,
    };
    rows.push(row);
    onRow?.(row);
    log('ok', `  2^${logN}: WebGPU ${gpu.totalMs.toFixed(1)} ms (GPU ${gpu.gpuMs.toFixed(1)} · setup ${gpu.setupMs.toFixed(1)}) · WASM ${wasmMs === null ? '—' : wasmMs.toFixed(1)}${row.speedup ? `  →  ${row.speedup.toFixed(2)}×` : ''}`);
  }
  return rows;
}
