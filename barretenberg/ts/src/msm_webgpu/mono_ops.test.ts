// No-GPU oracle for the short-monomial (Mono) arithmetic — Phase-2 step 1.
//
// The GPU run (dev/sumcheck-webgpu) validates the WGSL transliteration on real
// hardware. This test validates the ALGORITHM the WGSL implements — the
// coefficient-basis arithmetic (UnivariateCoefficientBasis) and the Lagrange
// promotion, including the deliberate degree-2 `c1` packing (= X-coeff + X²-coeff)
// and the (a0+a1) Karatsuba cache — by mirroring it in BigInt and checking it
// against an INDEPENDENT polynomial reference (plain coefficient-array algebra).
// If the JS Mono path and the polynomial reference agree for every op, the
// algorithm is correct and the GPU only has to match the polynomial reference.
//
// It also renders the real gen_mono_ops_test_shader and asserts the Mono
// functions + entry points are present and the field is F_r.

import { describe, expect, it } from '@jest/globals';

import { ShaderManager } from './cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from './cuzk/curve_config.js';
import { BN254_SCALAR_FIELD } from './cuzk/bn254.js';

const P = BN254_SCALAR_FIELD;
const mod = (x: bigint): bigint => ((x % P) + P) % P;
const OUT_LEN = 7;

// ---- Independent polynomial reference (coefficient arrays, mod P) ----
type Poly = bigint[]; // poly[i] is the X^i coefficient
const pAdd = (a: Poly, b: Poly): Poly => {
  const n = Math.max(a.length, b.length);
  return Array.from({ length: n }, (_, i) => mod((a[i] ?? 0n) + (b[i] ?? 0n)));
};
const pSub = (a: Poly, b: Poly): Poly => {
  const n = Math.max(a.length, b.length);
  return Array.from({ length: n }, (_, i) => mod((a[i] ?? 0n) - (b[i] ?? 0n)));
};
const pMul = (a: Poly, b: Poly): Poly => {
  const r: Poly = Array(a.length + b.length - 1).fill(0n);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = mod(r[i + j] + a[i] * b[j]);
  return r;
};
const pNeg = (a: Poly): Poly => a.map(x => mod(-x));
const pScale = (a: Poly, s: bigint): Poly => a.map(x => mod(x * s));
const pAddConst = (a: Poly, s: bigint): Poly => {
  const r = a.slice();
  r[0] = mod((r[0] ?? 0n) + s);
  return r;
};
const pSubConst = (a: Poly, s: bigint): Poly => pAddConst(a, mod(-s));
const pEvalSet = (a: Poly): bigint[] =>
  Array.from({ length: OUT_LEN }, (_, k) => {
    const x = BigInt(k);
    let acc = 0n;
    let xp = 1n;
    for (const c of a) {
      acc = mod(acc + c * xp);
      xp = mod(xp * x);
    }
    return acc;
  });

// ---- JS mirror of the WGSL/C++ Mono (UnivariateCoefficientBasis) ----
type Mono = { c0: bigint; c1: bigint; c2: bigint };
const fromEdge = (v0: bigint, v1: bigint): Mono => ({ c0: mod(v0), c1: mod(v1 - v0), c2: mod(v1) });
// mul variants: c0=a0*b0, c2=a1*b1, c1=(a0+a1)(b0+b1)-c0 (cache used where available)
const mulCC = (a: Mono, b: Mono): Mono => {
  const c0 = mod(a.c0 * b.c0);
  return { c0, c2: mod(a.c1 * b.c1), c1: mod(a.c2 * b.c2 - c0) };
};
const mulCG = (a: Mono, b: Mono): Mono => {
  const c0 = mod(a.c0 * b.c0);
  return { c0, c2: mod(a.c1 * b.c1), c1: mod(a.c2 * mod(b.c0 + b.c1) - c0) };
};
const mulGC = (a: Mono, b: Mono): Mono => {
  const c0 = mod(a.c0 * b.c0);
  return { c0, c2: mod(a.c1 * b.c1), c1: mod(mod(a.c0 + a.c1) * b.c2 - c0) };
};
const mulGG = (a: Mono, b: Mono): Mono => {
  const c0 = mod(a.c0 * b.c0);
  return { c0, c2: mod(a.c1 * b.c1), c1: mod(mod(a.c0 + a.c1) * mod(b.c0 + b.c1) - c0) };
};
const sqrC = (a: Mono): Mono => ({ c0: mod(a.c0 * a.c0), c2: mod(a.c1 * a.c1), c1: mod(mod(a.c2 + a.c0) * a.c1) });
const sqrG = (a: Mono): Mono => {
  const c2 = mod(a.c1 * a.c1);
  return { c0: mod(a.c0 * a.c0), c2, c1: mod(mod(2n * a.c0 * a.c1) + c2) };
};
const mAdd = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 + b.c0), c1: mod(a.c1 + b.c1), c2: mod(a.c2 + b.c2) });
const mSub = (a: Mono, b: Mono): Mono => ({ c0: mod(a.c0 - b.c0), c1: mod(a.c1 - b.c1), c2: mod(a.c2 - b.c2) });
const mNeg = (a: Mono): Mono => ({ c0: mod(-a.c0), c1: mod(-a.c1), c2: mod(-a.c2) });
const mAddScalar = (a: Mono, s: bigint): Mono => ({ ...a, c0: mod(a.c0 + s) });
const mSubScalar = (a: Mono, s: bigint): Mono => ({ ...a, c0: mod(a.c0 - s) });
const mScale = (a: Mono, s: bigint): Mono => ({ c0: mod(a.c0 * s), c1: mod(a.c1 * s), c2: mod(a.c2 * s) });

// promotion recurrences — mirror univariate.hpp lines 67-94 exactly
const promote2 = (m: Mono): bigint[] => {
  const out = [m.c0];
  let prev = m.c0;
  for (let k = 1; k < OUT_LEN; k++) {
    prev = mod(prev + m.c1);
    out.push(prev);
  }
  return out;
};
const promote3 = (m: Mono): bigint[] => {
  const out = [m.c0];
  let prev = m.c0;
  let toAdd = m.c1;
  const deriv = mod(m.c2 + m.c2);
  for (let k = 1; k < OUT_LEN - 1; k++) {
    prev = mod(prev + toAdd);
    out.push(prev);
    toAdd = mod(toAdd + deriv);
  }
  out.push(mod(prev + toAdd));
  return out;
};

// edge {v0,v1} as a linear polynomial v0 + (v1-v0)X
const edgePoly = (v0: bigint, v1: bigint): Poly => [mod(v0), mod(v1 - v0)];

let seed = 0x1234_5678_9abc_def0n;
const rnd = (): bigint => {
  seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n);
  return mod(seed >> 2n);
};

describe('Mono short-monomial algorithm vs polynomial reference', () => {
  const TRIALS = 300;
  type Case = { name: string; mono: (e: bigint[], s: bigint) => bigint[]; poly: (e: bigint[], s: bigint) => Poly };
  // e = [a0,a1,b0,b1,c0,c1,d0,d1]; edges A=(a0,a1) B=(b0,b1) C=(c0,c1) D=(d0,d1)
  const A = (e: bigint[]) => fromEdge(e[0], e[1]);
  const B = (e: bigint[]) => fromEdge(e[2], e[3]);
  const C = (e: bigint[]) => fromEdge(e[4], e[5]);
  const D = (e: bigint[]) => fromEdge(e[6], e[7]);
  const pA = (e: bigint[]) => edgePoly(e[0], e[1]);
  const pB = (e: bigint[]) => edgePoly(e[2], e[3]);
  const pC = (e: bigint[]) => edgePoly(e[4], e[5]);
  const pD = (e: bigint[]) => edgePoly(e[6], e[7]);

  const cases: Case[] = [
    { name: 'edge_promote', mono: e => promote2(A(e)), poly: e => pA(e) },
    { name: 'mul_cc', mono: e => promote3(mulCC(A(e), B(e))), poly: e => pMul(pA(e), pB(e)) },
    { name: 'mul_cg', mono: e => promote3(mulCG(A(e), mSubScalar(B(e), 0n))), poly: e => pMul(pA(e), pB(e)) },
    { name: 'mul_gc', mono: e => promote3(mulGC(mSubScalar(A(e), 0n), B(e))), poly: e => pMul(pA(e), pB(e)) },
    {
      name: 'mul_gg',
      mono: (e, s) => promote3(mulGG(mSubScalar(A(e), s), mSubScalar(B(e), s))),
      poly: (e, s) => pMul(pSubConst(pA(e), s), pSubConst(pB(e), s)),
    },
    { name: 'sqr_c', mono: e => promote3(sqrC(A(e))), poly: e => pMul(pA(e), pA(e)) },
    {
      name: 'sqr_g',
      mono: (e, s) => promote3(sqrG(mSubScalar(A(e), s))),
      poly: (e, s) => pMul(pSubConst(pA(e), s), pSubConst(pA(e), s)),
    },
    {
      name: 'sub',
      mono: e => promote3(mSub(mulCC(A(e), B(e)), mulCC(C(e), D(e)))),
      poly: e => pSub(pMul(pA(e), pB(e)), pMul(pC(e), pD(e))),
    },
    {
      name: 'add',
      mono: e => promote3(mAdd(mulCC(A(e), B(e)), mulCC(C(e), D(e)))),
      poly: e => pAdd(pMul(pA(e), pB(e)), pMul(pC(e), pD(e))),
    },
    {
      name: 'scalar',
      mono: (e, s) => promote3(mScale(mulCC(A(e), B(e)), s)),
      poly: (e, s) => pScale(pMul(pA(e), pB(e)), s),
    },
    {
      name: 'add_scalar',
      mono: (e, s) => promote3(mAddScalar(mulCC(A(e), B(e)), s)),
      poly: (e, s) => pAddConst(pMul(pA(e), pB(e)), s),
    },
    { name: 'neg', mono: e => promote3(mNeg(mulCC(A(e), B(e)))), poly: e => pNeg(pMul(pA(e), pB(e))) },
  ];

  for (const c of cases) {
    it(`${c.name}: JS-Mono promotion matches the polynomial reference`, () => {
      for (let t = 0; t < TRIALS; t++) {
        const e = Array.from({ length: 8 }, () => rnd());
        const s = rnd();
        const got = c.mono(e, s);
        const want = pEvalSet(c.poly(e, s));
        expect(got).toEqual(want);
      }
    });
  }
});

describe('Mono shader codegen (F_r)', () => {
  const sm = new ShaderManager(4, 1 << 8, BN254_CURVE_CONFIG, false, 'scalar');
  const src = sm.gen_mono_ops_test_shader(64);

  it('targets F_r and defines the Mono type + arithmetic', () => {
    expect(sm.p).toBe(BN254_SCALAR_FIELD);
    expect(src).toMatch(/struct Mono\b/);
    for (const fn of ['mono_from_edge', 'mono_mul_cc', 'mono_mul_gg', 'mono_sqr_c', 'mono_sqr_g', 'mono_add', 'mono_sub', 'mono_neg', 'mono_mul_scalar']) {
      expect(src).toMatch(new RegExp(`fn ${fn}\\b`));
    }
  });

  it('exposes the test entry points at the requested workgroup size', () => {
    for (const fn of ['mono_edge_promote', 'mono_mul_cc_main', 'mono_mul_gg_main', 'mono_sqr_c_main', 'mono_sub_main', 'mono_add_main', 'mono_scalar_main', 'mono_neg_main']) {
      expect(src).toMatch(new RegExp(`@workgroup_size\\(64\\)\\s*\\nfn\\s+${fn}\\b`));
    }
  });
});
