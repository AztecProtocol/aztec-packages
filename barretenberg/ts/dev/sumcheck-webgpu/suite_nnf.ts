// Suite: MegaFlavor NonNativeFieldRelation accumulate. The 6-Fr per-edge
// contribution is diffed against a polynomial reference of
// non_native_field_relation.hpp. Row 0 forces q_nnf = 0 (skip path).

import {
  type Suite, type SuiteCtx, type Poly,
  WG, sm, mod, makeRng, dispatchRelation, diffRelation, packEdgeRows,
  pMul, pAdd, pSub, pScale, edgePoly, evalSet,
} from './harness.js';

const NUM_EDGES = 13; // w_l/r/o/4, w_l/r/o/4_shift, q_r, q_o, q_4, q_m, q_nnf
const IN_LEN = 27;
const OUT_LEN = 6;
const LIMB = mod(1n << 68n);
const SUB = mod(1n << 14n);

function polyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [w1, w2, w3, w4, w1s, w2s, w3s, w4s, q2, q3, q4, qm, qnnf] = e.map(([a, b]) => edgePoly(a, b));
  const lsp = pAdd(pMul(w1, w2s), pMul(w1s, w2));
  let g2 = pSub(pAdd(pMul(w1, w4), pMul(w2, w3)), w3s);
  g2 = pScale(g2, LIMB); g2 = pSub(g2, w4s); g2 = pAdd(g2, lsp);
  const ng2 = pMul(g2, q4);
  const lsp2 = pAdd(pScale(lsp, LIMB), pMul(w1s, w2s));
  const ng1 = pMul(pSub(lsp2, pAdd(w3, w4)), q3);
  const ng3 = pMul(pSub(pAdd(lsp2, w4), pAdd(w3s, w4s)), qm);
  const nfid = pMul(pAdd(pAdd(ng1, ng2), ng3), q2);
  const horner = (a: Poly[]): Poly => {
    let acc = pScale(a[0], SUB);
    for (let i = 1; i < 4; i++) { acc = pAdd(acc, a[i]); acc = pScale(acc, SUB); }
    return pAdd(acc, a[4]);
  };
  const la1f = pMul(pSub(horner([w2s, w1s, w3, w2, w1]), w4), q4);
  const la2f = pMul(pSub(horner([w3s, w2s, w1s, w4, w3]), w4s), qm);
  const laid = pMul(pAdd(la1f, la2f), q3);
  return evalSet(pMul(pAdd(nfid, laid), pScale(qnnf, scaling)), 6);
}

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0x77facade01020304n);
  const { inBytes, inputs } = packEdgeRows(n, IN_LEN, NUM_EDGES, i => {
    const e = Array.from({ length: NUM_EDGES }, () => [rng(), rng()]);
    if (i === 0) e[12] = [0n, 0n]; // q_nnf = 0 (skip path)
    return { e, s: rng() };
  });
  const code = sm.gen_non_native_field_relation_test_shader(WG);
  const { bytes, ms } = await dispatchRelation(device, n, code, 'non_native_field_main', inBytes, OUT_LEN);
  return diffRelation(bytes, n, OUT_LEN, i => polyRef(inputs[i].e, inputs[i].s), log, 'non_native', ms);
}

export const nnfSuite: Suite = { id: 'nnf', label: 'NonNativeField', run };
