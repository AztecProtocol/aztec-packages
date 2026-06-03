// No-GPU oracle for the three low-degree relation accumulate kernels
// (DeltaRange, EccOpQueue, Poseidon2InitialExternal). For each relation, a JS
// mirror of the WGSL Mono + Lagrange sequence is checked against an independent
// polynomial-algebra reference of the corresponding relations/*.hpp, over random
// inputs plus the forced selector-zero (skip) edge. Agreement means the kernel's
// algorithm (mul-variant choice, c1 packing, length-3/6 promotion, the matrix
// adds, the delta-range polynomial trick) is correct; the GPU run on the M4 then
// only has to match the polynomial reference. All arithmetic is plain field mod p.

import { describe, expect, it } from '@jest/globals';

import { ShaderManager } from './cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from './cuzk/curve_config.js';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;

// ---- JS mirror of the WGSL Mono + Lagrange stack (plain field) ----
type Mono = { c0: bigint; c1: bigint; c2: bigint };
const fromEdge = (v0: bigint, v1: bigint): Mono => ({ c0: mod(v0), c1: mod(v1 - v0), c2: mod(v1) });
const mulGG = (a: Mono, b: Mono): Mono => {
  const c0 = mod(a.c0 * b.c0);
  return { c0, c2: mod(a.c1 * b.c1), c1: mod(mod(a.c0 + a.c1) * mod(b.c0 + b.c1) - c0) };
};
const mAdd = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 + b.c0), c1: mod(a.c1 + b.c1), c2: mod(a.c2 + b.c2) });
const mSub = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 - b.c0), c1: mod(a.c1 - b.c1), c2: mod(a.c2 - b.c2) });
const mNeg = (a: Mono): Mono => ({ c0: mod(-a.c0), c1: mod(-a.c1), c2: mod(-a.c2) });
const mAddScalar = (a: Mono, s: bigint): Mono => ({ ...a, c0: mod(a.c0 + s) });
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

// ---- independent polynomial reference (coeff arrays) ----
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

// ---- DeltaRange ----
function deltaMirror(e: bigint[][], scaling: bigint): bigint[] {
  const [w_l, w_r, w_o, w_4, w_ls, q_dr] = e.map(([a, b]) => fromEdge(a, b));
  const slag = lagFromMono2(mScale(q_dr, scaling), 6);
  const out: bigint[] = [];
  for (const d of [mSub(w_r, w_l), mSub(w_o, w_r), mSub(w_4, w_o), mSub(w_ls, w_4)]) {
    const t = mulGG(mSubScalar(d, 3n), d);
    const lt = lagFromMono3(t, 6);
    const lt2 = lt.map(x => mod(x + 2n));
    out.push(...lagMul(lagMul(lt, lt2, 6), slag, 6));
  }
  return out;
}
function deltaRef(e: bigint[][], scaling: bigint): bigint[] {
  const [w_l, w_r, w_o, w_4, w_ls, q_dr] = e.map(([a, b]) => edgePoly(a, b));
  const qs = pScale(q_dr, scaling);
  const out: bigint[] = [];
  for (const d of [pSub(w_r, w_l), pSub(w_o, w_r), pSub(w_4, w_o), pSub(w_ls, w_4)]) {
    // independent: the bare product D(D-1)(D-2)(D-3), no (D-3)*D / (T+2) trick
    const quad = pMul(pMul(pMul(d, pSubC(d, 1n)), pSubC(d, 2n)), pSubC(d, 3n));
    out.push(...evalSet(pMul(quad, qs), 6));
  }
  return out;
}

// ---- EccOpQueue ----
function eccMirror(e: bigint[][], scaling: bigint): bigint[] {
  const [w1s, w2s, w3s, w4s, op1, op2, op3, op4, lecc] = e.map(([a, b]) => fromEdge(a, b));
  const lbs = mScale(lecc, scaling);
  const comp = mAddScalar(mNeg(lbs), scaling);
  const acc = (a: Mono, b: Mono): bigint[] => lagFromMono3(mulGG(a, b), 3);
  return [
    ...acc(mSub(op1, w1s), lbs), ...acc(mSub(op2, w2s), lbs), ...acc(mSub(op3, w3s), lbs), ...acc(mSub(op4, w4s), lbs),
    ...acc(op1, comp), ...acc(op2, comp), ...acc(op3, comp), ...acc(op4, comp),
  ];
}
function eccRef(e: bigint[][], scaling: bigint): bigint[] {
  const [w1s, w2s, w3s, w4s, op1, op2, op3, op4, lecc] = e.map(([a, b]) => edgePoly(a, b));
  const lbs = pScale(lecc, scaling);
  const comp = pAddC(pNeg(lbs), scaling);
  const out: bigint[] = [];
  for (const [op, ws] of [[op1, w1s], [op2, w2s], [op3, w3s], [op4, w4s]]) out.push(...evalSet(pMul(pSub(op, ws), lbs), 3));
  for (const op of [op1, op2, op3, op4]) out.push(...evalSet(pMul(op, comp), 3));
  return out;
}

// ---- Poseidon2InitialExternal ----
function pos2Mirror(e: bigint[][], scaling: bigint): bigint[] {
  const [x0, x1, x2, x3, y0, y1, y2, y3, q] = e.map(([a, b]) => fromEdge(a, b));
  const qbs = mScale(q, scaling);
  const t0 = mAdd(x0, x1), t1 = mAdd(x2, x3);
  const t2 = mAdd(mAdd(x1, x1), t1), t3 = mAdd(mAdd(x3, x3), t0);
  let y3c = mAdd(t1, t1); y3c = mAdd(mAdd(y3c, y3c), t3);
  let y1c = mAdd(t0, t0); y1c = mAdd(mAdd(y1c, y1c), t2);
  const y0c = mAdd(t3, y1c), y2c = mAdd(t2, y3c);
  const acc = (yc: Mono, y: Mono): bigint[] => lagFromMono3(mulGG(qbs, mSub(yc, y)), 3);
  return [...acc(y0c, y0), ...acc(y1c, y1), ...acc(y2c, y2), ...acc(y3c, y3)];
}
function pos2Ref(e: bigint[][], scaling: bigint): bigint[] {
  const [x0, x1, x2, x3, y0, y1, y2, y3, q] = e.map(([a, b]) => edgePoly(a, b));
  const qbs = pScale(q, scaling);
  const y0c = pAdd(pAdd(pAdd(pScale(x0, 5n), pScale(x1, 7n)), x2), pScale(x3, 3n));
  const y1c = pAdd(pAdd(pAdd(pScale(x0, 4n), pScale(x1, 6n)), x2), x3);
  const y2c = pAdd(pAdd(pAdd(x0, pScale(x1, 3n)), pScale(x2, 5n)), pScale(x3, 7n));
  const y3c = pAdd(pAdd(pAdd(x0, x1), pScale(x2, 4n)), pScale(x3, 6n));
  const out: bigint[] = [];
  for (const [yc, y] of [[y0c, y0], [y1c, y1], [y2c, y2], [y3c, y3]]) out.push(...evalSet(pMul(qbs, pSub(yc, y)), 3));
  return out;
}

let seed = 0x5eed_4ac3_1234_9001n;
const rnd = (): bigint => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n); return mod(seed >> 2n); };

const CASES: { name: string; numEdges: number; selIdx: number; mirror: typeof deltaMirror; ref: typeof deltaRef }[] = [
  { name: 'DeltaRange', numEdges: 6, selIdx: 5, mirror: deltaMirror, ref: deltaRef },
  { name: 'EccOpQueue', numEdges: 9, selIdx: 8, mirror: eccMirror, ref: eccRef },
  { name: 'Poseidon2InitialExternal', numEdges: 9, selIdx: 8, mirror: pos2Mirror, ref: pos2Ref },
];

describe('simple relation kernels: mirror vs polynomial reference', () => {
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

describe('simple relation shader codegen (F_r)', () => {
  const sm = new ShaderManager(4, 1 << 8, BN254_CURVE_CONFIG, false, 'scalar');
  it('renders each entry point', () => {
    expect(sm.gen_delta_range_relation_test_shader(64)).toMatch(/@workgroup_size\(64\)\s*\nfn\s+delta_range_main\b/);
    expect(sm.gen_ecc_op_queue_relation_test_shader(64)).toMatch(/@workgroup_size\(64\)\s*\nfn\s+ecc_op_queue_main\b/);
    expect(sm.gen_poseidon2_initial_relation_test_shader(64)).toMatch(/@workgroup_size\(64\)\s*\nfn\s+poseidon2_initial_main\b/);
  });
  it('bakes DeltaRange FF(2)/FF(3) in Montgomery form', () => {
    const src = sm.gen_delta_range_relation_test_shader(64);
    for (const [name, val] of [['FR_TWO', 2n], ['FR_THREE', 3n]] as const) {
      const m = src.match(new RegExp(`const ${name}: array<u32, 8> = array<u32, 8>\\(([^)]*)\\)`));
      expect(m).not.toBeNull();
      const words = m![1].split(',').map(w => BigInt(w.trim().replace('u', '')));
      let v = 0n;
      for (let i = 7; i >= 0; i--) v = (v << 32n) | words[i];
      expect(v).toBe((sm.r * val) % P); // toMont(val)
    }
  });
});
