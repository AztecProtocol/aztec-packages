// Suite: fully GPU-resident single-command-buffer sumcheck with on-GPU Fiat-Shamir
// (engine in single_submit.ts). The challenges are DERIVED ON THE GPU (Poseidon2
// transcript), not precomputed — so this validates the whole chain end to end:
//
//   (1) telescoping over the GPU univariates and GPU-derived challenges;
//   (2) the absolute purported anchor at the GPU-derived final challenge;
//   (3) [small n] the GPU univariates match a CPU reference folded with the SAME
//       GPU challenges, AND the GPU challenges equal a CPU Poseidon2 re-derivation
//       of the challenge chain from those univariates (confirms GPU Fiat-Shamir).

import { checkTelescoping, evaluateUnivariate } from '../../src/msm_webgpu/multiround.js';
import { sumcheckRoundChallenge, SUMCHECK_TRANSCRIPT_SEED } from '../../src/msm_webgpu/cuzk/poseidon2_cpu.js';
import { RELATION_ACC_OFFSET, RELATION_NAMES } from '../../src/msm_webgpu/accumulator.js';
import {
  SUBREL_START, SUBREL_LIN_INDEP, SUBREL_RELATION, NUM_SUBRELATIONS,
} from '../../src/msm_webgpu/batch_tail.js';
import { ALL_RELATIONS } from './descriptors.js';
import { encodeColumnsToBytes } from './gpu_pipeline.js';
import { runSingleSubmitSumcheck, buildSharedColumns } from './single_submit.js';
import { cpuReferenceUnivariates } from './cpu_reference.js';
import {
  buildInstance, usedRows, activeRowsByRel, bandByRel,
  REALISTIC_BLOCK_PROFILE, REALISTIC_BAND_PROFILE, REALISTIC_SCATTERED_PROFILE,
} from './sparsity.js';
import {
  type Suite, type SuiteCtx,
  WG, mod, makeRng, packParams, fromMont, le32ToBi,
} from './harness.js';

const add = (a: bigint, b: bigint): bigint => mod(a + b);
const mul = (a: bigint, b: bigint): bigint => mod(a * b);

const subrelRelIdx: number[] = [];
const subrelLocalFr: number[] = [];
for (let g = 0; g < NUM_SUBRELATIONS; g++) {
  const name = SUBREL_RELATION[g].slice(0, SUBREL_RELATION[g].indexOf('['));
  const r = RELATION_NAMES.indexOf(name);
  subrelRelIdx.push(r);
  subrelLocalFr.push(SUBREL_START[g] - RELATION_ACC_OFFSET[r]);
}

// `useShared` runs the engine against the shared 67-entity column set (Idea 1). The
// CPU reference then reads each relation's columns by gathering them from the one shared
// witness via globalEntityIndices — exactly what the GPU's entity_map does — so the same
// three checks validate the shared path end to end.
async function validateOnce({ device, n, log }: SuiteCtx, useShared: boolean): Promise<boolean> {
  const tag = useShared ? 'shared' : 'per-rel';
  const d = Math.round(Math.log2(n));
  if (1 << d !== n) { log('err', '  singlesubmit: n must be a power of 2'); return false; }
  if (d < 1) { log('err', '  singlesubmit: need n >= 2'); return false; }

  const alpha = makeRng(0xa1fa_5eed_77n)();
  const betaRng = makeRng(0xbe7a_5eed_77n);
  const betas = Array.from({ length: d }, () => betaRng());

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
  const initColBytes: Uint8Array[] = [];
  for (const desc of ALL_RELATIONS) initColBytes[desc.relationIndex] = encodeColumnsToBytes(initCols[desc.relationIndex], n);

  // Shared mode: one 67-entity witness; each relation's CPU-reference columns are the
  // gathered slice of it, replacing the relation's independent random columns.
  let sharedColBytes: Uint8Array | undefined;
  if (useShared) {
    const sc = buildSharedColumns(n, 0x5ba7ed_c01c01n);
    sharedColBytes = sc.sharedColBytes;
    for (const desc of ALL_RELATIONS) initCols[desc.relationIndex] = desc.globalEntityIndices.map(g => sc.sharedCols[g]);
  }

  const gpu = await runSingleSubmitSumcheck(
    device, n, alpha, betas, relParamBytes, initColBytes,
    useShared ? { sharedColumns: true, sharedColBytes } : undefined,
  );
  const ch = gpu.challenges;

  // (3) small n: GPU univariates match CPU folded with the SAME GPU challenges, and
  // the GPU challenges equal a CPU Poseidon2 re-derivation from those univariates.
  const FULL_DIFF = n <= 1 << 10;
  if (FULL_DIFF) {
    const cpuUnivariates = await cpuReferenceUnivariates(initCols, paramsByRel, betas, alpha, ch);
    for (let i = 0; i < d; i++) {
      for (let k = 0; k < gpu.univariates[i].length; k++) {
        if (gpu.univariates[i][k] !== cpuUnivariates[i][k]) {
          log('err', `  round ${i} ✗  k=${k} gpu=${gpu.univariates[i][k]} cpu=${cpuUnivariates[i][k]}`);
          return false;
        }
      }
    }
    // Re-derive the Fiat-Shamir chain on the CPU from the (now matching) univariates.
    let running = SUMCHECK_TRANSCRIPT_SEED;
    for (let i = 0; i < d; i++) {
      const { challenge, nextRunning } = sumcheckRoundChallenge(running, gpu.univariates[i]);
      if (challenge !== ch[i]) {
        log('err', `  fiat-shamir ✗  round ${i}: gpu u=${ch[i]} != cpu Poseidon2 u=${challenge}`);
        return false;
      }
      running = nextRunning;
    }
    log('ok', `  [${tag}] accumulate+batch+fold+Fiat-Shamir ✓  GPU == CPU every round (${gpu.gpuMs.toFixed(1)} ms GPU)`);
  } else {
    log('info', `  [${tag}] CPU diff skipped for n=${n} (anchored by telescoping + purported); ${gpu.gpuMs.toFixed(1)} ms GPU`);
  }

  // (1) telescoping over the GPU univariates + GPU-derived challenges.
  const tel = checkTelescoping(gpu.univariates, ch);
  if (!tel.ok) {
    const f = tel.failures[0];
    log('err', `  telescoping ✗  round ${f.round}: S(0)+S(1)=${f.got} != prev S(u)=${f.expected}`);
    return false;
  }
  log('ok', `  [${tag}] telescoping ✓  S^i(0)+S^i(1) == S^{i-1}(u) for all ${d - 1} steps`);

  // (2) absolute anchor at the GPU final challenge.
  let cd = 1n;
  for (let k = 0; k < d; k++) cd = mul(cd, add(mod(1n - ch[k]), mul(ch[k], betas[k])));
  const finalSlices: bigint[][] = [];
  for (const desc of ALL_RELATIONS) {
    const r = desc.relationIndex;
    const mle = Array.from({ length: desc.numEdges }, (_, j) => {
      const v = fromMont(le32ToBi(gpu.finalColBytes[r], j * 32));
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
  const finalAtU = evaluateUnivariate(gpu.univariates[d - 1], ch[d - 1]);
  if (finalAtU !== purported) {
    log('err', `  purported ✗  S^{d-1}(u)=${finalAtU} != F(u)=${purported}`);
    return false;
  }
  log('ok', `  [${tag}] purported ✓  S^{d-1}(u_{d-1}) == batched relation at the folded point`);
  log('info', `    [${tag}] rounds=${d}  GPU ${gpu.gpuMs.toFixed(1)} ms · wall ${gpu.totalMs.toFixed(1)} ms · setup ${gpu.setupMs.toFixed(1)} ms`);

  // (4) Skipping is a pure performance optimization for the single-submission engine
  // too. On the SAME sparse instance, skip-ON (Tier 0 trim + Tier 1 per-edge skip) must
  // produce bit-identical univariates AND GPU-derived Fiat-Shamir challenges to skip-OFF
  // — the challenges are hashed from the univariates, so identical univariates each
  // round force identical challenges, which keeps the next round identical. The skip path
  // exercises the per-relation layout, so validate it once (on the per-relation pass).
  if (!useShared) for (const profile of [REALISTIC_BLOCK_PROFILE, REALISTIC_BAND_PROFILE, REALISTIC_SCATTERED_PROFILE]) {
    const inst = buildInstance(n, profile, false);
    const L = usedRows(profile, n);
    const off = await runSingleSubmitSumcheck(device, n, alpha, betas, inst.relParamBytes, inst.initColBytes);
    const on = await runSingleSubmitSumcheck(
      device, n, alpha, betas, inst.relParamBytes, inst.initColBytes, undefined, WG, false, undefined, true, L, activeRowsByRel(profile, n), bandByRel(profile, n),
    );
    for (let i = 0; i < d; i++) {
      if (off.challenges[i] !== on.challenges[i]) {
        log('err', `  skip ✗  [${profile.name}] round ${i}: skip-off challenge ${off.challenges[i]} != skip-on ${on.challenges[i]}`);
        return false;
      }
      for (let k = 0; k < off.univariates[i].length; k++) {
        if (off.univariates[i][k] !== on.univariates[i][k]) {
          log('err', `  skip ✗  [${profile.name}] round ${i} k=${k}: skip-off ${off.univariates[i][k]} != skip-on ${on.univariates[i][k]}`);
          return false;
        }
      }
    }
    log('ok', `  skip ✓  [${profile.name}] skip-ON == skip-OFF univariates + GPU challenges (all ${d} rounds) · used ${L}/${n}`);

    // Fused gate "uber" dispatch (band profile only): must be bit-identical to the
    // per-relation single-submission result (univariates + GPU-derived challenges).
    if (profile.name === REALISTIC_BAND_PROFILE.name) {
      const uber = await runSingleSubmitSumcheck(
        device, n, alpha, betas, inst.relParamBytes, inst.initColBytes, undefined, WG, false, undefined,
        true, L, activeRowsByRel(profile, n), bandByRel(profile, n), 'uber',
      );
      for (let i = 0; i < d; i++) {
        if (off.challenges[i] !== uber.challenges[i]) {
          log('err', `  uber ✗  [${profile.name}] round ${i}: per-relation challenge ${off.challenges[i]} != uber ${uber.challenges[i]}`);
          return false;
        }
        for (let k = 0; k < off.univariates[i].length; k++) {
          if (off.univariates[i][k] !== uber.univariates[i][k]) {
            log('err', `  uber ✗  [${profile.name}] round ${i} k=${k}: per-relation ${off.univariates[i][k]} != uber ${uber.univariates[i][k]}`);
            return false;
          }
        }
      }
      log('ok', `  uber ✓  [${profile.name}] fused-gate dispatch == per-relation (univariates + GPU challenges, all ${d} rounds)`);
    }
  }
  return true;
}

// Validate both the per-relation engine and the shared 67-entity column engine (Idea 1).
async function run(ctx: SuiteCtx): Promise<boolean> {
  const perRel = await validateOnce(ctx, false);
  if (!perRel) return false;
  return validateOnce(ctx, true);
}

export const singleSubmitSuite: Suite = { id: 'singlesubmit', label: 'Single-submission sumcheck (GPU Fiat-Shamir)', run };
