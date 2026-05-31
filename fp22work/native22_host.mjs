// GROUND-TRUTH host model for the NATIVE 12x22-bit Montgomery multiply.
//
// Representation: 12 limbs, each a 22-bit value (R = 2^264). The WHOLE
// pipeline is 22-bit; there is NO 13-bit limb anywhere. The product
// computed is  t = a * b * R^{-1} mod p,  returned canonical in [0,p).
//
// Two halves, BOTH Mali-safe (proven by the prior fp22 session):
//
//  MULTIPLY (FP pipe, 11-bit operand split): each 22-bit limb is split
//  into two 11-bit half-limbs. Every half-product hx*hy < 2^22 is EXACT
//  in an f32 (24-bit mantissa) WITHOUT fma — the Mali driver miscompiles
//  fma's 44-bit product, so we never rely on it. We accumulate the 576
//  half-products into a 48-wide 11-bit f32 column grid d[0..47] with a
//  floor renorm every G=3 rows, guarded by an integer-round-trip
//  reassociation barrier  c = f32(u32(c - hv*W11))  (defeats the Mali/
//  Metal add-reassociation that overflows the 2^24 budget). This yields
//  the EXACT 528-bit integer product a*b as 48 x 11-bit columns.
//
//  REDUCE (integer, 22-bit CIOS — NOT 13-bit Yuval, NOT f32): we first
//  fold the 48 x 11-bit columns into 24 x 22-bit u32 columns P[0..23]
//  (the full product a*b in 22-bit radix). Then run a standard integer
//  CIOS-style Montgomery reduction in 22-bit radix: for i in 0..11,
//  m = (P[i]*n0) mod 2^22 ; P += m*p << (22*i). After 12 steps the low
//  12 limbs are 0 and limbs[12..23] hold a*b*R^{-1} in [0,2p); a final
//  conditional subtract of p canonicalizes. n0 = -p^{-1} mod 2^22.
//  Integer ops on u32 are bit-exact on every GPU — no float in reduce.
//
// This file mirrors the WGSL op-for-op (f32 multiply via Math.fround;
// integer reduce via BigInt-free u32 where the WGSL uses u32, but here we
// use Number/BigInt that stay exact for the bounded magnitudes).

export const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
export const NUM_LIMBS = 12;     // 22-bit limbs
export const W_BITS = 22n;
export const W = 1n << W_BITS;   // 2^22
export const R = 1n << (BigInt(NUM_LIMBS) * W_BITS); // 2^264
export const NH = 2 * NUM_LIMBS;     // 24 half-limbs (11-bit)
export const NCOL11 = 2 * NH;        // 48 columns
export const G11 = 3;                // renorm cadence

const W11 = 2048.0;                  // 2^11
const W11_INV = Math.fround(1.0 / 2048.0); // exact 2^-11
const fr = x => Math.fround(x);

// ---- the f32 multiply core: returns the EXACT product as 48 x 11-bit
//      integer columns (as JS numbers, each in [0, 2^11)). Mirrors WGSL.
export function mul_11split(aLimbs22, bLimbs22) {
  // split each 22-bit limb into two 11-bit half-limbs (exact integers)
  const hx = new Array(NH), hy = new Array(NH);
  for (let m = 0; m < NUM_LIMBS; m++) {
    const af = aLimbs22[m];
    const aH = fr(Math.floor(fr(af * W11_INV)));
    const aL = fr(af - fr(aH * W11));
    hx[2 * m] = aL; hx[2 * m + 1] = aH;
    const bf = bLimbs22[m];
    const bH = fr(Math.floor(fr(bf * W11_INV)));
    const bL = fr(bf - fr(bH * W11));
    hy[2 * m] = bL; hy[2 * m + 1] = bH;
  }
  // 48-wide 11-bit f32 column grid + floor renorm every G rows with the
  // integer-round-trip reassociation barrier.
  const d = new Array(NCOL11 + 1).fill(0.0);
  let since = 0;
  for (let i = 0; i < NH; i++) {
    for (let j = 0; j < NH; j++) {
      const k = i + j;
      d[k] = fr(d[k] + fr(hx[i] * hy[j]));
    }
    if (++since >= G11) {
      for (let k = 0; k < NCOL11; k++) {
        const hv = fr(Math.floor(fr(d[k] * W11_INV)));
        // integer-round-trip barrier: d[k] is an exact non-neg integer in
        // [0,2^11) here; the round-trip is value-identity but blocks the
        // driver from reassociating the per-product adds across the renorm.
        d[k] = fr(d[k] - fr(hv * W11));   // host: exact; WGSL: f32(u32(...))
        d[k + 1] = fr(d[k + 1] + hv);
      }
      since = 0;
    }
  }
  // final renorm
  for (let k = 0; k < NCOL11; k++) {
    const hv = fr(Math.floor(fr(d[k] * W11_INV)));
    d[k] = fr(d[k] - fr(hv * W11));
    d[k + 1] = fr(d[k + 1] + hv);
  }
  return d; // 48 (+1) columns, each an 11-bit integer-valued f32
}

// fold 48 x 11-bit columns -> 24 x 22-bit u32 columns (the product a*b in
// 22-bit radix). Pairs (2k, 2k+1) combine: P[k] = d[2k] + d[2k+1]*2^11,
// then carry-propagate to keep each P[k] in [0, 2^22). Returns BigInt-free
// integer array (values fit in <2^24 before carry; we carry to <2^22).
export function fold_to_22(d) {
  const NP = NH; // 24 columns of 22-bit
  const P22 = new Array(NP + 1).fill(0);
  for (let k = 0; k < NP; k++) {
    // d entries are exact integers < 2^11; combine the two 11-bit halves.
    P22[k] = d[2 * k] + d[2 * k + 1] * 2048;
  }
  // carry-propagate to canonical 22-bit limbs
  let carry = 0;
  for (let k = 0; k < NP; k++) {
    const v = P22[k] + carry;
    P22[k] = v % 4194304;       // & (2^22-1)
    carry = Math.floor(v / 4194304);
  }
  P22[NP] = carry;
  return P22; // 24 (+1) limbs of 22-bit
}

// integer 22-bit CIOS Montgomery reduce of a 24-limb product -> 12-limb
// residue in [0,p). n0 = -p^{-1} mod 2^22. plimb = p in 12 x 22-bit.
export function cios_reduce_22(P22, n0, plimb) {
  const N = NUM_LIMBS;
  // working array, 2N+1 limbs (we operate in-place on a copy)
  const t = new Array(2 * N + 1).fill(0);
  for (let k = 0; k < 2 * N; k++) t[k] = P22[k] || 0;

  for (let i = 0; i < N; i++) {
    const m = (t[i] * n0) % 4194304; // (t[i]*n0) mod 2^22
    let carry = 0;
    for (let j = 0; j < N; j++) {
      const v = t[i + j] + m * plimb[j] + carry;
      t[i + j] = v % 4194304;
      carry = Math.floor(v / 4194304);
    }
    // propagate carry into the rest
    let k = i + N;
    while (carry !== 0) {
      const v = t[k] + carry;
      t[k] = v % 4194304;
      carry = Math.floor(v / 4194304);
      k++;
    }
  }
  // result is in t[N..2N], length N (+ possible top limb t[2N])
  const out = new Array(N);
  for (let j = 0; j < N; j++) out[j] = t[N + j];
  const top = t[2 * N] || 0;
  // value in [0, 2p): conditional subtract p (account for top limb too).
  return condsub_p(out, top, plimb);
}

// out (12 limbs) possibly with a 13th "top" limb; subtract p if >= p.
export function condsub_p(out, top, plimb) {
  const N = NUM_LIMBS;
  // compute out - p with borrow
  const d = new Array(N);
  let borrow = 0;
  for (let j = 0; j < N; j++) {
    let v = out[j] - plimb[j] - borrow;
    if (v < 0) { v += 4194304; borrow = 1; } else borrow = 0;
    d[j] = v;
  }
  // if top>0 the value is definitely >= p (p has 0 in limb 12); subtract.
  // else subtract iff borrow==0 (out >= p).
  const useD = top > 0 ? true : (borrow === 0);
  return useD ? d : out.slice();
}

// double a 12x22 limb value mod p (exact integer, Mali-safe): x -> 2x mod p.
export function double_mod_p(x, plimb) {
  const N = NUM_LIMBS;
  const s = new Array(N);
  let carry = 0;
  for (let j = 0; j < N; j++) {
    const v = x[j] * 2 + carry;
    s[j] = v % 4194304;
    carry = Math.floor(v / 4194304);
  }
  // s = 2x in [0, 2p) (+ a possible top carry); conditional subtract p.
  return condsub_p(s, carry, plimb);
}

// full native montmul producing x*y*2^-260 mod p (the walker's R260 domain).
// The 22-bit CIOS reduce yields x*y*2^-264; multiply by 2^4 (=four doublings)
// to land on 2^-260. All integer, Mali-safe; matches montgomery_product_f8.
export function montmul_native22(aLimbs22, bLimbs22, n0, plimb) {
  const d = mul_11split(aLimbs22, bLimbs22);
  const P22 = fold_to_22(d);
  let r = cios_reduce_22(P22, n0, plimb); // = a*b*2^-264 mod p
  // correct 2^-264 -> 2^-260 : multiply by 2^4 = 16 (R264 = R260 * 2^4)
  for (let s = 0; s < 4; s++) r = double_mod_p(r, plimb);
  return r;
}

// native montmul producing x*y*2^-264 mod p (the uniform R264 domain). Used
// when the WHOLE pipeline is R264 (no boundary correction needed).
export function montmul_native22_R264(aLimbs22, bLimbs22, n0, plimb) {
  const d = mul_11split(aLimbs22, bLimbs22);
  const P22 = fold_to_22(d);
  return cios_reduce_22(P22, n0, plimb);
}

// ---- BigInt helpers ----
export function modinv(a, m) {
  let [or, r] = [((a % m) + m) % m, m]; let [os, s] = [1n, 0n];
  while (r) { const q = or / r;[or, r] = [r, or - q * r];[os, s] = [s, os - q * s]; }
  return ((os % m) + m) % m;
}
// to/from 22-bit limbs WITHOUT the mod-p collapse (so p itself is representable)
export function toLimbs22(v) { const o = []; let x = v; for (let i = 0; i < NUM_LIMBS; i++) { o.push(Number(x & (W - 1n))); x >>= W_BITS; } return o; }
export function fromLimbs22(l) { let v = 0n; for (let i = NUM_LIMBS - 1; i >= 0; i--) v = (v << W_BITS) | BigInt(Math.round(l[i])); return v; }
export function montref(am, bm) { return (am * bm * modinv(R, P)) % P; }
export const N0 = Number(((1n << W_BITS) - modinv(P, 1n << W_BITS)) % (1n << W_BITS));
export const PLIMB = toLimbs22(P); // p in 12 x 22-bit (NOT mod p)
