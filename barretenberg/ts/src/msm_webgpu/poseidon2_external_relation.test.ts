// No-GPU oracle for the Poseidon2ExternalRelation accumulate kernel. A JS mirror
// of the WGSL Lagrange sequence (the elementwise x^5 S-box and the M_E matrix
// additions) is checked against an independent polynomial-algebra reference of
// relations/poseidon2_external_relation.hpp, over random inputs plus the
// q_poseidon2_external == 0 skip edge. No relation parameters; round constants
// are columns. Plain field mod p throughout.

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
const mAdd = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 + b.c0), c1: mod(a.c1 + b.c1), c2: mod(a.c2 + b.c2) });
const mScale = (a: Mono, s: bigint): Mono => ({ c0: mod(a.c0 * s), c1: mod(a.c1 * s), c2: mod(a.c2 * s) });
const lagFromMono2 = (m: Mono, L: number): Lag => {
  const o = [m.c0];
  let prev = m.c0;
  for (let k = 1; k < L; k++) { prev = mod(prev + m.c1); o.push(prev); }
  return o;
};
const lagSqr = (a: Lag, L: number): Lag => Array.from({ length: L }, (_, k) => mod(a[k] * a[k]));
const lagMul = (a: Lag, b: Lag, L: number): Lag => Array.from({ length: L }, (_, k) => mod(a[k] * b[k]));
const lagAdd = (a: Lag, b: Lag, L: number): Lag => Array.from({ length: L }, (_, k) => mod(a[k] + b[k]));
const lagSub = (a: Lag, b: Lag, L: number): Lag => Array.from({ length: L }, (_, k) => mod(a[k] - b[k]));
const sbox = (m: Mono): Lag => {
  const x = lagFromMono2(m, 7);
  return lagMul(lagSqr(lagSqr(x, 7), 7), x, 7);
};

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
const edgePoly = (v0: bigint, v1: bigint): Poly => [mod(v0), mod(v1 - v0)];
const pPow5 = (p: Poly): Poly => pMul(pMul(pMul(pMul(p, p), p), p), p);
const evalSet = (a: Poly, L: number): bigint[] => Array.from({ length: L }, (_, k) => {
  let acc = 0n; let xp = 1n;
  for (const c of a) { acc = mod(acc + c * xp); xp = mod(xp * BigInt(k)); }
  return acc;
});

// e indices: 0-3 w1..4, 4-7 w1..4_shift, 8-11 c1..4 (q_l/r/o/4), 12 q_poseidon2_external.
function extMirror(e: bigint[][], scaling: bigint): bigint[] {
  const [w1, w2, w3, w4, w1s, w2s, w3s, w4s, c1, c2, c3, c4, qpe] = e.map(([a, b]) => fromEdge(a, b));
  const u1 = sbox(mAdd(w1, c1)), u2 = sbox(mAdd(w2, c2)), u3 = sbox(mAdd(w3, c3)), u4 = sbox(mAdd(w4, c4));
  const t0 = lagAdd(u1, u2, 7), t1 = lagAdd(u3, u4, 7);
  const t2 = lagAdd(lagAdd(u2, u2, 7), t1, 7), t3 = lagAdd(lagAdd(u4, u4, 7), t0, 7);
  const v4 = lagAdd(lagAdd(lagAdd(t1, t1, 7), lagAdd(t1, t1, 7), 7), t3, 7);
  const v2 = lagAdd(lagAdd(lagAdd(t0, t0, 7), lagAdd(t0, t0, 7), 7), t2, 7);
  const v1 = lagAdd(t3, v2, 7), v3 = lagAdd(t2, v4, 7);
  const qps = lagFromMono2(mScale(qpe, scaling), 7);
  const acc = (v: Lag, ws: Mono): Lag => lagMul(qps, lagSub(v, lagFromMono2(ws, 7), 7), 7);
  return [...acc(v1, w1s), ...acc(v2, w2s), ...acc(v3, w3s), ...acc(v4, w4s)];
}
function extRef(e: bigint[][], scaling: bigint): bigint[] {
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

let seed = 0x9051d0ec0fe50001n;
const rnd = (): bigint => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n); return mod(seed >> 2n); };

describe('Poseidon2External kernel mirror vs polynomial reference', () => {
  for (const skip of [false, true]) {
    it(`${skip ? 'q_poseidon2_external == 0 (skip)' : 'random'}: contribution matches`, () => {
      for (let t = 0; t < 120; t++) {
        const e: bigint[][] = Array.from({ length: 13 }, () => [rnd(), rnd()]);
        if (skip) e[12] = [0n, 0n];
        const scaling = rnd();
        expect(extMirror(e, scaling)).toEqual(extRef(e, scaling));
      }
    });
  }
});

describe('Poseidon2External shader codegen (F_r)', () => {
  const sm = new ShaderManager(4, 1 << 8, BN254_CURVE_CONFIG, false, 'scalar');
  it('renders the entry point', () => {
    expect(sm.gen_poseidon2_external_relation_test_shader(64)).toMatch(/@workgroup_size\(64\)\s*\nfn\s+poseidon2_external_main\b/);
  });
});
