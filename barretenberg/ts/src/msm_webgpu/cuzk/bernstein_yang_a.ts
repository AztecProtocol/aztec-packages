// Option A TS reference: BY safegcd inverse on 20 x 13-bit BigInt with
// BATCH=26, NUM_OUTER=29. Validates the WGSL port at fr_inv_by_a against
// modInverse. Uses bigint throughout (no overflow concerns).

import { BN254_BASE_FIELD, modInverse } from "./bn254.js";

const N = 20;
const LIMB_BITS = 13n;
const LIMB_MASK = (1n << LIMB_BITS) - 1n;
const BATCH = 26n;
const BATCH_NUM = 26;
const MASK_BATCH = (1n << BATCH) - 1n;
const NUM_OUTER = 29;
const REDUCE_INTERVAL = 4;
const RTC_MAX_ITERS = 36;

const U64_MASK = (1n << 64n) - 1n;
const P_BIGINT = BN254_BASE_FIELD;
// p^(-1) mod 2^26. Hensel-lifted.
function computePInv26(p: bigint): bigint {
  let inv = 1n;
  let cur = 1n;
  while (cur < BATCH) {
    cur *= 2n;
    const mask = (1n << cur) - 1n;
    inv = (inv * (2n - p * inv)) & mask;
  }
  inv &= MASK_BATCH;
  return inv;
}
const P_INV = computePInv26(P_BIGINT);

type BigA = bigint[]; // length 20

function makeZero(): BigA { return new Array(N).fill(0n); }
function makeOne(): BigA { const r = makeZero(); r[0] = 1n; return r; }

function fromBigint(x: bigint): BigA {
  const r = makeZero();
  for (let i = 0; i < N; i++) r[i] = (x >> (BigInt(i) * LIMB_BITS)) & LIMB_MASK;
  return r;
}

function toBigint(x: BigA): bigint {
  let v = 0n;
  for (let i = N - 1; i >= 0; i--) v = (v << LIMB_BITS) | (x[i] & LIMB_MASK);
  return v;
}

function lowU64(x: BigA): bigint {
  // Low 64 bits of x. Uses limbs 0..4 (= 65 bits, top bit unused).
  let v = 0n;
  for (let i = 4; i >= 0; i--) v = (v << LIMB_BITS) | (x[i] & LIMB_MASK);
  return v & U64_MASK;
}

function isZero(x: BigA): boolean {
  for (let i = 0; i < N; i++) if (x[i] !== 0n) return false;
  return true;
}
function isNegative(x: BigA): boolean { return x[N - 1] < 0n; }

function normalise(x: BigA): void {
  let c = 0n;
  for (let i = 0; i < N - 1; i++) {
    const v = x[i] + c;
    x[i] = v & LIMB_MASK;
    c = v >> LIMB_BITS;  // bigint arith shift
  }
  x[N - 1] += c;
}

function neg(x: BigA): void {
  for (let i = 0; i < N; i++) x[i] = -x[i];
  normalise(x);
}

function addP(x: BigA, p: BigA): void {
  for (let i = 0; i < N; i++) x[i] += p[i];
  normalise(x);
}
function subP(x: BigA, p: BigA): void {
  for (let i = 0; i < N; i++) x[i] -= p[i];
  normalise(x);
}

function reduceToCanonical(x: BigA, p: BigA): void {
  normalise(x);
  for (let it = 0; it < RTC_MAX_ITERS; it++) {
    if (isNegative(x)) { addP(x, p); continue; }
    let cmp = 0;
    for (let i = N - 1; i >= 0; i--) {
      if (x[i] !== p[i]) { cmp = x[i] > p[i] ? 1 : -1; break; }
    }
    if (cmp < 0) break;
    subP(x, p);
  }
}

interface Mat { u: bigint; v: bigint; q: bigint; r: bigint; }

function divsteps(deltaIn: bigint, fLoIn: bigint, gLoIn: bigint): { mat: Mat; delta: bigint } {
  let delta = deltaIn;
  let f_lo = fLoIn & U64_MASK;
  let g_lo = gLoIn & U64_MASK;
  let u = 1n, v = 0n, q = 0n, r = 1n;
  for (let i = 0; i < BATCH_NUM; i++) {
    if ((g_lo & 1n) !== 0n) {
      if (delta > 0n) {
        const nf = g_lo;
        const diff = (g_lo - f_lo) & U64_MASK;
        const ng = diff >> 1n;
        const nu = q << 1n;
        const nv = r << 1n;
        const nq = q - u;
        const nr = r - v;
        f_lo = nf; g_lo = ng;
        u = nu; v = nv; q = nq; r = nr;
        delta = 1n - delta;
      } else {
        const sum = (g_lo + f_lo) & U64_MASK;
        g_lo = sum >> 1n;
        q = q + u; r = r + v;
        u <<= 1n; v <<= 1n;
        delta = delta + 1n;
      }
    } else {
      g_lo >>= 1n;
      u <<= 1n; v <<= 1n;
      delta = delta + 1n;
    }
  }
  return { mat: { u, v, q, r }, delta };
}

function applyMatrix(m: Mat, f: BigA, g: BigA, d: BigA, e: BigA, p: BigA, pInv: bigint): void {
  // Use TS-style decomposition: u_lo unsigned in [0, 2^13), u_hi signed.
  const u_lo = m.u & LIMB_MASK;
  const u_hi = m.u >> LIMB_BITS;
  const v_lo = m.v & LIMB_MASK;
  const v_hi = m.v >> LIMB_BITS;
  const q_lo = m.q & LIMB_MASK;
  const q_hi = m.q >> LIMB_BITS;
  const r_lo = m.r & LIMB_MASK;
  const r_hi = m.r >> LIMB_BITS;

  // (f, g) pass
  {
    let cf = 0n, cg = 0n, fp = 0n, gp = 0n;
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
    const nfTop = u_hi * fp + v_hi * gp + cf;
    const ngTop = q_hi * fp + r_hi * gp + cg;
    f[N - 2] = nfTop & LIMB_MASK;
    g[N - 2] = ngTop & LIMB_MASK;
    f[N - 1] = nfTop >> LIMB_BITS;
    g[N - 1] = ngTop >> LIMB_BITS;
  }

  // (d, e) pass with k*p
  {
    const d0 = d[0], e0 = e[0], d1 = d[1], e1 = e[1];
    const nd0 = u_lo * d0 + v_lo * e0;
    const ne0 = q_lo * d0 + r_lo * e0;
    const nd1 = u_lo * d1 + v_lo * e1 + u_hi * d0 + v_hi * e0;
    const ne1 = q_lo * d1 + r_lo * e1 + q_hi * d0 + r_hi * e0;
    const nd0_low = nd0 & LIMB_MASK;
    const nd1_carry = (nd1 + (nd0 >> LIMB_BITS)) & LIMB_MASK;
    const t_d = (nd0_low | (nd1_carry << LIMB_BITS)) & MASK_BATCH;
    const ne0_low = ne0 & LIMB_MASK;
    const ne1_carry = (ne1 + (ne0 >> LIMB_BITS)) & LIMB_MASK;
    const t_e = (ne0_low | (ne1_carry << LIMB_BITS)) & MASK_BATCH;
    const neg_td = (MASK_BATCH - t_d + 1n) & MASK_BATCH;
    const neg_te = (MASK_BATCH - t_e + 1n) & MASK_BATCH;
    const k_d = (neg_td * pInv) & MASK_BATCH;
    const k_e = (neg_te * pInv) & MASK_BATCH;
    const kd_lo = k_d & LIMB_MASK;
    const kd_hi = k_d >> LIMB_BITS;
    const ke_lo = k_e & LIMB_MASK;
    const ke_hi = k_e >> LIMB_BITS;
    let cd =
      (nd1 + kd_lo * p[1] + kd_hi * p[0] + ((nd0 + kd_lo * p[0]) >> LIMB_BITS)) >>
      LIMB_BITS;
    let ce =
      (ne1 + ke_lo * p[1] + ke_hi * p[0] + ((ne0 + ke_lo * p[0]) >> LIMB_BITS)) >>
      LIMB_BITS;
    let dp = d1, ep = e1;
    for (let i = 2; i < N; i++) {
      const di = d[i];
      const ei = e[i];
      const nd = u_lo * di + v_lo * ei + u_hi * dp + v_hi * ep + kd_lo * p[i] + kd_hi * p[i - 1] + cd;
      const ne = q_lo * di + r_lo * ei + q_hi * dp + r_hi * ep + ke_lo * p[i] + ke_hi * p[i - 1] + ce;
      cd = nd >> LIMB_BITS;
      ce = ne >> LIMB_BITS;
      d[i - 2] = nd & LIMB_MASK;
      e[i - 2] = ne & LIMB_MASK;
      dp = di;
      ep = ei;
    }
    const ndTop = u_hi * dp + v_hi * ep + kd_hi * p[N - 1] + cd;
    const neTop = q_hi * dp + r_hi * ep + ke_hi * p[N - 1] + ce;
    d[N - 2] = ndTop & LIMB_MASK;
    e[N - 2] = neTop & LIMB_MASK;
    d[N - 1] = ndTop >> LIMB_BITS;
    e[N - 1] = neTop >> LIMB_BITS;
  }
}

export function invertA(a: bigint, p: bigint = P_BIGINT, pInv: bigint = P_INV): bigint {
  if (a === 0n) return 0n;
  const pa = fromBigint(p);
  const f = fromBigint(p);
  const g = fromBigint(a);
  const d = makeZero();
  const e = makeOne();
  let delta = 1n;
  for (let iter = 0; iter < NUM_OUTER; iter++) {
    if (isZero(g)) break;
    const flo = lowU64(f);
    const glo = lowU64(g);
    const { mat, delta: nd } = divsteps(delta, flo, glo);
    delta = nd;
    applyMatrix(mat, f, g, d, e, pa, pInv);
    if (((iter + 1) % REDUCE_INTERVAL) === 0) {
      reduceToCanonical(d, pa);
      reduceToCanonical(e, pa);
    }
  }
  reduceToCanonical(d, pa);
  if (isNegative(f)) {
    neg(d);
    reduceToCanonical(d, pa);
  }
  return toBigint(d);
}
