// Host bit-exact model of the native 12x22-bit f32 Montgomery multiply.
//
// This file is the GROUND TRUTH that the WGSL `montgomery_product_fp22`
// must reproduce op-for-op. Every f32 intermediate is forced through
// Math.fround so the JS model matches WGSL f32 semantics exactly. fma is
// computed via an exact-product path then a single rounding (matching the
// WGSL `fma` builtin's single-rounding contract).
//
// Domain: R = 2^264 (12 * 22). Inputs/outputs are 12 f32 limbs, each an
// integer-valued f32 in [0, 2^22). The product computed is
//   t = a * b * R^{-1} mod p
// returned in [0, p) as 12x22 limbs.
//
// Algorithm: CIOS (Coarsely Integrated Operand Scanning) adapted to f32.
// Per outer i:
//   (A) carry-propagated multiply-accumulate of a[i]*b into a 13-wide
//       running accumulator t[0..12], using mulhilo22 two-product so each
//       limb stays an exact f32 integer.
//   (B) m = (t[0] * n0) mod 2^22  (the Montgomery digit)
//   (C) carry-propagated multiply-accumulate of m*p into t, which zeroes
//       t[0]; then shift t down by one limb (t[k] = t[k+1]).
// After 12 outer iters t holds a*b*R^{-1} in [0, 2p); a final conditional
// subtract of p canonicalizes to [0, p).
//
// Every accumulator limb is kept in [0, 2^22) by per-step carry split, so
// no f32 ever exceeds 2^24 - safe in the 24-bit mantissa.

export const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
export const NUM_LIMBS = 12;
export const W_BITS = 22n;
export const W = 1n << W_BITS;            // 2^22
export const R = 1n << (BigInt(NUM_LIMBS) * W_BITS); // 2^264

const W_F32 = 4194304.0;                  // 2^22
const W_INV_F32 = Math.fround(1.0 / 4194304.0); // 2^-22 (exact: 2.384185791015625e-7)

function fr(x) { return Math.fround(x); }

// Exact fma: a*b + c with a single rounding to f32. We compute a*b+c in
// full f64 precision. Since a,b are integer-valued f32 < 2^24, a*b is an
// integer < 2^48 representable exactly in f64; adding c (|c| < 2^48) is
// also exact in f64 (< 2^53). A single fround then matches WGSL fma's
// single-rounding result.
export function fma(a, b, c) {
  return Math.fround(a * b + c);
}

// mulhilo22: split the 44-bit product a*b (a,b in [0,2^22)) into
// (hi, lo) with hi*2^22 + lo == a*b exactly, hi,lo integer-valued f32.
// hi in [0, 2^22), lo in [0, 2^22). Mirrors mulhilo_22.wgsl.
//
// p = fround(a*b) is the product rounded to f32 (loses low bits when the
// product exceeds 2^24). e = fma(a,b,-p) recovers the rounding error
// exactly: p + e == a*b. hi = floor(p / 2^22). lo = fma(hi, -2^22, p) + e
// = (p - hi*2^22) + e = a*b - hi*2^22.
export function mulhilo22(a, b) {
  const p = fr(a * b);
  const e = fr(fma(a, b, -p));
  let hi = fr(Math.floor(fr(p * W_INV_F32)));
  let lo = fr(fr(fma(hi, -W_F32, p)) + e);
  // The two-product gives lo in (-2^22, 2^22); normalize to [0, 2^22) by
  // borrowing one unit of 2^22 from hi when lo is negative. After this,
  // hi, lo are non-negative integer f32 with hi*2^22 + lo == a*b exactly.
  // (step(lo, -0.5) is 1.0 iff lo is a negative integer.)
  const neg = lo < 0.0 ? 1.0 : 0.0;
  lo = fr(lo + fr(neg * W_F32));
  hi = fr(hi - neg);
  return [hi, lo];
}

// Split a value v (an exact f32 integer, 0 <= v < 2^24) into
// (carry, digit) with v == carry*2^22 + digit, digit in [0,2^22),
// carry integer. Used to normalize accumulator limbs after each add.
// floor-based, exact for integer v < 2^24 (mantissa-safe).
export function carrysplit(v) {
  const carry = fr(Math.floor(fr(v * W_INV_F32)));
  const digit = fr(fma(carry, -W_F32, v)); // v - carry*2^22
  return [carry, digit];
}

// The CIOS-f32 Montgomery product. a, b: arrays of 12 integer-valued f32
// limbs in [0,2^22). n0: -p^{-1} mod 2^22 as integer-valued f32. plimb:
// array of 12 f32 limbs of p. Returns 12 f32 limbs in [0,2^22).
export function montmul_fp22(a, b, n0, plimb) {
  const N = NUM_LIMBS;
  // t has N+1 limbs (the extra one absorbs the top carry across reduce).
  const t = new Array(N + 1).fill(0.0);

  for (let i = 0; i < N; i++) {
    const ai = a[i];

    // (A) t += a[i] * b, carry-propagated. C is the running carry.
    let C = 0.0;
    for (let j = 0; j < N; j++) {
      const [hi, lo] = mulhilo22(ai, b[j]);
      // s = t[j] + lo + C  (<= (2^22-1) + (2^22-1) + (2^22-1) < 2^24)
      const s = fr(fr(t[j] + lo) + C);
      const [c1, dig] = carrysplit(s);
      t[j] = dig;
      // next carry = hi + c1  (hi < 2^22, c1 <= 2, sum < 2^24)
      C = fr(hi + c1);
    }
    // fold final carry into t[N]
    {
      const s = fr(t[N] + C);
      // t[N] can grow but stays < 2^23 across the algorithm; keep exact.
      t[N] = s;
    }

    // (B) m = (t[0] * n0) mod 2^22
    const mfull = mulhilo22(t[0], n0); // [hi,lo]; lo = (t0*n0) mod 2^22
    const m = mfull[1];

    // (C) t += m * p, carry-propagated. This zeroes t[0] (mod 2^22).
    let C2 = 0.0;
    for (let j = 0; j < N; j++) {
      const [hi, lo] = mulhilo22(m, plimb[j]);
      const s = fr(fr(t[j] + lo) + C2);
      const [c1, dig] = carrysplit(s);
      t[j] = dig;
      C2 = fr(hi + c1);
    }
    {
      const s = fr(t[N] + C2);
      t[N] = s;
    }
    // t[0] is now 0 (guaranteed by Montgomery digit choice). Shift down.
    for (let j = 0; j < N; j++) {
      t[j] = t[j + 1];
    }
    t[N] = 0.0;
  }

  // t now holds a*b*R^{-1} mod p in [0, 2p) across 12 limbs (+ possible
  // tiny top carry already absorbed). Canonicalize: conditional subtract p.
  // Do it on the integer value to keep the model simple and exact, then
  // re-split to limbs. (The WGSL does a limb-wise conditional subtract; we
  // mirror that below in the WGSL but here we just need the correct value.)
  return condsub_p_limbs(t.slice(0, N), plimb);
}

// limb-wise conditional subtract of p: if t >= p, t -= p. Operates on
// 12 f32 limbs in [0,2^22). Mirrors the WGSL canonicalize tail.
export function condsub_p_limbs(tin, plimb) {
  const N = NUM_LIMBS;
  // compute t - p with borrow
  const d = new Array(N).fill(0.0);
  let borrow = 0.0;
  for (let j = 0; j < N; j++) {
    const diff = fr(fr(tin[j] - plimb[j]) - borrow);
    // if diff < 0, add 2^22 and set borrow
    const neg = diff < 0.0 ? 1.0 : 0.0;
    d[j] = fr(diff + fr(neg * W_F32));
    borrow = neg;
  }
  // if borrow==0, t>=p so use d; else use tin
  const out = new Array(N);
  const useD = borrow === 0.0;
  for (let j = 0; j < N; j++) out[j] = useD ? d[j] : tin[j];
  return out;
}

// ---- BigInt helpers for reference + conversion ----
export function modinv(a, m) {
  let [or, r] = [((a % m) + m) % m, m];
  let [os, s] = [1n, 0n];
  while (r) { const q = or / r; [or, r] = [r, or - q * r]; [os, s] = [s, os - q * s]; }
  return ((os % m) + m) % m;
}

export function toLimbs22(v) {
  const out = [];
  let x = ((v % P) + P) % P;
  for (let i = 0; i < NUM_LIMBS; i++) { out.push(Number(x & (W - 1n))); x >>= W_BITS; }
  return out;
}
export function fromLimbs22(limbs) {
  let v = 0n;
  for (let i = NUM_LIMBS - 1; i >= 0; i--) v = (v << W_BITS) | BigInt(Math.round(limbs[i]));
  return v;
}

// reference montgomery product in BigInt with R = 2^264.
// Inputs/outputs are Montgomery residues (integers in [0,p)).
export function montref(am, bm) {
  return (am * bm * modinv(R, P)) % P;
}

export const N0 = ((1n << W_BITS) - modinv(P, 1n << W_BITS)) % (1n << W_BITS);
export const PLIMB = toLimbs22(P).map(x => x); // p in 22-bit limbs (as numbers)
export const N0_F32 = Number(N0);
