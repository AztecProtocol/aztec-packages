// Pure-CPU MegaFlavor (non-ZK) sumcheck reference — the independent ground truth
// for the GPU engines. It runs the same per-relation polyRef accumulate + gate-
// separator batch + fold as the GPU pipeline, in canonical bigint, and returns the
// per-round length-8 univariates. Shared by the singlesubmit suite (small-n diff)
// and the benchmark's three-way correctness cross-check.

import { runSumcheckRounds } from '../../src/msm_webgpu/multiround.js';
import { GateSeparatorPolynomial } from '../../src/msm_webgpu/gate_separator.js';
import { NUM_RELATIONS, assembleAccumulator, reduceEdges } from '../../src/msm_webgpu/accumulator.js';
import { fold as cpuFold } from '../../src/msm_webgpu/fold.js';
import { ALL_RELATIONS } from './descriptors.js';
import { type RelationDescriptor } from './harness.js';

/**
 * One relation's contribution to the flat 345-Fr accumulator: polyRef on each edge
 * pair (with this round's gate-separator edge scaling folded in) reduced over edges.
 */
function cpuRelationSlice(
  desc: RelationDescriptor,
  cols: bigint[][],
  params: bigint[],
  gs: GateSeparatorPolynomial,
): bigint[] {
  const pairs = cols[0].length >> 1;
  const perEdge: bigint[][] = [];
  for (let p = 0; p < pairs; p++) {
    perEdge.push(desc.polyRef(cols.map(c => [c[2 * p], c[2 * p + 1]]), gs.edgeScaling(p), params));
  }
  return reduceEdges(perEdge, desc.outLen);
}

/**
 * Compute the d round univariates of the full MegaFlavor (non-ZK) sumcheck purely
 * on the CPU, folding `initCols` at the supplied `challenges` each round. Inputs are
 * indexed by relationIndex: `initCols[r]` is that relation's edges (each length n),
 * `paramsByRel[r]` its relation_parameters. `alpha` is the subrelation separator;
 * `betas` the gate-separator challenges. d is taken from `challenges.length`.
 */
export async function cpuReferenceUnivariates(
  initCols: bigint[][][],
  paramsByRel: bigint[][],
  betas: bigint[],
  alpha: bigint,
  challenges: bigint[],
): Promise<bigint[][]> {
  const d = challenges.length;
  const cpuCols = initCols.map(rcols => rcols.map(c => c.slice()));
  const { univariates } = await runSumcheckRounds(betas, d, {
    numRounds: d,
    challenges,
    accumulate: (_round, gs) => {
      const slices: (bigint[] | null)[] = new Array(NUM_RELATIONS).fill(null);
      for (const desc of ALL_RELATIONS) {
        slices[desc.relationIndex] = cpuRelationSlice(
          desc,
          cpuCols[desc.relationIndex],
          paramsByRel[desc.relationIndex],
          gs,
        );
      }
      return assembleAccumulator(slices);
    },
    roundUnivariate: (acc, gs) => gs.roundUnivariate(acc, alpha),
    fold: (_round, u) => {
      for (let r = 0; r < NUM_RELATIONS; r++) cpuCols[r] = cpuCols[r].map(c => cpuFold(c, u));
    },
  });
  return univariates;
}
