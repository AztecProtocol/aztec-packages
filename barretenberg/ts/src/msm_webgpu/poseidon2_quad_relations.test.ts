// No-GPU oracle for the three Poseidon2 K=4 quad relations (TransitionEntry,
// QuadInternalTerminal, QuadInternal). Each relation is checked three ways:
//   (1) random: JS Lag mirror of the WGSL == independent polynomial reference
//       (validates the pow5/lag mechanics and coefficient application);
//   (2) valid trace: on a real Poseidon2 quad row (built by the round-trip-
//       validated forward internal-round iteration, fed as constant edges), every
//       subrelation must be identically zero (validates the relation FORMULA /
//       signs / which constant goes where, against ground truth);
//   (3) codegen renders the entry point.
// Derived constants come from cuzk/poseidon2_quad_consts.ts (foundation-gated in
// poseidon2_quad_consts.test.ts).

import { describe, expect, it } from '@jest/globals';

import { ShaderManager } from './cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from './cuzk/curve_config.js';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';
import { poseidon2QuadConsts } from './cuzk/poseidon2_quad_consts.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;
const C = poseidon2QuadConsts(P);

// ---- JS mirror of the WGSL Mono + Lagrange stack ----
type Mono = { c0: bigint; c1: bigint; c2: bigint };
type Lag = bigint[];
const fromEdge = (v0: bigint, v1: bigint): Mono => ({ c0: mod(v0), c1: mod(v1 - v0), c2: mod(v1) });
const mAdd = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 + b.c0), c1: mod(a.c1 + b.c1), c2: mod(a.c2 + b.c2) });
const mSub = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 - b.c0), c1: mod(a.c1 - b.c1), c2: mod(a.c2 - b.c2) });
const mScale = (a: Mono, s: bigint): Mono => ({ c0: mod(a.c0 * s), c1: mod(a.c1 * s), c2: mod(a.c2 * s) });
const l2 = (m: Mono): Lag => { const o = [m.c0]; let p = m.c0; for (let k = 1; k < 7; k++) { p = mod(p + m.c1); o.push(p); } return o; };
const lSqr = (a: Lag): Lag => a.map(x => mod(x * x));
const lMul = (a: Lag, b: Lag): Lag => a.map((x, k) => mod(x * b[k]));
const lAdd = (a: Lag, b: Lag): Lag => a.map((x, k) => mod(x + b[k]));
const lSub = (a: Lag, b: Lag): Lag => a.map((x, k) => mod(x - b[k]));
const lScale = (a: Lag, s: bigint): Lag => a.map(x => mod(x * s));
const sbox = (m: Mono): Lag => { const x = l2(m); return lMul(lSqr(lSqr(x)), x); };

// ---- independent polynomial reference ----
type Poly = bigint[];
const pMul = (a: Poly, b: Poly): Poly => { const r: Poly = Array(a.length + b.length - 1).fill(0n); for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = mod(r[i + j] + a[i] * b[j]); return r; };
const pAdd = (a: Poly, b: Poly): Poly => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => mod((a[i] ?? 0n) + (b[i] ?? 0n)));
const pSub = (a: Poly, b: Poly): Poly => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => mod((a[i] ?? 0n) - (b[i] ?? 0n)));
const pScale = (a: Poly, s: bigint): Poly => a.map(x => mod(x * s));
const edgePoly = (v0: bigint, v1: bigint): Poly => [mod(v0), mod(v1 - v0)];
const pPow5 = (p: Poly): Poly => pMul(pMul(pMul(pMul(p, p), p), p), p);
const evalSet = (a: Poly, L: number): bigint[] => Array.from({ length: L }, (_, k) => { let acc = 0n, xp = 1n; for (const c of a) { acc = mod(acc + c * xp); xp = mod(xp * BigInt(k)); } return acc; });

// =================== TransitionEntry ===================
// e: 0-3 w_l/r/o/4, 4-6 w_r/o/4_shift, 7-9 q_l/r/o, 10 q_sel
function teMirror(e: bigint[][], scaling: bigint): bigint[] {
  const [w_l, w_r, w_o, w_4, w_rs, w_os, w_4s, q_l, q_r, q_o, q_sel] = e.map(([a, b]) => fromEdge(a, b));
  const u0 = sbox(mAdd(w_l, q_l)), u1 = sbox(mAdd(w_rs, q_r)), u2 = sbox(mAdd(w_os, q_o));
  const qbs = l2(mScale(q_sel, scaling));
  const a0 = lAdd(lScale(u0, C.D1), l2(mSub(mAdd(mAdd(w_r, w_o), w_4), w_rs)));
  const a1 = lAdd(lAdd(lScale(u1, C.D1), lScale(u0, 3n)), l2(mSub(mAdd(mAdd(mScale(w_r, C.A_one[0]), mScale(w_o, C.A_one[1])), mScale(w_4, C.A_one[2])), w_os)));
  const a2 = lAdd(lAdd(lAdd(lScale(u2, C.D1), lScale(u1, 3n)), lScale(u0, C.sum_A_one)), l2(mSub(mAdd(mAdd(mScale(w_r, C.A2_one[0]), mScale(w_o, C.A2_one[1])), mScale(w_4, C.A2_one[2])), w_4s)));
  return [...lMul(qbs, a0), ...lMul(qbs, a1), ...lMul(qbs, a2)];
}
function teRef(e: bigint[][], scaling: bigint): bigint[] {
  const [w_l, w_r, w_o, w_4, w_rs, w_os, w_4s, q_l, q_r, q_o, q_sel] = e.map(([a, b]) => edgePoly(a, b));
  const u0 = pPow5(pAdd(w_l, q_l)), u1 = pPow5(pAdd(w_rs, q_r)), u2 = pPow5(pAdd(w_os, q_o));
  const qbs = pScale(q_sel, scaling);
  const a0 = pAdd(pScale(u0, C.D1), pSub(pAdd(pAdd(w_r, w_o), w_4), w_rs));
  const a1 = pAdd(pAdd(pScale(u1, C.D1), pScale(u0, 3n)), pSub(pAdd(pAdd(pScale(w_r, C.A_one[0]), pScale(w_o, C.A_one[1])), pScale(w_4, C.A_one[2])), w_os));
  const a2 = pAdd(pAdd(pAdd(pScale(u2, C.D1), pScale(u1, 3n)), pScale(u0, C.sum_A_one)), pSub(pAdd(pAdd(pScale(w_r, C.A2_one[0]), pScale(w_o, C.A2_one[1])), pScale(w_4, C.A2_one[2])), w_4s));
  return [...evalSet(pMul(qbs, a0), 7), ...evalSet(pMul(qbs, a1), 7), ...evalSet(pMul(qbs, a2), 7)];
}
function teValid(rng: () => bigint): bigint[][] {
  const [w_l, w_r, w_o, w_4] = [rng(), rng(), rng(), rng()];
  const [c0, c1, c2] = [rng(), rng(), rng()];
  const f = C.forward(w_r, w_o, w_4, w_l, [c0, c1, c2, 0n]);
  const vals = [w_l, w_r, w_o, w_4, f.w_r, f.w_o, f.w_4, c0, c1, c2, 1n];
  return vals.map(v => [v, v]); // constant edges
}

// =================== QuadInternalTerminal ===================
// e: 0-3 w_l/r/o/4, 4-7 w_l/r/o/4_shift, 8-11 q_l/r/o/4, 12 q_sel
function termMirror(e: bigint[][], scaling: bigint): bigint[] {
  const [w_l, w_r, w_o, w_4, w_ls, w_rs, w_os, w_4s, q_l, q_r, q_o, q_4, q_sel] = e.map(([a, b]) => fromEdge(a, b));
  const u = [sbox(mAdd(w_l, q_l)), sbox(mAdd(w_r, q_r)), sbox(mAdd(w_o, q_o)), sbox(mAdd(w_4, q_4))];
  const qbs = l2(mScale(q_sel, scaling));
  const shifts = [w_ls, w_rs, w_os, w_4s];
  const out: bigint[] = [];
  for (let j = 0; j < 4; j++) {
    const cf = C.closed_form[j];
    let acc = lScale(u[0], cf[3]);
    acc = lAdd(acc, lScale(u[1], cf[4]));
    acc = lAdd(acc, lScale(u[2], cf[5]));
    acc = lAdd(acc, lScale(u[3], cf[6]));
    const wp = mSub(mAdd(mAdd(mScale(w_r, cf[0]), mScale(w_o, cf[1])), mScale(w_4, cf[2])), shifts[j]);
    out.push(...lMul(qbs, lAdd(acc, l2(wp))));
  }
  return out;
}
function termRef(e: bigint[][], scaling: bigint): bigint[] {
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
function termValid(rng: () => bigint): bigint[][] {
  const [s1, s2, s3, w_l] = [rng(), rng(), rng(), rng()];
  const c = [rng(), rng(), rng(), rng()];
  const f = C.forward(s1, s2, s3, w_l, c);
  const vals = [w_l, f.w_r, f.w_o, f.w_4, f.out[0], f.out[1], f.out[2], f.out[3], c[0], c[1], c[2], c[3], 1n];
  return vals.map(v => [v, v]);
}

// =================== QuadInternal ===================
// e: 0-3 w_l/r/o/4, 4-7 w_l/r/o/4_shift, 8-11 q_l/r/o/4, 12-14 q_m/q_c/q_5, 15 q_sel
function qiMirror(e: bigint[][], scaling: bigint): bigint[] {
  const [w_l, w_r, w_o, w_4, w_ls, w_rs, w_os, w_4s, q_l, q_r, q_o, q_4, q_m, q_c, q_5, q_sel] = e.map(([a, b]) => fromEdge(a, b));
  const u0 = sbox(mAdd(w_l, q_l)), u1 = sbox(mAdd(w_r, q_r)), u2 = sbox(mAdd(w_o, q_o)), u3 = sbox(mAdd(w_4, q_4));
  const u0p = sbox(mAdd(w_ls, q_m)), u1p = sbox(mAdd(w_rs, q_c)), u2p = sbox(mAdd(w_os, q_5));
  const qbs = l2(mScale(q_sel, scaling));
  const u0nD1 = lScale(u0p, C.D1);
  const cf0 = C.closed_form[0], L = C.forward_vandermonde_lhs;
  const ucomb = (c: bigint[]): Lag => lAdd(lAdd(lAdd(lScale(u0, c[3]), lScale(u1, c[4])), lScale(u2, c[5])), lScale(u3, c[6]));
  // A_0
  const wp0 = mSub(mAdd(mAdd(mScale(w_r, cf0[0]), mScale(w_o, cf0[1])), mScale(w_4, cf0[2])), w_ls);
  const a0 = lAdd(ucomb(cf0), l2(wp0));
  // A_1
  const wp1 = mSub(mAdd(mAdd(mScale(w_r, L[0][0]), mScale(w_o, L[0][1])), mScale(w_4, L[0][2])), w_rs);
  const a1 = lAdd(lAdd(ucomb(L[0]), u0nD1), l2(wp1));
  // A_2: -2*u0nD1 + 3 u0' + D1 u1' ; wp2 = base - w_o' + 2 w_r'
  const wp2 = mAdd(mAdd(mSub(mAdd(mAdd(mScale(w_r, L[1][0]), mScale(w_o, L[1][1])), mScale(w_4, L[1][2])), w_os), w_rs), w_rs);
  let a2 = lSub(lSub(ucomb(L[1]), u0nD1), u0nD1);
  a2 = lAdd(a2, lScale(u0p, 3n));
  a2 = lAdd(a2, lScale(u1p, C.D1));
  a2 = lAdd(a2, l2(wp2));
  // A_3: - B3 u0' - (D1-3) u1' + D1 u2' ; wp3 = base - w_4' + w_o' + (Σ+2) w_r'
  const wp3 = mAdd(mAdd(mSub(mAdd(mAdd(mScale(w_r, L[2][0]), mScale(w_o, L[2][1])), mScale(w_4, L[2][2])), w_4s), w_os), mScale(w_rs, C.SIGMA_PLUS_2));
  let a3 = lSub(ucomb(L[2]), lScale(u0p, C.B3_U0_COEF));
  a3 = lSub(a3, lScale(u1p, C.D1_MINUS_3));
  a3 = lAdd(a3, lScale(u2p, C.D1));
  a3 = lAdd(a3, l2(wp3));
  return [...lMul(qbs, a0), ...lMul(qbs, a1), ...lMul(qbs, a2), ...lMul(qbs, a3)];
}
function qiRef(e: bigint[][], scaling: bigint): bigint[] {
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
function qiValid(rng: () => bigint): bigint[][] {
  const [s1, s2, s3, w_l] = [rng(), rng(), rng(), rng()];
  const c = [rng(), rng(), rng(), rng()];
  const f = C.forward(s1, s2, s3, w_l, c);
  const cn = [rng(), rng(), rng(), rng()]; // next quad constants c4..c7
  const g = C.forward(f.out[1], f.out[2], f.out[3], f.out[0], cn);
  const vals = [w_l, f.w_r, f.w_o, f.w_4, f.out[0], g.w_r, g.w_o, g.w_4, c[0], c[1], c[2], c[3], cn[0], cn[1], cn[2], 1n];
  return vals.map(v => [v, v]);
}

let seed = 0x9051d02_cafe_001n;
const rnd = (): bigint => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n); return mod(seed >> 2n); };
const zeros = (n: number): bigint[] => Array.from({ length: n }, () => 0n);

const RELS = [
  { name: 'TransitionEntry', out: 21, mirror: teMirror, ref: teRef, valid: teValid },
  { name: 'QuadInternalTerminal', out: 28, mirror: termMirror, ref: termRef, valid: termValid },
  { name: 'QuadInternal', out: 28, mirror: qiMirror, ref: qiRef, valid: qiValid },
];

describe('Poseidon2 quad relations: mirror vs polynomial reference', () => {
  for (const r of RELS) {
    it(`${r.name}: random contribution matches`, () => {
      for (let t = 0; t < 80; t++) {
        const ne = r.name === 'QuadInternal' ? 16 : r.name === 'QuadInternalTerminal' ? 13 : 11;
        const e: bigint[][] = Array.from({ length: ne }, () => [rnd(), rnd()]);
        const scaling = rnd();
        expect(r.mirror(e, scaling)).toEqual(r.ref(e, scaling));
      }
    });
    it(`${r.name}: valid trace row contributes identically zero`, () => {
      for (let t = 0; t < 50; t++) {
        expect(r.mirror(r.valid(rnd), rnd())).toEqual(zeros(r.out));
      }
    });
  }
});

describe('Poseidon2 quad relation codegen (F_r)', () => {
  const sm = new ShaderManager(4, 1 << 8, BN254_CURVE_CONFIG, false, 'scalar');
  it('renders each entry point', () => {
    expect(sm.gen_poseidon2_transition_entry_relation_test_shader(64)).toMatch(/fn\s+poseidon2_transition_entry_main\b/);
    expect(sm.gen_poseidon2_quad_internal_terminal_relation_test_shader(64)).toMatch(/fn\s+poseidon2_quad_internal_terminal_main\b/);
    expect(sm.gen_poseidon2_quad_internal_relation_test_shader(64)).toMatch(/fn\s+poseidon2_quad_internal_main\b/);
  });
});
