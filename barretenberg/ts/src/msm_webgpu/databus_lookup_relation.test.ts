// No-GPU oracle for the DatabusLookupRelation accumulate kernel. Five bus columns
// x three length-6 subrelations (90 Fr). Checked three ways:
//   (1) random: JS Lag mirror == independent polynomial reference (mechanics);
//   (2) skip: q_busread == 0 and all read_counts == 0 -> all 90 evals zero;
//   (3) valid inverse: on constant edges with I = 1/(L*T), the inverse-correctness
//       subrelations (1a, 1b) of every bus are identically zero (semantic check of
//       the I*L*T-1 formula).
// Subrelation (2) per bus is linearly dependent: NOT scaled. Params [beta, gamma].

import { describe, expect, it } from '@jest/globals';

import { ShaderManager } from './cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from './cuzk/curve_config.js';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;
const modinv = (a: bigint): bigint => {
  let [or, r] = [mod(a), P];
  let [os, s] = [1n, 0n];
  while (r) { const q = or / r; [or, r] = [r, or - q * r]; [os, s] = [s, os - q * s]; }
  return mod(os);
};

// ---- JS mirror of the WGSL Mono + Lagrange stack ----
type Mono = { c0: bigint; c1: bigint; c2: bigint };
type Lag = bigint[];
const fromEdge = (v0: bigint, v1: bigint): Mono => ({ c0: mod(v0), c1: mod(v1 - v0), c2: mod(v1) });
const mAdd = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 + b.c0), c1: mod(a.c1 + b.c1), c2: mod(a.c2 + b.c2) });
const mAddScalar = (a: Mono, s: bigint): Mono => ({ ...a, c0: mod(a.c0 + s) });
const mScale = (a: Mono, s: bigint): Mono => ({ c0: mod(a.c0 * s), c1: mod(a.c1 * s), c2: mod(a.c2 * s) });
const l2 = (m: Mono): Lag => { const o = [m.c0]; let p = m.c0; for (let k = 1; k < 6; k++) { p = mod(p + m.c1); o.push(p); } return o; };
const lMul = (a: Lag, b: Lag): Lag => a.map((x, k) => mod(x * b[k]));
const lSub = (a: Lag, b: Lag): Lag => a.map((x, k) => mod(x - b[k]));
const lScale = (a: Lag, s: bigint): Lag => a.map(x => mod(x * s));

// ---- independent polynomial reference ----
type Poly = bigint[];
const pMul = (a: Poly, b: Poly): Poly => { const r: Poly = Array(a.length + b.length - 1).fill(0n); for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = mod(r[i + j] + a[i] * b[j]); return r; };
const pSub = (a: Poly, b: Poly): Poly => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => mod((a[i] ?? 0n) - (b[i] ?? 0n)));
const pScale = (a: Poly, s: bigint): Poly => a.map(x => mod(x * s));
const pAddC = (a: Poly, s: bigint): Poly => { const r = a.slice(); r[0] = mod((r[0] ?? 0n) + s); return r; };
const pAdd = (a: Poly, b: Poly): Poly => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => mod((a[i] ?? 0n) + (b[i] ?? 0n)));
const edgePoly = (v0: bigint, v1: bigint): Poly => [mod(v0), mod(v1 - v0)];
const evalSet = (a: Poly, L: number): bigint[] => Array.from({ length: L }, (_, k) => { let acc = 0n, xp = 1n; for (const c of a) { acc = mod(acc + c * xp); xp = mod(xp * BigInt(k)); } return acc; });

// e: 0 w_l, 1 w_r, 2 databus_id, 3 q_busread, then bus j (0..4): 4+4j value, +1 sel, +2 inv, +3 rc.
function busMirror(e: bigint[][], scaling: bigint, beta: bigint, gamma: bigint): bigint[] {
  const E = e.map(([a, b]) => fromEdge(a, b));
  const [w_l, w_r, db_id, qbr] = E;
  const llag = l2(mAddScalar(mAdd(mScale(w_r, beta), w_l), gamma));
  const dbg = mAddScalar(mScale(db_id, beta), gamma);
  const qbrlag = l2(qbr);
  const ones = l2({ c0: 1n, c1: 0n, c2: 0n });
  const out: bigint[] = [];
  for (let j = 0; j < 5; j++) {
    const [value, sel, inv, rc] = [E[4 + 4 * j], E[5 + 4 * j], E[6 + 4 * j], E[7 + 4 * j]];
    const tlag = l2(mAdd(dbg, value));
    const rslag = lMul(qbrlag, l2(sel));
    const invlag = l2(inv);
    const rclag = l2(rc);
    const common = lSub(lMul(lMul(llag, tlag), invlag), ones);
    out.push(...lScale(lMul(common, rslag), scaling));
    out.push(...lScale(lMul(common, rclag), scaling));
    out.push(...lMul(lSub(lMul(rslag, tlag), lMul(rclag, llag)), invlag));
  }
  return out;
}
function busRef(e: bigint[][], scaling: bigint, beta: bigint, gamma: bigint): bigint[] {
  const E = e.map(([a, b]) => edgePoly(a, b));
  const [w_l, w_r, db_id, qbr] = E;
  const L = pAddC(pAdd(pScale(w_r, beta), w_l), gamma);
  const out: bigint[] = [];
  for (let j = 0; j < 5; j++) {
    const [value, sel, inv, rc] = [E[4 + 4 * j], E[5 + 4 * j], E[6 + 4 * j], E[7 + 4 * j]];
    const T = pAddC(pAdd(pScale(db_id, beta), value), gamma);
    const rs = pMul(qbr, sel);
    const common = pAddC(pMul(pMul(L, T), inv), mod(-1n));
    out.push(...evalSet(pScale(pMul(common, rs), scaling), 6));
    out.push(...evalSet(pScale(pMul(common, rc), scaling), 6));
    out.push(...evalSet(pMul(pSub(pMul(rs, T), pMul(rc, L)), inv), 6));
  }
  return out;
}

let seed = 0xda7ab5_10010001n;
const rnd = (): bigint => { seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n); return mod(seed >> 2n); };

describe('DatabusLookup kernel mirror vs polynomial reference', () => {
  it('random: contribution matches', () => {
    for (let t = 0; t < 80; t++) {
      const e: bigint[][] = Array.from({ length: 24 }, () => [rnd(), rnd()]);
      const [scaling, beta, gamma] = [rnd(), rnd(), rnd()];
      expect(busMirror(e, scaling, beta, gamma)).toEqual(busRef(e, scaling, beta, gamma));
    }
  });

  it('skip (q_busread == 0 && all read_counts == 0): all zero', () => {
    for (let t = 0; t < 30; t++) {
      const e: bigint[][] = Array.from({ length: 24 }, () => [rnd(), rnd()]);
      e[3] = [0n, 0n]; // q_busread
      for (let j = 0; j < 5; j++) e[7 + 4 * j] = [0n, 0n]; // read_counts
      const [scaling, beta, gamma] = [rnd(), rnd(), rnd()];
      expect(busMirror(e, scaling, beta, gamma)).toEqual(Array.from({ length: 90 }, () => 0n));
    }
  });

  it('valid inverse (I = 1/(L*T) on constant edges): subrels 1a, 1b are zero', () => {
    for (let t = 0; t < 30; t++) {
      const beta = rnd(), gamma = rnd(), scaling = rnd();
      const w_l = rnd(), w_r = rnd(), db_id = rnd(), qbr = rnd();
      const L = mod(mod(w_r * beta) + w_l + gamma);
      const e: bigint[][] = [[w_l, w_l], [w_r, w_r], [db_id, db_id], [qbr, qbr]];
      for (let j = 0; j < 5; j++) {
        const value = rnd(), sel = rnd(), rc = rnd();
        const T = mod(mod(db_id * beta) + value + gamma);
        const inv = modinv(mod(L * T)); // I = 1/(L*T)
        e.push([value, value], [sel, sel], [inv, inv], [rc, rc]);
      }
      const got = busMirror(e, scaling, beta, gamma);
      for (let j = 0; j < 5; j++) {
        for (let k = 0; k < 12; k++) expect(got[j * 18 + k]).toBe(0n); // (1a) + (1b) slots
      }
    }
  });
});

describe('DatabusLookup shader codegen (F_r)', () => {
  const sm = new ShaderManager(4, 1 << 8, BN254_CURVE_CONFIG, false, 'scalar');
  it('renders the entry point and binds the params buffer', () => {
    const src = sm.gen_databus_lookup_relation_test_shader(64);
    expect(src).toMatch(/fn\s+databus_lookup_main\b/);
    expect(src).toMatch(/@group\(0\) @binding\(3\) var<storage, read> scaling/);
    expect(src).toMatch(/@group\(0\) @binding\(4\) var<storage, read> param_buf/);
  });
});
