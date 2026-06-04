// Suite: MegaFlavor Poseidon2ExternalRelation accumulate. The 28-Fr per-edge
// contribution (4 subrelations x 7) is diffed against a polynomial reference of
// poseidon2_external_relation.hpp (v = M_E * (w+c)^5, enforcing v = w_shift).
// Round constants are columns; no params buffer. Row 0 forces
// q_poseidon2_external = 0 (skip path).

import {
  type Suite, type SuiteCtx, type Poly,
  WG, sm, makeRng, dispatchRelation, diffRelation, packEdgeRows,
  pMul, pAdd, pSub, pScale, edgePoly, evalSet,
} from './harness.js';

const NUM_EDGES = 13; // w_l/r/o/4, w_l/r/o/4_shift, q_l/r/o/4 (round constants), q_poseidon2_external
const IN_LEN = 27;
const OUT_LEN = 28;

const pPow5 = (p: Poly): Poly => pMul(pMul(pMul(pMul(p, p), p), p), p);

function polyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [w1, w2, w3, w4, w1s, w2s, w3s, w4s, c1, c2, c3, c4, qpe] = e.map(([a, b]) => edgePoly(a, b));
  const u1 = pPow5(pAdd(w1, c1)), u2 = pPow5(pAdd(w2, c2)), u3 = pPow5(pAdd(w3, c3)), u4 = pPow5(pAdd(w4, c4));
  const v1 = pAdd(pAdd(pAdd(pScale(u1, 5n), pScale(u2, 7n)), u3), pScale(u4, 3n));
  const v2 = pAdd(pAdd(pAdd(pScale(u1, 4n), pScale(u2, 6n)), u3), u4);
  const v3 = pAdd(pAdd(pAdd(u1, pScale(u2, 3n)), pScale(u3, 5n)), pScale(u4, 7n));
  const v4 = pAdd(pAdd(pAdd(u1, u2), pScale(u3, 4n)), pScale(u4, 6n));
  const qps = pScale(qpe, scaling);
  const acc = (v: Poly, ws: Poly): bigint[] => evalSet(pMul(qps, pSub(v, ws)), 7);
  return [...acc(v1, w1s), ...acc(v2, w2s), ...acc(v3, w3s), ...acc(v4, w4s)];
}

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0x9051d0ec0fe5beefn);
  const { inBytes, inputs } = packEdgeRows(n, IN_LEN, NUM_EDGES, i => {
    const e = Array.from({ length: NUM_EDGES }, () => [rng(), rng()]);
    if (i === 0) e[12] = [0n, 0n]; // q_poseidon2_external = 0 (skip path)
    return { e, s: rng() };
  });
  const code = sm.gen_poseidon2_external_relation_test_shader(WG);
  const { bytes, ms } = await dispatchRelation(device, n, code, 'poseidon2_external_main', inBytes, OUT_LEN);
  return diffRelation(bytes, n, OUT_LEN, i => polyRef(inputs[i].e, inputs[i].s), log, 'pos2_external', ms);
}

export const pos2ExtSuite: Suite = { id: 'pos2ext', label: 'Poseidon2Ext', run };
