// Host bit-exact model v2 — split-accumulator SOS, comfortable headroom.
//
// Domain R = 2^264. Inputs/outputs: 12 integer-valued f32 limbs in [0,2^22).
// Product computed: t = a*b*R^{-1} mod p, returned in [0,p) as 12 limbs.
//
// Structure (SOS, separated multiply/reduce per outer i, but with a
// per-column LOW/HIGH f32 pair so no single accumulator exceeds ~3*2^22
// < 2^24 between normalizations):
//
// We keep, for each of the 13 working columns, a single running f32
// "col[k]" that holds a partial integer sum. Per outer i:
//   (A) for j: split a[i]*b[j] = hi*2^22+lo (mulhilo22, both in [0,2^22));
//       col[j] += lo ; col[j+1] += hi.
//       After each += we IMMEDIATELY normalize col[j] (carry up) so it
//       returns to [0,2^22) and at most a +1 lands in col[j+1]. This keeps
//       every col[k] <= 2^22 + (one lo) + (one hi) + (one carry) < 4*2^22
//       = 2^24 at its peak, but we normalize eagerly to hold it < 3*2^22.
//   (B) m = (col[0]*n0) mod 2^22.
//   (C) for j: split m*p[j]; col[j]+=lo (col[0] becomes 0 mod 2^22),
//       col[j+1]+=hi, normalizing col[j] each step.
//   shift col down by one (col[k]=col[k+1]); col[top]=0.
//
// Because we normalize col[j] to [0,2^22) right after adding to it, the
// ONLY thing that accumulates in col[k] before it is itself processed is:
//   its residue (<2^22) + lo-from-its-own-step + hi-from-previous-step
//   + the +1 carries. Bounded < 2^24 with margin.
//
// This mirrors mulhilo_22.wgsl exactly and is fully unrollable with named
// scalars (no dynamic indexing) for the WGSL emission.

export const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
export const NUM_LIMBS = 12;
export const W_BITS = 22n;
export const W = 1n << W_BITS;
export const R = 1n << (BigInt(NUM_LIMBS) * W_BITS);
const W_F32 = 4194304.0;
const W_INV_F32 = Math.fround(1.0 / 4194304.0);
const fr = x => Math.fround(x);
export function fma(a, b, c) { return Math.fround(a * b + c); }

export function mulhilo22(a, b) {
  const p = fr(a * b);
  const e = fr(fma(a, b, -p));
  let hi = fr(Math.floor(fr(p * W_INV_F32)));
  let lo = fr(fr(fma(hi, -W_F32, p)) + e);
  const neg = lo < 0.0 ? 1.0 : 0.0;
  lo = fr(lo + fr(neg * W_F32));
  hi = fr(hi - neg);
  return [hi, lo];
}

// carry-normalize one column value v (integer f32, 0 <= v < 2^24) into
// (carry, digit): v == carry*2^22 + digit, digit in [0,2^22).
export function norm(v) {
  const carry = fr(Math.floor(fr(v * W_INV_F32)));
  const digit = fr(fma(carry, -W_F32, v));
  return [carry, digit];
}

export function montmul_fp22(a, b, n0, plimb) {
  const N = NUM_LIMBS;
  const col = new Array(N + 1).fill(0.0); // working columns 0..N

  for (let i = 0; i < N; i++) {
    const ai = a[i];

    // (A) col += a[i]*b, eager-normalized.
    for (let j = 0; j < N; j++) {
      const [hi, lo] = mulhilo22(ai, b[j]);
      // add lo into col[j], normalize, push carry into col[j+1]
      let s = fr(col[j] + lo);
      let nr = norm(s); col[j] = nr[1];
      col[j + 1] = fr(col[j + 1] + fr(nr[0] + hi));
    }
    // normalize col[N] (top) so it stays bounded; carry beyond is dropped
    // because the algorithm guarantees the value < 2*R (top carry tiny).
    {
      const nr = norm(col[N]); col[N] = nr[1];
      // nr[0] would be the (13th) overflow; for CIOS it stays 0 or 1 and
      // is absorbed by the next shift's vacated top. Track it into a phantom.
      // (We add it back after shift below via `topcarry`.)
      var topcarryA = nr[0];
    }

    // (B) Montgomery digit m = (col[0]*n0) mod 2^22.
    const m = mulhilo22(col[0], n0)[1];

    // (C) col += m*p, eager-normalized. This zeroes col[0] mod 2^22.
    for (let j = 0; j < N; j++) {
      const [hi, lo] = mulhilo22(m, plimb[j]);
      let s = fr(col[j] + lo);
      let nr = norm(s); col[j] = nr[1];
      col[j + 1] = fr(col[j + 1] + fr(nr[0] + hi));
    }
    let topcarryC;
    {
      const nr = norm(col[N]); col[N] = nr[1]; topcarryC = nr[0];
    }

    // col[0] is now 0 (Montgomery). Shift down by one limb.
    for (let j = 0; j < N; j++) col[j] = col[j + 1];
    // the vacated top (col[N]) gets the accumulated top carries.
    col[N] = fr(topcarryA + topcarryC);
  }

  return condsub_p_limbs(col.slice(0, N), plimb);
}

export function condsub_p_limbs(tin, plimb) {
  const N = NUM_LIMBS;
  const d = new Array(N).fill(0.0);
  let borrow = 0.0;
  for (let j = 0; j < N; j++) {
    const diff = fr(fr(tin[j] - plimb[j]) - borrow);
    const neg = diff < 0.0 ? 1.0 : 0.0;
    d[j] = fr(diff + fr(neg * W_F32));
    borrow = neg;
  }
  const out = new Array(N);
  const useD = borrow === 0.0;
  for (let j = 0; j < N; j++) out[j] = useD ? d[j] : tin[j];
  return out;
}

export function modinv(a, m) {
  let [or, r] = [((a % m) + m) % m, m]; let [os, s] = [1n, 0n];
  while (r) { const q = or / r;[or, r] = [r, or - q * r];[os, s] = [s, os - q * s]; }
  return ((os % m) + m) % m;
}
export function toLimbs22(v) { const o = []; let x = ((v % P) + P) % P; for (let i = 0; i < NUM_LIMBS; i++) { o.push(Number(x & (W - 1n))); x >>= W_BITS; } return o; }
export function fromLimbs22(l) { let v = 0n; for (let i = NUM_LIMBS - 1; i >= 0; i--) v = (v << W_BITS) | BigInt(Math.round(l[i])); return v; }
export function montref(am, bm) { return (am * bm * modinv(R, P)) % P; }
export const N0 = ((1n << W_BITS) - modinv(P, 1n << W_BITS)) % (1n << W_BITS);
export const N0_F32 = Number(N0);
export const PLIMB = toLimbs22(P);
