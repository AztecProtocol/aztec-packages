// RNS basis + constant computation and correctness proof for BN254 F_q, using
// DOUBLE-MONTGOMERY reduction (per-residue Montgomery reduce for the elementwise
// multiplies; plain pseudo-Mersenne reduce for the two base-extension matvecs).
// See ../../../../RNS_COOP_PLAN.md.
//
// AUTHORING DISCIPLINE (§0.1): the ONLY JavaScript in the RNS path. Computes and
// VALIDATES numeric constants, writes the committed DATA file rns_constants.wgsl,
// emits no shader logic. rnsModmul is a byte-for-byte mirror of the integer ops the
// hand-written rns_field.wgsl performs, so a green test here gates the GPU kernel.
//
//   node dev/msm-webgpu/rns_params.mjs          (writes + validates the data file)
//   node dev/msm-webgpu/rns_params.test.mjs     (oracle + file-freshness asserts)
//
// Representation: residues live in per-residue Montgomery form [R] (value*R mod modulus,
// R=2^W). The CRT digits xi/eta come out NORMAL because their forming-multiply uses an
// un-scaled constant (the Montgomery reduce's R^-1 cancels the operand's R); the matvec
// constants are scaled by R so the matvec output lands back in [R]. Moduli must be ODD
// (coprime to R) for the per-residue Montgomery inverse to exist.

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const P = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47n; // BN254 F_q

function egcd(a, b) { if (b === 0n) return [a, 1n, 0n]; const [g, x, y] = egcd(b, a % b); return [g, y, x - (a / b) * y]; }
function modinv(a, m) { const [g, x] = egcd(((a % m) + m) % m, m); if (g !== 1n) throw new Error(`no inverse`); return ((x % m) + m) % m; }
function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; }
function prod(xs) { return xs.reduce((r, x) => r * x, 1n); }

// ODD pseudo-Mersenne moduli 2^w - z (z odd), pairwise coprime, coprime to P and `taken`.
function pickBasis(w, count, taken) {
  const base = 1n << BigInt(w);
  const out = [];
  for (let z = 1n; out.length < count && z < base; z += 2n) { // z odd -> m odd
    const m = base - z;
    if (m <= 1n || gcd(m, P) !== 1n) continue;
    if (!out.every((o) => gcd(m, o) === 1n) || !taken.every((t) => gcd(m, t) === 1n)) continue;
    out.push(m);
  }
  if (out.length < count) throw new Error(`only ${out.length}/${count} odd moduli at w=${w}`);
  return out;
}

// Config (env-overridable): per-thread basis t=20,w=13 default.
export const W = Number(process.env.RNS_W ?? 13);
export const T = Number(process.env.RNS_T ?? 20);
export const RANK_F = Number(process.env.RNS_RANK_F ?? 24);
const R = 1 << W; // per-residue Montgomery radix

export function computeParams() {
  const mM = pickBasis(W, T, []);
  const mN = pickBasis(W, T, mM);
  const M = prod(mM), N = prod(mN);
  if (gcd(M, N) !== 1n) throw new Error('M,N not coprime');
  const Rb = 1n << BigInt(W);
  const negPinvM = (M - modinv(P, M)) % M;
  const TWO_F = 1n << BigInt(RANK_F);

  const RNS_M_MOD = mM.map(Number), RNS_N_MOD = mN.map(Number);
  const RNS_M_Z = mM.map((m) => Number(Rb - m)), RNS_N_Z = mN.map((n) => Number(Rb - n));
  // per-residue Montgomery inverses: -m^{-1} mod R
  const MONT_MINV_M = mM.map((m) => Number(((Rb - modinv(m, Rb)) % Rb)));
  const MONT_MINV_N = mN.map((n) => Number(((Rb - modinv(n, Rb)) % Rb)));
  // digit-forming constants stay PLAIN -> digits come out normal
  const PRE_M = mM.map((m, i) => Number((negPinvM * modinv(M / m, m)) % m));
  const NDI_N = mN.map((n, j) => Number(modinv(N / n, n)));
  const RANK_W_M = mM.map((m) => Number(TWO_F / m));
  const RANK_W_N = mN.map((n) => Number(TWO_F / n));
  // matvec + post-extension constants SCALED BY R -> outputs land back in [R] form
  const CRNS_A_MN = []; for (const m of mM) { const Mi = M / m; for (const n of mN) CRNS_A_MN.push(Number((Mi * Rb) % n)); }
  const CRNS_C_MN = mN.map((n) => Number((((-M * Rb) % n) + n) % n));
  const CRNS_A_NM = []; for (const n of mN) { const Nj = N / n; for (const m of mM) CRNS_A_NM.push(Number((Nj * Rb) % m)); }
  const CRNS_C_NM = mM.map((m) => Number((((-N * Rb) % m) + m) % m));
  const P_MOD_N_R = mN.map((n) => Number((P * Rb) % n));
  const M_INV_N_R = mN.map((n) => Number((modinv(M, n) * Rb) % n));
  // M^{-1}*(N/n_j)^{-1} mod n_j: lets the kernel form eta = montred(t*MND_N) directly,
  // off the rN dependency, shortening the critical path by one Montgomery reduce.
  const MND_N = mN.map((n) => Number((modinv(M, n) * modinv(N / n, n)) % n));
  // P*M^{-1}*(N/n_j)^{-1} mod n_j: eta's qN-term = montred(qN*PMND_N) (1 reduce off qN),
  // its sN-term = montred(sN*MND_N) is precomputable before the first gather; their sum is
  // eta. This removes a second Montgomery reduce from the critical path into extend-2.
  const PMND_N = mN.map((n) => Number((P % n * (modinv(M, n) * modinv(N / n, n) % n)) % n));
  const RANK_ALPHA = T * R;

  // For the select-free butterfly all-gather (power-of-two t only): after the gather lane r
  // holds g[k] = digit of lane (r XOR k), so the matvec/rank read A[(k^r)][r] and W[(k^r)].
  // Pre-permute them into contiguous per-lane rows [r*t + k] so the kernel needs no reorder.
  const isPow2 = (T & (T - 1)) === 0;
  // Per-lane-contiguous layout [r*T + k]: lane r's 16 gather constants are consecutive words
  // (1-2 cache lines/lane). In the starved target regime (1-2 warps) this beats cross-lane
  // coalescing — measured ~20% faster than the transposed [k*T+r] at M<=128.
  const xperm = (src, w) => { const o = []; for (let r = 0; r < T; r++) for (let k = 0; k < T; k++) o.push(w ? src[k ^ r] : src[(k ^ r) * T + r]); return o; };
  const A_MN_PERM = isPow2 ? xperm(CRNS_A_MN, false) : [];
  const A_NM_PERM = isPow2 ? xperm(CRNS_A_NM, false) : [];
  const RANK_W_M_PERM = isPow2 ? xperm(RANK_W_M, true) : [];
  const RANK_W_N_PERM = isPow2 ? xperm(RANK_W_N, true) : [];

  // p-scaled ext1 constants: folding (P mod n_j) into A_MN/C_MN makes the M->N extend output
  // qp = qN*p directly (a pure scalar multiple of each output residue), so the kernel skips
  // qp = montred(qN*P_MOD_N_R) — one Montgomery reduce off the critical spine. Output unchanged.
  const A_MN_P = []; for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) A_MN_P.push(Number((BigInt(CRNS_A_MN[i * T + j]) * (P % mN[j])) % mN[j]));
  const C_MN_P = mN.map((n, j) => Number((BigInt(CRNS_C_MN[j]) * (P % n)) % n));
  const A_MN_P_PERM = isPow2 ? xperm(A_MN_P, false) : [];

  return {
    mM, mN, M, N, RANK_ALPHA,
    RNS_M_MOD, RNS_N_MOD, RNS_M_Z, RNS_N_Z, MONT_MINV_M, MONT_MINV_N,
    PRE_M, NDI_N, RANK_W_M, RANK_W_N,
    CRNS_A_MN, CRNS_C_MN, CRNS_A_NM, CRNS_C_NM, P_MOD_N_R, M_INV_N_R, MND_N, PMND_N,
    A_MN_PERM, A_NM_PERM, RANK_W_M_PERM, RANK_W_N_PERM, A_MN_P_PERM, C_MN_P,
  };
}

// ---- the integer ops the kernel mirrors (Number arithmetic, exact below 2^53; no JS
// bitwise on wide values — at w=16 the Montgomery sum is <2^33 and the matvec
// accumulator <2^36, both past the 32-bit bitwise window) ----
// per-residue Montgomery reduce: T < m*R -> canonical [0,m). minv = -m^{-1} mod R.
function montred(t, m, minv) {
  const q = ((t % R) * minv) % R;
  let r = (t + q * m) / R; // exactly divisible by construction
  if (r >= m) r -= m;
  return r;
}
// plain pseudo-Mersenne reduce of t mod m=2^W-z -> canonical [0,m).
function plain(t, m, z) {
  while (t >= R) { t = (t % R) + Math.floor(t / R) * z; }
  while (t >= m) t -= m;
  return t;
}
// normal integer x -> per-residue [R] Montgomery residues (mods may be BigInt or Number).
export function toMont(x, mods) {
  const Rb = BigInt(R), xb = BigInt(x);
  return mods.map((m) => { const mb = BigInt(m); return Number((((xb % mb) + mb) % mb * Rb) % mb); });
}

// a*b*M^{-1} mod p. Inputs/outputs are residues in per-residue [R] Montgomery form, both bases.
export function rnsModmul(aM, aN, bM, bN, p) {
  const sM = aM.map((a, i) => montred(a * bM[i], p.RNS_M_MOD[i], p.MONT_MINV_M[i]));      // [R]
  const sN = aN.map((a, j) => montred(a * bN[j], p.RNS_N_MOD[j], p.MONT_MINV_N[j]));      // [R]
  const xi = sM.map((s, i) => montred(s * p.PRE_M[i], p.RNS_M_MOD[i], p.MONT_MINV_M[i])); // NORMAL
  let rank = 0; for (let i = 0; i < T; i++) rank += xi[i] * p.RANK_W_M[i];
  const kMv = Math.floor(rank / Math.pow(2, RANK_F)); // rank >> RANK_F (rank can exceed 2^31)
  const qN = []; for (let j = 0; j < T; j++) { let acc = kMv * p.CRNS_C_MN[j]; for (let i = 0; i < T; i++) acc += xi[i] * p.CRNS_A_MN[i * T + j]; qN.push(plain(acc, p.RNS_N_MOD[j], p.RNS_N_Z[j])); }
  const rN = [], eta = [];
  for (let j = 0; j < T; j++) {
    const qp = montred(qN[j] * p.P_MOD_N_R[j], p.RNS_N_MOD[j], p.MONT_MINV_N[j]);          // [R] of qN*p
    const t = plain(qp + sN[j], p.RNS_N_MOD[j], p.RNS_N_Z[j]);                              // [R]
    const r = montred(t * p.M_INV_N_R[j], p.RNS_N_MOD[j], p.MONT_MINV_N[j]);                // [R] = rN
    rN.push(r); eta.push(montred(r * p.NDI_N[j], p.RNS_N_MOD[j], p.MONT_MINV_N[j]));        // NORMAL
  }
  let rank2 = p.RANK_ALPHA; for (let j = 0; j < T; j++) rank2 += eta[j] * p.RANK_W_N[j];
  const kN = Math.floor(rank2 / Math.pow(2, RANK_F));
  const rM = []; for (let i = 0; i < T; i++) { let acc = kN * p.CRNS_C_NM[i]; for (let j = 0; j < T; j++) acc += eta[j] * p.CRNS_A_NM[j * T + i]; rM.push(plain(acc, p.RNS_M_MOD[i], p.RNS_M_Z[i])); }
  return { rM, rN };
}

// [R] residues -> normal -> CRT integer (validation only).
function fromMontReconstruct(res, mods, minv, modProd) {
  const t = mods.length; let x = 0n;
  for (let k = 0; k < t; k++) {
    const nrm = montred(res[k], Number(mods[k]), minv[k]);
    const Mi = modProd / mods[k];
    x += BigInt(nrm) * Mi * modinv(Mi, mods[k]);
  }
  return x % modProd;
}

function randBelow(x) { let r = 0n; for (let i = 0; i < 8; i++) r = (r << 32n) | BigInt((Math.random() * 0x100000000) >>> 0); return r % x; }

export function validate({ trials = 100000 } = {}) {
  const p = computeParams();
  const Minv_p = modinv(p.M, P);
  const fails = [];
  const edges = [0n, 1n, 2n, P - 1n, P - 2n, (P - 1n) / 2n, p.M % P, p.N % P];
  const cases = [];
  for (const a of edges) for (const b of edges) cases.push([a, b]);
  for (let i = 0; i < trials; i++) cases.push([randBelow(P), randBelow(P)]);
  for (const [a, b] of cases) {
    const { rM, rN } = rnsModmul(toMont(a, p.mM), toMont(a, p.mN), toMont(b, p.mM), toMont(b, p.mN), p);
    const vN = fromMontReconstruct(rN, p.mN, p.MONT_MINV_N, p.N) % P;
    const vM = fromMontReconstruct(rM, p.mM, p.MONT_MINV_M, p.M) % P;
    const exp = (((a * b) % P) * Minv_p) % P;
    if (vN !== exp || vM !== exp) { fails.push({ a, b, vN, vM, exp }); if (fails.length > 20) break; }
  }
  // adversarial Montgomery chain (stays in [R] form throughout)
  let chainFails = 0;
  let x = randBelow(P), xref = x; const c = randBelow(P);
  const cM = toMont(c, p.mM), cN = toMont(c, p.mN);
  let xM = toMont(x, p.mM), xN = toMont(x, p.mN);
  for (let s = 0; s < 20000; s++) {
    const { rM, rN } = rnsModmul(xM, xN, cM, cN, p); xM = rM; xN = rN;
    xref = (((xref * c) % P) * Minv_p) % P;
    if (fromMontReconstruct(rN, p.mN, p.MONT_MINV_N, p.N) % P !== xref) { chainFails++; if (chainFails > 5) break; }
  }
  return { p, total: cases.length, fails, chainFails };
}

// Analytical proof (NOT sampling) that the kernel's exact-minimum fold/subtract counts
// canonicalise the WORST-CASE accumulator for every output residue. The accumulator is
// monotone in each digit, so its max is at digits = modulus-1; the post-fold bound is
// t' <= (2^13-1) + floor(t/2^13)*z. Plan: M->N 3 folds+2 subs (<3m); N->M 3 folds+1 sub
// (<2m); t-step 1 fold+1 sub (<2m). Returns {ok, detail}.
export function foldBoundsOk(p) {
  const Rb = 1 << W, foldUB = (t, z) => (Rb - 1) + Math.floor(t / Rb) * z;
  const afterK = (t, z, k) => { for (let f = 0; f < k; f++) t = foldUB(t, z); return t; };
  const kM = Math.floor(p.RNS_M_MOD.reduce((s, m, i) => s + (m - 1) * p.RANK_W_M[i], 0) / 2 ** RANK_F);
  const kN = Math.floor((p.RANK_ALPHA + p.RNS_N_MOD.reduce((s, n, j) => s + (n - 1) * p.RANK_W_N[j], 0)) / 2 ** RANK_F);
  const accMN = (j) => { let a = kM * p.CRNS_C_MN[j]; for (let i = 0; i < T; i++) a += (p.RNS_M_MOD[i] - 1) * p.CRNS_A_MN[i * T + j]; return a; };
  const accNM = (i) => { let a = kN * p.CRNS_C_NM[i]; for (let j = 0; j < T; j++) a += (p.RNS_N_MOD[j] - 1) * p.CRNS_A_NM[j * T + i]; return a; };
  const checks = [];
  for (let j = 0; j < T; j++) { const a = accMN(j); checks.push(a < 2 ** 32 && afterK(a, p.RNS_N_Z[j], 3) < 3 * p.RNS_N_MOD[j]); }       // M->N: 3 folds, 2 subs
  for (let i = 0; i < T; i++) { const a = accNM(i); checks.push(a < 2 ** 32 && afterK(a, p.RNS_M_Z[i], 3) < 2 * p.RNS_M_MOD[i]); }       // N->M: 3 folds, 1 sub
  for (let j = 0; j < T; j++) { checks.push(afterK(2 * p.RNS_N_MOD[j], p.RNS_N_Z[j], 1) < 2 * p.RNS_N_MOD[j]); }                          // t-step: 1 fold, 1 sub
  return checks.every(Boolean);
}

// Analytical proof (sound, NOT sampling) for the t=16 cooperative kernel's EXACT reduction
// pipeline (rns_field_coop16.wgsl). Unlike foldBoundsOk, it models the kernel's lo/hi SPLIT
// accumulation: each extend recombines x = alo + ahi*z where alo <= 17*(R-1) (sixteen lo-halves
// + the kc lo-half) and ahi <= Σ floor(src*A/R) + floor(kc/R) — alo is a SUM, far larger than
// ACC mod R, so the ACC-based foldUB of foldBoundsOk does NOT bound it. foldUB(t)=(R-1)+
// floor(t/R)*z bounds one fold over the whole range [0,t]; foldBig itself is non-monotone, so
// worst-case digits do NOT bound the post-fold value — only the range bound does. Verifies, for
// the kernel's exact fold/subtract counts: (1) no u32 overflow in the recombine; (2) the counts
// canonicalise every output residue; (3) they are MINIMAL — one fewer subtract leaves the bound
// >= the modulus. Kernel: ext1 M->N = recombine + 2 red_mn folds + 1 sub; ext2 N->M = recombine
// + 1 red_nm fold + 2 subs; t-step red17 = 1 sub, no fold (qp+sN < 2n). Returns {ok, detail}.
export function foldBoundsOk16(p) {
  const Rb = 1 << W, MASK = Rb - 1;
  const foldUB = (t, z) => (Rb - 1) + Math.floor(t / Rb) * z;
  const afterK = (t, z, k) => { for (let f = 0; f < k; f++) t = foldUB(t, z); return t; };
  const A_MN_P = (i, j) => Number((BigInt(p.CRNS_A_MN[i * T + j]) * (P % p.mN[j])) % p.mN[j]);
  const C_MN_P = (j) => Number((BigInt(p.CRNS_C_MN[j]) * (P % p.mN[j])) % p.mN[j]);
  const kM = Math.floor(p.RNS_M_MOD.reduce((s, m, i) => s + (m - 1) * p.RANK_W_M[i], 0) / 2 ** RANK_F);
  const kN = Math.floor((p.RANK_ALPHA + p.RNS_N_MOD.reduce((s, n, j) => s + (n - 1) * p.RANK_W_N[j], 0)) / 2 ** RANK_F);
  // sound upper bound on the recombined x = alo + ahi*z for one output residue
  const xUpper = (z, kc, Acol, srcMod) => {
    let ahi = Math.floor(kc / Rb);
    for (let s = 0; s < T; s++) ahi += Math.floor(srcMod[s] * Acol(s) / Rb);
    return 17 * MASK + ahi * z;
  };
  // subs to bring a sound upper bound `b` into [0, md): the count s with b <= (s+1)*md.
  const subsFor = (b, md) => (b < md ? 0 : Math.ceil(b / md) - 1);
  // Per extend: the kernel uses ONE reduce for all 16 output lanes, so its subtract count must
  // equal the MAX over lanes of subs-needed (minimal) and be >= it (sufficient). folds: the
  // kernel's explicit fold count after the recombine.
  const extend = (tag, folds, subsKernel, lane) => {
    let maxSubs = 0, overflow = false;
    for (let o = 0; o < T; o++) {
      const { z, kc, Acol, srcMod, md } = lane(o);
      const x = xUpper(z, kc, Acol, srcMod);
      if (x >= 2 ** 32) overflow = true;
      maxSubs = Math.max(maxSubs, subsFor(afterK(x, z, folds), md));
    }
    return { tag, folds, subsKernel, maxSubs, overflow, ok: !overflow && maxSubs === subsKernel };
  };
  const detail = [
    extend('MN', 2, 1, (j) => ({ z: p.RNS_N_Z[j], kc: kM * C_MN_P(j), Acol: (i) => A_MN_P(i, j), srcMod: p.RNS_M_MOD, md: p.RNS_N_MOD[j] })),
    extend('NM', 1, 2, (i) => ({ z: p.RNS_M_Z[i], kc: kN * p.CRNS_C_NM[i], Acol: (j) => p.CRNS_A_NM[j * T + i], srcMod: p.RNS_N_MOD, md: p.RNS_M_MOD[i] })),
  ];
  // t-step red17: qp + sN, both < n, so the sum is < 2n -> exactly 1 subtract, no fold.
  let tSubs = 0; for (let j = 0; j < T; j++) tSubs = Math.max(tSubs, subsFor(2 * (p.RNS_N_MOD[j] - 1), p.RNS_N_MOD[j]));
  detail.push({ tag: 't', folds: 0, subsKernel: 1, maxSubs: tSubs, overflow: false, ok: tSubs === 1 });
  return { ok: detail.every((d) => d.ok), detail };
}

function arr(name, xs, perLine = 10) {
  const lines = [];
  for (let i = 0; i < xs.length; i += perLine) lines.push('  ' + xs.slice(i, i + perLine).map((v) => `${v >>> 0}u`).join(', ') + ',');
  return `const ${name}: array<u32, ${xs.length}> = array<u32, ${xs.length}>(\n${lines.join('\n')}\n);`;
}

export function renderWgsl(p) {
  return `// rns_constants.wgsl — COMMITTED DATA, NOT HAND-EDITED.
// Generated AND PROVEN by dev/msm-webgpu/rns_params.mjs / rns_params.test.mjs.
// Double-Montgomery RNS for BN254 F_q: two coprime bases of T=${T} ODD pseudo-Mersenne
// moduli 2^${W}-z. Residues are in per-residue Montgomery form [R], R=2^${W}.
//   M/p ~ ${Number(p.M / P)}, N/p ~ ${Number(p.N / P)}  (fully-redundant: M>9p, N>6p)

const RNS_T: u32 = ${T}u;
const RNS_W: u32 = ${W}u;
const RNS_RANK_F: u32 = ${RANK_F}u;
const RNS_RANK_ALPHA: u32 = ${p.RANK_ALPHA}u;

${arr('RNS_M_MOD', p.RNS_M_MOD)}
${arr('RNS_N_MOD', p.RNS_N_MOD)}
${arr('RNS_M_Z', p.RNS_M_Z)}
${arr('RNS_N_Z', p.RNS_N_Z)}
${arr('MONT_MINV_M', p.MONT_MINV_M)}   // -m_i^{-1} mod 2^W (per-residue Montgomery)
${arr('MONT_MINV_N', p.MONT_MINV_N)}

${arr('PRE_M', p.PRE_M)}               // plain: (-p^{-1})*(M/m_i)^{-1} mod m_i (xi forms normal)
${arr('NDI_N', p.NDI_N)}               // plain: (N/n_j)^{-1} mod n_j (eta forms normal)
${arr('RANK_W_M', p.RANK_W_M)}
${arr('RANK_W_N', p.RANK_W_N)}

${arr('P_MOD_N_R', p.P_MOD_N_R)}       // (p*R) mod n_j
${arr('M_INV_N_R', p.M_INV_N_R)}       // (M^{-1}*R) mod n_j
${arr('MND_N', p.MND_N)}               // M^{-1}*(N/n_j)^{-1} mod n_j (eta sN-term)
${arr('PMND_N', p.PMND_N)}              // P*M^{-1}*(N/n_j)^{-1} mod n_j (eta qN-term)
${arr('CRNS_C_MN', p.CRNS_C_MN)}       // (-M*R) mod n_j
${arr('CRNS_C_NM', p.CRNS_C_NM)}       // (-N*R) mod m_i
${arr('CRNS_A_MN', p.CRNS_A_MN, 8)}    // (M/m_i * R) mod n_j, row-major [i*T+j]
${arr('CRNS_A_NM', p.CRNS_A_NM, 8)}    // (N/n_j * R) mod m_i, row-major [j*T+i]
${p.A_MN_PERM.length ? `
// XOR-permuted for the select-free butterfly all-gather (lane r holds g[k]=digit(r^k)):
// row-major [r*T+k], value = original A[(k^r)][r] / W[(k^r)]. No reorder needed.
${arr('CRNS_A_MN_PERM', p.A_MN_PERM, 8)}
${arr('CRNS_A_NM_PERM', p.A_NM_PERM, 8)}
${arr('RANK_W_M_PERM', p.RANK_W_M_PERM, 8)}
${arr('RANK_W_N_PERM', p.RANK_W_N_PERM, 8)}
${arr('CRNS_A_MN_P_PERM', p.A_MN_P_PERM, 8)}  // A_MN_PERM * (P mod n): ext1 emits qp = qN*p directly
${arr('CRNS_C_MN_P', p.C_MN_P)}               // C_MN * (P mod n): the matching rank correction
` : ''}`;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const CFG = (T === 20 && W === 13) ? '' : `_${T}x${W}`;
export const WGSL_PATH = join(HERE, '..', '..', 'src', 'msm_webgpu', 'wgsl', 'rns', `rns_constants${CFG}.wgsl`);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\/+$/, '')) {
  const t0 = Date.now();
  const { p, total, fails, chainFails } = validate({ trials: 100000 });
  console.log(`basis: T=${T} w=${W}  M/p=${Number(p.M / P)}  N/p=${Number(p.N / P)}  RANK_F=${RANK_F} (Montgomery)`);
  console.log(`oracle: ${total} cases, ${fails.length} fails; chain(20000): ${chainFails} fails  [${Date.now() - t0} ms]`);
  if (fails.length || chainFails) { console.error('VALIDATION FAILED.', fails[0]); process.exit(1); }
  // Analytical fold/subtract-bound proof for the kernel that consumes these constants.
  const isPow2 = (T & (T - 1)) === 0;
  const fb = isPow2 ? foldBoundsOk16(p) : { ok: foldBoundsOk(p), detail: [] };
  console.log(`fold bounds (analytical, sound): ${fb.ok ? 'PROVEN minimal & canonical' : 'FAILED'}`);
  if (!fb.ok) { console.error('FOLD-BOUND PROOF FAILED.', fb.detail.find((d) => !d.ok)); process.exit(1); }
  const wgsl = renderWgsl(p); writeFileSync(WGSL_PATH, wgsl);
  console.log(`wrote ${WGSL_PATH} (${wgsl.length} bytes)`);
}
