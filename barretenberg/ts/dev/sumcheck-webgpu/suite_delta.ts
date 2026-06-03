// Suite: MegaFlavor DeltaRangeConstraintRelation accumulate. The 24-Fr per-edge
// contribution (4 subrelations x 6) is diffed against a polynomial reference of
// delta_range_constraint_relation.hpp. Row 0 forces q_delta_range = 0 (skip path).

import {
  type Suite, type SuiteCtx,
  WG, sm, makeRng, dispatchRelation, diffRelation, packEdgeRows,
  pMul, pSub, pScale, pAddC, pSubC, edgePoly, evalSet,
} from './harness.js';

const NUM_EDGES = 6; // w_l, w_r, w_o, w_4, w_l_shift, q_delta_range
const IN_LEN = 13;
const OUT_LEN = 24;

function polyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [w_l, w_r, w_o, w_4, w_ls, q_dr] = e.map(([a, b]) => edgePoly(a, b));
  const qs = pScale(q_dr, scaling);
  const out: bigint[] = [];
  for (const d of [pSub(w_r, w_l), pSub(w_o, w_r), pSub(w_4, w_o), pSub(w_ls, w_4)]) {
    const t = pMul(pSubC(d, 3n), d); // (D-3)*D
    out.push(...evalSet(pMul(pMul(t, pAddC(t, 2n)), qs), 6)); // T*(T+2)*q_scaled
  }
  return out;
}

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0xde17a9a9c0ffee01n);
  const { inBytes, inputs } = packEdgeRows(n, IN_LEN, NUM_EDGES, i => {
    const e = Array.from({ length: NUM_EDGES }, () => [rng(), rng()]);
    if (i === 0) e[5] = [0n, 0n]; // q_delta_range = 0 (skip path)
    return { e, s: rng() };
  });
  const code = sm.gen_delta_range_relation_test_shader(WG);
  const { bytes, ms } = await dispatchRelation(device, n, code, 'delta_range_main', inBytes, OUT_LEN);
  return diffRelation(bytes, n, OUT_LEN, i => polyRef(inputs[i].e, inputs[i].s), log, 'delta_range', ms);
}

export const deltaSuite: Suite = { id: 'delta', label: 'DeltaRange', run };
