// Jest unit tests for the Wasm9x29 Bernstein-Yang TS port (sub-step 1.1 of
// the WebGPU MSM rewrite plan). Asserts:
//   1. invert(a, p) matches modInverse(a, p) on 1000 seeded-LCG random
//      BN254 base-field inputs.
//   2. Edge cases: a == 1, a == p-1, a == 2, a == (p-1)/2.
//   3. (a * invert(a)) mod p === 1 for every successful invert.
//   4. The internal step counter never exceeds the static bound implied
//      by the WASM source (NUM_OUTER * (BATCH + 2 * RTC_MAX_ITERS) +
//      2 * RTC_MAX_ITERS for the final reduce). This enforces the
//      "strictly bounded loops" constraint from the plan.

import {
  invert,
  Wasm9x29,
  P_BIGINT,
  BATCH_NUM,
  NUM_OUTER,
  RTC_MAX_ITERS,
} from "./bernstein_yang.js";
import { modInverse } from "./bn254.js";

// Seeded LCG (Numerical Recipes constants) mirrored from
// dev/msm-webgpu/bench-field-mul.ts. Reproducible across runs.
function makeRng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function randomBelow(p: bigint, rng: () => number): bigint {
  const bitlen = p.toString(2).length;
  const byteLen = Math.ceil(bitlen / 8);
  // Bounded: max retries cap to keep the test loop hard-bounded.
  // For BN254 base field, p ≈ 0.94 * 2^254, so rejection probability is ~6%;
  // 64 attempts gives failure probability ~10^-79.
  const MAX_TRIES = 64;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    let v = 0n;
    for (let i = 0; i < byteLen; i++) {
      v = (v << 8n) | BigInt(rng() & 0xff);
    }
    v &= (1n << BigInt(bitlen)) - 1n;
    if (v < p) return v;
  }
  throw new Error("randomBelow: rejection sampling exceeded MAX_TRIES");
}

// Hard upper bound on the bounded-loop step counter incremented by
// divsteps inner steps + reduce_to_canonical inner steps. Tighter than
// the absolute max so a regression that loosens the loop bound trips a
// test failure. Components:
//   - NUM_OUTER * BATCH = 13 * 58 = 754 divstep inner steps.
//   - In-loop reduces: ⌊NUM_OUTER / REDUCE_INTERVAL⌋ = 3 boundary hits,
//     each calling reduce_to_canonical twice (d, e) of ≤ RTC_MAX_ITERS = 36.
//     → 3 * 2 * 36 = 216.
//   - Final reduce_to_canonical(d), plus optional reduce after neg(d) on
//     f-negative branch. → 2 * 36 = 72.
//   Total upper bound: 754 + 216 + 72 = 1042.
const STEP_BOUND =
  NUM_OUTER * BATCH_NUM +
  2 * Math.floor(NUM_OUTER / 4) * RTC_MAX_ITERS +
  2 * RTC_MAX_ITERS;

describe("Bernstein-Yang Wasm9x29 TS port", () => {
  const p = P_BIGINT;

  it("invert(1) == 1", () => {
    const stepRef = { steps: 0 };
    const r = invert(1n, p, Wasm9x29.P_INV, stepRef);
    expect(r).toBe(1n);
    expect(stepRef.steps).toBeLessThan(STEP_BOUND);
  });

  it("invert(2) * 2 mod p == 1", () => {
    const stepRef = { steps: 0 };
    const inv2 = invert(2n, p, Wasm9x29.P_INV, stepRef);
    expect((inv2 * 2n) % p).toBe(1n);
    expect(inv2).toBe(modInverse(2n, p));
    expect(stepRef.steps).toBeLessThan(STEP_BOUND);
  });

  it("invert(p - 1) * (p - 1) mod p == 1", () => {
    const a = p - 1n;
    const stepRef = { steps: 0 };
    const r = invert(a, p, Wasm9x29.P_INV, stepRef);
    expect((a * r) % p).toBe(1n);
    expect(r).toBe(modInverse(a, p));
    // p - 1 is its own inverse mod p (since (p-1)^2 = p^2 - 2p + 1 ≡ 1).
    expect(r).toBe(p - 1n);
    expect(stepRef.steps).toBeLessThan(STEP_BOUND);
  });

  it("invert((p - 1) / 2) * ((p - 1) / 2) mod p == 1", () => {
    const a = (p - 1n) / 2n;
    const stepRef = { steps: 0 };
    const r = invert(a, p, Wasm9x29.P_INV, stepRef);
    expect((a * r) % p).toBe(1n);
    expect(r).toBe(modInverse(a, p));
    expect(stepRef.steps).toBeLessThan(STEP_BOUND);
  });

  it("invert(0) == 0", () => {
    expect(invert(0n, p)).toBe(0n);
  });

  it("matches modInverse on 1000 seeded-LCG random inputs", () => {
    const rng = makeRng(0xdeadbeef);
    const N = 1000;
    let passes = 0;
    let mismatches = 0;
    let maxSteps = 0;
    for (let i = 0; i < N; i++) {
      const a = randomBelow(p, rng);
      if (a === 0n) {
        // BY returns 0 for 0; modInverse throws.
        expect(invert(a, p)).toBe(0n);
        passes++;
        continue;
      }
      const stepRef = { steps: 0 };
      const byInv = invert(a, p, Wasm9x29.P_INV, stepRef);
      const refInv = modInverse(a, p);
      const ok = byInv === refInv && (a * byInv) % p === 1n;
      if (!ok) {
        mismatches++;
        if (mismatches <= 5) {
          // Log up to 5 details for debugging.
          // eslint-disable-next-line no-console
          console.error(
            `mismatch at i=${i}: a=${a}\n  by =${byInv}\n  ref=${refInv}`,
          );
        }
      } else {
        passes++;
      }
      if (stepRef.steps > maxSteps) maxSteps = stepRef.steps;
    }
    expect(mismatches).toBe(0);
    expect(passes).toBe(N);
    expect(maxSteps).toBeLessThan(STEP_BOUND);
    // eslint-disable-next-line no-console
    console.log(
      `[BY] ${passes}/${N} random inputs matched modInverse. max bounded-loop steps observed: ${maxSteps} (bound ${STEP_BOUND})`,
    );
  });

  it("invert(a) * a mod p == 1 (1000 random, separate seed)", () => {
    const rng = makeRng(0xa5a5a5a5);
    const N = 1000;
    let bad = 0;
    for (let i = 0; i < N; i++) {
      const a = randomBelow(p, rng);
      if (a === 0n) continue;
      const r = invert(a, p);
      if ((a * r) % p !== 1n) bad++;
    }
    expect(bad).toBe(0);
  });

  // --- Inner-piece sanity tests: lock down individual primitives so the
  // ---  WGSL port can diff against the same intermediate values.

  it("fromBigint/toBigint round-trip on random values", () => {
    const rng = makeRng(0x1234);
    for (let i = 0; i < 100; i++) {
      const x = randomBelow(p, rng);
      const back = Wasm9x29.toBigint(Wasm9x29.fromBigint(x));
      expect(back).toBe(x);
    }
  });

  it("divsteps: gcd(p, a) ends with g == 0 after NUM_OUTER iters", () => {
    // Spot-check: drive the full algorithm and assert the early-break
    // condition fires within NUM_OUTER for typical inputs.
    const rng = makeRng(7);
    let everEarlyExit = false;
    for (let i = 0; i < 50; i++) {
      const a = randomBelow(p, rng);
      if (a === 0n) continue;
      // Re-run the driver loop and count outer iters until g==0.
      const P = Wasm9x29.fromBigint(p);
      const f = Wasm9x29.fromBigint(p);
      const g = Wasm9x29.fromBigint(a);
      const d = Wasm9x29.makeZero();
      const e = Wasm9x29.makeOne();
      let delta = 1n;
      let outer = 0;
      for (; outer < NUM_OUTER; outer++) {
        const { mat, delta: nd } = Wasm9x29.divsteps(
          delta,
          Wasm9x29.low64(f),
          Wasm9x29.low64(g),
        );
        delta = nd;
        Wasm9x29.applyMatrix(mat, f, g, d, e, P, Wasm9x29.P_INV);
        if (Wasm9x29.isZero(g)) break;
      }
      expect(outer).toBeLessThan(NUM_OUTER);
      if (outer < NUM_OUTER - 1) everEarlyExit = true;
    }
    expect(everEarlyExit).toBe(true);
  });
});

// ============================================================
// WGSL helper TS mirror tests (sub-step 1.2)
// ============================================================
//
// The TS helpers below mirror, byte-for-byte, the algorithms in
// wgsl/bigint/bigint_by.template.wgsl. WGSL operates on 32-bit u32/i32
// types that wrap on overflow; TS `number` plus `bigint` masking lets us
// emulate the same bit semantics. These tests validate the algorithms
// independent of any GPU dispatch — sub-step 1.3 will run the WGSL
// helpers end-to-end in a divsteps shader.
//
// Each mirror function takes the same input shape as its WGSL counterpart
// (typically a vec2 represented as a 2-element JS tuple) and returns the
// same shape. Ground-truth checks use BigInt.

const U32_MASK = 0xFFFFFFFFn;
const I32_MIN = -(2 ** 31);
const I32_MAX = 2 ** 31 - 1;
const POW_29 = 1 << 29;
const POW_29N = 1n << 29n;
const POW_32N = 1n << 32n;
const POW_64N = 1n << 64n;
const I64_SIGN = 1n << 63n;
const BY_LIMB_MASK_N = (1n << 29n) - 1n;

// ---- 64-bit BigInt helpers used for ground-truth comparison ----
function pairToU64(p: [number, number]): bigint {
  const lo = BigInt(p[0] >>> 0);
  const hi = BigInt(p[1] >>> 0);
  return lo | (hi << 32n);
}
function u64ToPair(x: bigint): [number, number] {
  const v = x & ((1n << 64n) - 1n);
  return [Number(v & U32_MASK) >>> 0, Number((v >> 32n) & U32_MASK) >>> 0];
}
function i64PairToBigint(p: [number, number]): bigint {
  // Low half is treated as unsigned 32 bits; high half is signed 32.
  const lo = BigInt(p[0] >>> 0);
  const hi = BigInt(p[1] | 0); // sign-extend via | 0
  return lo + (hi << 32n);
}
function bigintToI64Pair(x: bigint): [number, number] {
  const v = x & ((1n << 64n) - 1n);
  const lo = Number(v & U32_MASK) >>> 0;
  // hi is the upper 32 bits, interpreted as i32 (so values >= 2^31 wrap to negative).
  const hiU = Number((v >> 32n) & U32_MASK);
  const hi = hiU >= 2 ** 31 ? hiU - 2 ** 32 : hiU;
  return [lo, hi];
}

// ---- TS mirrors of the WGSL helpers ----
function u64_add_ts(a: [number, number], b: [number, number]): [number, number] {
  const lo = (a[0] + b[0]) >>> 0;
  const carry = lo < (a[0] >>> 0) ? 1 : 0;
  // (a[1] + b[1] + carry) wraps to u32 like WGSL u32 add.
  const hi = (a[1] + b[1] + carry) >>> 0;
  return [lo, hi];
}
function u64_sub_ts(a: [number, number], b: [number, number]): [number, number] {
  const lo = (a[0] - b[0]) >>> 0;
  const borrow = (a[0] >>> 0) < (b[0] >>> 0) ? 1 : 0;
  const hi = (a[1] - b[1] - borrow) >>> 0;
  return [lo, hi];
}
function u64_shr1_ts(x: [number, number]): [number, number] {
  const lo = (((x[0] >>> 0) >>> 1) | (((x[1] >>> 0) & 1) << 31)) >>> 0;
  const hi = (x[1] >>> 0) >>> 1;
  return [lo, hi];
}
function u64_low_bit_ts(x: [number, number]): number {
  return (x[0] >>> 0) & 1;
}
function u64_neg_ts(x: [number, number]): [number, number] {
  const nx: [number, number] = [(~x[0]) >>> 0, (~x[1]) >>> 0];
  return u64_add_ts(nx, [1, 0]);
}
function u64_and_ts(
  a: [number, number],
  mask: [number, number],
): [number, number] {
  return [((a[0] & mask[0]) >>> 0), ((a[1] & mask[1]) >>> 0)];
}

function i64_add_pair_ts(
  a: [number, number],
  b: [number, number],
): [number, number] {
  const au = a[0] >>> 0;
  const bu = b[0] >>> 0;
  const lo = (au + bu) >>> 0;
  const carry = lo < au ? 1 : 0;
  // (a[1] + b[1] + carry) treated as i32 add with wrap.
  const hi = (a[1] + b[1] + carry) | 0;
  return [lo, hi];
}
function i64_sub_pair_ts(
  a: [number, number],
  b: [number, number],
): [number, number] {
  const au = a[0] >>> 0;
  const bu = b[0] >>> 0;
  const lo = (au - bu) >>> 0;
  const borrow = au < bu ? 1 : 0;
  const hi = (a[1] - b[1] - borrow) | 0;
  return [lo, hi];
}
function i64_shl1_pair_ts(a: [number, number]): [number, number] {
  const au = a[0] >>> 0;
  const lo = (au << 1) >>> 0;
  const bit31 = (au >>> 31) & 1;
  // (a[1] << 1) | bit31, treated as i32.
  const hi_u = (((a[1] >>> 0) << 1) | bit31) >>> 0;
  const hi = hi_u >= 2 ** 31 ? hi_u - 2 ** 32 : hi_u;
  return [lo, hi];
}
function i64_neg_pair_ts(a: [number, number]): [number, number] {
  const nlo = (~a[0]) >>> 0;
  const nhi = (~a[1]) >>> 0;
  const lo = (nlo + 1) >>> 0;
  const carry = lo < nlo ? 1 : 0;
  const hi_u = (nhi + carry) >>> 0;
  const hi = hi_u >= 2 ** 31 ? hi_u - 2 ** 32 : hi_u;
  return [lo, hi];
}

// Track the worst-case partial-product magnitude across all calls. Tests
// assert this stays under 2^31 to validate the width-choice claim.
let signedMulSplitMaxPartial = 0n;

function signed_mul_split_ts(a: number, b: number): [number, number] {
  // Mirror the WGSL implementation: signed (15-bit lo, 14/16-bit hi) split.
  // a_lo = (a << 17) >> 17 sign-extends low 15 bits. JS `|0` coerces to
  // i32 with wrap; left/right shifts on Number use i32 semantics.
  const a_lo = (a << 17) >> 17;
  const a_hi = ((a - a_lo) >> 15) | 0;
  const b_lo = (b << 17) >> 17;
  const b_hi = ((b - b_lo) >> 15) | 0;

  const pll = Math.imul(a_lo, b_lo);
  const plh = Math.imul(a_lo, b_hi);
  const phl = Math.imul(a_hi, b_lo);
  const phh = Math.imul(a_hi, b_hi);
  const mid = (plh + phl) | 0;

  // Audit: every partial must fit in i32.
  for (const p of [pll, plh, phl, phh, mid]) {
    const bp = BigInt(Math.abs(p));
    if (bp > signedMulSplitMaxPartial) signedMulSplitMaxPartial = bp;
  }

  // Compose low 64 bits of i64 = pll + (mid << 15) + (phh << 30) via u32
  // wrap arithmetic with carries. JS Number can hold all intermediate
  // values exactly (well under 2^53).
  const pll_lo = pll >>> 0;
  const pll_hi = (pll >> 31) >>> 0; // sign mask
  const mid_lo = ((mid << 15) >>> 0);
  // (mid >> 17) gives signed arith shift; >>> 0 converts to u32 bit pattern.
  const mid_hi = (mid >> 17) >>> 0;
  const phh_lo = ((phh << 30) >>> 0);
  const phh_hi = (phh >> 2) >>> 0;

  // Sum (pll_lo, pll_hi) + (mid_lo, mid_hi).
  const s1_lo_raw = pll_lo + mid_lo;
  const s1_lo = s1_lo_raw >>> 0;
  const c1 = s1_lo_raw >= 2 ** 32 ? 1 : 0;
  const s1_hi_raw = pll_hi + mid_hi + c1;
  const s1_hi = s1_hi_raw >>> 0;

  // Add (phh_lo, phh_hi).
  const sum_lo_raw = s1_lo + phh_lo;
  const sum_lo = sum_lo_raw >>> 0;
  const c2 = sum_lo_raw >= 2 ** 32 ? 1 : 0;
  const sum_hi_raw = s1_hi + phh_hi + c2;
  const sum_hi = sum_hi_raw >>> 0;

  const lo29 = sum_lo & 0x1FFFFFFF;
  const hi_u = (((sum_lo >>> 29) | (sum_hi << 3)) >>> 0);
  const hi = hi_u >= 2 ** 31 ? hi_u - 2 ** 32 : hi_u;
  return [lo29, hi];
}

function by_accumulate_ts(
  acc: [number, number],
  m_lo: number,
  x_limb: number,
): [number, number] {
  const prod = signed_mul_split_ts(m_lo, x_limb);
  const lo_sum = (acc[0] + prod[0]) | 0;
  const lo29 = lo_sum & ((1 << 29) - 1);
  // Arithmetic shift right by 29 in i32: JS `>>` is sign-preserving on i32.
  const lo_overflow = lo_sum >> 29;
  const hi = ((acc[1] + prod[1] + lo_overflow) | 0);
  return [lo29, hi];
}

const BY_NUM_LIMBS_N = 9;
function by_normalise_ts(x: number[]): number[] {
  const out = x.slice();
  let c = 0n;
  for (let i = 0; i < BY_NUM_LIMBS_N - 1; i++) {
    // Use BigInt math to mirror WGSL i32 semantics exactly: limb values can
    // be ±2^60 from caller, and we want the low 29 bits + arithmetic shift.
    const v = BigInt(out[i]) + c;
    out[i] = Number(v & BY_LIMB_MASK_N);
    c = v >> 29n;
  }
  out[BY_NUM_LIMBS_N - 1] = Number(BigInt(out[BY_NUM_LIMBS_N - 1]) + c);
  return out;
}

// ---- 20×13-bit BigInt <-> 9×29-bit BigIntBY (TS mirror) ----
const NUM_WORDS = 20;
const WORD_SIZE = 13;
const WORD_MASK = (1 << 13) - 1;

function read29Window(limbs: number[], bit_lo: number): number {
  // 29-bit window from 13-bit limbs: requires up to ceil((29 + 12) / 13) = 4
  // source limbs (worst case in_limb_bit = 12).
  const base_idx = Math.floor(bit_lo / WORD_SIZE);
  const in_limb_bit = bit_lo % WORD_SIZE;
  const v0 = base_idx < NUM_WORDS ? limbs[base_idx] : 0;
  const v1 = base_idx + 1 < NUM_WORDS ? limbs[base_idx + 1] : 0;
  const v2 = base_idx + 2 < NUM_WORDS ? limbs[base_idx + 2] : 0;
  const v3 = base_idx + 3 < NUM_WORDS ? limbs[base_idx + 3] : 0;
  // Use BigInt to avoid 32-bit signed overflow when shifting up to 39 bits.
  const s0 = BigInt(v0) >> BigInt(in_limb_bit);
  const s1 = BigInt(v1) << BigInt(WORD_SIZE - in_limb_bit);
  const s2 = BigInt(v2) << BigInt(WORD_SIZE * 2 - in_limb_bit);
  const s3 = BigInt(v3) << BigInt(WORD_SIZE * 3 - in_limb_bit);
  return Number((s0 | s1 | s2 | s3) & BY_LIMB_MASK_N);
}
function by_from_bigint_ts(limbs: number[]): number[] {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 9; i++) {
    r[i] = read29Window(limbs, i * 29);
  }
  return r;
}
function read13Window(by_l: number[], bit_lo: number): number {
  const base_idx = Math.floor(bit_lo / 29);
  const in_limb_bit = bit_lo % 29;
  const v0 = base_idx < 9 ? by_l[base_idx] >>> 0 : 0;
  const v1 = base_idx + 1 < 9 ? by_l[base_idx + 1] >>> 0 : 0;
  const s0 = BigInt(v0) >> BigInt(in_limb_bit);
  const s1 = BigInt(v1) << BigInt(29 - in_limb_bit);
  return Number((s0 | s1) & BigInt(WORD_MASK));
}
function by_to_bigint_ts(by_l: number[]): number[] {
  const out = new Array(NUM_WORDS).fill(0);
  for (let i = 0; i < NUM_WORDS; i++) {
    out[i] = read13Window(by_l, i * WORD_SIZE);
  }
  return out;
}

// Convert a 256-bit bigint into a 20×13-bit limb array (canonical, all
// limbs in [0, 2^13)).
function bigintToLimbs(x: bigint): number[] {
  const out: number[] = new Array(NUM_WORDS).fill(0);
  let v = x;
  for (let i = 0; i < NUM_WORDS; i++) {
    out[i] = Number(v & BigInt(WORD_MASK));
    v = v >> 13n;
  }
  return out;
}

describe("WGSL helper TS mirror", () => {
  it("u64_add matches BigInt ground truth (500 random)", () => {
    const rng = makeRng(0x11111111);
    let failures = 0;
    for (let i = 0; i < 500; i++) {
      const a: [number, number] = [rng() >>> 0, rng() >>> 0];
      const b: [number, number] = [rng() >>> 0, rng() >>> 0];
      const got = u64_add_ts(a, b);
      const expectedBN = (pairToU64(a) + pairToU64(b)) & ((1n << 64n) - 1n);
      if (pairToU64(got) !== expectedBN) failures++;
    }
    expect(failures).toBe(0);
  });

  it("u64_sub matches BigInt ground truth (500 random)", () => {
    const rng = makeRng(0x22222222);
    let failures = 0;
    for (let i = 0; i < 500; i++) {
      const a: [number, number] = [rng() >>> 0, rng() >>> 0];
      const b: [number, number] = [rng() >>> 0, rng() >>> 0];
      const got = u64_sub_ts(a, b);
      const expectedBN =
        (pairToU64(a) - pairToU64(b) + (1n << 64n)) & ((1n << 64n) - 1n);
      if (pairToU64(got) !== expectedBN) failures++;
    }
    expect(failures).toBe(0);
  });

  it("u64_shr1 matches BigInt ground truth (100 random)", () => {
    const rng = makeRng(0x33333333);
    let failures = 0;
    for (let i = 0; i < 100; i++) {
      const a: [number, number] = [rng() >>> 0, rng() >>> 0];
      const got = u64_shr1_ts(a);
      const expectedBN = pairToU64(a) >> 1n;
      if (pairToU64(got) !== expectedBN) failures++;
    }
    expect(failures).toBe(0);
  });

  it("u64_low_bit matches BigInt ground truth (100 random)", () => {
    const rng = makeRng(0x44444444);
    let failures = 0;
    for (let i = 0; i < 100; i++) {
      const a: [number, number] = [rng() >>> 0, rng() >>> 0];
      const got = u64_low_bit_ts(a);
      const expected = Number(pairToU64(a) & 1n);
      if (got !== expected) failures++;
    }
    expect(failures).toBe(0);
  });

  it("u64_neg matches BigInt ground truth (100 random)", () => {
    const rng = makeRng(0x55555555);
    let failures = 0;
    for (let i = 0; i < 100; i++) {
      const a: [number, number] = [rng() >>> 0, rng() >>> 0];
      const got = u64_neg_ts(a);
      const expectedBN =
        (((1n << 64n) - pairToU64(a)) & ((1n << 64n) - 1n)) % (1n << 64n);
      if (pairToU64(got) !== expectedBN) failures++;
    }
    expect(failures).toBe(0);
  });

  it("u64_and matches BigInt ground truth (100 random)", () => {
    const rng = makeRng(0x66666666);
    let failures = 0;
    for (let i = 0; i < 100; i++) {
      const a: [number, number] = [rng() >>> 0, rng() >>> 0];
      const m: [number, number] = [rng() >>> 0, rng() >>> 0];
      const got = u64_and_ts(a, m);
      const expectedBN = pairToU64(a) & pairToU64(m);
      if (pairToU64(got) !== expectedBN) failures++;
    }
    expect(failures).toBe(0);
  });

  // ---- i64 signed pair helpers ----
  function makeI64Pair(rng: () => number, magBits: number): [number, number] {
    // Generate a uniform signed integer in [-2^magBits, 2^magBits).
    let v = 0n;
    const bytes = Math.ceil(magBits / 8) + 1;
    for (let i = 0; i < bytes; i++) {
      v = (v << 8n) | BigInt(rng() & 0xff);
    }
    const range = 1n << BigInt(magBits);
    // Map into [-range, range).
    v = (v % (2n * range)) - range;
    return bigintToI64Pair(v);
  }

  it("i64_add_pair matches BigInt ground truth (200 random)", () => {
    const rng = makeRng(0x77777777);
    let failures = 0;
    for (let i = 0; i < 200; i++) {
      const a = makeI64Pair(rng, 60);
      const b = makeI64Pair(rng, 60);
      const got = i64_add_pair_ts(a, b);
      let expectedBN = (i64PairToBigint(a) + i64PairToBigint(b)) & ((1n << 64n) - 1n);
      if (expectedBN >= I64_SIGN) expectedBN -= 1n << 64n;
      if (i64PairToBigint(got) !== expectedBN) {
        failures++;
        if (failures <= 3) {
          console.error(
            `i64_add fail: a=${i64PairToBigint(a)} b=${i64PairToBigint(b)} got=${i64PairToBigint(got)} expected=${expectedBN}`,
          );
        }
      }
    }
    expect(failures).toBe(0);
  });

  it("i64_sub_pair matches BigInt ground truth (200 random)", () => {
    const rng = makeRng(0x88888888);
    let failures = 0;
    for (let i = 0; i < 200; i++) {
      const a = makeI64Pair(rng, 60);
      const b = makeI64Pair(rng, 60);
      const got = i64_sub_pair_ts(a, b);
      let expectedBN = (i64PairToBigint(a) - i64PairToBigint(b)) & ((1n << 64n) - 1n);
      if (expectedBN >= I64_SIGN) expectedBN -= 1n << 64n;
      if (i64PairToBigint(got) !== expectedBN) failures++;
    }
    expect(failures).toBe(0);
  });

  it("i64_shl1_pair matches BigInt ground truth (200 random)", () => {
    const rng = makeRng(0x99999999);
    let failures = 0;
    for (let i = 0; i < 200; i++) {
      const a = makeI64Pair(rng, 60);
      const got = i64_shl1_pair_ts(a);
      let expectedBN = (i64PairToBigint(a) << 1n) & ((1n << 64n) - 1n);
      if (expectedBN >= I64_SIGN) expectedBN -= 1n << 64n;
      if (i64PairToBigint(got) !== expectedBN) failures++;
    }
    expect(failures).toBe(0);
  });

  it("i64_neg_pair matches BigInt ground truth (200 random)", () => {
    const rng = makeRng(0xaaaaaaaa);
    let failures = 0;
    for (let i = 0; i < 200; i++) {
      const a = makeI64Pair(rng, 60);
      const got = i64_neg_pair_ts(a);
      let expectedBN = (-i64PairToBigint(a)) & ((1n << 64n) - 1n);
      if (expectedBN >= I64_SIGN) expectedBN -= 1n << 64n;
      if (i64PairToBigint(got) !== expectedBN) failures++;
    }
    expect(failures).toBe(0);
  });

  // ---- signed_mul_split ----
  it("signed_mul_split: 500 random (a,b) with bounds + partial-product audit", () => {
    const rng = makeRng(0xbbbbbbbb);
    let failures = 0;
    signedMulSplitMaxPartial = 0n;
    for (let i = 0; i < 500; i++) {
      // a in [-2^29, 2^29] (one BY limb plus possible sign-bit overflow).
      // b in [-2^31, 2^31) (i32 range, matrix entry low half).
      const aMag = rng() & ((1 << 29) - 1); // 29-bit unsigned in [0, 2^29)
      const aSign = (rng() & 1) ? -1 : 1;
      const a = aSign * aMag;
      const bSign = (rng() & 1) ? -1 : 1;
      // Generate b in [-2^31, 2^31). i32 representation: any 32-bit value.
      const bMagU32 = rng() >>> 0;
      const b = bMagU32 >= 2 ** 31 ? bMagU32 - 2 ** 32 : bMagU32;
      // Clamp |a| to ≤ 2^29 — generate could be exactly 2^29-1, which is fine.
      if (Math.abs(a) > 2 ** 29) continue;

      const got = signed_mul_split_ts(a, b);
      const lo29 = BigInt(got[0]);
      const hi = BigInt(got[1]);
      const reconstructed = lo29 + hi * POW_29N;
      const expected = BigInt(a) * BigInt(b);
      if (reconstructed !== expected) {
        failures++;
        if (failures <= 3) {
          console.error(
            `signed_mul_split fail: a=${a} b=${b} got=(lo29=${got[0]}, hi=${got[1]}) reconstructed=${reconstructed} expected=${expected}`,
          );
        }
      }
      // lo29 must be in [0, 2^29).
      if (got[0] < 0 || got[0] >= POW_29) failures++;
    }
    expect(failures).toBe(0);
    // Width audit (per plan): every signed partial product fits in i32.
    // With the 15-bit signed split, the worst case is |a_lo| * |b_hi| or
    // |a_hi| * |b_hi| <= 2^14 * 2^16 = 2^30, well within i32.
    expect(signedMulSplitMaxPartial).toBeLessThan(1n << 31n);
  });

  it("signed_mul_split: edge cases (zero, max-positive, min-negative)", () => {
    // For |a|, |b| <= 2^29-1 (strict), |hi| <= 2^29 fits in i32 comfortably.
    // Note: a = -2^29 with b = -2^31 produces a*b = 2^60, hi = 2^31 which
    // does NOT fit in signed i32. The actual use case in apply_matrix has
    // |b| <= 2^29 (matrix-entry low half is in [0, 2^29) unsigned, matrix-
    // entry high half is signed in [-2^29, 2^29)), so the edge cases here
    // are bounded accordingly.
    const edges: Array<[number, number]> = [
      [0, 0],
      [1, 1],
      [POW_29 - 1, 0],
      [0, POW_29 - 1],
      [POW_29 - 1, POW_29 - 1],
      [-POW_29, POW_29 - 1],
      [POW_29 - 1, -POW_29],
      [-POW_29, -POW_29],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ];
    for (const [a, b] of edges) {
      const got = signed_mul_split_ts(a, b);
      const reconstructed = BigInt(got[0]) + BigInt(got[1]) * POW_29N;
      const expected = BigInt(a) * BigInt(b);
      expect(reconstructed).toBe(expected);
      expect(got[0]).toBeGreaterThanOrEqual(0);
      expect(got[0]).toBeLessThan(POW_29);
    }
  });

  // ---- by_accumulate ----
  it("by_accumulate: 200 random matches BigInt", () => {
    const rng = makeRng(0xcccccccc);
    let failures = 0;
    for (let i = 0; i < 200; i++) {
      // acc.x in [0, 2^29); acc.y bounded so |acc| < 2^58 (matches the
      // 2-limb accumulator used by apply_matrix). Generate |acc_hi| <= 2^29.
      const acc_lo = rng() & ((1 << 29) - 1);
      const acc_hi_mag = rng() & ((1 << 29) - 1);
      const acc_hi = (rng() & 1) ? -acc_hi_mag : acc_hi_mag;
      const m_lo_mag = rng() & ((1 << 29) - 1);
      const m_lo = (rng() & 1) ? -m_lo_mag : m_lo_mag;
      const x_limb_mag = rng() & ((1 << 29) - 1);
      const x_limb = (rng() & 1) ? -x_limb_mag : x_limb_mag;

      const got = by_accumulate_ts([acc_lo, acc_hi], m_lo, x_limb);
      const accBN = BigInt(acc_lo) + BigInt(acc_hi) * POW_29N;
      const expected = accBN + BigInt(m_lo) * BigInt(x_limb);
      const reconstructed = BigInt(got[0]) + BigInt(got[1]) * POW_29N;
      if (reconstructed !== expected) {
        failures++;
        if (failures <= 3) {
          console.error(
            `by_accumulate fail: acc=(${acc_lo}, ${acc_hi}) m_lo=${m_lo} x_limb=${x_limb} got=(${got[0]}, ${got[1]}) reconstructed=${reconstructed} expected=${expected}`,
          );
        }
      }
      if (got[0] < 0 || got[0] >= POW_29) failures++;
    }
    expect(failures).toBe(0);
  });

  // ---- by_normalise ----
  it("by_normalise: 100 cases with non-canonical limbs", () => {
    const rng = makeRng(0xdddddddd);
    let failures = 0;
    for (let i = 0; i < 100; i++) {
      const limbs: number[] = [];
      // Build truly non-canonical limbs in [-2^60, 2^60) using BigInt then
      // reduce mod 2^32 for the JS array (since we re-read via BigInt below).
      const limbBN: bigint[] = [];
      let originalValueBN = 0n;
      for (let j = 0; j < 9; j++) {
        // Random signed up to ~2^31 (since JS Number array would lose
        // precision otherwise). We're still exercising overflow scenarios.
        const mag = rng() & 0xfffffff; // 28-bit
        const sign = (rng() & 1) ? -1n : 1n;
        const v = sign * BigInt(mag);
        limbBN.push(v);
        limbs.push(Number(v));
        originalValueBN += v << BigInt(j * 29);
      }
      const got = by_normalise_ts(limbs);
      // Compute reconstructed (treating limbs as signed where limb 8 is the
      // sign carrier). After normalise, l[0..7] are in [0, 2^29) and l[8]
      // is signed.
      let reconstructed = 0n;
      for (let j = 0; j < 8; j++) {
        reconstructed += BigInt(got[j]) << BigInt(j * 29);
      }
      // l[8] is signed (no normalisation past).
      reconstructed += BigInt(got[8]) << BigInt(8 * 29);
      if (reconstructed !== originalValueBN) {
        failures++;
        if (failures <= 3) {
          console.error(
            `by_normalise fail: original=${originalValueBN} reconstructed=${reconstructed}`,
          );
        }
      }
      for (let j = 0; j < 8; j++) {
        if (got[j] < 0 || got[j] >= POW_29) {
          failures++;
          if (failures <= 3) {
            console.error(`limb ${j} not canonical: ${got[j]}`);
          }
        }
      }
    }
    expect(failures).toBe(0);
  });

  // ---- by_from_bigint / by_to_bigint ----
  it("by_from_bigint / by_to_bigint round-trip on 200 BN254 base-field values", () => {
    const rng = makeRng(0xeeeeeeee);
    let failures = 0;
    for (let i = 0; i < 200; i++) {
      const x = randomBelow(P_BIGINT, rng);
      const srcLimbs = bigintToLimbs(x);
      const by = by_from_bigint_ts(srcLimbs);
      // Reconstruct from BY limbs to verify the conversion.
      let v = 0n;
      for (let j = 0; j < 9; j++) {
        v += BigInt(by[j]) << BigInt(j * 29);
      }
      if (v !== x) {
        failures++;
        if (failures <= 3) {
          console.error(`by_from_bigint fail: x=${x} reconstructed=${v}`);
        }
      }
      // Now round-trip back.
      const back = by_to_bigint_ts(by);
      let backV = 0n;
      for (let j = 0; j < NUM_WORDS; j++) {
        backV += BigInt(back[j]) << BigInt(j * WORD_SIZE);
      }
      if (backV !== x) {
        failures++;
        if (failures <= 3) {
          console.error(`by_to_bigint fail: x=${x} back=${backV}`);
        }
      }
      // Every output limb is canonical.
      for (let j = 0; j < NUM_WORDS; j++) {
        if (back[j] < 0 || back[j] > WORD_MASK) failures++;
      }
    }
    expect(failures).toBe(0);
  });
});
