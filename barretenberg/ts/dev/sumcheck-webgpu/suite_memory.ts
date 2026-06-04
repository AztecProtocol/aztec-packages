// Suite: MegaFlavor MemoryRelation accumulate. The 36-Fr per-edge contribution
// (6 subrelations x 6) is diffed against a polynomial reference of
// memory_relation.hpp. Params [eta, eta_two, eta_three] via the binding(3)
// buffer. Row 0 forces q_memory = 0 (skip path).

import {
  type Suite, type SuiteCtx,
  WG, sm, makeRng, dispatchRelation, diffRelation, packEdgeRows, packParams,
  pMul, pAdd, pSub, pScale, pAddC, edgePoly, evalSet,
} from './harness.js';

const NUM_EDGES = 15; // w_l/r/o/4, w_l/r/o/4_shift, q_l, q_r, q_o, q_4, q_m, q_c, q_memory
const IN_LEN = 31;
const OUT_LEN = 36;

function polyRef(e: bigint[][], scaling: bigint, par: bigint[]): bigint[] {
  const [eta, eta2, eta3] = par;
  const [w1, w2, w3, w4, w1s, w2s, w3s, w4s, q1, q2, q3, q4, qm, qc, qmem] = e.map(([a, b]) => edgePoly(a, b));
  const prc = pAdd(pAdd(pAdd(pScale(w3, eta3), pScale(w2, eta2)), pScale(w1, eta)), qc);
  const mrc = pSub(prc, w4);
  const nid = pSub(w1, w1s);
  const idz = pAddC(nid, 1n);
  const qmbs = pScale(qmem, scaling);
  const q12 = pMul(q1, q2);
  const q3bms = pMul(q3, qmbs);
  const iizoo = pAdd(pMul(nid, nid), nid);
  const avmaim = pMul(idz, pSub(w4s, w4));
  const access = pAdd(pMul(mrc, mrc), mrc);
  const nngat = pSub(pAdd(pAdd(pScale(w3s, eta3), pScale(w2s, eta2)), pScale(w1s, eta)), w4s);
  const ngatib = pAdd(pMul(nngat, nngat), nngat);
  const rtci = pSub(pMul(idz, pSub(w2s, w2)), w3);
  const q12bmbs = pMul(q12, qmbs);
  const sub1 = evalSet(pMul(avmaim, q12bmbs), 6);
  const sub2 = evalSet(pMul(iizoo, q12bmbs), 6);
  const sub3 = evalSet(pMul(pMul(pMul(idz, pSub(w3s, w3)), pAddC(nngat, 1n)), q3bms), 6);
  const sub4 = evalSet(pMul(iizoo, q3bms), 6);
  const sub5 = evalSet(pMul(ngatib, q3bms), 6);
  const mid = pMul(pAdd(pAdd(pMul(mrc, q12), pMul(rtci, pMul(q4, q1))), pMul(mrc, pMul(qm, q1))), qmbs);
  const sub0 = evalSet(pAdd(mid, pMul(access, q3bms)), 6);
  return [...sub0, ...sub1, ...sub2, ...sub3, ...sub4, ...sub5];
}

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0x3133700ddba11500n);
  const par = [rng(), rng(), rng()]; // eta, eta_two, eta_three
  const { inBytes, inputs } = packEdgeRows(n, IN_LEN, NUM_EDGES, i => {
    const e = Array.from({ length: NUM_EDGES }, () => [rng(), rng()]);
    if (i === 0) e[14] = [0n, 0n]; // q_memory = 0 (skip path)
    return { e, s: rng() };
  });
  const code = sm.gen_memory_relation_test_shader(WG);
  const { bytes, ms } = await dispatchRelation(device, n, code, 'memory_main', inBytes, OUT_LEN, packParams(par));
  return diffRelation(bytes, n, OUT_LEN, i => polyRef(inputs[i].e, inputs[i].s, par), log, 'memory', ms);
}

export const memorySuite: Suite = { id: 'memory', label: 'Memory', run };
