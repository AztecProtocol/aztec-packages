// Suite: MegaFlavor Poseidon2QuadInternalRelation accumulate. The 28-Fr per-edge
// contribution (4 subrelations x 7) is diffed against a polynomial reference of
// poseidon2_quad_internal_relation.hpp using closed_form[0] and
// forward_vandermonde_lhs (cuzk/poseidon2_quad_consts.ts). Row 0 forces q_sel = 0.

import {
  type Suite, type SuiteCtx, type Poly,
  WG, sm, P, makeRng, dispatchRelation, diffRelation, packEdgeRows,
  pMul, pAdd, pSub, pScale, edgePoly, evalSet,
} from './harness.js';
import { poseidon2QuadConsts } from '../../src/msm_webgpu/cuzk/poseidon2_quad_consts.js';

const C = poseidon2QuadConsts(P);
const NUM_EDGES = 16; // w_l/r/o/4, w_l/r/o/4_shift, q_l/r/o/4, q_m, q_c, q_5, q_poseidon2_quad_internal
const IN_LEN = 33;
const OUT_LEN = 28;
const pPow5 = (p: Poly): Poly => pMul(pMul(pMul(pMul(p, p), p), p), p);

function polyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [w_l, w_r, w_o, w_4, w_ls, w_rs, w_os, w_4s, q_l, q_r, q_o, q_4, q_m, q_c, q_5, q_sel] = e.map(([a, b]) => edgePoly(a, b));
  const u0 = pPow5(pAdd(w_l, q_l)), u1 = pPow5(pAdd(w_r, q_r)), u2 = pPow5(pAdd(w_o, q_o)), u3 = pPow5(pAdd(w_4, q_4));
  const u0p = pPow5(pAdd(w_ls, q_m)), u1p = pPow5(pAdd(w_rs, q_c)), u2p = pPow5(pAdd(w_os, q_5));
  const qbs = pScale(q_sel, scaling);
  const cf0 = C.closed_form[0], L = C.forward_vandermonde_lhs;
  const ucomb = (c: bigint[]): Poly => pAdd(pAdd(pAdd(pScale(u0, c[3]), pScale(u1, c[4])), pScale(u2, c[5])), pScale(u3, c[6]));
  const wp0 = pSub(pAdd(pAdd(pScale(w_r, cf0[0]), pScale(w_o, cf0[1])), pScale(w_4, cf0[2])), w_ls);
  const a0 = pAdd(ucomb(cf0), wp0);
  const wp1 = pSub(pAdd(pAdd(pScale(w_r, L[0][0]), pScale(w_o, L[0][1])), pScale(w_4, L[0][2])), w_rs);
  const a1 = pAdd(pAdd(ucomb(L[0]), pScale(u0p, C.D1)), wp1);
  const wp2 = pAdd(pAdd(pSub(pAdd(pAdd(pScale(w_r, L[1][0]), pScale(w_o, L[1][1])), pScale(w_4, L[1][2])), w_os), w_rs), w_rs);
  let a2 = pSub(ucomb(L[1]), pScale(u0p, mod2D1()));
  a2 = pAdd(a2, pScale(u0p, 3n));
  a2 = pAdd(a2, pScale(u1p, C.D1));
  a2 = pAdd(a2, wp2);
  const wp3 = pAdd(pAdd(pSub(pAdd(pAdd(pScale(w_r, L[2][0]), pScale(w_o, L[2][1])), pScale(w_4, L[2][2])), w_4s), w_os), pScale(w_rs, C.SIGMA_PLUS_2));
  let a3 = pSub(ucomb(L[2]), pScale(u0p, C.B3_U0_COEF));
  a3 = pSub(a3, pScale(u1p, C.D1_MINUS_3));
  a3 = pAdd(a3, pScale(u2p, C.D1));
  a3 = pAdd(a3, wp3);
  return [...evalSet(pMul(qbs, a0), 7), ...evalSet(pMul(qbs, a1), 7), ...evalSet(pMul(qbs, a2), 7), ...evalSet(pMul(qbs, a3), 7)];
}
function mod2D1(): bigint { return ((2n * C.D1) % P + P) % P; }

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0x9051d0701a4d0000n);
  const { inBytes, inputs } = packEdgeRows(n, IN_LEN, NUM_EDGES, i => {
    const e = Array.from({ length: NUM_EDGES }, () => [rng(), rng()]);
    if (i === 0) e[15] = [0n, 0n]; // q_sel = 0 (skip path)
    return { e, s: rng() };
  });
  const code = sm.gen_poseidon2_quad_internal_relation_test_shader(WG);
  const { bytes, ms } = await dispatchRelation(device, n, code, 'poseidon2_quad_internal_main', inBytes, OUT_LEN);
  return diffRelation(bytes, n, OUT_LEN, i => polyRef(inputs[i].e, inputs[i].s), log, 'pos2_quad', ms);
}

export const pos2QuadSuite: Suite = { id: 'pos2quad', label: 'Poseidon2Quad', run };
