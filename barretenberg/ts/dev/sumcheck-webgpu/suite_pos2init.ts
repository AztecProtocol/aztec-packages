// Suite: MegaFlavor Poseidon2InitialExternalRelation accumulate. The 12-Fr
// per-edge contribution (4 subrelations x 3) is diffed against a polynomial
// reference of poseidon2_initial_external_relation.hpp. Row 0 forces
// q_poseidon2_external_initial = 0 (skip path).

import {
  type Suite, type SuiteCtx,
  WG, sm, makeRng, dispatchRelation, diffRelation, packEdgeRows,
  pMul, pAdd, pSub, pScale, edgePoly, evalSet,
} from './harness.js';

const NUM_EDGES = 9; // w_l/r/o/4 (=x0..3), w_l/r/o/4_shift (=y0..3), q_pos2_ext_initial
const IN_LEN = 19;
const OUT_LEN = 12;

function polyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [x0, x1, x2, x3, y0, y1, y2, y3, q] = e.map(([a, b]) => edgePoly(a, b));
  const qbs = pScale(q, scaling);
  // y = M_E · x
  const y0c = pAdd(pAdd(pAdd(pScale(x0, 5n), pScale(x1, 7n)), x2), pScale(x3, 3n));
  const y1c = pAdd(pAdd(pAdd(pScale(x0, 4n), pScale(x1, 6n)), x2), x3);
  const y2c = pAdd(pAdd(pAdd(x0, pScale(x1, 3n)), pScale(x2, 5n)), pScale(x3, 7n));
  const y3c = pAdd(pAdd(pAdd(x0, x1), pScale(x2, 4n)), pScale(x3, 6n));
  const out: bigint[] = [];
  for (const [yc, y] of [[y0c, y0], [y1c, y1], [y2c, y2], [y3c, y3]]) {
    out.push(...evalSet(pMul(qbs, pSub(yc, y)), 3));
  }
  return out;
}

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0x9051d02141711a10n);
  const { inBytes, inputs } = packEdgeRows(n, IN_LEN, NUM_EDGES, i => {
    const e = Array.from({ length: NUM_EDGES }, () => [rng(), rng()]);
    if (i === 0) e[8] = [0n, 0n]; // q_poseidon2_external_initial = 0 (skip path)
    return { e, s: rng() };
  });
  const code = sm.gen_poseidon2_initial_relation_test_shader(WG);
  const { bytes, ms } = await dispatchRelation(device, n, code, 'poseidon2_initial_main', inBytes, OUT_LEN);
  return diffRelation(bytes, n, OUT_LEN, i => polyRef(inputs[i].e, inputs[i].s), log, 'pos2_initial', ms);
}

export const pos2InitSuite: Suite = { id: 'pos2init', label: 'Poseidon2Init', run };
