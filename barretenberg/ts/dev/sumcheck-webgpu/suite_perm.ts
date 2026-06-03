// Suite: MegaFlavor UltraPermutationRelation accumulate. The 12-Fr per-edge
// contribution (6 + 3 + 3) is diffed against a polynomial reference of
// permutation_relation.hpp. beta/gamma/public_input_delta are passed via the
// binding(3) params buffer. Row 0 forces z_perm_shift = z_perm (skip path).

import {
  type Suite, type SuiteCtx,
  WG, sm, makeRng, dispatchRelation, diffRelation, packEdgeRows, packParams,
  pMul, pAdd, pSub, pScale, pAddC, edgePoly, evalSet,
} from './harness.js';

const NUM_EDGES = 16; // w_l/r/o/4, id_1..4, sigma_1..4, z_perm, z_perm_shift, lagrange_first, lagrange_last
const IN_LEN = 33;
const OUT_LEN = 12;

function polyRef(e: bigint[][], scaling: bigint, beta: bigint, gamma: bigint, pid: bigint): bigint[] {
  const E = e.map(([a, b]) => edgePoly(a, b));
  const [w1, w2, w3, w4, id1, id2, id3, id4, s1, s2, s3, s4, zp, zps, lf, ll] = E;
  const wg = [pAddC(w1, gamma), pAddC(w2, gamma), pAddC(w3, gamma), pAddC(w4, gamma)];
  const fac = (ent: bigint[], w: bigint[]): bigint[] => pAdd(pScale(ent, beta), w);
  const t1 = pScale(fac(id1, wg[0]), scaling), t2 = fac(id2, wg[1]), t3 = fac(id3, wg[2]), t4 = fac(id4, wg[3]);
  const t5 = pScale(fac(s1, wg[0]), scaling), t6 = fac(s2, wg[1]), t7 = fac(s3, wg[2]), t8 = fac(s4, wg[3]);
  const num = pMul(pMul(pMul(t1, t2), t3), t4);
  const den = pMul(pMul(pMul(t5, t6), t7), t8);
  const sub0 = evalSet(pSub(pMul(pAdd(zp, lf), num), pMul(pAdd(pScale(ll, pid), zps), den)), 6);
  const sub1 = evalSet(pScale(pMul(ll, zps), scaling), 3);
  const sub2 = evalSet(pScale(pMul(lf, zp), scaling), 3);
  return [...sub0, ...sub1, ...sub2];
}

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0x9e1d77abcd001234n);
  const beta = rng(), gamma = rng(), pid = rng();
  const { inBytes, inputs } = packEdgeRows(n, IN_LEN, NUM_EDGES, i => {
    const e = Array.from({ length: NUM_EDGES }, () => [rng(), rng()]);
    if (i === 0) e[13] = [e[12][0], e[12][1]]; // z_perm_shift = z_perm (skip path)
    return { e, s: rng() };
  });
  const code = sm.gen_permutation_relation_test_shader(WG);
  const { bytes, ms } = await dispatchRelation(device, n, code, 'permutation_main', inBytes, OUT_LEN, packParams([beta, gamma, pid]));
  return diffRelation(bytes, n, OUT_LEN, i => polyRef(inputs[i].e, inputs[i].s, beta, gamma, pid), log, 'permutation', ms);
}

export const permSuite: Suite = { id: 'perm', label: 'UltraPerm', run };
