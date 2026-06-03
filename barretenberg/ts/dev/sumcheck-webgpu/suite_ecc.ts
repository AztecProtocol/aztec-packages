// Suite: MegaFlavor EccOpQueueRelation accumulate. The 24-Fr per-edge
// contribution (8 subrelations x 3) is diffed against a polynomial reference of
// ecc_op_queue_relation.hpp. Row 0 forces lagrange_ecc_op = 0 (off-domain path).

import {
  type Suite, type SuiteCtx,
  WG, sm, makeRng, dispatchRelation, diffRelation, packEdgeRows,
  pMul, pSub, pScale, pAddC, pNeg, edgePoly, evalSet,
} from './harness.js';

const NUM_EDGES = 9; // w_l/r/o/4_shift, ecc_op_wire_1..4, lagrange_ecc_op
const IN_LEN = 19;
const OUT_LEN = 24;

function polyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [w1s, w2s, w3s, w4s, op1, op2, op3, op4, lecc] = e.map(([a, b]) => edgePoly(a, b));
  const lbs = pScale(lecc, scaling); // lagrange_by_scaling
  const comp = pAddC(pNeg(lbs), scaling); // scaling*(1 - lagrange_ecc_op)
  const out: bigint[] = [];
  // (1-4) op_wire_i - w_i_shift, on the ecc-op domain
  for (const [op, ws] of [[op1, w1s], [op2, w2s], [op3, w3s], [op4, w4s]]) {
    out.push(...evalSet(pMul(pSub(op, ws), lbs), 3));
  }
  // (5-8) op_wire_i vanishes off it
  for (const op of [op1, op2, op3, op4]) {
    out.push(...evalSet(pMul(op, comp), 3));
  }
  return out;
}

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0xecc0a13573571100n);
  const { inBytes, inputs } = packEdgeRows(n, IN_LEN, NUM_EDGES, i => {
    const e = Array.from({ length: NUM_EDGES }, () => [rng(), rng()]);
    if (i === 0) e[8] = [0n, 0n]; // lagrange_ecc_op = 0 (off-domain path)
    return { e, s: rng() };
  });
  const code = sm.gen_ecc_op_queue_relation_test_shader(WG);
  const { bytes, ms } = await dispatchRelation(device, n, code, 'ecc_op_queue_main', inBytes, OUT_LEN);
  return diffRelation(bytes, n, OUT_LEN, i => polyRef(inputs[i].e, inputs[i].s), log, 'ecc_op_queue', ms);
}

export const eccSuite: Suite = { id: 'ecc', label: 'EccOpQueue', run };
