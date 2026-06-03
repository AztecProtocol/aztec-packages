// Suite: MegaFlavor EllipticRelation accumulate. The 12-Fr per-edge contribution
// (2 subrelations x 6) is diffed against a polynomial reference of
// elliptic_relation.hpp (curve_b = -17, Grumpkin). Row 0 forces q_elliptic = 0
// (skip path). Entity->wire map: x1=w_r, x2=w_l_shift, x3=w_r_shift, y1=w_o,
// y2=w_4_shift, y3=w_o_shift, q_elliptic, q_is_double=q_m, q_sign=q_l.

import {
  type Suite, type SuiteCtx,
  WG, sm, mod, makeRng, dispatchRelation, diffRelation, packEdgeRows,
  pMul, pAdd, pSub, pScale, pSubC, pNeg, edgePoly, evalSet,
} from './harness.js';

const NUM_EDGES = 9;
const IN_LEN = 19;
const OUT_LEN = 12;
const CURVE_B = mod(-17n);

function polyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [x1, x2, x3, y1, y2, y3, q_ell, q_double, q_sign] = e.map(([a, b]) => edgePoly(a, b));
  const x2_sub_x1 = pSub(x2, x1);
  const x1_mul_3 = pScale(x1, 3n);
  const x3_sub_x1 = pSub(x3, x1);
  const x3_plus_two_x1 = pAdd(x3, pScale(x1, 2n));
  const x3_plus_x2_plus_x1 = pAdd(pAdd(x3, x2), x1);
  const y2_sqr = pMul(y2, y2), y1_sqr = pMul(y1, y1), y2_q_sign = pMul(y2, q_sign);
  const q_ell_by_scaling = pScale(q_ell, scaling);
  const q_ell_q_double = pMul(q_ell_by_scaling, q_double);
  const neg_qnd = pSub(q_ell_q_double, q_ell_by_scaling);
  const x_add = pAdd(
    pSub(pMul(x3_plus_x2_plus_x1, pMul(x2_sub_x1, x2_sub_x1)), pAdd(y2_sqr, y1_sqr)),
    pMul(pScale(y2_q_sign, 2n), y1),
  );
  const x_double = pSub(pMul(x3_plus_two_x1, pScale(y1_sqr, 4n)), pScale(pMul(pSubC(y1_sqr, CURVE_B), x1_mul_3), 3n));
  const sub0 = evalSet(pSub(pMul(x_double, q_ell_q_double), pMul(x_add, neg_qnd)), 6);
  const y1_plus_y3 = pAdd(y1, y3);
  const y_diff = pSub(y2_q_sign, y1);
  const y_add = pAdd(pMul(y1_plus_y3, x2_sub_x1), pMul(x3_sub_x1, y_diff));
  const neg_y_double = pAdd(pMul(pMul(x1_mul_3, x1), x3_sub_x1), pMul(pScale(y1, 2n), y1_plus_y3));
  const sub1 = evalSet(pNeg(pAdd(pMul(y_add, neg_qnd), pMul(neg_y_double, q_ell_q_double))), 6);
  return [...sub0, ...sub1];
}

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0xe11ec0de33445566n);
  const { inBytes, inputs } = packEdgeRows(n, IN_LEN, NUM_EDGES, i => {
    const e = Array.from({ length: NUM_EDGES }, () => [rng(), rng()]);
    if (i === 0) e[6] = [0n, 0n]; // q_elliptic = 0 (skip path)
    return { e, s: rng() };
  });
  const code = sm.gen_elliptic_relation_test_shader(WG);
  const { bytes, ms } = await dispatchRelation(device, n, code, 'elliptic_main', inBytes, OUT_LEN);
  return diffRelation(bytes, n, OUT_LEN, i => polyRef(inputs[i].e, inputs[i].s), log, 'elliptic', ms);
}

export const ellipticSuite: Suite = { id: 'elliptic', label: 'Elliptic', run };
