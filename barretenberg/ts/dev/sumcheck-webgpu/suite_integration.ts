// Suite: end-to-end sumcheck round univariate (Phase 2 integration).
//
// Drives all 14 relation isolation kernels through the full CPU tail on real GPU
// output: for each relation, draw its relation_parameters, build edges with
// per-edge scaling = gate separator edgeScaling(j), dispatch, decode, sum over
// edges (reduceEdges) into the relation's 345-Fr slice; assemble all slices, then
// reduce to the length-8 round univariate via GateSeparatorPolynomial +
// batch_over_relations. The GPU-derived result is diffed against the same
// pipeline fed by the polynomial references (the C++-mirror goldens), with
// per-relation slice diffs for localization.
//
// Each relation uses its own random edges — this validates the GPU->reduce->
// assemble->tail plumbing and the gate-separator wiring, not a shared execution
// trace. Round 0 (periodicity 2, c_i = 1); the c_i/later-round paths are covered
// by the no-GPU gate_separator tests.

import { GateSeparatorPolynomial } from '../../src/msm_webgpu/gate_separator.js';
import {
  NUM_RELATIONS, assembleAccumulator, reduceEdges,
} from '../../src/msm_webgpu/accumulator.js';
import { ALL_RELATIONS } from './descriptors.js';
import {
  type Suite, type SuiteCtx,
  WG, makeRng, dispatchRelation, packEdgeRows, packParams, fromMont, le32ToBi,
} from './harness.js';

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const alpha = makeRng(0xa1fa_5eed_01n)();
  // Round 0: periodicity 2, c_i = 1. Need beta_products length >= 2n, so 2^d >= 2n.
  const d = Math.ceil(Math.log2(n)) + 1;
  const betaRng = makeRng(0xbe7a_5eed_01n);
  const betas = Array.from({ length: d }, () => betaRng());
  const gs = new GateSeparatorPolynomial(betas, d);

  const gpuSlices: (bigint[] | null)[] = new Array(NUM_RELATIONS).fill(null);
  const refSlices: (bigint[] | null)[] = new Array(NUM_RELATIONS).fill(null);
  let totalMs = 0;

  for (const desc of ALL_RELATIONS) {
    const rng = makeRng(desc.seed);
    const params = desc.makeParams ? desc.makeParams(rng) : [];
    const relParams = desc.makeParams ? packParams(params) : undefined;
    const { inBytes, inputs } = packEdgeRows(n, desc.inLen, desc.numEdges, i => {
      const row = desc.build(rng, i);
      return { e: row.e, s: gs.edgeScaling(i) }; // per-edge gate-separator scaling
    });
    const { bytes, ms } = await dispatchRelation(device, n, desc.shader(), desc.entry, inBytes, desc.outLen, relParams);
    totalMs += ms;

    // Decode the GPU per-edge output and sum over edges into this relation's slice.
    const perEdge: bigint[][] = [];
    for (let i = 0; i < n; i++) {
      const row: bigint[] = [];
      for (let k = 0; k < desc.outLen; k++) row.push(fromMont(le32ToBi(bytes, (i * desc.outLen + k) * 32)));
      perEdge.push(row);
    }
    const gpuSlice = reduceEdges(perEdge, desc.outLen);
    const refSlice = reduceEdges(inputs.map(inp => desc.polyRef(inp.e, inp.s, params)), desc.outLen);

    let mism = 0;
    let first = '';
    for (let k = 0; k < desc.outLen; k++) {
      if (gpuSlice[k] !== refSlice[k]) { mism++; if (mism <= 3) first += `\n    ${desc.id} slice[${k}] got=${gpuSlice[k]} want=${refSlice[k]}`; }
    }
    if (mism > 0) { log('err', `  ${desc.id.padEnd(12)} ✗  ${mism}/${desc.outLen} slice MISMATCH${first}`); return false; }
    log('ok', `  ${desc.id.padEnd(12)} ✓  slice reduced (${ms.toFixed(1)} ms)`);

    gpuSlices[desc.relationIndex] = gpuSlice;
    refSlices[desc.relationIndex] = refSlice;
  }

  // Assemble the flat 345-Fr accumulators and reduce to the length-8 round univariate.
  const gpuRU = gs.roundUnivariate(assembleAccumulator(gpuSlices), alpha);
  const refRU = gs.roundUnivariate(assembleAccumulator(refSlices), alpha);

  for (let k = 0; k < gpuRU.length; k++) {
    if (gpuRU[k] !== refRU[k]) {
      log('err', `  round univariate ✗  k=${k} got=${gpuRU[k]} want=${refRU[k]}`);
      return false;
    }
  }
  log('ok', `  round univariate ✓  length-${gpuRU.length} over all ${ALL_RELATIONS.length} relations  (${totalMs.toFixed(1)} ms GPU)`);
  log('info', `    S(0..7) = [${gpuRU.map(x => '0x' + x.toString(16).slice(0, 10)).join(', ')}]`);
  return true;
}

export const integrationSuite: Suite = { id: 'integration', label: 'Integration (round univariate)', run };
