// TypeScript port of the Wasm9x29 Bernstein-Yang safegcd modular inverse
// from barretenberg/cpp/src/barretenberg/ecc/fields/bernstein_yang_inverse_wasm.hpp
// (with the driver from bernstein_yang_inverse.hpp).
//
// This module is the ground-truth reference for the WGSL port that follows
// in the WebGPU MSM rewrite plan (sub-steps 1.2-1.6). It must be a faithful
// transliteration of the C++ — same constants, same control flow, same
// per-limb arithmetic. Performance is not a concern; correctness vs
// `modInverse` over 1000+ random BN254 base-field values is.
//
// Algorithmic notes
// -----------------
// State: 9 × 29-bit signed limbs held as `bigint[9]`. Top limb carries
// sign, lower limbs in [0, 2^29) post-normalise. Choice of `bigint` over
// `number`: matrix entries grow up to 2^58 after BATCH=58 divsteps and the
// per-limb cross-products in apply_matrix reach |i58|, which overflow JS's
// 32-bit safe integer range for arithmetic. The intermediate accumulators
// (cf, cg, cd, ce, nf, ng, nd, ne, t_d, t_e) must be `bigint`.
//
// The divsteps low-64-bit carriers (f_lo, g_lo) are also `bigint` since they
// hold u64 values. Each divstep mutates these via shift / add / sub at i64
// precision; we mask back to u64 after each mutation to avoid sign
// extension surprises. BigInt's `>>` is arithmetic shift for negative
// values, matching C++ `(i64) >> n`.
//
// Loop bound discipline (per plan §1, hard constraint): the only loops in
// this file have static upper bounds.
//   - divsteps inner loop: BATCH = 58
//   - apply_matrix per-limb loops: N = 9
//   - reduce_to_canonical: RTC_MAX_ITERS = 36
//   - driver outer loop: NUM_OUTER = 13 (with early `g == 0` break)
// The test file asserts the step counter never exceeds these bounds.

import { BN254_BASE_FIELD } from "./bn254.js";

// ---- Constants (mirror Wasm9x29::*) -----------------------------------
export const N = 9;
export const LIMB_BITS = 29n;
export const LIMB_MASK = (1n << LIMB_BITS) - 1n; // 0x1FFFFFFF
export const BATCH = 58n;
export const BATCH_NUM = 58;
export const MASK_BATCH = (1n << BATCH) - 1n;
export const NUM_OUTER = 13;
export const REDUCE_INTERVAL = 4;
export const RTC_MAX_ITERS = 36;

// u64 mask for f_lo / g_lo carriers in divsteps.
const U64_MASK = (1n << 64n) - 1n;
const U64_SIGN_BIT = 1n << 63n;

// ---- BN254 base-field p (matches the C++ `p` argument) ----------------
export const P_BIGINT = BN254_BASE_FIELD;

// p_inv = p^(-1) mod 2^BATCH (BATCH = 58). Used by apply_matrix's 2-adic
// correction step. Precomputed via Hensel's lemma; verified
// (P * P_INV) % 2^58 === 1.
export const P_INV = 12939590167534711n;

// ---- 2x2 matrix produced by BATCH divsteps ----------------------------
export interface Mat {
  u: bigint;
  v: bigint;
  q: bigint;
  r: bigint;
}

// ---- BigIntBY state: 9 × 29-bit signed limbs --------------------------
export type BigIntBY = bigint[]; // length 9

export function makeZero(): BigIntBY {
  return [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n];
}

export function makeOne(): BigIntBY {
  const r = makeZero();
  r[0] = 1n;
  return r;
}

// uint256 -> 9 × 29-bit limbs (matches Wasm9x29(const uint256_t&) ctor).
// Input `x` is the canonical integer in [0, 2^256); we treat it as 4 × u64
// limbs internally to mirror the C++ bit extraction exactly.
export function fromBigint(x: bigint): BigIntBY {
  if (x < 0n) {
    throw new Error("fromBigint: negative input");
  }
  const mask64 = (1n << 64n) - 1n;
  const d0 = x & mask64;
  const d1 = (x >> 64n) & mask64;
  const d2 = (x >> 128n) & mask64;
  const d3 = (x >> 192n) & mask64;
  const l: BigIntBY = makeZero();
  l[0] = d0 & LIMB_MASK;
  l[1] = (d0 >> 29n) & LIMB_MASK;
  l[2] = ((d0 >> 58n) & 0x3Fn) | ((d1 & 0x7FFFFFn) << 6n);
  l[3] = (d1 >> 23n) & LIMB_MASK;
  l[4] = ((d1 >> 52n) & 0xFFFn) | ((d2 & 0x1FFFFn) << 12n);
  l[5] = (d2 >> 17n) & LIMB_MASK;
  l[6] = ((d2 >> 46n) & 0x3FFFFn) | ((d3 & 0x7FFn) << 18n);
  l[7] = (d3 >> 11n) & LIMB_MASK;
  l[8] = (d3 >> 40n) & 0xFFFFFFn;
  return l;
}

// 9 × 29-bit limbs -> uint256 (matches to_uint256()).
// We re-pack into 4 × u64 chunks then concatenate. Assumes the state is
// canonical (all limbs in [0, 2^29), top limb non-negative).
export function toBigint(x: BigIntBY): bigint {
  const mask64 = (1n << 64n) - 1n;
  const w0 = (x[0] | (x[1] << 29n) | (x[2] << 58n)) & mask64;
  const w1 = ((x[2] >> 6n) | (x[3] << 23n) | (x[4] << 52n)) & mask64;
  const w2 = ((x[4] >> 12n) | (x[5] << 17n) | (x[6] << 46n)) & mask64;
  const w3 = ((x[6] >> 18n) | (x[7] << 11n) | (x[8] << 40n)) & mask64;
  return w0 | (w1 << 64n) | (w2 << 128n) | (w3 << 192n);
}

export function isZero(x: BigIntBY): boolean {
  let a = 0n;
  for (let i = 0; i < N; i++) {
    a |= x[i];
  }
  return a === 0n;
}

export function isNegative(x: BigIntBY): boolean {
  return x[N - 1] < 0n;
}

export function neg(x: BigIntBY): void {
  for (let i = 0; i < N; i++) {
    x[i] = -x[i];
  }
  normalise(x);
}

// Canonicalise limb carries: propagate so each lower limb is in
// [0, 2^29) using arithmetic shift; the top limb absorbs the final
// carry (and may go negative).
export function normalise(x: BigIntBY): void {
  let c = 0n;
  for (let i = 0; i < N - 1; i++) {
    const v = x[i] + c;
    x[i] = v & LIMB_MASK;
    c = v >> LIMB_BITS; // arithmetic shift for negative v
  }
  x[N - 1] += c;
}

function addInplace(x: BigIntBY, b: BigIntBY): void {
  for (let i = 0; i < N; i++) {
    x[i] += b[i];
  }
  normalise(x);
}

function subInplace(x: BigIntBY, b: BigIntBY): void {
  for (let i = 0; i < N; i++) {
    x[i] -= b[i];
  }
  normalise(x);
}

// reduce_to_canonical: bring x into [0, p) using at most 36 add-p / sub-p
// passes. 36 covers |x| ≤ 32p under REDUCE_INTERVAL = 4 (see Wasm9x29 docs).
// Tracks step count and asserts it never exceeds the bound — the WGSL port
// will have the same fixed bound.
export function reduceToCanonical(
  x: BigIntBY,
  p: BigIntBY,
  stepRef?: { steps: number },
): void {
  normalise(x);
  for (let it = 0; it < RTC_MAX_ITERS; it++) {
    if (stepRef) stepRef.steps++;
    if (isNegative(x)) {
      addInplace(x, p);
      continue;
    }
    let cmp = 0;
    for (let i = N - 1; i >= 0; i--) {
      if (x[i] !== p[i]) {
        cmp = x[i] > p[i] ? 1 : -1;
        break;
      }
    }
    if (cmp < 0) {
      break;
    }
    subInplace(x, p);
  }
}

// ---- divsteps ---------------------------------------------------------
// Run BATCH = 58 branchy divsteps on the low 64 bits of (f, g); returns
// the transition matrix M and updates delta. Variable-time over inner
// branches — non-secret inputs only.
//
// Inputs/outputs:
//   delta: scalar bigint (interpret as i64), mutated by the caller via the
//     `deltaRef` wrapper. We return the new delta in the tuple to keep
//     the signature simple for testing.
//   f_lo, g_lo: bigint values representing u64. We mask to u64 after each
//     mutation; arithmetic shifts on bigint handle the sign correctly
//     because we explicitly convert g_lo to its signed form for the
//     subtraction `(g_lo - f_lo) >> 1` (C++ relies on u64-wrap then
//     unsigned >>1, which we mimic exactly with `& U64_MASK`).
export function divsteps(
  deltaIn: bigint,
  fLoIn: bigint,
  gLoIn: bigint,
  stepRef?: { steps: number },
): { mat: Mat; delta: bigint } {
  let delta = deltaIn;
  let f_lo = fLoIn & U64_MASK;
  let g_lo = gLoIn & U64_MASK;
  let u = 1n;
  let v = 0n;
  let q = 0n;
  let r = 1n;
  for (let i = 0; i < BATCH_NUM; i++) {
    if (stepRef) stepRef.steps++;
    if ((g_lo & 1n) !== 0n) {
      if (delta > 0n) {
        // (f, g) <- (g, (g - f)/2)
        const nf = g_lo;
        // (g_lo - f_lo) wraps mod 2^64 (C++ u64 sub), then unsigned >>1.
        const diff = (g_lo - f_lo) & U64_MASK;
        const ng = diff >> 1n;
        const nu = q << 1n;
        const nv = r << 1n;
        const nq = q - u;
        const nr = r - v;
        f_lo = nf;
        g_lo = ng;
        u = nu;
        v = nv;
        q = nq;
        r = nr;
        delta = 1n - delta;
      } else {
        // g <- (g + f)/2
        const sum = (g_lo + f_lo) & U64_MASK;
        g_lo = sum >> 1n;
        q = q + u;
        r = r + v;
        u <<= 1n;
        v <<= 1n;
        delta = delta + 1n;
      }
    } else {
      // g <- g/2
      g_lo >>= 1n;
      u <<= 1n;
      v <<= 1n;
      delta = delta + 1n;
    }
  }
  return { mat: { u, v, q, r }, delta };
}

// ---- apply_matrix -----------------------------------------------------
// Apply M to (f, g, d, e) using the streamed schoolbook described in the
// C++ comment block. Matrix entries can reach |2^58| post-divsteps; we
// split into (lo: 29-bit, hi: i32) parts via arithmetic shift, matching
// the C++ `u_lo = m.u & LIMB_MASK; u_hi = m.u >> LIMB_BITS;`.
//
// The exact `/ 2^BATCH = 2^58 = 2 * LIMB_BITS` at the end is realised by
// writing the per-limb result at position `i - 2` (drop bottom two limbs).
export function applyMatrix(
  m: Mat,
  f: BigIntBY,
  g: BigIntBY,
  d: BigIntBY,
  e: BigIntBY,
  p: BigIntBY,
  pInv: bigint,
): void {
  // (signed) split into low 29 bits + high (arithmetic shift).
  const u_lo = m.u & LIMB_MASK;
  const u_hi = m.u >> LIMB_BITS;
  const v_lo = m.v & LIMB_MASK;
  const v_hi = m.v >> LIMB_BITS;
  const q_lo = m.q & LIMB_MASK;
  const q_hi = m.q >> LIMB_BITS;
  const r_lo = m.r & LIMB_MASK;
  const r_hi = m.r >> LIMB_BITS;

  // ---- (f, g) pass ----------------------------------------------------
  {
    let cf = 0n;
    let cg = 0n;
    let fp = 0n;
    let gp = 0n;
    for (let i = 0; i < N; i++) {
      const fi = f[i];
      const gi = g[i];
      const nf = u_lo * fi + v_lo * gi + u_hi * fp + v_hi * gp + cf;
      const ng = q_lo * fi + r_lo * gi + q_hi * fp + r_hi * gp + cg;
      cf = nf >> LIMB_BITS;
      cg = ng >> LIMB_BITS;
      if (i >= 2) {
        f[i - 2] = nf & LIMB_MASK;
        g[i - 2] = ng & LIMB_MASK;
      }
      fp = fi;
      gp = gi;
    }
    const nf9 = u_hi * fp + v_hi * gp + cf;
    const ng9 = q_hi * fp + r_hi * gp + cg;
    f[N - 2] = nf9 & LIMB_MASK;
    g[N - 2] = ng9 & LIMB_MASK;
    f[N - 1] = nf9 >> LIMB_BITS;
    g[N - 1] = ng9 >> LIMB_BITS;
  }

  // ---- (d, e) pass with 2-adic k·p correction -------------------------
  {
    const d0 = d[0];
    const e0 = e[0];
    const d1 = d[1];
    const e1 = e[1];
    const nd0 = u_lo * d0 + v_lo * e0;
    const ne0 = q_lo * d0 + r_lo * e0;
    const nd1 = u_lo * d1 + v_lo * e1 + u_hi * d0 + v_hi * e0;
    const ne1 = q_lo * d1 + r_lo * e1 + q_hi * d0 + r_hi * e0;
    // Reconstruct low 58 bits of nd and ne for k computation.
    // C++ does `(u64)nd0 & LIMB_MASK | (((u64)(nd1 + (nd0 >> LIMB_BITS)) & LIMB_MASK) << LIMB_BITS)`.
    // The `(u64)` casts truncate signed -> unsigned mod 2^64. We replicate
    // by masking with U64_MASK before assembling.
    const nd0_low = nd0 & LIMB_MASK;
    const nd1_carry = (nd1 + (nd0 >> LIMB_BITS)) & LIMB_MASK;
    const t_d = (nd0_low | (nd1_carry << LIMB_BITS)) & U64_MASK;
    const ne0_low = ne0 & LIMB_MASK;
    const ne1_carry = (ne1 + (ne0 >> LIMB_BITS)) & LIMB_MASK;
    const t_e = (ne0_low | (ne1_carry << LIMB_BITS)) & U64_MASK;
    // k = (-t mod 2^64) * p_inv mod 2^BATCH.
    // (-t) mod 2^64 = (~t + 1) & U64_MASK = (U64_MASK - t + 1) & U64_MASK.
    const neg_td = (U64_MASK - t_d + 1n) & U64_MASK;
    const neg_te = (U64_MASK - t_e + 1n) & U64_MASK;
    const k_d = (neg_td * pInv) & MASK_BATCH;
    const k_e = (neg_te * pInv) & MASK_BATCH;
    const kd_lo = k_d & LIMB_MASK;
    const kd_hi = k_d >> LIMB_BITS;
    const ke_lo = k_e & LIMB_MASK;
    const ke_hi = k_e >> LIMB_BITS;
    // Initial carries seed from limb-1 partials (matches the C++
    // `cd = (nd1 + kd_lo*p[1] + kd_hi*p[0] + ((nd0 + kd_lo*p[0]) >> LIMB_BITS)) >> LIMB_BITS`).
    let cd =
      (nd1 + kd_lo * p[1] + kd_hi * p[0] + ((nd0 + kd_lo * p[0]) >> LIMB_BITS)) >>
      LIMB_BITS;
    let ce =
      (ne1 + ke_lo * p[1] + ke_hi * p[0] + ((ne0 + ke_lo * p[0]) >> LIMB_BITS)) >>
      LIMB_BITS;

    let dp = d1;
    let ep = e1;
    for (let i = 2; i < N; i++) {
      const di = d[i];
      const ei = e[i];
      const nd =
        u_lo * di +
        v_lo * ei +
        u_hi * dp +
        v_hi * ep +
        kd_lo * p[i] +
        kd_hi * p[i - 1] +
        cd;
      const ne =
        q_lo * di +
        r_lo * ei +
        q_hi * dp +
        r_hi * ep +
        ke_lo * p[i] +
        ke_hi * p[i - 1] +
        ce;
      cd = nd >> LIMB_BITS;
      ce = ne >> LIMB_BITS;
      d[i - 2] = nd & LIMB_MASK;
      e[i - 2] = ne & LIMB_MASK;
      dp = di;
      ep = ei;
    }
    const nd9 = u_hi * dp + v_hi * ep + kd_hi * p[N - 1] + cd;
    const ne9 = q_hi * dp + r_hi * ep + ke_hi * p[N - 1] + ce;
    d[N - 2] = nd9 & LIMB_MASK;
    e[N - 2] = ne9 & LIMB_MASK;
    d[N - 1] = nd9 >> LIMB_BITS;
    e[N - 1] = ne9 >> LIMB_BITS;
  }
}

// ---- low_64: low 64 bits of the state ---------------------------------
// Mirrors Wasm9x29::low_64(): re-pack limbs [0,1,2] (low 6 bits of limb 2)
// into a u64. Returns a positive bigint <2^64.
export function low64(x: BigIntBY): bigint {
  return ((x[0] & LIMB_MASK) | ((x[1] & LIMB_MASK) << 29n) | ((x[2] & 0x3Fn) << 58n)) & U64_MASK;
}

// Convert a positive bigint into a signed-64 view (for use as `f_lo`/`g_lo`
// in the divsteps inner where (g_lo - f_lo) interprets as u64 sub-wrap).
// We don't need to convert — divsteps masks the inputs to U64_MASK.

// ---- driver: invert_bernsteinyang19 -----------------------------------
// Returns a^(-1) mod p, or 0 if a == 0. Bounded by NUM_OUTER outer iters
// (≤ 13) with early break on g == 0, RTC_MAX_ITERS per reduce_to_canonical.
//
// stepRef (optional) accumulates the total bounded-loop step count for
// test assertions: divsteps inner + reduce_to_canonical inner steps.
export function invert(
  a: bigint,
  p: bigint = P_BIGINT,
  pInv: bigint = P_INV,
  stepRef?: { steps: number },
): bigint {
  if (a === 0n) return 0n;
  const P = fromBigint(p);
  const f = fromBigint(p);
  const g = fromBigint(a);
  const d = makeZero();
  const e = makeOne();
  let delta = 1n;
  for (let i = 0; i < NUM_OUTER; i++) {
    const f_lo = low64(f);
    const g_lo = low64(g);
    const { mat, delta: newDelta } = divsteps(delta, f_lo, g_lo, stepRef);
    delta = newDelta;
    applyMatrix(mat, f, g, d, e, P, pInv);
    if (isZero(g)) break;
    if ((i + 1) % REDUCE_INTERVAL === 0) {
      reduceToCanonical(d, P, stepRef);
      reduceToCanonical(e, P, stepRef);
    }
  }
  reduceToCanonical(d, P, stepRef);
  if (isNegative(f)) {
    neg(d);
    reduceToCanonical(d, P, stepRef);
  }
  return toBigint(d);
}

// ---- Convenience namespace ---------------------------------------------
// Same shape as the C++ `Wasm9x29::*` static interface so the WGSL port
// can be diffed line-by-line against this file.
export const Wasm9x29 = {
  N,
  LIMB_BITS,
  LIMB_MASK,
  BATCH,
  BATCH_NUM,
  NUM_OUTER,
  REDUCE_INTERVAL,
  RTC_MAX_ITERS,
  P: P_BIGINT,
  P_INV,
  makeZero,
  makeOne,
  fromBigint,
  toBigint,
  isZero,
  isNegative,
  neg,
  normalise,
  reduceToCanonical: (x: BigIntBY, p: BigIntBY) => reduceToCanonical(x, p),
  divsteps: (delta: bigint, f_lo: bigint, g_lo: bigint) =>
    divsteps(delta, f_lo, g_lo),
  applyMatrix,
  low64,
  invert: (a: bigint, p: bigint = P_BIGINT) => invert(a, p, P_INV),
};
