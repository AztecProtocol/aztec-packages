// Per-relation kernel + polynomial-reference descriptors, shared by each
// relation's standalone suite (per-edge diff) and the end-to-end integration
// suite (reduce over edges -> assemble -> round univariate). The build/polyRef
// bodies are the relation goldens transcribed from the C++ relation headers; see
// each relation's suite header for the per-subrelation derivation notes.
//
// All 14 MegaFlavor relations, in Relations_ tuple order. Parameter-bearing
// relations (UltraPermutation, LogDerivLookup, Memory, DatabusLookup) draw their
// relation_parameters via makeParams (consumed from the rng before the edges).

import {
  type EdgeRow, type Poly, type RelationDescriptor,
  WG, sm, P, mod, modinv,
  pMul, pAdd, pSub, pScale, pAddC, pSubC, pNeg, edgePoly, evalSet,
} from './harness.js';
import { poseidon2QuadConsts } from '../../src/msm_webgpu/cuzk/poseidon2_quad_consts.js';

const NEG_HALF = mod(-modinv(2n));
const LIMB = mod(1n << 68n);
const SUB = mod(1n << 14n);
const CURVE_B = mod(-17n);
const C = poseidon2QuadConsts(P);
const pPow5 = (p: Poly): Poly => pMul(pMul(pMul(pMul(p, p), p), p), p);

// ---- Arithmetic (idx 0): OUT_LEN 11 = [6,5] ----
function arithBuild(rng: () => bigint, i: number): EdgeRow {
  const e: bigint[][] = Array.from({ length: 13 }, () => [rng(), rng()]);
  if (i < 4) e[12] = [BigInt(i), BigInt(i)]; // q_arith = 0,1,2,3
  return { e, s: rng() };
}
function arithPolyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [w_l, w_r, w_o, w_4, w_4s, w_ls, q_m, q_l, q_r, q_o, q_4, q_c, q_arith] = e.map(([a, b]) => edgePoly(a, b));
  const scaled = pScale(q_arith, scaling);
  const tmp0 = pMul(pScale(pMul(w_r, w_l), NEG_HALF), pMul(pSubC(q_arith, 3n), q_m));
  let tmp1 = pAdd(pAdd(pAdd(pMul(q_l, w_l), pMul(q_r, w_r)), pMul(q_o, w_o)), pMul(q_4, w_4));
  tmp1 = pAdd(tmp1, q_c);
  tmp1 = pAdd(tmp1, pMul(pSubC(q_arith, 1n), w_4s));
  const sub0 = evalSet(pMul(pAdd(tmp0, tmp1), scaled), 6);
  const t0 = pAdd(pSub(pAdd(w_l, w_4), w_ls), q_m);
  const sub1 = evalSet(pMul(pMul(t0, pSubC(q_arith, 2n)), pMul(pSubC(q_arith, 1n), scaled)), 5);
  return [...sub0, ...sub1];
}
export const arithDescriptor: RelationDescriptor = {
  id: 'arith', label: 'Arithmetic', relationIndex: 0, numEdges: 13, inLen: 27, outLen: 11,
  entry: 'arithmetic_main', seed: 0x1badb002c0defacen,
  shader: () => sm.gen_arithmetic_relation_test_shader(WG), build: arithBuild, polyRef: arithPolyRef,
  skip: { kind: 'allZero', cols: [12] }, // q_arith.is_zero()
};

// ---- UltraPermutation (idx 1): OUT_LEN 12 = [6,3,3]; params [beta,gamma,pid] ----
function permBuild(rng: () => bigint, i: number): EdgeRow {
  const e: bigint[][] = Array.from({ length: 16 }, () => [rng(), rng()]);
  if (i === 0) e[13] = [e[12][0], e[12][1]]; // z_perm_shift = z_perm (skip path)
  return { e, s: rng() };
}
function permPolyRef(e: bigint[][], scaling: bigint, params: bigint[]): bigint[] {
  const [beta, gamma, pid] = params;
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
export const permDescriptor: RelationDescriptor = {
  id: 'perm', label: 'UltraPerm', relationIndex: 1, numEdges: 16, inLen: 33, outLen: 12,
  entry: 'permutation_main', seed: 0x9e1d77abcd001234n,
  makeParams: rng => [rng(), rng(), rng()], // beta, gamma, public_input_delta
  shader: () => sm.gen_permutation_relation_test_shader(WG), build: permBuild, polyRef: permPolyRef,
  skip: { kind: 'eqPair', cols: [12, 13] }, // (z_perm - z_perm_shift).is_zero()
};

// ---- LogDerivLookup (idx 2): OUT_LEN 13 = [5,5,3]; params [gamma,beta,beta^2,beta^3] ----
function logderivBuild(rng: () => bigint, i: number): EdgeRow {
  const e: bigint[][] = Array.from({ length: 18 }, () => [rng(), rng()]);
  if (i === 0) { e[15] = [0n, 0n]; e[16] = [0n, 0n]; } // read_counts, q_lookup (skip path)
  return { e, s: rng() };
}
function logderivPolyRef(e: bigint[][], scaling: bigint, params: bigint[]): bigint[] {
  const [gamma, beta, beta_sqr, beta_cube] = params;
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
export const logderivDescriptor: RelationDescriptor = {
  id: 'logderiv', label: 'LogDeriv', relationIndex: 2, numEdges: 18, inLen: 37, outLen: 13,
  entry: 'logderiv_lookup_main', seed: 0x10adde4199887766n,
  makeParams: rng => { const beta = rng(); const gamma = rng(); return [gamma, beta, mod(beta * beta), mod(beta * beta * beta)]; },
  shader: () => sm.gen_logderiv_lookup_relation_test_shader(WG), build: logderivBuild, polyRef: logderivPolyRef,
  skip: { kind: 'allZero', cols: [15, 16] }, // q_lookup.is_zero() && lookup_read_counts.is_zero()
};

// ---- DeltaRangeConstraint (idx 3): OUT_LEN 24 = [6,6,6,6] ----
function deltaBuild(rng: () => bigint, i: number): EdgeRow {
  const e: bigint[][] = Array.from({ length: 6 }, () => [rng(), rng()]);
  if (i === 0) e[5] = [0n, 0n]; // q_delta_range = 0 (skip path)
  return { e, s: rng() };
}
function deltaPolyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [w_l, w_r, w_o, w_4, w_ls, q_dr] = e.map(([a, b]) => edgePoly(a, b));
  const qs = pScale(q_dr, scaling);
  const out: bigint[] = [];
  for (const d of [pSub(w_r, w_l), pSub(w_o, w_r), pSub(w_4, w_o), pSub(w_ls, w_4)]) {
    const t = pMul(pSubC(d, 3n), d); // (D-3)*D
    out.push(...evalSet(pMul(pMul(t, pAddC(t, 2n)), qs), 6)); // T*(T+2)*q_scaled
  }
  return out;
}
export const deltaDescriptor: RelationDescriptor = {
  id: 'delta', label: 'DeltaRange', relationIndex: 3, numEdges: 6, inLen: 13, outLen: 24,
  entry: 'delta_range_main', seed: 0xde17a9a9c0ffee01n,
  shader: () => sm.gen_delta_range_relation_test_shader(WG), build: deltaBuild, polyRef: deltaPolyRef,
  skip: { kind: 'allZero', cols: [5] }, // q_delta_range.is_zero()
};

// ---- Elliptic (idx 4): OUT_LEN 12 = [6,6]; curve_b = -17 ----
function ellipticBuild(rng: () => bigint, i: number): EdgeRow {
  const e: bigint[][] = Array.from({ length: 9 }, () => [rng(), rng()]);
  if (i === 0) e[6] = [0n, 0n]; // q_elliptic = 0 (skip path)
  return { e, s: rng() };
}
function ellipticPolyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [x1, x2, x3, y1, y2, y3, q_ell, q_double, q_sign] = e.map(([a, b]) => edgePoly(a, b));
  const x2_sub_x1 = pSub(x2, x1);
  const x1_mul_3 = pScale(x1, 3n);
  const x3_sub_x1 = pSub(x3, x1);
  const x3_plus_two_x1 = pAdd(x3, pScale(x1, 2n));
  const x3_plus_x2_plus_x1 = pAdd(pAdd(x3, x2), x1);
  const y2_sqr = pMul(y2, y2), y1_sqr = pMul(y1, y1), y2_q_sign = pMul(y2, q_sign);
  const q_ell_by_scaling = pScale(q_ell, scaling);
  const q_ell_q_double = pMul(q_ell_by_scaling, q_double);
  const neg_qnd = pSub(q_ell_q_double, q_ell_by_scaling);
  const x_add = pAdd(
    pSub(pMul(x3_plus_x2_plus_x1, pMul(x2_sub_x1, x2_sub_x1)), pAdd(y2_sqr, y1_sqr)),
    pMul(pScale(y2_q_sign, 2n), y1),
  );
  const x_double = pSub(pMul(x3_plus_two_x1, pScale(y1_sqr, 4n)), pScale(pMul(pSubC(y1_sqr, CURVE_B), x1_mul_3), 3n));
  const sub0 = evalSet(pSub(pMul(x_double, q_ell_q_double), pMul(x_add, neg_qnd)), 6);
  const y1_plus_y3 = pAdd(y1, y3);
  const y_diff = pSub(y2_q_sign, y1);
  const y_add = pAdd(pMul(y1_plus_y3, x2_sub_x1), pMul(x3_sub_x1, y_diff));
  const neg_y_double = pAdd(pMul(pMul(x1_mul_3, x1), x3_sub_x1), pMul(pScale(y1, 2n), y1_plus_y3));
  const sub1 = evalSet(pNeg(pAdd(pMul(y_add, neg_qnd), pMul(neg_y_double, q_ell_q_double))), 6);
  return [...sub0, ...sub1];
}
export const ellipticDescriptor: RelationDescriptor = {
  id: 'elliptic', label: 'Elliptic', relationIndex: 4, numEdges: 9, inLen: 19, outLen: 12,
  entry: 'elliptic_main', seed: 0xe11ec0de33445566n,
  shader: () => sm.gen_elliptic_relation_test_shader(WG), build: ellipticBuild, polyRef: ellipticPolyRef,
  skip: { kind: 'allZero', cols: [6] }, // q_elliptic.is_zero()
};

// ---- Memory (idx 5): OUT_LEN 36 = [6]x6; params [eta,eta_two,eta_three] ----
function memoryBuild(rng: () => bigint, i: number): EdgeRow {
  const e: bigint[][] = Array.from({ length: 15 }, () => [rng(), rng()]);
  if (i === 0) e[14] = [0n, 0n]; // q_memory = 0 (skip path)
  return { e, s: rng() };
}
function memoryPolyRef(e: bigint[][], scaling: bigint, params: bigint[]): bigint[] {
  const [eta, eta2, eta3] = params;
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
export const memoryDescriptor: RelationDescriptor = {
  id: 'memory', label: 'Memory', relationIndex: 5, numEdges: 15, inLen: 31, outLen: 36,
  entry: 'memory_main', seed: 0x3133700ddba11500n,
  makeParams: rng => [rng(), rng(), rng()], // eta, eta_two, eta_three
  shader: () => sm.gen_memory_relation_test_shader(WG), build: memoryBuild, polyRef: memoryPolyRef,
  skip: { kind: 'allZero', cols: [14] }, // q_memory.is_zero()
};

// ---- NonNativeField (idx 6): OUT_LEN 6 ----
function nnfBuild(rng: () => bigint, i: number): EdgeRow {
  const e: bigint[][] = Array.from({ length: 13 }, () => [rng(), rng()]);
  if (i === 0) e[12] = [0n, 0n]; // q_nnf = 0 (skip path)
  return { e, s: rng() };
}
function nnfPolyRef(e: bigint[][], scaling: bigint): bigint[] {
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
export const nnfDescriptor: RelationDescriptor = {
  id: 'nnf', label: 'NonNativeField', relationIndex: 6, numEdges: 13, inLen: 27, outLen: 6,
  entry: 'non_native_field_main', seed: 0x77facade01020304n,
  shader: () => sm.gen_non_native_field_relation_test_shader(WG), build: nnfBuild, polyRef: nnfPolyRef,
  skip: { kind: 'allZero', cols: [12] }, // q_nnf.is_zero()
};

// ---- EccOpQueue (idx 7): OUT_LEN 24 = [3]x8 ----
function eccBuild(rng: () => bigint, i: number): EdgeRow {
  const e: bigint[][] = Array.from({ length: 9 }, () => [rng(), rng()]);
  if (i === 0) e[8] = [0n, 0n]; // lagrange_ecc_op = 0 (off-domain path)
  return { e, s: rng() };
}
function eccPolyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [w1s, w2s, w3s, w4s, op1, op2, op3, op4, lecc] = e.map(([a, b]) => edgePoly(a, b));
  const lbs = pScale(lecc, scaling);
  const comp = pAddC(pNeg(lbs), scaling); // scaling*(1 - lagrange_ecc_op)
  const out: bigint[] = [];
  for (const [op, ws] of [[op1, w1s], [op2, w2s], [op3, w3s], [op4, w4s]]) {
    out.push(...evalSet(pMul(pSub(op, ws), lbs), 3));
  }
  for (const op of [op1, op2, op3, op4]) {
    out.push(...evalSet(pMul(op, comp), 3));
  }
  return out;
}
export const eccDescriptor: RelationDescriptor = {
  id: 'ecc', label: 'EccOpQueue', relationIndex: 7, numEdges: 9, inLen: 19, outLen: 24,
  entry: 'ecc_op_queue_main', seed: 0xecc0a13573571100n,
  shader: () => sm.gen_ecc_op_queue_relation_test_shader(WG), build: eccBuild, polyRef: eccPolyRef,
  skip: { kind: 'allZero', cols: [8] }, // lagrange_ecc_op.is_zero()
};

// ---- DatabusLookup (idx 8): OUT_LEN 90 = [6,6,6]x5 buses; params [beta,gamma] ----
function databusBuild(rng: () => bigint, i: number): EdgeRow {
  const e: bigint[][] = Array.from({ length: 24 }, () => [rng(), rng()]);
  if (i === 0) {
    e[3] = [0n, 0n]; // q_busread
    for (let j = 0; j < 5; j++) e[7 + 4 * j] = [0n, 0n]; // read_counts
  }
  return { e, s: rng() };
}
function databusPolyRef(e: bigint[][], scaling: bigint, params: bigint[]): bigint[] {
  const [beta, gamma] = params;
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
export const databusDescriptor: RelationDescriptor = {
  id: 'databus', label: 'DatabusLookup', relationIndex: 8, numEdges: 24, inLen: 49, outLen: 90,
  entry: 'databus_lookup_main', seed: 0xda7ab5c0ffee0001n,
  makeParams: rng => [rng(), rng()], // beta, gamma
  shader: () => sm.gen_databus_lookup_relation_test_shader(WG), build: databusBuild, polyRef: databusPolyRef,
  skip: { kind: 'allZero', cols: [3, 7, 11, 15, 19, 23] }, // q_busread.is_zero() && all 5 read_counts.is_zero()
};

// ---- Poseidon2External (idx 9): OUT_LEN 28 = [7]x4 ----
function pos2ExtBuild(rng: () => bigint, i: number): EdgeRow {
  const e: bigint[][] = Array.from({ length: 13 }, () => [rng(), rng()]);
  if (i === 0) e[12] = [0n, 0n]; // q_poseidon2_external = 0 (skip path)
  return { e, s: rng() };
}
function pos2ExtPolyRef(e: bigint[][], scaling: bigint): bigint[] {
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
export const pos2ExtDescriptor: RelationDescriptor = {
  id: 'pos2ext', label: 'Poseidon2Ext', relationIndex: 9, numEdges: 13, inLen: 27, outLen: 28,
  entry: 'poseidon2_external_main', seed: 0x9051d0ec0fe5beefn,
  shader: () => sm.gen_poseidon2_external_relation_test_shader(WG), build: pos2ExtBuild, polyRef: pos2ExtPolyRef,
  skip: { kind: 'allZero', cols: [12] }, // q_poseidon2_external.is_zero()
};

// ---- Poseidon2InitialExternal (idx 10): OUT_LEN 12 = [3,3,3,3] ----
function pos2InitBuild(rng: () => bigint, i: number): EdgeRow {
  const e: bigint[][] = Array.from({ length: 9 }, () => [rng(), rng()]);
  if (i === 0) e[8] = [0n, 0n]; // q_poseidon2_external_initial = 0 (skip path)
  return { e, s: rng() };
}
function pos2InitPolyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [x0, x1, x2, x3, y0, y1, y2, y3, q] = e.map(([a, b]) => edgePoly(a, b));
  const qbs = pScale(q, scaling);
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
export const pos2InitDescriptor: RelationDescriptor = {
  id: 'pos2init', label: 'Poseidon2Init', relationIndex: 10, numEdges: 9, inLen: 19, outLen: 12,
  entry: 'poseidon2_initial_main', seed: 0x9051d02141711a10n,
  shader: () => sm.gen_poseidon2_initial_relation_test_shader(WG), build: pos2InitBuild, polyRef: pos2InitPolyRef,
  skip: { kind: 'allZero', cols: [8] }, // q_poseidon2_external_initial.is_zero()
};

// ---- Poseidon2QuadInternal (idx 11): OUT_LEN 28 = [7]x4 ----
function pos2QuadBuild(rng: () => bigint, i: number): EdgeRow {
  const e: bigint[][] = Array.from({ length: 16 }, () => [rng(), rng()]);
  if (i === 0) e[15] = [0n, 0n]; // q_sel = 0 (skip path)
  return { e, s: rng() };
}
function pos2QuadPolyRef(e: bigint[][], scaling: bigint): bigint[] {
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
  let a2 = pSub(ucomb(L[1]), pScale(u0p, mod(2n * C.D1)));
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
export const pos2QuadDescriptor: RelationDescriptor = {
  id: 'pos2quad', label: 'Poseidon2Quad', relationIndex: 11, numEdges: 16, inLen: 33, outLen: 28,
  entry: 'poseidon2_quad_internal_main', seed: 0x9051d0701a4d0000n,
  shader: () => sm.gen_poseidon2_quad_internal_relation_test_shader(WG), build: pos2QuadBuild, polyRef: pos2QuadPolyRef,
  skip: { kind: 'allZero', cols: [15] }, // q_poseidon2_quad_internal.is_zero()
};

// ---- Poseidon2QuadInternalTerminal (idx 12): OUT_LEN 28 = [7]x4 ----
function pos2QuadTermBuild(rng: () => bigint, i: number): EdgeRow {
  const e: bigint[][] = Array.from({ length: 13 }, () => [rng(), rng()]);
  if (i === 0) e[12] = [0n, 0n]; // q_sel = 0 (skip path)
  return { e, s: rng() };
}
function pos2QuadTermPolyRef(e: bigint[][], scaling: bigint): bigint[] {
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
export const pos2QuadTermDescriptor: RelationDescriptor = {
  id: 'pos2quadterm', label: 'Poseidon2QuadTerm', relationIndex: 12, numEdges: 13, inLen: 27, outLen: 28,
  entry: 'poseidon2_quad_internal_terminal_main', seed: 0x9051d07e21a10000n,
  shader: () => sm.gen_poseidon2_quad_internal_terminal_relation_test_shader(WG), build: pos2QuadTermBuild, polyRef: pos2QuadTermPolyRef,
  skip: { kind: 'allZero', cols: [12] }, // q_poseidon2_quad_internal_terminal.is_zero()
};

// ---- Poseidon2TransitionEntry (idx 13): OUT_LEN 21 = [7,7,7] ----
function pos2TransBuild(rng: () => bigint, i: number): EdgeRow {
  const e: bigint[][] = Array.from({ length: 11 }, () => [rng(), rng()]);
  if (i === 0) e[10] = [0n, 0n]; // q_sel = 0 (skip path)
  return { e, s: rng() };
}
function pos2TransPolyRef(e: bigint[][], scaling: bigint): bigint[] {
  const [w_l, w_r, w_o, w_4, w_rs, w_os, w_4s, q_l, q_r, q_o, q_sel] = e.map(([a, b]) => edgePoly(a, b));
  const u0 = pPow5(pAdd(w_l, q_l)), u1 = pPow5(pAdd(w_rs, q_r)), u2 = pPow5(pAdd(w_os, q_o));
  const qbs = pScale(q_sel, scaling);
  const a0 = pAdd(pScale(u0, C.D1), pSub(pAdd(pAdd(w_r, w_o), w_4), w_rs));
  const a1 = pAdd(pAdd(pScale(u1, C.D1), pScale(u0, 3n)), pSub(pAdd(pAdd(pScale(w_r, C.A_one[0]), pScale(w_o, C.A_one[1])), pScale(w_4, C.A_one[2])), w_os));
  const a2 = pAdd(pAdd(pAdd(pScale(u2, C.D1), pScale(u1, 3n)), pScale(u0, C.sum_A_one)), pSub(pAdd(pAdd(pScale(w_r, C.A2_one[0]), pScale(w_o, C.A2_one[1])), pScale(w_4, C.A2_one[2])), w_4s));
  return [...evalSet(pMul(qbs, a0), 7), ...evalSet(pMul(qbs, a1), 7), ...evalSet(pMul(qbs, a2), 7)];
}
export const pos2TransDescriptor: RelationDescriptor = {
  id: 'pos2trans', label: 'Poseidon2Trans', relationIndex: 13, numEdges: 11, inLen: 23, outLen: 21,
  entry: 'poseidon2_transition_entry_main', seed: 0x9051d0747a5170n,
  shader: () => sm.gen_poseidon2_transition_entry_relation_test_shader(WG), build: pos2TransBuild, polyRef: pos2TransPolyRef,
  skip: { kind: 'allZero', cols: [10] }, // q_poseidon2_transition_entry.is_zero()
};

/** All 14 MegaFlavor relation descriptors, in Relations_ tuple order. */
export const ALL_RELATIONS: RelationDescriptor[] = [
  arithDescriptor, permDescriptor, logderivDescriptor, deltaDescriptor, ellipticDescriptor,
  memoryDescriptor, nnfDescriptor, eccDescriptor, databusDescriptor, pos2ExtDescriptor,
  pos2InitDescriptor, pos2QuadDescriptor, pos2QuadTermDescriptor, pos2TransDescriptor,
];
