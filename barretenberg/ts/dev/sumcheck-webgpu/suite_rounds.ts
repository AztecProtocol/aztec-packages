// Suite: multi-round sumcheck on the GPU (Phase 1 + Phase 2 chained), with the
// polynomial columns kept GPU-resident in Montgomery form across all rounds (the
// engine lives in gpu_pipeline.ts; this file is the validation harness).
//
// Each relation uses its own independent random columns (shifts are treated as
// independent columns, not row+1 aliases): a valid synthetic sumcheck instance
// for exercising the chained GPU kernels, not a real execution trace.
//
// Validation: (1) for small n, the GPU round univariate matches a canonical CPU
// reference (polyRef accumulate + CPU fold) on all 8 evals every round (which also
// cross-checks the GPU fold, since the resident bytes must equal toMont(cpuFold)
// each round); (2) the GPU round univariates telescope (S^i(0)+S^i(1) ==
// S^{i-1}(u_{i-1})) — a fold/chaining error breaks this; (3) the final round
// univariate at u_{d-1} equals the purported value at the fully folded point.
// (2)+(3) hold at any n without the per-edge CPU reference.

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
import { runResidentGpuSumcheck, encodeColumnsToBytes } from './gpu_pipeline.js';
import { buildSharedColumns } from './single_submit.js';
import {
  buildInstance, usedRows, activeRowsByRel, compactionPlan, relationsPerRow,
  REALISTIC_BLOCK_PROFILE, REALISTIC_SCATTERED_PROFILE,
} from './sparsity.js';
import {
  type Suite, type SuiteCtx, type RelationDescriptor,
  WG, mod, makeRng, packParams, fromMont, le32ToBi,
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

// CPU reference accumulate one relation over canonical columns -> its slice.
function cpuRelationSlice(desc: RelationDescriptor, cols: bigint[][], params: bigint[], gs: GateSeparatorPolynomial): bigint[] {
  const pairs = cols[0].length >> 1;
  const perEdge: bigint[][] = [];
  for (let p = 0; p < pairs; p++) {
    perEdge.push(desc.polyRef(cols.map(c => [c[2 * p], c[2 * p + 1]]), gs.edgeScaling(p), params));
  }
  return reduceEdges(perEdge, desc.outLen);
}

// `useShared` runs the engine against the shared 67-entity column set (Idea 1). The CPU
// reference then reads each relation's columns by gathering them from the one shared
// witness via globalEntityIndices — exactly what the GPU's entity_map does — so the same
// checks validate the shared multi-pass path end to end.
async function validateOnce({ device, n, log }: SuiteCtx, useShared: boolean): Promise<boolean> {
  const tag = useShared ? 'shared' : 'per-rel';
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

  // Shared mode: one 67-entity witness; each relation's CPU-reference columns are the
  // gathered slice of it, replacing the relation's independent random columns.
  let sharedColBytes: Uint8Array | undefined;
  if (useShared) {
    const sc = buildSharedColumns(n, 0x5ba7ed_c01c01n + BigInt(n));
    sharedColBytes = sc.sharedColBytes;
    for (const desc of ALL_RELATIONS) initCols[desc.relationIndex] = desc.globalEntityIndices.map(g => sc.sharedCols[g]);
  }

  const initColBytes: Uint8Array[] = [];
  for (const desc of ALL_RELATIONS) initColBytes[desc.relationIndex] = encodeColumnsToBytes(initCols[desc.relationIndex], n);

  const gpu = await runResidentGpuSumcheck(
    device, n, alpha, betas, challenges, relParamBytes, initColBytes,
    useShared ? { sharedColumns: true, sharedColBytes } : undefined,
  );

  // (1) per-round GPU vs canonical CPU round univariate — full-fidelity, small n.
  const FULL_DIFF = n <= 1 << 10;
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
    log('ok', `  [${tag}] accumulate ✓  GPU round univariate matches CPU (all 8 evals) every round (${gpu.gpuMs.toFixed(1)} ms GPU)`);
  } else {
    log('info', `  [${tag}] accumulate · per-edge CPU diff skipped for n=${n} (anchored by telescoping + purported); ${gpu.gpuMs.toFixed(1)} ms GPU`);
  }

  // (2) telescoping over the GPU univariates — a fold/chaining error breaks this.
  const tel = checkTelescoping(gpu.univariates, gpu.challenges);
  if (!tel.ok) {
    const f = tel.failures[0];
    log('err', `  telescoping ✗  round ${f.round}: S(0)+S(1)=${f.got} != prev S(u)=${f.expected}`);
    return false;
  }
  log('ok', `  [${tag}] telescoping ✓  S^i(0)+S^i(1) == S^{i-1}(u) for all ${d - 1} steps`);

  // (3) absolute anchor: final round univariate at u_{d-1} == purported value at
  // the fully folded point. finalColBytes are length 1 (the multilinear evals).
  let cd = 1n;
  for (let k = 0; k < d; k++) cd = mul(cd, add(mod(1n - challenges[k]), mul(challenges[k], betas[k])));
  const finalSlices: bigint[][] = [];
  for (const desc of ALL_RELATIONS) {
    const r = desc.relationIndex;
    const mle = Array.from({ length: desc.numEdges }, (_, j) => {
      const v = fromMont(le32ToBi(gpu.finalColBytes[r], j * 32)); // column j, row 0 (only row left)
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
  log('ok', `  [${tag}] purported ✓  S^{d-1}(u_{d-1}) == batched relation at the folded point`);
  log('info', `    [${tag}] rounds=${d}  GPU dispatch ${gpu.gpuMs.toFixed(1)} ms · wall ${gpu.totalMs.toFixed(1)} ms`);
  return true;
}

// Skipping is a pure performance optimization: on the SAME sparse instance, skip-ON
// (Tier 0 effective-size trim + Tier 1 per-edge skip + Tier 2 compaction) must produce
// bit-identical round univariates to skip-OFF (full dense dispatch). This holds exactly
// because an inactive row zeroes ALL of a relation's columns, so its contribution is
// exactly zero whether the row is skipped or fully computed — including permutation/
// logderiv, whose skip() predicate is only zero-implying on a real trace (see sparsity.ts).
// Block exercises whole-workgroup prefix dispatch; scattered exercises Tier-0 trim +
// Tier-2 compaction. Also reports the brief's achieved-vs-ideal relations/row.
async function validateSkip({ device, n, log }: SuiteCtx): Promise<boolean> {
  const d = Math.round(Math.log2(n));
  const alpha = makeRng(0xa1fa_5eed_77n)();
  const betaRng = makeRng(0xbe7a_5eed_77n);
  const betas = Array.from({ length: d }, () => betaRng());
  const chRng = makeRng(0xc4a1_1e6e_77n);
  const challenges = Array.from({ length: d }, () => chRng());
  for (const profile of [REALISTIC_BLOCK_PROFILE, REALISTIC_SCATTERED_PROFILE]) {
    const inst = buildInstance(n, profile, false);
    const L = usedRows(profile, n);
    const off = await runResidentGpuSumcheck(device, n, alpha, betas, challenges, inst.relParamBytes, inst.initColBytes);
    const on = await runResidentGpuSumcheck(
      device, n, alpha, betas, challenges, inst.relParamBytes, inst.initColBytes, undefined, WG, false, undefined,
      true, L, activeRowsByRel(profile, n), compactionPlan(profile, n),
    );
    for (let i = 0; i < d; i++) {
      for (let k = 0; k < off.univariates[i].length; k++) {
        if (off.univariates[i][k] !== on.univariates[i][k]) {
          log('err', `  skip ✗  [${profile.name}] round ${i} k=${k}: skip-off ${off.univariates[i][k]} != skip-on ${on.univariates[i][k]}`);
          return false;
        }
      }
    }
    const tel = checkTelescoping(on.univariates, on.challenges);
    if (!tel.ok) {
      log('err', `  skip ✗  [${profile.name}] telescoping broke under skipping at round ${tel.failures[0].round}`);
      return false;
    }
    const rpr = relationsPerRow(profile, n);
    log('ok', `  skip ✓  [${profile.name}] skip-ON == skip-OFF (all ${d} rounds × 8 evals) + telescopes · used ${L}/${n}`);
    log('info', `    [${profile.name}] round-0 relations/row — achieved ${rpr.achieved.toFixed(2)} vs ideal ${rpr.ideal.toFixed(2)} (dense ${rpr.dense}) · ${rpr.mode}`);
  }
  return true;
}

// Validate the per-relation engine, the shared 67-entity column engine (Idea 1), and
// the skip path (Tier 0/1/2) bit-for-bit against the dense dispatch.
async function run(ctx: SuiteCtx): Promise<boolean> {
  const perRel = await validateOnce(ctx, false);
  if (!perRel) return false;
  if (!(await validateOnce(ctx, true))) return false;
  return validateSkip(ctx);
}

export const roundsSuite: Suite = { id: 'rounds', label: 'Multi-round sumcheck (GPU)', run };
