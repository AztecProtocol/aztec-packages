// Suite: MegaFlavor Poseidon2TransitionEntryRelation accumulate. The 21-Fr
// per-edge contribution (3 subrelations x 7) is diffed against a polynomial
// reference of poseidon2_transition_entry_relation.hpp. Constants derived in
// cuzk/poseidon2_quad_consts.ts. Row 0 forces q_sel = 0 (skip path).

import {
  type Suite, type SuiteCtx, type Poly,
  WG, sm, P, makeRng, dispatchRelation, diffRelation, packEdgeRows,
  pMul, pAdd, pSub, pScale, edgePoly, evalSet,
} from './harness.js';
import { poseidon2QuadConsts } from '../../src/msm_webgpu/cuzk/poseidon2_quad_consts.js';

const C = poseidon2QuadConsts(P);
const NUM_EDGES = 11; // w_l/r/o/4, w_r/o/4_shift, q_l/r/o, q_poseidon2_transition_entry
const IN_LEN = 23;
const OUT_LEN = 21;
const pPow5 = (p: Poly): Poly => pMul(pMul(pMul(pMul(p, p), p), p), p);

function polyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [w_l, w_r, w_o, w_4, w_rs, w_os, w_4s, q_l, q_r, q_o, q_sel] = e.map(([a, b]) => edgePoly(a, b));
  const u0 = pPow5(pAdd(w_l, q_l)), u1 = pPow5(pAdd(w_rs, q_r)), u2 = pPow5(pAdd(w_os, q_o));
  const qbs = pScale(q_sel, scaling);
  const a0 = pAdd(pScale(u0, C.D1), pSub(pAdd(pAdd(w_r, w_o), w_4), w_rs));
  const a1 = pAdd(pAdd(pScale(u1, C.D1), pScale(u0, 3n)), pSub(pAdd(pAdd(pScale(w_r, C.A_one[0]), pScale(w_o, C.A_one[1])), pScale(w_4, C.A_one[2])), w_os));
  const a2 = pAdd(pAdd(pAdd(pScale(u2, C.D1), pScale(u1, 3n)), pScale(u0, C.sum_A_one)), pSub(pAdd(pAdd(pScale(w_r, C.A2_one[0]), pScale(w_o, C.A2_one[1])), pScale(w_4, C.A2_one[2])), w_4s));
  return [...evalSet(pMul(qbs, a0), 7), ...evalSet(pMul(qbs, a1), 7), ...evalSet(pMul(qbs, a2), 7)];
}

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0x9051d0747a5170n);
  const { inBytes, inputs } = packEdgeRows(n, IN_LEN, NUM_EDGES, i => {
    const e = Array.from({ length: NUM_EDGES }, () => [rng(), rng()]);
    if (i === 0) e[10] = [0n, 0n]; // q_sel = 0 (skip path)
    return { e, s: rng() };
  });
  const code = sm.gen_poseidon2_transition_entry_relation_test_shader(WG);
  const { bytes, ms } = await dispatchRelation(device, n, code, 'poseidon2_transition_entry_main', inBytes, OUT_LEN);
  return diffRelation(bytes, n, OUT_LEN, i => polyRef(inputs[i].e, inputs[i].s), log, 'pos2_trans', ms);
}

export const pos2TransSuite: Suite = { id: 'pos2trans', label: 'Poseidon2Trans', run };
