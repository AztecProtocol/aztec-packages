// Per-relation kernel + polynomial-reference descriptors, shared by each
// relation's standalone suite (per-edge diff) and the end-to-end integration
// suite (reduce over edges -> assemble -> round univariate). The build/polyRef
// bodies are the relation goldens transcribed from the C++ relation headers; see
// each relation's suite for the per-subrelation derivation notes.
//
// Currently the simple-group relations (no relation_parameters): Arithmetic (0),
// DeltaRangeConstraint (3), EccOpQueue (7), Poseidon2InitialExternal (10).

import {
  type EdgeRow, type RelationDescriptor,
  WG, sm, mod, modinv,
  pMul, pAdd, pSub, pScale, pAddC, pSubC, pNeg, edgePoly, evalSet,
} from './harness.js';

const NEG_HALF = mod(-modinv(2n));

// ---- Arithmetic (idx 0): 13 entity edges + scaling, OUT_LEN 11 = [6,5] ----
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
};

// ---- DeltaRangeConstraint (idx 3): 6 edges + scaling, OUT_LEN 24 = [6,6,6,6] ----
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
};

// ---- EccOpQueue (idx 7): 9 edges + scaling, OUT_LEN 24 = [3]x8 ----
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
};

// ---- Poseidon2InitialExternal (idx 10): 9 edges + scaling, OUT_LEN 12 = [3,3,3,3] ----
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
};

/** The simple-group descriptors, in MegaFlavor relation order. */
export const SIMPLE_GROUP: RelationDescriptor[] = [arithDescriptor, deltaDescriptor, eccDescriptor, pos2InitDescriptor];
