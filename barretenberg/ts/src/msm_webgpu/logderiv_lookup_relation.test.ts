// No-GPU oracle for the LogDerivLookupRelation accumulate kernel. A JS mirror of
// the WGSL Mono + Lagrange sequence is checked against an independent
// polynomial-algebra reference of relations/logderiv_lookup_relation.hpp, over
// random inputs plus the q_lookup == 0 && read_counts == 0 skip edge.
// Subrelation 1 (the lookup identity) is linearly dependent: NOT scaled. Params
// [gamma, beta, beta_sqr, beta_cube] are degree-0 scalars. (lookup_inverses is
// fed random: the kernel computes the accumulate formula, not satisfiability.)

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
const mAddLin = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 + b.c0), c1: mod(a.c1 + b.c1), c2: a.c2 });
const mSubLin = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 - b.c0), c1: mod(a.c1 - b.c1), c2: a.c2 });
const mNeg = (a: Mono): Mono => ({ c0: mod(-a.c0), c1: mod(-a.c1), c2: mod(-a.c2) });
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
const pNeg = (a: Poly): Poly => a.map(x => mod(-x));
const edgePoly = (v0: bigint, v1: bigint): Poly => [mod(v0), mod(v1 - v0)];
const evalSet = (a: Poly, L: number): bigint[] => Array.from({ length: L }, (_, k) => {
  let acc = 0n; let xp = 1n;
  for (const c of a) { acc = mod(acc + c * xp); xp = mod(xp * BigInt(k)); }
  return acc;
});

// e indices: 0-3 table_1..4, 4-6 w_l/r/o, 7-9 w_l/r/o_shift, 10 q_o, 11 q_r,
// 12 q_m, 13 q_c, 14 inverses, 15 read_counts, 16 q_lookup, 17 read_tags.
function lookMirror(e: bigint[][], scaling: bigint, par: bigint[]): bigint[] {
  const [gamma, beta, beta_sqr, beta_cube] = par;
  const E = e.map(([a, b]) => fromEdge(a, b));
  const [t1, t2, t3, t4, w_l, w_r, w_o, w_ls, w_rs, w_os, q_o, q_r, q_m, q_c, inv, rc, ql, rt] = E;
  let tt = mScale(t2, beta);
  tt = mAdd(tt, mScale(t3, beta_sqr)); tt = mAdd(tt, mScale(t4, beta_cube)); tt = mAdd(tt, t1); tt = mAddScalar(tt, gamma);
  const dt1 = mAddLin(mulGG(q_r, w_ls), mAddScalar(w_l, gamma));
  const dt2 = mAddLin(mulGG(q_m, w_rs), w_r);
  const dt3 = mAddLin(mulGG(q_c, w_os), w_o);
  const tie = mScale(q_o, beta_cube);
  let lt = mScale(dt2, beta);
  lt = mAdd(lt, mScale(dt3, beta_sqr)); lt = mAdd(lt, mAddLin(dt1, tie));
  let ie = mNeg(mulGG(rt, ql)); ie = mAddLin(ie, rt); ie = mAddLin(ie, ql);
  const lt_lag = lagFromMono3(lt, 5), tt_lag = lagFromMono2(tt, 5);
  const sub0 = lagSub(
    lagMul(lagMul(lt_lag, tt_lag, 5), lagFromMono2(mScale(inv, scaling), 5), 5),
    lagFromMono3(mScale(ie, scaling), 5), 5,
  );
  const sub1 = lagMul(
    lagSub(lagMul(lagFromMono2(ql, 5), tt_lag, 5), lagMul(lagFromMono2(rc, 5), lt_lag, 5), 5),
    lagFromMono2(inv, 5), 5,
  );
  const sub2 = lagFromMono3(mScale(mSubLin(sqrG(rt), rt), scaling), 3);
  return [...sub0, ...sub1, ...sub2];
}
function lookRef(e: bigint[][], scaling: bigint, par: bigint[]): bigint[] {
  const [gamma, beta, beta_sqr, beta_cube] = par;
  const E = e.map(([a, b]) => edgePoly(a, b));
  const [t1, t2, t3, t4, w_l, w_r, w_o, w_ls, w_rs, w_os, q_o, q_r, q_m, q_c, inv, rc, ql, rt] = E;
  const tt = pAddC(pAdd(pAdd(pAdd(pScale(t2, beta), pScale(t3, beta_sqr)), pScale(t4, beta_cube)), t1), gamma);
  const dt1 = pAdd(pMul(q_r, w_ls), pAddC(w_l, gamma));
  const dt2 = pAdd(pMul(q_m, w_rs), w_r);
  const dt3 = pAdd(pMul(q_c, w_os), w_o);
  const tie = pScale(q_o, beta_cube);
  const lt = pAdd(pAdd(pScale(dt2, beta), pScale(dt3, beta_sqr)), pAdd(dt1, tie));
  const ie = pAdd(pAdd(pNeg(pMul(rt, ql)), rt), ql);
  const sub0 = evalSet(pScale(pSub(pMul(pMul(lt, tt), inv), ie), scaling), 5);
  const sub1 = evalSet(pMul(pSub(pMul(ql, tt), pMul(rc, lt)), inv), 5);
  const sub2 = evalSet(pScale(pSub(pMul(rt, rt), rt), scaling), 3);
  return [...sub0, ...sub1, ...sub2];
}

let seed = 0x10ad_de41_2222_0001n;
const rnd = (): bigint => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n); return mod(seed >> 2n); };

describe('LogDerivLookup kernel mirror vs polynomial reference', () => {
  for (const skip of [false, true]) {
    it(`${skip ? 'q_lookup == 0 && read_counts == 0 (skip)' : 'random'}: contribution matches`, () => {
      for (let t = 0; t < 150; t++) {
        const e: bigint[][] = Array.from({ length: 18 }, () => [rnd(), rnd()]);
        if (skip) { e[15] = [0n, 0n]; e[16] = [0n, 0n]; } // read_counts, q_lookup
        const scaling = rnd();
        const beta = rnd();
        const par = [rnd(), beta, mod(beta * beta), mod(beta * beta * beta)]; // gamma, beta, beta^2, beta^3
        expect(lookMirror(e, scaling, par)).toEqual(lookRef(e, scaling, par));
      }
    });
  }
});

describe('LogDerivLookup shader codegen (F_r)', () => {
  const sm = new ShaderManager(4, 1 << 8, BN254_CURVE_CONFIG, false, 'scalar');
  it('renders the entry point and binds the params buffer', () => {
    const src = sm.gen_logderiv_lookup_relation_test_shader(64);
    expect(src).toMatch(/@workgroup_size\(64\)\s*\nfn\s+logderiv_lookup_main\b/);
    expect(src).toMatch(/@group\(0\) @binding\(3\) var<storage, read> scaling/);
    expect(src).toMatch(/@group\(0\) @binding\(4\) var<storage, read> param_buf/);
  });
});
