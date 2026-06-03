// No-GPU oracle for the UltraPermutationRelation accumulate kernel. A JS mirror
// of the WGSL Mono + Lagrange sequence is checked against an independent
// polynomial-algebra reference of relations/permutation_relation.hpp, over random
// inputs plus the z_perm == z_perm_shift skip edge. beta/gamma/public_input_delta
// are degree-0 parameters (plain scalars). Plain field mod p throughout.

import { describe, expect, it } from '@jest/globals';

import { ShaderManager } from './cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from './cuzk/curve_config.js';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;

// ---- JS mirror of the WGSL Mono + Lagrange stack ----
type Mono = { c0: bigint; c1: bigint; c2: bigint };
type Lag = bigint[];
const fromEdge = (v0: bigint, v1: bigint): Mono => ({ c0: mod(v0), c1: mod(v1 - v0), c2: mod(v1) });
const mulGG = (a: Mono, b: Mono): Mono => {
  const c0 = mod(a.c0 * b.c0);
  return { c0, c2: mod(a.c1 * b.c1), c1: mod(mod(a.c0 + a.c1) * mod(b.c0 + b.c1) - c0) };
};
const mAdd = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 + b.c0), c1: mod(a.c1 + b.c1), c2: mod(a.c2 + b.c2) });
const mAddScalar = (a: Mono, s: bigint): Mono => ({ ...a, c0: mod(a.c0 + s) });
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
const lagSub = (a: Lag, b: Lag, L: number): Lag => Array.from({ length: L }, (_, k) => mod(a[k] - b[k]));

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
const edgePoly = (v0: bigint, v1: bigint): Poly => [mod(v0), mod(v1 - v0)];
const evalSet = (a: Poly, L: number): bigint[] => Array.from({ length: L }, (_, k) => {
  let acc = 0n; let xp = 1n;
  for (const c of a) { acc = mod(acc + c * xp); xp = mod(xp * BigInt(k)); }
  return acc;
});

// e indices: 0-3 w1..4, 4-7 id1..4, 8-11 sigma1..4, 12 z_perm, 13 z_perm_shift,
// 14 lagrange_first, 15 lagrange_last. params = [beta, gamma, pid].
function permMirror(e: bigint[][], scaling: bigint, beta: bigint, gamma: bigint, pid: bigint): bigint[] {
  const E = e.map(([a, b]) => fromEdge(a, b));
  const [w1, w2, w3, w4, id1, id2, id3, id4, s1, s2, s3, s4, zp, zps, lf, ll] = E;
  const wg = [mAddScalar(w1, gamma), mAddScalar(w2, gamma), mAddScalar(w3, gamma), mAddScalar(w4, gamma)];
  const fac = (ent: Mono, w: Mono): Mono => mAdd(mScale(ent, beta), w);
  const t = [
    mScale(fac(id1, wg[0]), scaling), fac(id2, wg[1]), fac(id3, wg[2]), fac(id4, wg[3]),
    mScale(fac(s1, wg[0]), scaling), fac(s2, wg[1]), fac(s3, wg[2]), fac(s4, wg[3]),
  ].map(m => lagFromMono2(m, 6));
  const num = lagMul(lagMul(lagMul(t[0], t[1], 6), t[2], 6), t[3], 6);
  const den = lagMul(lagMul(lagMul(t[4], t[5], 6), t[6], 6), t[7], 6);
  const zlf = lagFromMono2(mAdd(zp, lf), 6);
  const pit = lagFromMono2(mAdd(mScale(ll, pid), zps), 6);
  const sub0 = lagSub(lagMul(zlf, num, 6), lagMul(pit, den, 6), 6);
  const sub1 = lagFromMono3(mScale(mulGG(ll, zps), scaling), 3);
  const sub2 = lagFromMono3(mScale(mulGG(lf, zp), scaling), 3);
  return [...sub0, ...sub1, ...sub2];
}
function permRef(e: bigint[][], scaling: bigint, beta: bigint, gamma: bigint, pid: bigint): bigint[] {
  const E = e.map(([a, b]) => edgePoly(a, b));
  const [w1, w2, w3, w4, id1, id2, id3, id4, s1, s2, s3, s4, zp, zps, lf, ll] = E;
  const wg = [pAddC(w1, gamma), pAddC(w2, gamma), pAddC(w3, gamma), pAddC(w4, gamma)];
  const fac = (ent: Poly, w: Poly): Poly => pAdd(pScale(ent, beta), w);
  const t1 = pScale(fac(id1, wg[0]), scaling), t2 = fac(id2, wg[1]), t3 = fac(id3, wg[2]), t4 = fac(id4, wg[3]);
  const t5 = pScale(fac(s1, wg[0]), scaling), t6 = fac(s2, wg[1]), t7 = fac(s3, wg[2]), t8 = fac(s4, wg[3]);
  const num = pMul(pMul(pMul(t1, t2), t3), t4);
  const den = pMul(pMul(pMul(t5, t6), t7), t8);
  const zlf = pAdd(zp, lf);
  const pit = pAdd(pScale(ll, pid), zps);
  const sub0 = evalSet(pSub(pMul(zlf, num), pMul(pit, den)), 6);
  const sub1 = evalSet(pScale(pMul(ll, zps), scaling), 3);
  const sub2 = evalSet(pScale(pMul(lf, zp), scaling), 3);
  return [...sub0, ...sub1, ...sub2];
}

let seed = 0x9e1d_1234_abcd_0001n;
const rnd = (): bigint => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n); return mod(seed >> 2n); };

describe('UltraPermutation kernel mirror vs polynomial reference', () => {
  for (const skip of [false, true]) {
    it(`${skip ? 'z_perm == z_perm_shift (skip)' : 'random'}: contribution matches`, () => {
      for (let t = 0; t < 150; t++) {
        const e: bigint[][] = Array.from({ length: 16 }, () => [rnd(), rnd()]);
        if (skip) e[13] = [e[12][0], e[12][1]]; // z_perm_shift = z_perm
        const [scaling, beta, gamma, pid] = [rnd(), rnd(), rnd(), rnd()];
        expect(permMirror(e, scaling, beta, gamma, pid)).toEqual(permRef(e, scaling, beta, gamma, pid));
      }
    });
  }
});

describe('UltraPermutation shader codegen (F_r)', () => {
  const sm = new ShaderManager(4, 1 << 8, BN254_CURVE_CONFIG, false, 'scalar');
  it('renders the entry point and binds the params buffer', () => {
    const src = sm.gen_permutation_relation_test_shader(64);
    expect(src).toMatch(/@workgroup_size\(64\)\s*\nfn\s+permutation_main\b/);
    expect(src).toMatch(/@group\(0\) @binding\(3\) var<storage, read> param_buf/);
  });
});
