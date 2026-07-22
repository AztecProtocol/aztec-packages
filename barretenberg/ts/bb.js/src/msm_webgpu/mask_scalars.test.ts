// Node-side unit tests for the additive scalar-masking pre-pass. None need a
// GPU — they validate the parts of the masking idea that are pure arithmetic:
//
// 1. WGSL substitution + modulus. We render `mask_scalars` and reconstruct the
//    scalar field modulus r from the eight R8_* limb constants baked into the
//    shader source, asserting it equals noble's Fr.ORDER. A typo in any limb
//    (the highest-risk bug — it would silently corrupt every masked scalar)
//    fails here instead of as a wrong commitment on the GPU.
//
// 2. Pure-JS port of the shader's 8×u32 (s + R) mod r limb arithmetic, checked
//    against BigInt for carry/borrow edge cases (sum == r, sum == 2r-2), the
//    structured scalar shapes that break the GPU, and bulk random inputs.
//
// 3. The masking algebra end to end: for structured scalars over random points,
//    C' - O == C where C' = Σ((s+R) mod r)P, O = Σ R·P, C = Σ s·P. This is the
//    identity the bridge relies on (mask on GPU, subtract the precomputed offset
//    O from window 0). It holds for any points, so noble's group ops suffice.
//
// The on-GPU counterpart — that masking actually makes the GPU compute the
// structured MSM correctly — is `testRawMsmMasked` in the browser bench harness,
// which must run on real hardware.

import { describe, expect, it } from '@jest/globals';
import { bn254 } from '@noble/curves/bn254';

import { ShaderManager } from './cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from './cuzk/curve_config.js';

const r = bn254.fields.Fr.ORDER;
const G = bn254.G1.ProjectivePoint;

// Deterministic PRNG — no Math.random, reproducible failures.
let prng = 0x9e3779b97f4a7c15n;
const rand64 = (): bigint => {
  prng = (prng * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
  return prng >> 1n;
};
const randFr = (): bigint => {
  let v = 0n;
  for (let i = 0; i < 4; i++) v = (v << 64n) | rand64();
  return v % r;
};

const MASK14 = (1n << 14n) - 1n;
type Shape = 'random' | 'small' | 'sparse' | 'binary' | 'repeated';
const genScalar = (shape: Shape): bigint => {
  const x = randFr();
  switch (shape) {
    case 'small':
      return x & MASK14;
    case 'sparse':
      return x % 10n < 7n ? 0n : x & MASK14;
    case 'binary':
      return x & 1n;
    case 'repeated':
      return BigInt(Number(x & 0xffn) % 8);
    default:
      return x;
  }
};

// Exact port of mask_scalars.template.wgsl's body: (a + b) mod r over 8×u32 LE
// limbs, mirroring the shader's carry/borrow (carry-out = u32(sum < operand)).
const R8 = [0xf0000001, 0x43e1f593, 0x79b97091, 0x2833e848, 0x8181585d, 0xb85045b6, 0xe131a029, 0x30644e72];
const u32 = (x: number): number => x >>> 0;
const ltu = (a: number, b: number): number => (u32(a) < u32(b) ? 1 : 0);
const toLimbs = (v: bigint): number[] => {
  const out = new Array<number>(8);
  for (let k = 0; k < 8; k++) {
    out[k] = Number(v & 0xffffffffn);
    v >>= 32n;
  }
  return out;
};
const fromLimbs = (a: number[]): bigint => {
  let v = 0n;
  for (let k = 7; k >= 0; k--) v = (v << 32n) | BigInt(a[k] >>> 0);
  return v;
};
const maskLogic = (a: number[], b: number[]): number[] => {
  const s = new Array<number>(8);
  let carry = 0;
  for (let k = 0; k < 8; k++) {
    const lo = u32(a[k] + b[k]);
    const v = u32(lo + carry);
    s[k] = v;
    carry = ltu(lo, a[k]) + ltu(v, lo);
  }
  const d = new Array<number>(8);
  let borrow = 0;
  for (let k = 0; k < 8; k++) {
    const t = u32(s[k] - R8[k]);
    const v = u32(t - borrow);
    d[k] = v;
    borrow = ltu(s[k], R8[k]) + ltu(t, borrow);
  }
  const keepS = borrow !== 0;
  return Array.from({ length: 8 }, (_, k) => (keepS ? s[k] : d[k]));
};
const maskMod = (a: bigint, b: bigint): bigint => fromLimbs(maskLogic(toLimbs(a), toLimbs(b)));

const affEq = (p: ReturnType<typeof G.fromAffine>, q: ReturnType<typeof G.fromAffine>): boolean => {
  if (p.equals(G.ZERO) || q.equals(G.ZERO)) return p.equals(G.ZERO) && q.equals(G.ZERO);
  const a = p.toAffine();
  const b = q.toAffine();
  return a.x === b.x && a.y === b.y;
};
// MSM dropping zero scalars (noble requires scalars in [1, r); the bridge's
// cross-check uses the same convention).
const msm = (pts: ReturnType<typeof G.fromAffine>[], scs: bigint[]): ReturnType<typeof G.fromAffine> => {
  const P: ReturnType<typeof G.fromAffine>[] = [];
  const S: bigint[] = [];
  for (let i = 0; i < scs.length; i++) {
    if (scs[i] !== 0n) {
      P.push(pts[i]);
      S.push(scs[i]);
    }
  }
  return P.length === 0 ? G.ZERO : G.msm(P, S);
};

describe('mask_scalars shader plumbing', () => {
  const sm = new ShaderManager(4, 1 << 15, BN254_CURVE_CONFIG, false);

  it('renders @workgroup_size and leaves no unsubstituted mustache tags', () => {
    const src = sm.gen_mask_scalars_shader(128);
    expect(src).toMatch(/@workgroup_size\(128\)/);
    expect(src).not.toMatch(/\{\{/);
  });

  it('bakes a scalar-field modulus that equals Fr.ORDER (catches a limb typo)', () => {
    const src = sm.gen_mask_scalars_shader(128);
    const limbs: bigint[] = [];
    for (let i = 0; i < 8; i++) {
      const m = src.match(new RegExp(`const R8_${i}: u32 = (0x[0-9a-fA-F]+)u;`));
      expect(m).not.toBeNull();
      limbs.push(BigInt(m![1]));
    }
    let modulus = 0n;
    for (let i = 7; i >= 0; i--) modulus = (modulus << 32n) | limbs[i];
    expect(modulus).toBe(r);
  });
});

describe('mask_scalars (s + R) mod r limb arithmetic', () => {
  it('matches BigInt on carry/borrow edge cases', () => {
    const edge: [bigint, bigint][] = [
      [0n, 0n],
      [0n, r - 1n],
      [r - 1n, r - 1n], // largest sum 2r-2
      [r - 1n, 1n], // sum == r exactly -> 0
      [1n, r - 1n],
      [r / 2n, r / 2n + 1n],
    ];
    for (const [a, b] of edge) expect(maskMod(a % r, b % r)).toBe((a + b) % r);
  });

  it('matches BigInt for structured scalars masked by random R', () => {
    const shapes: Shape[] = ['random', 'small', 'sparse', 'binary', 'repeated'];
    for (const shape of shapes) {
      for (let i = 0; i < 5000; i++) {
        const s = genScalar(shape);
        const R = randFr();
        expect(maskMod(s, R)).toBe((s + R) % r);
      }
    }
  });

  it('matches BigInt for bulk random inputs', () => {
    for (let i = 0; i < 20000; i++) {
      const a = randFr();
      const b = randFr();
      expect(maskMod(a, b)).toBe((a + b) % r);
    }
  });

  it('produces structure-free masked scalars (no zeros, full width)', () => {
    const masked: bigint[] = [];
    for (let i = 0; i < 4000; i++) masked.push(maskMod(genScalar('sparse'), randFr()));
    expect(masked.every(m => m !== 0n)).toBe(true);
    const avgBits = masked.reduce((a, m) => a + m.toString(2).length, 0) / masked.length;
    expect(avgBits).toBeGreaterThan(250); // ~uniform over [0, r), r is 254-bit
    expect(new Set(masked).size).toBe(masked.length); // all distinct
  });
});

describe('masking algebra: C = C' + "'" + ' - O', () => {
  const N = 1500;
  const pts = Array.from({ length: N }, () => G.BASE.multiply(randFr()));
  const R = Array.from({ length: N }, () => randFr());
  const O = msm(pts, R); // precomputed offset, shared across columns

  it.each<Shape>(['random', 'small', 'sparse', 'binary', 'repeated'])(
    'recovers the true commitment for %s scalars',
    shape => {
      const s = Array.from({ length: N }, () => genScalar(shape));
      const C = msm(pts, s);
      const masked = s.map((si, i) => maskMod(si, R[i]));
      const Cprime = msm(pts, masked);
      const recovered = Cprime.add(O.negate());
      expect(affEq(recovered, C)).toBe(true);
    },
  );

  it('recovers every column with ONE shared offset O', () => {
    for (let col = 0; col < 4; col++) {
      const s = Array.from({ length: N }, () => genScalar('sparse'));
      const C = msm(pts, s);
      const recovered = msm(
        pts,
        s.map((si, i) => maskMod(si, R[i])),
      ).add(O.negate());
      expect(affEq(recovered, C)).toBe(true);
    }
  });
});
