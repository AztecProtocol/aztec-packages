// No-GPU oracle for the two medium relation accumulate kernels (NonNativeField,
// Elliptic). For each, a JS mirror of the WGSL Mono + Lagrange sequence (incl.
// the mixed-degree mono_add_lin/mono_sub_lin folds, sqr, and the length-6
// promotion) is checked against an independent polynomial-algebra reference of
// the corresponding relations/*.hpp, over random inputs plus the forced
// selector-zero (skip) edge. Plain field mod p throughout.

import { describe, expect, it } from '@jest/globals';

import { ShaderManager } from './cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from './cuzk/curve_config.js';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;
const LIMB = mod(1n << 68n);
const SUB = mod(1n << 14n);
const CURVE_B = mod(-17n); // Grumpkin

// ---- JS mirror of the WGSL Mono + Lagrange stack ----
type Mono = { c0: bigint; c1: bigint; c2: bigint };
type Lag = bigint[];
const fromEdge = (v0: bigint, v1: bigint): Mono => ({ c0: mod(v0), c1: mod(v1 - v0), c2: mod(v1) });
const mulGG = (a: Mono, b: Mono): Mono => {
  const c0 = mod(a.c0 * b.c0);
  return { c0, c2: mod(a.c1 * b.c1), c1: mod(mod(a.c0 + a.c1) * mod(b.c0 + b.c1) - c0) };
};
const sqrG = (a: Mono): Mono => ({ c0: mod(a.c0 * a.c0), c2: mod(a.c1 * a.c1), c1: mod(2n * a.c0 * a.c1 + a.c1 * a.c1) });
const mAdd = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 + b.c0), c1: mod(a.c1 + b.c1), c2: mod(a.c2 + b.c2) });
const mSub = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 - b.c0), c1: mod(a.c1 - b.c1), c2: mod(a.c2 - b.c2) });
const mAddLin = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 + b.c0), c1: mod(a.c1 + b.c1), c2: a.c2 });
const mSubLin = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 - b.c0), c1: mod(a.c1 - b.c1), c2: a.c2 });
const mSubScalar = (a: Mono, s: bigint): Mono => ({ ...a, c0: mod(a.c0 - s) });
const mScale = (a: Mono, s: bigint): Mono => ({ c0: mod(a.c0 * s), c1: mod(a.c1 * s), c2: mod(a.c2 * s) });
const lagFromMono2 = (m: Mono, L: number): Lag => {
  const o = [m.c0];
  let prev = m.c0;
  for (let k = 1; k < L; k++) { prev = mod(prev + m.c1); o.push(prev); }
  return o;
};
const lagFromMono3 = (m: Mono, L: number): Lag => {
  const o = [m.c0];
  let prev = m.c0;
  let toAdd = m.c1;
  const deriv = mod(m.c2 + m.c2);
  for (let k = 1; k < L - 1; k++) { prev = mod(prev + toAdd); o.push(prev); toAdd = mod(toAdd + deriv); }
  o.push(mod(prev + toAdd));
  return o;
};
const lagMul = (a: Lag, b: Lag, L: number): Lag => Array.from({ length: L }, (_, k) => mod(a[k] * b[k]));
const lagAdd = (a: Lag, b: Lag, L: number): Lag => Array.from({ length: L }, (_, k) => mod(a[k] + b[k]));
const lagSub = (a: Lag, b: Lag, L: number): Lag => Array.from({ length: L }, (_, k) => mod(a[k] - b[k]));
const lagNeg = (a: Lag, L: number): Lag => Array.from({ length: L }, (_, k) => mod(-a[k]));

// ---- independent polynomial reference ----
type Poly = bigint[];
const pMul = (a: Poly, b: Poly): Poly => {
  const r: Poly = Array(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = mod(r[i + j] + a[i] * b[j]);
  return r;
};
const pAdd = (a: Poly, b: Poly): Poly =>
  Array.from({ length: Math.max(a.length, b.length) }, (_, i) => mod((a[i] ?? 0n) + (b[i] ?? 0n)));
const pSub = (a: Poly, b: Poly): Poly =>
  Array.from({ length: Math.max(a.length, b.length) }, (_, i) => mod((a[i] ?? 0n) - (b[i] ?? 0n)));
const pScale = (a: Poly, s: bigint): Poly => a.map(x => mod(x * s));
const pAddC = (a: Poly, s: bigint): Poly => { const r = a.slice(); r[0] = mod((r[0] ?? 0n) + s); return r; };
const pSubC = (a: Poly, s: bigint): Poly => pAddC(a, mod(-s));
const pNeg = (a: Poly): Poly => a.map(x => mod(-x));
const edgePoly = (v0: bigint, v1: bigint): Poly => [mod(v0), mod(v1 - v0)];
const evalSet = (a: Poly, L: number): bigint[] => Array.from({ length: L }, (_, k) => {
  let acc = 0n; let xp = 1n;
  for (const c of a) { acc = mod(acc + c * xp); xp = mod(xp * BigInt(k)); }
  return acc;
});

// ===== NonNativeField =====
function nnfMirror(e: bigint[][], scaling: bigint): bigint[] {
  const [w1, w2, w3, w4, w1s, w2s, w3s, w4s, q2, q3, q4, qm, qnnf] = e.map(([a, b]) => fromEdge(a, b));
  let lsp = mAdd(mulGG(w1, w2s), mulGG(w1s, w2));
  let g2 = mAdd(mulGG(w1, w4), mulGG(w2, w3));
  g2 = mSubLin(g2, w3s); g2 = mScale(g2, LIMB); g2 = mSubLin(g2, w4s); g2 = mAdd(g2, lsp);
  const ng2 = lagMul(lagFromMono3(g2, 6), lagFromMono2(q4, 6), 6);
  lsp = mScale(lsp, LIMB); lsp = mAdd(lsp, mulGG(w1s, w2s));
  const g1 = mSubLin(lsp, mAdd(w3, w4));
  const ng1 = lagMul(lagFromMono3(g1, 6), lagFromMono2(q3, 6), 6);
  let g3 = mAddLin(lsp, w4); g3 = mSubLin(g3, mAdd(w3s, w4s));
  const ng3 = lagMul(lagFromMono3(g3, 6), lagFromMono2(qm, 6), 6);
  const nfid = lagMul(lagAdd(lagAdd(ng1, ng2, 6), ng3, 6), lagFromMono2(q2, 6), 6);
  const horner = (a: Mono[]): Mono => {
    let acc = mScale(a[0], SUB);
    for (let i = 1; i < 4; i++) { acc = mAdd(acc, a[i]); acc = mScale(acc, SUB); }
    return mAdd(acc, a[4]);
  };
  const la1 = mSub(horner([w2s, w1s, w3, w2, w1]), w4);
  const la2 = mSub(horner([w3s, w2s, w1s, w4, w3]), w4s);
  const laid = lagMul(lagFromMono3(mAdd(mulGG(la1, q4), mulGG(la2, qm)), 6), lagFromMono2(q3, 6), 6);
  return lagMul(lagAdd(nfid, laid, 6), lagFromMono2(mScale(qnnf, scaling), 6), 6);
}
function nnfRef(e: bigint[][], scaling: bigint): bigint[] {
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

// ===== Elliptic =====
function ellMirror(e: bigint[][], scaling: bigint): bigint[] {
  const [x1, x2, x3, y1, y2, y3, q_ell, q_double, q_sign] = e.map(([a, b]) => fromEdge(a, b));
  const x2_sub_x1 = mSub(x2, x1);
  const x1_mul_3 = mAdd(mAdd(x1, x1), x1);
  const x3_sub_x1 = mSub(x3, x1);
  const x3_plus_two_x1 = mAdd(x3_sub_x1, x1_mul_3);
  const x3_plus_x2_plus_x1 = mAdd(x3_plus_two_x1, x2_sub_x1);
  const y2_sqr = sqrG(y2), y1_sqr = sqrG(y1), y2_q_sign = mulGG(y2, q_sign), x2_sub_x1_sqr = sqrG(x2_sub_x1);
  const q_ell_by_scaling = mScale(q_ell, scaling);
  const q_ell_q_double = mulGG(q_ell_by_scaling, q_double);
  const lqdd = lagFromMono3(q_ell_q_double, 6);
  const lnqnd = lagFromMono3(mSubLin(q_ell_q_double, q_ell_by_scaling), 6);
  // x_add
  const la = lagMul(lagFromMono2(x3_plus_x2_plus_x1, 6), lagFromMono3(x2_sub_x1_sqr, 6), 6);
  const lb = lagFromMono3(mAdd(y2_sqr, y1_sqr), 6);
  const lc = lagMul(lagFromMono3(mAdd(y2_q_sign, y2_q_sign), 6), lagFromMono2(y1, 6), 6);
  const xai = lagAdd(lagSub(la, lb, 6), lc, 6);
  // x_double
  const y1_sqr_4 = mAdd(mAdd(y1_sqr, y1_sqr), mAdd(y1_sqr, y1_sqr));
  const xp43 = lagMul(lagFromMono3(mSubScalar(y1_sqr, CURVE_B), 6), lagFromMono2(x1_mul_3, 6), 6);
  const xp49 = lagAdd(lagAdd(xp43, xp43, 6), xp43, 6);
  const xdi = lagSub(lagMul(lagFromMono2(x3_plus_two_x1, 6), lagFromMono3(y1_sqr_4, 6), 6), xp49, 6);
  const sub0 = lagSub(lagMul(xdi, lqdd, 6), lagMul(xai, lnqnd, 6), 6);
  // y_add
  const y1_plus_y3 = mAdd(y1, y3);
  const y_diff = mSubLin(y2_q_sign, y1);
  const yai = lagAdd(
    lagFromMono3(mulGG(y1_plus_y3, x2_sub_x1), 6),
    lagMul(lagFromMono2(x3_sub_x1, 6), lagFromMono3(y_diff, 6), 6),
    6,
  );
  // neg_y_double
  const nyd = lagAdd(
    lagMul(lagFromMono3(mulGG(x1_mul_3, x1), 6), lagFromMono2(x3_sub_x1, 6), 6),
    lagFromMono3(mulGG(mAdd(y1, y1), y1_plus_y3), 6),
    6,
  );
  const sub1 = lagNeg(lagAdd(lagMul(yai, lnqnd, 6), lagMul(nyd, lqdd, 6), 6), 6);
  return [...sub0, ...sub1];
}
function ellRef(e: bigint[][], scaling: bigint): bigint[] {
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

let seed = 0xb01dface_5511_0a01n;
const rnd = (): bigint => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n); return mod(seed >> 2n); };

const CASES: { name: string; numEdges: number; selIdx: number; mirror: typeof nnfMirror; ref: typeof nnfRef }[] = [
  { name: 'NonNativeField', numEdges: 13, selIdx: 12, mirror: nnfMirror, ref: nnfRef },
  { name: 'Elliptic', numEdges: 9, selIdx: 6, mirror: ellMirror, ref: ellRef }, // selIdx 6 = q_elliptic
];

describe('medium relation kernels: mirror vs polynomial reference', () => {
  for (const c of CASES) {
    for (const forceSel of [false, true]) {
      it(`${c.name}${forceSel ? ' (selector=0)' : ''}: contribution matches`, () => {
        for (let t = 0; t < 100; t++) {
          const e: bigint[][] = Array.from({ length: c.numEdges }, () => [rnd(), rnd()]);
          if (forceSel) e[c.selIdx] = [0n, 0n];
          const scaling = rnd();
          expect(c.mirror(e, scaling)).toEqual(c.ref(e, scaling));
        }
      });
    }
  }
});

describe('medium relation shader codegen (F_r)', () => {
  const sm = new ShaderManager(4, 1 << 8, BN254_CURVE_CONFIG, false, 'scalar');
  it('renders each entry point', () => {
    expect(sm.gen_non_native_field_relation_test_shader(64)).toMatch(/@workgroup_size\(64\)\s*\nfn\s+non_native_field_main\b/);
    expect(sm.gen_elliptic_relation_test_shader(64)).toMatch(/@workgroup_size\(64\)\s*\nfn\s+elliptic_main\b/);
  });
  const word = (src: string, name: string): bigint => {
    const m = src.match(new RegExp(`const ${name}: array<u32, 8> = array<u32, 8>\\(([^)]*)\\)`));
    expect(m).not.toBeNull();
    const words = m![1].split(',').map(w => BigInt(w.trim().replace('u', '')));
    let v = 0n;
    for (let i = 7; i >= 0; i--) v = (v << 32n) | words[i];
    return v;
  };
  it('bakes NNF 2^68 / 2^14 and Elliptic curve_b in Montgomery form', () => {
    const nnf = sm.gen_non_native_field_relation_test_shader(64);
    expect(word(nnf, 'LIMB_SIZE')).toBe((sm.r * LIMB) % P);
    expect(word(nnf, 'SUBLIMB_SHIFT')).toBe((sm.r * SUB) % P);
    expect(word(sm.gen_elliptic_relation_test_shader(64), 'CURVE_B')).toBe((sm.r * CURVE_B) % P);
  });
});
