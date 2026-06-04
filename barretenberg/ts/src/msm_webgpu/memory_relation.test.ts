// No-GPU oracle for the MemoryRelation accumulate kernel. A JS mirror of the
// WGSL Mono + Lagrange sequence is checked against an independent
// polynomial-algebra reference of relations/memory_relation.hpp, over random
// inputs plus the q_memory == 0 skip edge. eta/eta_two/eta_three are degree-0
// params. Plain field mod p throughout.

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
const sqrG = (a: Mono): Mono => ({ c0: mod(a.c0 * a.c0), c2: mod(a.c1 * a.c1), c1: mod(2n * a.c0 * a.c1 + a.c1 * a.c1) });
const mAdd = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 + b.c0), c1: mod(a.c1 + b.c1), c2: mod(a.c2 + b.c2) });
const mSub = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 - b.c0), c1: mod(a.c1 - b.c1), c2: mod(a.c2 - b.c2) });
const mAddLin = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 + b.c0), c1: mod(a.c1 + b.c1), c2: a.c2 });
const mSubLin = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 - b.c0), c1: mod(a.c1 - b.c1), c2: a.c2 });
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
const lagAdd = (a: Lag, b: Lag, L: number): Lag => Array.from({ length: L }, (_, k) => mod(a[k] + b[k]));

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

// e indices: 0-3 w1..4, 4-7 w1..4_shift, 8-13 q1(q_l)/q2(q_r)/q3(q_o)/q4/qm/qc, 14 q_memory.
function memMirror(e: bigint[][], scaling: bigint, par: bigint[]): bigint[] {
  const [eta, eta2, eta3] = par;
  const [w1, w2, w3, w4, w1s, w2s, w3s, w4s, q1, q2, q3, q4, qm, qc, qmem] = e.map(([a, b]) => fromEdge(a, b));
  let prc = mAdd(mAdd(mAdd(mScale(w3, eta3), mScale(w2, eta2)), mScale(w1, eta)), qc);
  const mrc = mSub(prc, w4);
  const nid = mSub(w1, w1s);
  const idz = mAddScalar(nid, 1n);
  const record_delta = mSub(w4s, w4);
  const qmbs = mScale(qmem, scaling);
  const q12 = mulGG(q1, q2);
  const q3bms_m = mulGG(q3, qmbs);
  const iizoo_m = mAddLin(sqrG(nid), nid);
  const avmaim_m = mulGG(idz, record_delta);
  const access_m = mAddLin(sqrG(mrc), mrc);
  let nngat = mAdd(mAdd(mScale(w3s, eta3), mScale(w2s, eta2)), mScale(w1s, eta));
  nngat = mSub(nngat, w4s);
  const ngatib_m = mAddLin(sqrG(nngat), nngat);
  const value_delta = mSub(w3s, w3);
  const timestamp_delta = mSub(w2s, w2);
  const rtci_m = mSubLin(mulGG(idz, timestamp_delta), w3);

  const q12bmbs = lagMul(lagFromMono3(q12, 6), lagFromMono2(qmbs, 6), 6);
  const q3bms = lagFromMono3(q3bms_m, 6);
  const iizoo = lagFromMono3(iizoo_m, 6);
  const sub1 = lagMul(lagFromMono3(avmaim_m, 6), q12bmbs, 6);
  const sub2 = lagMul(iizoo, q12bmbs, 6);
  const avmaim_read = lagMul(lagFromMono3(mulGG(idz, value_delta), 6), lagFromMono2(mAddScalar(nngat, 1n), 6), 6);
  const sub3 = lagMul(avmaim_read, q3bms, 6);
  const sub4 = lagMul(iizoo, q3bms, 6);
  const sub5 = lagMul(lagFromMono3(ngatib_m, 6), q3bms, 6);
  const rom_cci = lagMul(lagFromMono2(mrc, 6), lagFromMono3(q12, 6), 6);
  const term_rtci = lagMul(lagFromMono3(rtci_m, 6), lagFromMono3(mulGG(q4, q1), 6), 6);
  const term_mrc = lagMul(lagFromMono2(mrc, 6), lagFromMono3(mulGG(qm, q1), 6), 6);
  const mid = lagAdd(lagAdd(rom_cci, term_rtci, 6), term_mrc, 6);
  const mid_scaled = lagMul(mid, lagFromMono2(qmbs, 6), 6);
  const ram_cci = lagMul(lagFromMono3(access_m, 6), q3bms, 6);
  const sub0 = lagAdd(mid_scaled, ram_cci, 6);
  return [...sub0, ...sub1, ...sub2, ...sub3, ...sub4, ...sub5];
}
function memRef(e: bigint[][], scaling: bigint, par: bigint[]): bigint[] {
  const [eta, eta2, eta3] = par;
  const [w1, w2, w3, w4, w1s, w2s, w3s, w4s, q1, q2, q3, q4, qm, qc, qmem] = e.map(([a, b]) => edgePoly(a, b));
  const prc = pAdd(pAdd(pAdd(pScale(w3, eta3), pScale(w2, eta2)), pScale(w1, eta)), qc);
  const mrc = pSub(prc, w4);
  const nid = pSub(w1, w1s);
  const idz = pAddC(nid, 1n);
  const record_delta = pSub(w4s, w4);
  const qmbs = pScale(qmem, scaling);
  const q12 = pMul(q1, q2);
  const q3bms = pMul(q3, qmbs);
  const iizoo = pAdd(pMul(nid, nid), nid);
  const avmaim = pMul(idz, record_delta);
  const access = pAdd(pMul(mrc, mrc), mrc);
  const nngat = pSub(pAdd(pAdd(pScale(w3s, eta3), pScale(w2s, eta2)), pScale(w1s, eta)), w4s);
  const ngatib = pAdd(pMul(nngat, nngat), nngat);
  const value_delta = pSub(w3s, w3);
  const timestamp_delta = pSub(w2s, w2);
  const rtci = pSub(pMul(idz, timestamp_delta), w3);

  const q12bmbs = pMul(q12, qmbs);
  const sub1 = evalSet(pMul(avmaim, q12bmbs), 6);
  const sub2 = evalSet(pMul(iizoo, q12bmbs), 6);
  const avmaim_read = pMul(pMul(idz, value_delta), pAddC(nngat, 1n));
  const sub3 = evalSet(pMul(avmaim_read, q3bms), 6);
  const sub4 = evalSet(pMul(iizoo, q3bms), 6);
  const sub5 = evalSet(pMul(ngatib, q3bms), 6);
  const rom_cci = pMul(mrc, q12);
  const term_rtci = pMul(rtci, pMul(q4, q1));
  const term_mrc = pMul(mrc, pMul(qm, q1));
  const mid = pMul(pAdd(pAdd(rom_cci, term_rtci), term_mrc), qmbs);
  const ram_cci = pMul(access, q3bms);
  const sub0 = evalSet(pAdd(mid, ram_cci), 6);
  return [...sub0, ...sub1, ...sub2, ...sub3, ...sub4, ...sub5];
}

let seed = 0x31337dead0001abcn;
const rnd = (): bigint => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n); return mod(seed >> 2n); };

describe('MemoryRelation kernel mirror vs polynomial reference', () => {
  for (const skip of [false, true]) {
    it(`${skip ? 'q_memory == 0 (skip)' : 'random'}: contribution matches`, () => {
      for (let t = 0; t < 120; t++) {
        const e: bigint[][] = Array.from({ length: 15 }, () => [rnd(), rnd()]);
        if (skip) e[14] = [0n, 0n]; // q_memory
        const scaling = rnd();
        const par = [rnd(), rnd(), rnd()]; // eta, eta_two, eta_three
        expect(memMirror(e, scaling, par)).toEqual(memRef(e, scaling, par));
      }
    });
  }
});

describe('MemoryRelation shader codegen (F_r)', () => {
  const sm = new ShaderManager(4, 1 << 8, BN254_CURVE_CONFIG, false, 'scalar');
  it('renders the entry point and binds the params buffer', () => {
    const src = sm.gen_memory_relation_test_shader(64);
    expect(src).toMatch(/@workgroup_size\(64\)\s*\nfn\s+memory_main\b/);
    expect(src).toMatch(/@group\(0\) @binding\(3\) var<storage, read> param_buf/);
  });
});
