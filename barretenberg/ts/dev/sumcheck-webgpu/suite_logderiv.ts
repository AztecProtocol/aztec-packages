// Suite: MegaFlavor LogDerivLookupRelation accumulate. The 13-Fr per-edge
// contribution (5 + 5 + 3) is diffed against a polynomial reference of
// logderiv_lookup_relation.hpp. Subrelation 1 is linearly dependent (no scaling).
// Params [gamma, beta, beta^2, beta^3] via the binding(3) buffer. Row 0 forces
// q_lookup = read_counts = 0 (skip path). lookup_inverses is random (the kernel
// computes the accumulate formula, not satisfiability).

import {
  type Suite, type SuiteCtx,
  WG, sm, mod, makeRng, dispatchRelation, diffRelation, packEdgeRows, packParams,
  pMul, pAdd, pSub, pScale, pAddC, pNeg, edgePoly, evalSet,
} from './harness.js';

const NUM_EDGES = 18;
const IN_LEN = 37;
const OUT_LEN = 13;

function polyRef(e: bigint[][], scaling: bigint, par: bigint[]): bigint[] {
  const [gamma, beta, beta_sqr, beta_cube] = par;
  const E = e.map(([a, b]) => edgePoly(a, b));
  const [t1, t2, t3, t4, w_l, w_r, w_o, w_ls, w_rs, w_os, q_o, q_r, q_m, q_c, inv, rc, ql, rt] = E;
  const tt = pAddC(pAdd(pAdd(pAdd(pScale(t2, beta), pScale(t3, beta_sqr)), pScale(t4, beta_cube)), t1), gamma);
  const dt1 = pAdd(pMul(q_r, w_ls), pAddC(w_l, gamma));
  const dt2 = pAdd(pMul(q_m, w_rs), w_r);
  const dt3 = pAdd(pMul(q_c, w_os), w_o);
  const lt = pAdd(pAdd(pScale(dt2, beta), pScale(dt3, beta_sqr)), pAdd(dt1, pScale(q_o, beta_cube)));
  const ie = pAdd(pAdd(pNeg(pMul(rt, ql)), rt), ql);
  const sub0 = evalSet(pScale(pSub(pMul(pMul(lt, tt), inv), ie), scaling), 5);
  const sub1 = evalSet(pMul(pSub(pMul(ql, tt), pMul(rc, lt)), inv), 5);
  const sub2 = evalSet(pScale(pSub(pMul(rt, rt), rt), scaling), 3);
  return [...sub0, ...sub1, ...sub2];
}

async function run({ device, n, log }: SuiteCtx): Promise<boolean> {
  const rng = makeRng(0x10adde4199887766n);
  const beta = rng();
  const par = [rng(), beta, mod(beta * beta), mod(beta * beta * beta)];
  const { inBytes, inputs } = packEdgeRows(n, IN_LEN, NUM_EDGES, i => {
    const e = Array.from({ length: NUM_EDGES }, () => [rng(), rng()]);
    if (i === 0) { e[15] = [0n, 0n]; e[16] = [0n, 0n]; } // read_counts, q_lookup (skip path)
    return { e, s: rng() };
  });
  const code = sm.gen_logderiv_lookup_relation_test_shader(WG);
  const { bytes, ms } = await dispatchRelation(device, n, code, 'logderiv_lookup_main', inBytes, OUT_LEN, packParams(par));
  return diffRelation(bytes, n, OUT_LEN, i => polyRef(inputs[i].e, inputs[i].s, par), log, 'logderiv', ms);
}

export const logderivSuite: Suite = { id: 'logderiv', label: 'LogDeriv', run };
