// Suite: MegaFlavor DatabusLookupRelation accumulate. The 90-Fr per-edge
// contribution (5 buses x 3 subrelations x 6) is diffed against a polynomial
// reference of databus_lookup_relation.hpp. Per-bus subrelation (2) is linearly
// dependent (no scaling). Params [beta, gamma] via binding(3). Row 0 forces
// q_busread = 0 and all read_counts = 0 (skip path).

import {
  type Suite, type SuiteCtx,
  WG, sm, makeRng, dispatchRelation, diffRelation, packEdgeRows, packParams,
  pMul, pAdd, pSub, pScale, pAddC, edgePoly, evalSet,
} from './harness.js';

const NUM_EDGES = 24; // w_l, w_r, databus_id, q_busread, then per bus: value, selector, inverses, read_counts
const IN_LEN = 49;
const OUT_LEN = 90;

function polyRef(e: bigint[][], scaling: bigint, beta: bigint, gamma: bigint): bigint[] {
  const E = e.map(([a, b]) => edgePoly(a, b));
  const [w_l, w_r, db_id, qbr] = E;
  const L = pAddC(pAdd(pScale(w_r, beta), w_l), gamma);
  const out: bigint[] = [];
  for (let j = 0; j < 5; j++) {
    const [value, sel, inv, rc] = [E[4 + 4 * j], E[5 + 4 * j], E[6 + 4 * j], E[7 + 4 * j]];
    const T = pAddC(pAdd(pScale(db_id, beta), value), gamma);
    const rs = pMul(qbr, sel);
    const common = pAddC(pMul(pMul(L, T), inv), -1n); // L*T*I - 1
    out.push(...evalSet(pScale(pMul(common, rs), scaling), 6));
    out.push(...evalSet(pScale(pMul(common, rc), scaling), 6));
    out.push(...evalSet(pMul(pSub(pMul(rs, T), pMul(rc, L)), inv), 6));
  }
  return out;
}

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0xda7ab5c0ffee0001n);
  const beta = rng(), gamma = rng();
  const { inBytes, inputs } = packEdgeRows(n, IN_LEN, NUM_EDGES, i => {
    const e = Array.from({ length: NUM_EDGES }, () => [rng(), rng()]);
    if (i === 0) {
      e[3] = [0n, 0n]; // q_busread
      for (let j = 0; j < 5; j++) e[7 + 4 * j] = [0n, 0n]; // read_counts
    }
    return { e, s: rng() };
  });
  const code = sm.gen_databus_lookup_relation_test_shader(WG);
  const { bytes, ms } = await dispatchRelation(device, n, code, 'databus_lookup_main', inBytes, OUT_LEN, packParams([beta, gamma]));
  return diffRelation(bytes, n, OUT_LEN, i => polyRef(inputs[i].e, inputs[i].s, beta, gamma), log, 'databus', ms);
}

export const databusSuite: Suite = { id: 'databus', label: 'DatabusLookup', run };
