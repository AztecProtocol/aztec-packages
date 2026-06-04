// Suite: MegaFlavor Poseidon2QuadInternalTerminalRelation accumulate. The 28-Fr
// per-edge contribution (4 subrelations x 7) is diffed against a polynomial
// reference of poseidon2_quad_internal_terminal_relation.hpp using the derived
// closed_form table (cuzk/poseidon2_quad_consts.ts). Row 0 forces q_sel = 0.

import {
  type Suite, type SuiteCtx, type Poly,
  WG, sm, P, makeRng, dispatchRelation, diffRelation, packEdgeRows,
  pMul, pAdd, pSub, pScale, edgePoly, evalSet,
} from './harness.js';
import { poseidon2QuadConsts } from '../../src/msm_webgpu/cuzk/poseidon2_quad_consts.js';

const C = poseidon2QuadConsts(P);
const NUM_EDGES = 13; // w_l/r/o/4, w_l/r/o/4_shift, q_l/r/o/4, q_poseidon2_quad_internal_terminal
const IN_LEN = 27;
const OUT_LEN = 28;
const pPow5 = (p: Poly): Poly => pMul(pMul(pMul(pMul(p, p), p), p), p);

function polyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [w_l, w_r, w_o, w_4, w_ls, w_rs, w_os, w_4s, q_l, q_r, q_o, q_4, q_sel] = e.map(([a, b]) => edgePoly(a, b));
  const u = [pPow5(pAdd(w_l, q_l)), pPow5(pAdd(w_r, q_r)), pPow5(pAdd(w_o, q_o)), pPow5(pAdd(w_4, q_4))];
  const qbs = pScale(q_sel, scaling);
  const shifts = [w_ls, w_rs, w_os, w_4s];
  const out: bigint[] = [];
  for (let j = 0; j < 4; j++) {
    const cf = C.closed_form[j];
    let acc = pScale(u[0], cf[3]);
    acc = pAdd(acc, pScale(u[1], cf[4]));
    acc = pAdd(acc, pScale(u[2], cf[5]));
    acc = pAdd(acc, pScale(u[3], cf[6]));
    const wp = pSub(pAdd(pAdd(pScale(w_r, cf[0]), pScale(w_o, cf[1])), pScale(w_4, cf[2])), shifts[j]);
    out.push(...evalSet(pMul(qbs, pAdd(acc, wp)), 7));
  }
  return out;
}

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0x9051d07e21a10000n);
  const { inBytes, inputs } = packEdgeRows(n, IN_LEN, NUM_EDGES, i => {
    const e = Array.from({ length: NUM_EDGES }, () => [rng(), rng()]);
    if (i === 0) e[12] = [0n, 0n]; // q_sel = 0 (skip path)
    return { e, s: rng() };
  });
  const code = sm.gen_poseidon2_quad_internal_terminal_relation_test_shader(WG);
  const { bytes, ms } = await dispatchRelation(device, n, code, 'poseidon2_quad_internal_terminal_main', inBytes, OUT_LEN);
  return diffRelation(bytes, n, OUT_LEN, i => polyRef(inputs[i].e, inputs[i].s), log, 'pos2_quad_term', ms);
}

export const pos2QuadTermSuite: Suite = { id: 'pos2quadterm', label: 'Poseidon2QuadTerm', run };
