// No-GPU oracle for the ArithmeticRelation accumulate kernel — Phase-2 step 2.
//
// Two independent computations of the 11-Fr per-edge contribution, checked
// against each other over many inputs (incl. q_arith in {0,1,2,3}):
//   (a) a JS mirror of the WGSL kernel's Mono + Lagrange sequence, and
//   (b) a direct polynomial-algebra reference of ultra_arithmetic_relation.hpp.
// Agreement means the kernel's algorithm (the c1 packing, mixed-degree adds, the
// promotion, the mul-variant choices) is correct; the GPU run on the M4 then only
// has to match reference (b). All arithmetic is plain field mod p — the Montgomery
// domain is just a representation the GPU carries and is irrelevant to the math.

import { describe, expect, it } from '@jest/globals';

import { ShaderManager } from './cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from './cuzk/curve_config.js';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;
const modinv = (a: bigint, m = P): bigint => {
  let [or, r] = [mod(a), m];
  let [os, s] = [1n, 0n];
  while (r) {
    const q = or / r;
    [or, r] = [r, or - q * r];
    [os, s] = [s, os - q * s];
  }
  return mod(os);
};
const NEG_HALF = mod(-modinv(2n));

// ---- JS mirror of the WGSL Mono + Lagrange stack (plain field) ----
type Mono = { c0: bigint; c1: bigint; c2: bigint };
const fromEdge = (v0: bigint, v1: bigint): Mono => ({ c0: mod(v0), c1: mod(v1 - v0), c2: mod(v1) });
const mulCC = (a: Mono, b: Mono): Mono => { const c0 = mod(a.c0 * b.c0); return { c0, c2: mod(a.c1 * b.c1), c1: mod(a.c2 * b.c2 - c0) }; };
const mulGC = (a: Mono, b: Mono): Mono => { const c0 = mod(a.c0 * b.c0); return { c0, c2: mod(a.c1 * b.c1), c1: mod(mod(a.c0 + a.c1) * b.c2 - c0) }; };
const mulGG = (a: Mono, b: Mono): Mono => { const c0 = mod(a.c0 * b.c0); return { c0, c2: mod(a.c1 * b.c1), c1: mod(mod(a.c0 + a.c1) * mod(b.c0 + b.c1) - c0) }; };
const mAdd = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 + b.c0), c1: mod(a.c1 + b.c1), c2: mod(a.c2 + b.c2) });
const mSub = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 - b.c0), c1: mod(a.c1 - b.c1), c2: mod(a.c2 - b.c2) });
const mAddLin = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 + b.c0), c1: mod(a.c1 + b.c1), c2: a.c2 });
const mSubScalar = (a: Mono, s: bigint): Mono => ({ ...a, c0: mod(a.c0 - s) });
const mScale = (a: Mono, s: bigint): Mono => ({ c0: mod(a.c0 * s), c1: mod(a.c1 * s), c2: mod(a.c2 * s) });
const lagFromMono2 = (m: Mono, L: number): bigint[] => {
  const o = [m.c0];
  let prev = m.c0;
  for (let k = 1; k < L; k++) { prev = mod(prev + m.c1); o.push(prev); }
  return o;
};
const lagFromMono3 = (m: Mono, L: number): bigint[] => {
  const o = [m.c0];
  let prev = m.c0;
  let toAdd = m.c1;
  const deriv = mod(m.c2 + m.c2);
  for (let k = 1; k < L - 1; k++) { prev = mod(prev + toAdd); o.push(prev); toAdd = mod(toAdd + deriv); }
  o.push(mod(prev + toAdd));
  return o;
};
const lagMul = (a: bigint[], b: bigint[], L: number): bigint[] => Array.from({ length: L }, (_, k) => mod(a[k] * b[k]));
const lagAdd = (a: bigint[], b: bigint[], L: number): bigint[] => Array.from({ length: L }, (_, k) => mod(a[k] + b[k]));

// e = [w_l,w_r,w_o,w_4,w_4s,w_ls,q_m,q_l,q_r,q_o,q_4,q_c,q_arith] each [v0,v1]; scaling scalar
function kernelMirror(e: bigint[][], scaling: bigint): bigint[] {
  const E = (i: number) => fromEdge(e[i][0], e[i][1]);
  const w_l = E(0), w_r = E(1), w_o = E(2), w_4 = E(3), w_4s = E(4), w_ls = E(5);
  const q_m = E(6), q_l = E(7), q_r = E(8), q_o = E(9), q_4 = E(10), q_c = E(11), q_arith = E(12);
  const scaled = mScale(q_arith, scaling);
  const qm1 = mSubScalar(q_arith, 1n);
  // subrel 0 (L=6)
  const A0 = lagFromMono3(mScale(mulCC(w_r, w_l), NEG_HALF), 6);
  const B0 = lagFromMono3(mulGC(mSubScalar(q_arith, 3n), q_m), 6);
  const tmp0 = lagMul(A0, B0, 6);
  let tmp1 = mAdd(mulCC(q_l, w_l), mulCC(q_r, w_r));
  tmp1 = mAdd(tmp1, mulCC(q_o, w_o));
  tmp1 = mAdd(tmp1, mulCC(q_4, w_4));
  tmp1 = mAddLin(tmp1, q_c);
  tmp1 = mAdd(tmp1, mulGC(qm1, w_4s));
  const inner = lagAdd(tmp0, lagFromMono3(tmp1, 6), 6);
  const sub0 = lagMul(inner, lagFromMono2(scaled, 6), 6);
  // subrel 1 (L=5)
  let t0 = mAdd(w_l, w_4);
  t0 = mSub(t0, w_ls);
  t0 = mAdd(t0, q_m);
  const tmp_1 = mulGG(t0, mSubScalar(q_arith, 2n));
  const tmp_2 = mulGG(qm1, scaled);
  const sub1 = lagMul(lagFromMono3(tmp_1, 5), lagFromMono3(tmp_2, 5), 5);
  return [...sub0, ...sub1];
}

// ---- independent polynomial reference (coeff arrays) ----
type Poly = bigint[];
const pMul = (a: Poly, b: Poly): Poly => {
  const r: Poly = Array(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = mod(r[i + j] + a[i] * b[j]);
  return r;
};
const pAdd = (a: Poly, b: Poly): Poly => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => mod((a[i] ?? 0n) + (b[i] ?? 0n)));
const pSub = (a: Poly, b: Poly): Poly => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => mod((a[i] ?? 0n) - (b[i] ?? 0n)));
const pScale = (a: Poly, s: bigint): Poly => a.map(x => mod(x * s));
const pSubC = (a: Poly, s: bigint): Poly => { const r = a.slice(); r[0] = mod((r[0] ?? 0n) - s); return r; };
const edgePoly = (v0: bigint, v1: bigint): Poly => [mod(v0), mod(v1 - v0)];
const evalSet = (a: Poly, L: number): bigint[] => Array.from({ length: L }, (_, k) => {
  let acc = 0n; let xp = 1n;
  for (const c of a) { acc = mod(acc + c * xp); xp = mod(xp * BigInt(k)); }
  return acc;
});

function polyRef(e: bigint[][], scaling: bigint): bigint[] {
  const w_l = edgePoly(e[0][0], e[0][1]), w_r = edgePoly(e[1][0], e[1][1]), w_o = edgePoly(e[2][0], e[2][1]),
    w_4 = edgePoly(e[3][0], e[3][1]), w_4s = edgePoly(e[4][0], e[4][1]), w_ls = edgePoly(e[5][0], e[5][1]),
    q_m = edgePoly(e[6][0], e[6][1]), q_l = edgePoly(e[7][0], e[7][1]), q_r = edgePoly(e[8][0], e[8][1]),
    q_o = edgePoly(e[9][0], e[9][1]), q_4 = edgePoly(e[10][0], e[10][1]), q_c = edgePoly(e[11][0], e[11][1]),
    q_arith = edgePoly(e[12][0], e[12][1]);
  const scaled = pScale(q_arith, scaling);
  // subrel0
  const tmp0 = pMul(pScale(pMul(w_r, w_l), NEG_HALF), pMul(pSubC(q_arith, 3n), q_m));
  let tmp1 = pAdd(pAdd(pAdd(pMul(q_l, w_l), pMul(q_r, w_r)), pMul(q_o, w_o)), pMul(q_4, w_4));
  tmp1 = pAdd(tmp1, q_c);
  tmp1 = pAdd(tmp1, pMul(pSubC(q_arith, 1n), w_4s));
  const sub0 = evalSet(pMul(pAdd(tmp0, tmp1), scaled), 6);
  // subrel1
  const t0 = pAdd(pSub(pAdd(w_l, w_4), w_ls), q_m);
  const sub1 = evalSet(pMul(pMul(t0, pSubC(q_arith, 2n)), pMul(pSubC(q_arith, 1n), scaled)), 5);
  return [...sub0, ...sub1];
}

let seed = 0xdec0_de01_2345_6789n;
const rnd = (): bigint => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n); return mod(seed >> 2n); };

describe('ArithmeticRelation kernel mirror vs polynomial reference', () => {
  // exercise q_arith ∈ {0,1,2,3} (the four gate cases) and random
  const cases: (bigint | 'rand')[] = ['rand', 0n, 1n, 2n, 3n];
  for (const qa of cases) {
    it(`q_arith=${qa}: 11-Fr contribution matches`, () => {
      for (let t = 0; t < 200; t++) {
        const e: bigint[][] = Array.from({ length: 13 }, () => [rnd(), rnd()]);
        if (qa !== 'rand') e[12] = [qa, qa]; // constant q_arith edge
        const scaling = rnd();
        expect(kernelMirror(e, scaling)).toEqual(polyRef(e, scaling));
      }
    });
  }
});

describe('ArithmeticRelation shader codegen (F_r)', () => {
  const sm = new ShaderManager(4, 1 << 8, BN254_CURVE_CONFIG, false, 'scalar');
  const src = sm.gen_arithmetic_relation_test_shader(64);
  it('renders arithmetic_main and bakes the Montgomery constants', () => {
    expect(sm.p).toBe(BN254_SCALAR_FIELD);
    expect(src).toMatch(/@workgroup_size\(64\)\s*\nfn\s+arithmetic_main\b/);
    for (const c of ['FR_ONE', 'FR_TWO', 'FR_THREE', 'NEG_HALF']) expect(src).toMatch(new RegExp(`const ${c}: array<u32, 8>`));
    // NEG_HALF baked = toMont((p-1)/2): reconstruct the 8 words and check
    const m = src.match(/const NEG_HALF: array<u32, 8> = array<u32, 8>\(([^)]*)\)/);
    expect(m).not.toBeNull();
    const words = m![1].split(',').map(w => BigInt(w.trim().replace('u', '')));
    let val = 0n;
    for (let i = 7; i >= 0; i--) val = (val << 32n) | words[i];
    expect(val).toBe((sm.r * mod(-modinv(2n))) % P); // toMont(-1/2)
  });
});
