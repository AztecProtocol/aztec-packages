// Suite: multi-round sumcheck on the GPU (Phase 1 + Phase 2 chained), with the
// polynomial columns kept GPU-resident in Montgomery form across all rounds.
//
// Runs all d = log2(n) rounds of a MegaFlavor (non-ZK) sumcheck end to end: each
// round dispatches the 14 relation accumulate kernels over the current columns,
// reduces + assembles the flat 345-Fr accumulator, batches it to the length-8
// round univariate, then folds every column on the GPU before the next round. The
// fold kernel's Montgomery-byte output IS the next round's column data — columns
// are encoded to Montgomery bytes once at the start and never re-encoded; each
// round's accumulate input is assembled by byte-copy (no per-round toMont), and
// the fold output stays in Montgomery bytes (no fromMont). The only per-round
// canonical decode is of the accumulate output, which the CPU tail reduces.
//
// Each relation uses its own independent random columns (shifts are treated as
// independent columns, not row+1 aliases): a valid synthetic sumcheck instance
// for exercising the chained GPU kernels, not a real execution trace.
//
// Validation: (1) for small n, the GPU round univariate matches a canonical CPU
// reference (polyRef accumulate + CPU fold) on all 8 evals every round; (2) the
// GPU round univariates telescope (S^i(0)+S^i(1) == S^{i-1}(u_{i-1})) — a fold or
// chaining error breaks this; (3) the final round univariate at u_{d-1} equals
// the purported value at the fully folded point (an absolute anchor). (2)+(3)
// hold at any n without the per-edge CPU reference.

import {
  create_and_write_sb, create_and_write_ub, create_sb,
  create_bind_group_layout, create_bind_group, create_compute_pipeline,
  execute_pipeline, read_from_gpu,
} from '../../src/msm_webgpu/cuzk/gpu.js';
import {
  runSumcheckRounds, checkTelescoping, evaluateUnivariate,
} from '../../src/msm_webgpu/multiround.js';
import { GateSeparatorPolynomial } from '../../src/msm_webgpu/gate_separator.js';
import {
  NUM_RELATIONS, RELATION_ACC_OFFSET, RELATION_NAMES, assembleAccumulator, reduceEdges,
} from '../../src/msm_webgpu/accumulator.js';
import {
  SUBREL_START, SUBREL_LIN_INDEP, SUBREL_RELATION, NUM_SUBRELATIONS,
} from '../../src/msm_webgpu/batch_tail.js';
import { fold as cpuFold } from '../../src/msm_webgpu/fold.js';
import { ALL_RELATIONS } from './descriptors.js';
import {
  type Suite, type SuiteCtx, type RelationDescriptor, type PipelineCache,
  WG, sm, mod, makeRng, dispatchRelation, packParams,
  toMont, fromMont, writeLe32, le32ToBi,
} from './harness.js';

const add = (a: bigint, b: bigint): bigint => mod(a + b);
const mul = (a: bigint, b: bigint): bigint => mod(a * b);

// Per flat subrelation: the descriptor index of the relation it belongs to and
// its Fr offset within that relation's polyRef slice — for the purported anchor.
const subrelRelIdx: number[] = [];
const subrelLocalFr: number[] = [];
for (let g = 0; g < NUM_SUBRELATIONS; g++) {
  const name = SUBREL_RELATION[g].slice(0, SUBREL_RELATION[g].indexOf('['));
  const r = RELATION_NAMES.indexOf(name);
  subrelRelIdx.push(r);
  subrelLocalFr.push(SUBREL_START[g] - RELATION_ACC_OFFSET[r]);
}

interface FoldRunner { layout: GPUBindGroupLayout; pipeline: GPUComputePipeline }

async function makeFoldRunner(device: GPUDevice): Promise<FoldRunner> {
  const layout = create_bind_group_layout(device, ['read-only-storage', 'storage', 'uniform', 'read-only-storage']);
  const pipeline = await create_compute_pipeline(device, [layout], sm.gen_fold_test_shader(WG), 'fold_main', 'fold_main');
  return { layout, pipeline };
}

// Fold `numCols` column-major Montgomery-byte columns of length `len` on the GPU,
// returning the folded columns as Montgomery bytes (numCols x len/2). No
// canonical conversion: the bytes go straight back in as the next round's columns.
async function gpuFoldBytes(
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

// Assemble a relation's packed edge-row input (numPairs x inLen Fr) from its
// resident column-major Montgomery bytes by byte-copy — entity j's pair at slots
// 2j/2j+1, the round's edge scaling at the last slot. No toMont.
function packEdgesFromBytes(
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

// Decode a relation kernel's per-edge output (Montgomery bytes) and sum over
// edges into the relation's 345-Fr slice.
function decodeAndReduce(bytes: Uint8Array, numPairs: number, outLen: number): bigint[] {
  const perEdge: bigint[][] = [];
  for (let i = 0; i < numPairs; i++) {
    const row: bigint[] = [];
    for (let k = 0; k < outLen; k++) row.push(fromMont(le32ToBi(bytes, (i * outLen + k) * 32)));
    perEdge.push(row);
  }
  return reduceEdges(perEdge, outLen);
}

// CPU reference accumulate one relation over canonical columns -> its slice.
function cpuRelationSlice(desc: RelationDescriptor, cols: bigint[][], params: bigint[], gs: GateSeparatorPolynomial): bigint[] {
  const pairs = cols[0].length >> 1;
  const perEdge: bigint[][] = [];
  for (let p = 0; p < pairs; p++) {
    perEdge.push(desc.polyRef(cols.map(c => [c[2 * p], c[2 * p + 1]]), gs.edgeScaling(p), params));
  }
  return reduceEdges(perEdge, desc.outLen);
}

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const d = Math.round(Math.log2(n));
  if (1 << d !== n) { log('err', '  rounds: n must be a power of 2'); return false; }
  if (d < 1) { log('err', '  rounds: need n >= 2'); return false; }

  const alpha = makeRng(0xa1fa_5eed_77n)();
  const betaRng = makeRng(0xbe7a_5eed_77n);
  const betas = Array.from({ length: d }, () => betaRng());
  const chRng = makeRng(0xc4a1_1e6e_77n);
  const challenges = Array.from({ length: d }, () => chRng());

  // Independent random columns + fixed relation_parameters per relation.
  const initCols: bigint[][][] = [];
  const paramsByRel: bigint[][] = [];
  const relParamBytes: (Uint8Array | undefined)[] = [];
  for (const desc of ALL_RELATIONS) {
    const rng = makeRng(desc.seed ^ 0x5151_5151_5151n);
    const params = desc.makeParams ? desc.makeParams(rng) : [];
    paramsByRel[desc.relationIndex] = params;
    relParamBytes[desc.relationIndex] = desc.makeParams ? packParams(params) : undefined;
    initCols[desc.relationIndex] = Array.from({ length: desc.numEdges }, () => Array.from({ length: n }, () => rng()));
  }

  const FULL_DIFF = n <= 1 << 10;
  const relCache: PipelineCache = new Map();
  const foldRunner = await makeFoldRunner(device);

  // Encode each relation's columns to column-major Montgomery bytes ONCE; these
  // stay GPU-resident (as the fold kernel's input/output) across all rounds.
  const colBytes: Uint8Array[] = [];
  for (const desc of ALL_RELATIONS) {
    const ne = desc.numEdges;
    const buf = new Uint8Array(ne * n * 32);
    const cols = initCols[desc.relationIndex];
    for (let j = 0; j < ne; j++) for (let i = 0; i < n; i++) writeLe32(buf, (j * n + i) * 32, toMont(cols[j][i]));
    colBytes[desc.relationIndex] = buf;
  }

  // ---- GPU run: resident-byte accumulate + GPU fold, through the shared driver ----
  let curLen = n;
  let totalMs = 0;
  const gpu = await runSumcheckRounds(betas, d, {
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
        const { bytes, ms } = await dispatchRelation(device, pairs, desc.shader(), desc.entry, inB, desc.outLen, relParamBytes[r], relCache);
        totalMs += ms;
        slices[r] = decodeAndReduce(bytes, pairs, desc.outLen);
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

  // (1) per-round GPU vs canonical CPU round univariate — full-fidelity, small n.
  if (FULL_DIFF) {
    const cpuCols = initCols.map(rcols => rcols.map(c => c.slice()));
    const cpu = await runSumcheckRounds(betas, d, {
      numRounds: d,
      challenges,
      accumulate: (_round, gs) => {
        const slices: (bigint[] | null)[] = new Array(NUM_RELATIONS).fill(null);
        for (const desc of ALL_RELATIONS) {
          slices[desc.relationIndex] = cpuRelationSlice(desc, cpuCols[desc.relationIndex], paramsByRel[desc.relationIndex], gs);
        }
        return assembleAccumulator(slices);
      },
      roundUnivariate: (acc, gs) => gs.roundUnivariate(acc, alpha),
      fold: (_round, u) => { for (let r = 0; r < NUM_RELATIONS; r++) cpuCols[r] = cpuCols[r].map(c => cpuFold(c, u)); },
    });
    for (let i = 0; i < d; i++) {
      for (let k = 0; k < gpu.univariates[i].length; k++) {
        if (gpu.univariates[i][k] !== cpu.univariates[i][k]) {
          log('err', `  round ${i} ✗  k=${k} gpu=${gpu.univariates[i][k]} cpu=${cpu.univariates[i][k]}`);
          return false;
        }
      }
    }
    log('ok', `  accumulate ✓  GPU round univariate matches CPU (all 8 evals) every round (${totalMs.toFixed(1)} ms GPU)`);
  } else {
    log('info', `  accumulate · per-edge CPU diff skipped for n=${n} (anchored by telescoping + purported); ${totalMs.toFixed(1)} ms GPU`);
  }

  // (2) telescoping over the GPU univariates — a fold/chaining error breaks this.
  const tel = checkTelescoping(gpu.univariates, gpu.challenges);
  if (!tel.ok) {
    const f = tel.failures[0];
    log('err', `  telescoping ✗  round ${f.round}: S(0)+S(1)=${f.got} != prev S(u)=${f.expected}`);
    return false;
  }
  log('ok', `  telescoping ✓  S^i(0)+S^i(1) == S^{i-1}(u) for all ${d - 1} steps`);

  // (3) absolute anchor: final round univariate at u_{d-1} == purported value at
  // the fully folded point. colBytes are now length 1 (the multilinear evals).
  let cd = 1n;
  for (let k = 0; k < d; k++) cd = mul(cd, add(mod(1n - challenges[k]), mul(challenges[k], betas[k])));
  const finalSlices: bigint[][] = [];
  for (const desc of ALL_RELATIONS) {
    const r = desc.relationIndex;
    const mle = Array.from({ length: desc.numEdges }, (_, j) => {
      const v = fromMont(le32ToBi(colBytes[r], j * 32)); // column j, row 0 (only row left)
      return [v, v] as bigint[];
    });
    finalSlices[r] = desc.polyRef(mle, 1n, paramsByRel[r]);
  }
  let purported = 0n;
  let alphaPow = 1n;
  for (let g = 0; g < NUM_SUBRELATIONS; g++) {
    if (g > 0) alphaPow = mul(alphaPow, alpha);
    purported = add(purported, mul(mul(alphaPow, SUBREL_LIN_INDEP[g] ? cd : 1n), finalSlices[subrelRelIdx[g]][subrelLocalFr[g]]));
  }
  const finalAtU = evaluateUnivariate(gpu.univariates[d - 1], challenges[d - 1]);
  if (finalAtU !== purported) {
    log('err', `  purported ✗  S^{d-1}(u)=${finalAtU} != F(u)=${purported}`);
    return false;
  }
  log('ok', `  purported ✓  S^{d-1}(u_{d-1}) == batched relation at the folded point`);
  log('info', `    rounds=${d}  S^0(0..7)=[${gpu.univariates[0].map(x => '0x' + x.toString(16).slice(0, 8)).join(', ')}]`);
  return true;
}

export const roundsSuite: Suite = { id: 'rounds', label: 'Multi-round sumcheck (GPU)', run };
