// Host model: PACKED single-lane jumpy safegcd (K=12) on 9 words (18 x 15-bit
// limbs, 2/word) — the register-lean form meant to BEAT 13-bit pk. Single-lane
// i32 apply (matrix entries <=2^12 => 2-3 products of <=2^28 per limb, one i32
// lane, no 2-word macc), then a >>12 recombination across the packed limbs.
// Validates the Montgomery inverse bit-exact + cross-checks vs the BigInt
// algorithm every iter; this is the exact dataflow the packed WGSL will run.

import { readFileSync } from 'node:fs';
const C = JSON.parse(readFileSync(new URL('./constants.json', import.meta.url)));
const P = BigInt(C.p);
const NW = 9, MASK = (1 << 15) - 1;
const K = parseInt(process.env.K || '12', 10), KMASK = (1 << K) - 1, BOT = 15 - K;
const TWO15 = 1n << 15n, MASK15 = TWO15 - 1n, TWO_SGN = 1n << 270n;
// NUM_OUTER is ALGEBRAIC, not empirical: Bernstein-Yang (2019) prove a divstep
// reaches g=0 within N(d)=floor((49d+57)/17) divsteps for EVERY d-bit input.
// BN254 Fq is d=254 -> N=735 (the bound the audited 13-bit pk also uses).
// NUM_OUTER = ceil(735/K). Failure probability is 0, deterministically.
// This script's job is only to confirm the PACKED LIMB ARITHMETIC is bit-exact
// vs full-precision BigInt (CC_ALL=1) so the proven bound transfers to the code.
const BY_DIVSTEP_BOUND = 735;
const NUM_OUTER = parseInt(process.env.NO || String(Math.ceil(BY_DIVSTEP_BOUND / K)), 10);
const PINV = 7287; // p^-1 mod 2^15
const R = (1n << 255n) % P;
const PL = [...C.p_limbs.map(Number), 0]; // 18 limbs (limb 17 = 0)
const pL = (i) => PL[i];

const modinv = (a, m) => { a = ((a % m) + m) % m; let [o, r] = [a, m], [os, s] = [1n, 0n]; while (r) { const q = o / r;[o, r] = [r, o - q * r];[os, s] = [s, os - q * s]; } return ((os % m) + m) % m; };
const R3 = (R * R * R) % P, INVR = modinv(R, P);
const montmul = (x, y) => (x * y % P) * INVR % P;
const sext = (v) => { const t = v & MASK; return (t & (1 << 14)) ? t - 32768 : t; }; // 15-bit sign-extend -> JS int
const asr = (x, n) => x >> BigInt(n);

// packed-word <-> value
const wToL = (W) => { const L = []; for (let w = 0; w < NW; w++) { L.push(W[w] & MASK); L.push((W[w] >>> 15) & MASK); } return L; };
const lToW = (L) => { const W = []; for (let w = 0; w < NW; w++) W.push((L[2 * w] | (L[2 * w + 1] << 15)) >>> 0); return W; };
const fromWsSigned = (W) => { const L = wToL(W); let v = 0n; for (let i = 17; i >= 0; i--) v = (v << 15n) + BigInt(L[i]); if (BigInt(L[17]) & (1n << 14n)) v -= TWO_SGN; return v; };
const fromWsCanon = (W) => { const L = wToL(W); let v = 0n; for (let i = 17; i >= 0; i--) v = (v << 15n) + BigInt(L[i]); return v; };
const toWsSigned = (x) => { let xc = ((x % TWO_SGN) + TWO_SGN) % TWO_SGN; const L = []; for (let i = 0; i < 18; i++) { L.push(Number(xc & MASK15)); xc >>= 15n; } return lToW(L); };
const toWsCanon = (x) => { x = ((x % P) + P) % P; const L = []; for (let i = 0; i < 18; i++) { L.push(Number(x & MASK15)); x >>= 15n; } return lToW(L); };

const u32 = (x) => x >>> 0;
const lo15 = (v) => v & MASK;          // low 15 bits of a JS int (2's-comp via &)
// signed >>15 for a JS int that fits (products <2^31): use arithmetic
const sh15 = (v) => Math.floor(v / 32768);

const isZero = (W) => W.every((w) => w === 0);
const isNeg = (W) => ((W[8] >>> 29) & 1) === 1;
function addP(W) { let c = 0; for (let w = 0; w < NW; w++) { let e = (W[w] & MASK) + pL(2 * w) + c; let le = e & MASK; c = sh15(e); let o = ((W[w] >>> 15) & MASK) + pL(2 * w + 1) + c; let lo = o & MASK; if (w !== 8) c = sh15(o); W[w] = (le | (lo << 15)) >>> 0; } }
function subP(W) { let c = 0; for (let w = 0; w < NW; w++) { let e = (W[w] & MASK) - pL(2 * w) + c; let le = e & MASK; c = sh15(e); let o = ((W[w] >>> 15) & MASK) - pL(2 * w + 1) + c; let lo = o & MASK; if (w !== 8) c = sh15(o); W[w] = (le | (lo << 15)) >>> 0; } }
function gte(W) { for (let idx = 0; idx < 18; idx++) { const i = 17 - idx; const xi = (W[i >> 1] >>> ((i & 1) * 15)) & MASK; const pi = pL(i); if (xi > pi) return true; if (xi < pi) return false; } return true; }
function normModp(W) { for (let i = 0; i < 4; i++) { if (isNeg(W)) addP(W); else break; } for (let i = 0; i < 4; i++) { if (gte(W)) subP(W); else break; } }
function negModp(W) { let borrow = 0; for (let w = 0; w < NW; w++) { let e = pL(2 * w) - (W[w] & MASK) - borrow; let le = e & MASK; borrow = e < 0 ? 1 : 0; let o = pL(2 * w + 1) - ((W[w] >>> 15) & MASK) - borrow; let lo = o & MASK; borrow = o < 0 ? 1 : 0; W[w] = (le | (lo << 15)) >>> 0; } }

function divsteps(delta, f0, g0) { // K inner divsteps on i32 approximations
  let u = 1, v = 0, q = 0, r = 1, f = f0, g = g0, d = delta;
  for (let i = 0; i < K; i++) {
    const gl = g & 1;
    if (d > 0 && gl === 1) { const n00 = q * 2, n01 = r * 2, n10 = q - u, n11 = r - v; const nf = g; g = g - f; f = nf; u = n00; v = n01; q = n10; r = n11; d = 1 - d; }
    else if (gl === 1) { q = q + u; r = r + v; u = u * 2; v = v * 2; g = g + f; d = d + 1; }
    else { u = u * 2; v = v * 2; d = d + 1; }
    g = g >> 1;
  }
  return { u, v, q, r, delta: d };
}

// product limbs (packed) of (x*a + y*b), then >>K recombination -> out
function axbyShrK(a, x, b, y, out, stats) {
  const acc = new Array(NW);
  let carry = 0;
  for (let w = 0; w < NW; w++) {
    const fe = a[w] & MASK, ge = b[w] & MASK;
    const pe = fe * x + ge * y + carry; if (stats) stats.col = Math.max(stats.col, Math.abs(pe));
    const le = lo15(pe); carry = sh15(pe);
    const fo = (w === 8) ? sext(a[w] >>> 15) : ((a[w] >>> 15) & MASK);
    const go = (w === 8) ? sext(b[w] >>> 15) : ((b[w] >>> 15) & MASK);
    const po = fo * x + go * y + carry; if (stats) stats.col = Math.max(stats.col, Math.abs(po));
    const lop = lo15(po); carry = sh15(po);
    acc[w] = (le | (lop << 15)) >>> 0;
  }
  for (let w = 0; w < NW; w++) {
    const ae = acc[w] & MASK, ao = (acc[w] >>> 15) & MASK;
    const nextE = (w === 8) ? (u32(carry) & MASK) : (acc[w + 1] & MASK);
    const oe = (ae >>> K) | ((ao & KMASK) << BOT);
    const oo = (ao >>> K) | ((nextE & KMASK) << BOT);
    out[w] = ((oe & MASK) | ((oo & MASK) << 15)) >>> 0;
  }
}
function axbyModpHalveK(a, x, b, y, out, stats) {
  const acc = new Array(NW);
  let carry = 0;
  for (let w = 0; w < NW; w++) {
    const fe = a[w] & MASK, ge = b[w] & MASK;
    const pe = fe * x + ge * y + carry; if (stats) stats.col = Math.max(stats.col, Math.abs(pe));
    const le = lo15(pe); carry = sh15(pe);
    const fo = (w === 8) ? sext(a[w] >>> 15) : ((a[w] >>> 15) & MASK);
    const go = (w === 8) ? sext(b[w] >>> 15) : ((b[w] >>> 15) & MASK);
    const po = fo * x + go * y + carry; if (stats) stats.col = Math.max(stats.col, Math.abs(po));
    const lop = lo15(po); carry = sh15(po);
    acc[w] = (le | (lop << 15)) >>> 0;
  }
  const lo_k = acc[0] & KMASK;
  const m = ((((KMASK + 1) - lo_k) & KMASK) * PINV) & KMASK;
  let mp = 0;
  for (let w = 0; w < NW; w++) {
    let e = (acc[w] & MASK) + pL(2 * w) * m + mp; let le = e & MASK; mp = e >> 15;
    let o = ((acc[w] >>> 15) & MASK) + pL(2 * w + 1) * m + mp; let lo = o & MASK; mp = o >> 15;
    acc[w] = (le | (lo << 15)) >>> 0;
  }
  const newCarry = carry + mp;
  for (let w = 0; w < NW; w++) {
    const ae = acc[w] & MASK, ao = (acc[w] >>> 15) & MASK;
    const nextE = (w === 8) ? (u32(newCarry) & MASK) : (acc[w + 1] & MASK);
    const oe = (ae >>> K) | ((ao & KMASK) << BOT);
    const oo = (ao >>> K) | ((nextE & KMASK) << BOT);
    out[w] = ((oe & MASK) | ((oo & MASK) << 15)) >>> 0;
  }
  normModp(out);
}

function frInv(aMont, cc, stats) {
  let f = toWsSigned(P), g = toWsSigned(((aMont % P) + P) % P);
  let u = toWsCanon(0n), v = toWsCanon(1n);
  let delta = 1;
  let F = P, G = ((aMont % P) + P) % P, U = 0n, V = 1n;
  const INV2K = modinv(1n << BigInt(K), P);
  let found = false;
  for (let it = 0; it < NUM_OUTER; it++) {
    if (isZero(g)) { found = true; if (stats) stats.maxIt = Math.max(stats.maxIt || 0, it); break; }
    const m = divsteps(delta, f[0] & MASK, g[0] & MASK); // low limb i32 approx
    delta = m.delta;
    const nf = new Array(NW), ng = new Array(NW), nu = new Array(NW), nv = new Array(NW);
    axbyShrK(f, m.u, g, m.v, nf, stats); axbyShrK(f, m.q, g, m.r, ng, stats);
    axbyModpHalveK(u, m.u, v, m.v, nu, stats); axbyModpHalveK(u, m.q, v, m.r, nv, stats);
    f = nf; g = ng; u = nu; v = nv;
    // BigInt ref (matrix entries are JS numbers -> BigInt)
    const bu = BigInt(m.u), bv = BigInt(m.v), bq = BigInt(m.q), br = BigInt(m.r);
    const nF = (bu * F + bv * G) >> BigInt(K), nG = (bq * F + br * G) >> BigInt(K);
    const nU = (((bu * U + bv * V) % P) * INV2K % P + P) % P, nV = (((bq * U + br * V) % P) * INV2K % P + P) % P;
    F = nF; G = nG; U = nU; V = nV;
    if (cc && (fromWsSigned(f) !== F || fromWsSigned(g) !== G || fromWsCanon(u) !== U || fromWsCanon(v) !== V)) return { mismatchAt: it };
  }
  if (!found && stats) stats.notFound = (stats.notFound || 0) + 1;
  let uv = fromWsCanon((normModp(u), u));
  if (fromWsSigned(f) < 0n) { negModp(u); uv = fromWsCanon(u); }
  return { inv: montmul(uv, R3), found };
}

const rnd = () => { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 32n) | BigInt((Math.random() * 2 ** 32) >>> 0); return v % P; };
const TRIALS = parseInt(process.argv[2] || '20000', 10);
const edges = [1n, 2n, 3n, P - 1n, P - 2n, (P - 1n) / 2n, R % P];
// Adversarial: consecutive Fibonacci numbers are the worst case for subtractive-
// GCD / divstep chain length. Feed every F_k mod p (k up to F_k > p, ~370 terms)
// AND their pairwise products, the longest-chain inputs the divstep bound must cover.
{ let a = 1n, b = 1n; for (let k = 0; k < 400; k++) { edges.push(a % P || 1n); edges.push((a * b) % P || 1n); [a, b] = [b, a + b]; } }
let fail = 0, mism = 0, run = 0, first = null; const stats = { col: 0, maxIt: 0, notFound: 0 };
const check = (A, cc) => { run++; const a = (A * R) % P; if (a === 0n) return; const res = frInv(a, cc, stats); if (res.mismatchAt !== undefined) { mism++; if (!first) first = res; return; } const want = (modinv(A, P) * R) % P; if (res.inv !== want) { fail++; if (!first) first = { A: A.toString(), got: res.inv.toString(), want: want.toString() }; } };
for (const A of edges) check(A, true);
const CC_ALL = process.env.CC_ALL === '1';
for (let i = 0; i < TRIALS; i++) check(rnd() || 1n, CC_ALL || i < 200);
console.log(`checked=${run}  mismatch_vs_bigint=${mism}  FAIL_inverse=${fail}  max|col|=2^${(Math.log2(stats.col || 1)).toFixed(1)} (i32-safe=${stats.col < 2 ** 31})`);
console.log(`K=${K} NUM_OUTER=${NUM_OUTER} (budget=${NUM_OUTER * K} divsteps)  max_outer_to_zero=${stats.maxIt} (=> <=${(stats.maxIt + 1) * K} divsteps used)  never_converged=${stats.notFound}`);
if (first) console.log('FIRST', JSON.stringify(first).slice(0, 200));
console.log(`PK15_PACKED_SINGLELANE_VERDICT=${fail === 0 && mism === 0 ? 'PASS' : 'FAIL'}`);
process.exit(fail === 0 && mism === 0 ? 0 : 1);
