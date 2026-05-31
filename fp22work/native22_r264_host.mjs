// CLEAN host oracle for the NATIVE 12x22-bit Montgomery domain, R = 2^264.
// ONE representation (12 limbs x 22 bits), ONE R (2^264), native 22-bit CIOS
// reduction. There is NO 13-bit limb, NO 2^260, and NO domain-correction
// (no doubling, no fixup) anywhere in this file. montmul = a*b*2^-264 mod p.
//
// Multiply: 11-bit operand split into a 48-col 11-bit f32 grid with a floor
// renorm every G=3 rows guarded by an integer-round-trip reassociation
// barrier. NO fma, NO magic-constant snap, NO Dekker residual (all fold on
// Mali). Reduce: integer 22-bit CIOS, per-limb n0 = -p^-1 mod 2^22 = 418697.
// Mirrors gen_native22_r264.mjs op-for-op.

export const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
export const NUM_LIMBS = 12;
export const W_BITS = 22n;
export const W = 1n << W_BITS;
export const R = 1n << (BigInt(NUM_LIMBS) * W_BITS);   // 2^264
export const NH = 2 * NUM_LIMBS;       // 24 half-limbs (11-bit)
export const NCOL11 = 2 * NH;          // 48 columns
export const G11 = 3;

const W11 = 2048.0;
const W11_INV = Math.fround(1.0 / 2048.0);
const fr = x => Math.fround(x);

export function mul_11split(a, b) {
  const hx = new Array(NH), hy = new Array(NH);
  for (let m = 0; m < NUM_LIMBS; m++) {
    const af = a[m]; const aH = fr(Math.floor(fr(af * W11_INV))); const aL = fr(af - fr(aH * W11));
    hx[2 * m] = aL; hx[2 * m + 1] = aH;
    const bf = b[m]; const bH = fr(Math.floor(fr(bf * W11_INV))); const bL = fr(bf - fr(bH * W11));
    hy[2 * m] = bL; hy[2 * m + 1] = bH;
  }
  const d = new Array(NCOL11 + 1).fill(0.0);
  let since = 0;
  for (let i = 0; i < NH; i++) {
    for (let j = 0; j < NH; j++) { const k = i + j; d[k] = fr(d[k] + fr(hx[i] * hy[j])); }
    if (++since >= G11) {
      for (let k = 0; k < NCOL11; k++) { const hv = fr(Math.floor(fr(d[k] * W11_INV))); d[k] = fr(d[k] - fr(hv * W11)); d[k + 1] = fr(d[k + 1] + hv); }
      since = 0;
    }
  }
  for (let k = 0; k < NCOL11; k++) { const hv = fr(Math.floor(fr(d[k] * W11_INV))); d[k] = fr(d[k] - fr(hv * W11)); d[k + 1] = fr(d[k + 1] + hv); }
  return d;
}

export function fold_to_22(d) {
  const NP = NH;
  const P22 = new Array(NP + 1).fill(0);
  for (let k = 0; k < NP; k++) P22[k] = d[2 * k] + d[2 * k + 1] * 2048;
  let carry = 0;
  for (let k = 0; k < NP; k++) { const v = P22[k] + carry; P22[k] = v % 4194304; carry = Math.floor(v / 4194304); }
  P22[NP] = carry;
  return P22;
}

function condsub_p(out, top, plimb) {
  const N = NUM_LIMBS; const d = new Array(N); let borrow = 0;
  for (let j = 0; j < N; j++) { let v = out[j] - plimb[j] - borrow; if (v < 0) { v += 4194304; borrow = 1; } else borrow = 0; d[j] = v; }
  const useD = top > 0 ? true : (borrow === 0);
  return useD ? d : out.slice();
}

export function cios_reduce_22(P22, n0, plimb) {
  const N = NUM_LIMBS;
  const t = new Array(2 * N + 1).fill(0);
  for (let k = 0; k < 2 * N; k++) t[k] = P22[k] || 0;
  for (let i = 0; i < N; i++) {
    const m = (t[i] * n0) % 4194304;
    let carry = 0;
    for (let j = 0; j < N; j++) { const v = t[i + j] + m * plimb[j] + carry; t[i + j] = v % 4194304; carry = Math.floor(v / 4194304); }
    let k = i + N;
    while (carry !== 0) { const v = t[k] + carry; t[k] = v % 4194304; carry = Math.floor(v / 4194304); k++; }
  }
  const out = new Array(N); for (let j = 0; j < N; j++) out[j] = t[N + j];
  return condsub_p(out, t[2 * N] || 0, plimb);
}

// THE native montmul: a*b*2^-264 mod p. No correction, ever.
export function montmul(a, b, n0, plimb) {
  return cios_reduce_22(fold_to_22(mul_11split(a, b)), n0, plimb);
}

export function modinv(a, m) { let [or, r] = [((a % m) + m) % m, m]; let [os, s] = [1n, 0n]; while (r) { const q = or / r;[or, r] = [r, or - q * r];[os, s] = [s, os - q * s]; } return ((os % m) + m) % m; }
export function toLimbs22(v) { const o = []; let x = v; for (let i = 0; i < NUM_LIMBS; i++) { o.push(Number(x & (W - 1n))); x >>= W_BITS; } return o; }
export function fromLimbs22(l) { let v = 0n; for (let i = NUM_LIMBS - 1; i >= 0; i--) v = (v << W_BITS) | BigInt(Math.round(l[i])); return v; }
export const N0 = Number(((1n << W_BITS) - modinv(P, 1n << W_BITS)) % (1n << W_BITS));  // 418697
export const PLIMB = toLimbs22(P);
