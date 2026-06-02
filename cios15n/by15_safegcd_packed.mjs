// PACKED 15-bit safegcd host model: f,g,d,e stored 2x15-bit limbs per u32 word
// => 9 words each (vs 18 unpacked) — the register/private-memory win, mirroring
// the 13-bit pk (struct Pk{w:array<u32,10>}). Same arithmetic as the validated
// unpacked model (by15_safegcd_limb.mjs); only storage access changes (even limb
// = word&MASK, odd = word>>15). The >>30 drop = write word[w-1] (1 word = 2 limbs).
// This is the exact dataflow the packed WGSL fr_inv_by_loop_pk15 will run; we
// validate the full Montgomery inverse bit-exact and cross-check vs the BigInt
// algorithm every iter.

import { readFileSync } from 'node:fs';
const C = JSON.parse(readFileSync(new URL('./constants.json', import.meta.url)));
const P = BigInt(C.p);
const NW = 9, MASK = (1 << 15) - 1;
const TWO15 = 1n << 15n, MASK15 = TWO15 - 1n, MASK30 = (1n << 30n) - 1n, TWO_SGN = 1n << 270n;
const BATCH = 30, NUM_OUTER = 25, REDUCE_INTERVAL = 4, RTC_MAX = 4;
const PINV30 = 460954743n;
const R = (1n << 255n) % P;
const PL = [...C.p_limbs.map(Number), 0];      // 18 limbs (limb 17 = 0)
const pLimb = (i) => PL[i];

const modinv = (a, m) => { a = ((a % m) + m) % m; let [o, r] = [a, m], [os, s] = [1n, 0n]; while (r) { const q = o / r;[o, r] = [r, o - q * r];[os, s] = [s, os - q * s]; } return ((os % m) + m) % m; };
const R3 = (R * R * R) % P, INVR = modinv(R, P);
const montmul = (x, y) => (x * y % P) * INVR % P;
const slo = (x) => ((x % TWO15) + TWO15) % TWO15;
const asr15 = (x) => x >> 15n;
const sext = (limb) => { const t = BigInt(limb) & MASK15; return (t & (1n << 14n)) ? t - TWO15 : t; };

// ---- packed-word <-> value conversions (via 18 limbs) ----
const wordsToLimbs = (W) => { const L = []; for (let w = 0; w < NW; w++) { L.push(W[w] & MASK); L.push((W[w] >>> 15) & MASK); } return L; };
const limbsToWords = (L) => { const W = []; for (let w = 0; w < NW; w++) W.push((L[2 * w] | (L[2 * w + 1] << 15)) >>> 0); return W; };
const fromWordsSigned = (W) => { const L = wordsToLimbs(W); let v = 0n; for (let i = 17; i >= 0; i--) v = (v << 15n) + BigInt(L[i]); if (BigInt(L[17]) & (1n << 14n)) v -= TWO_SGN; return v; };
const fromWordsCanon = (W) => { const L = wordsToLimbs(W); let v = 0n; for (let i = 17; i >= 0; i--) v = (v << 15n) + BigInt(L[i]); return v; };
const toWordsSigned = (x) => { let xc = ((x % TWO_SGN) + TWO_SGN) % TWO_SGN; const L = []; for (let i = 0; i < 18; i++) { L.push(Number(xc & MASK15)); xc >>= 15n; } return limbsToWords(L); };
const toWordsCanon = (x) => { x = ((x % P) + P) % P; const L = []; for (let i = 0; i < 18; i++) { L.push(Number(x & MASK15)); x >>= 15n; } return limbsToWords(L); };

const stats = { fg: 0n, de: 0n, carry: 0n };
const trk = (k, ...vs) => { for (const v of vs) { const a = v < 0n ? -v : v; if (a > stats[k]) stats[k] = a; } };

function divsteps(delta, f0, g0) {
  let u = 1n, v = 0n, q = 0n, r = 1n, f = f0, g = g0, d = delta;
  for (let i = 0; i < BATCH; i++) {
    const gOdd = (g & 1n) === 1n, swap = gOdd && d > 0, addc = gOdd && d <= 0;
    let nf, ng, nu, nv, nq, nr, nd;
    if (swap) { nf = g; ng = g - f; nu = 2n * q; nv = 2n * r; nq = q - u; nr = r - v; nd = 1 - d; }
    else if (addc) { nf = f; ng = g + f; nu = 2n * u; nv = 2n * v; nq = q + u; nr = r + v; nd = d + 1; }
    else { nf = f; ng = g; nu = 2n * u; nv = 2n * v; nq = q; nr = r; nd = d + 1; }
    f = nf; g = ng >> 1n; u = nu; v = nv; q = nq; r = nr; d = nd;
  }
  return { u, v, q, r, delta: d };
}

const matLoHi = (m) => ({ uL: slo(m.u), uH: asr15(m.u), vL: slo(m.v), vH: asr15(m.v), qL: slo(m.q), qH: asr15(m.q), rL: slo(m.r), rH: asr15(m.r) });

// (f,g) <- ((u*f+v*g)>>30, (q*f+r*g)>>30). Packed: 9 words, even/odd limbs per word.
function applyFG(m, F, G) {
  const TOPW = NW - 1, TOPL = 17;
  const { uL, uH, vL, vH, qL, qH, rL, rH } = matLoHi(m);
  let cf = 0n, cg = 0n, fp = 0n, gp = 0n;
  for (let w = 0; w < NW; w++) {
    // even limb (index 2w)
    const fe = BigInt(F[w] & MASK), ge = BigInt(G[w] & MASK);
    const nfe = uL * fe + vL * ge + uH * fp + vH * gp + cf;
    const nge = qL * fe + rL * ge + qH * fp + rH * gp + cg;
    trk('fg', nfe, nge); cf = asr15(nfe); cg = asr15(nge); trk('carry', cf, cg);
    // odd limb (index 2w+1); top limb (17) is sign-extended
    const foRaw = (F[w] >>> 15) & MASK, goRaw = (G[w] >>> 15) & MASK;
    const fo = (2 * w + 1 === TOPL) ? sext(foRaw) : BigInt(foRaw);
    const go = (2 * w + 1 === TOPL) ? sext(goRaw) : BigInt(goRaw);
    const nfo = uL * fo + vL * go + uH * fe + vH * ge + cf;
    const ngo = qL * fo + rL * go + qH * fe + rH * ge + cg;
    trk('fg', nfo, ngo); cf = asr15(nfo); cg = asr15(ngo); trk('carry', cf, cg);
    if (w >= 1) {
      F[w - 1] = (Number(slo(nfe)) | (Number(slo(nfo)) << 15)) >>> 0;
      G[w - 1] = (Number(slo(nge)) | (Number(slo(ngo)) << 15)) >>> 0;
    }
    fp = fo; gp = go;
  }
  const nft = uH * fp + vH * gp + cf, ngt = qH * fp + rH * gp + cg;
  trk('fg', nft, ngt);
  F[TOPW] = (Number(slo(nft)) | (Number(slo(asr15(nft))) << 15)) >>> 0;
  G[TOPW] = (Number(slo(ngt)) | (Number(slo(asr15(ngt))) << 15)) >>> 0;
}

// (d,e) <- ((u*d+v*e+k_d*p)>>30, (q*d+r*e+k_e*p)>>30); k cancels low 30 bits.
function applyDE(m, D, E) {
  const TOPW = NW - 1, TOPL = 17;
  const { uL, uH, vL, vH, qL, qH, rL, rH } = matLoHi(m);
  const d0 = BigInt(D[0] & MASK), d1 = BigInt((D[0] >>> 15) & MASK);
  const e0 = BigInt(E[0] & MASK), e1 = BigInt((E[0] >>> 15) & MASK);
  const p0 = BigInt(pLimb(0)), p1 = BigInt(pLimb(1));
  const nd0 = uL * d0 + vL * e0, ne0 = qL * d0 + rL * e0;
  const nd1 = uL * d1 + vL * e1 + uH * d0 + vH * e0, ne1 = qL * d1 + rL * e1 + qH * d0 + rH * e0;
  trk('de', nd0, ne0, nd1, ne1);
  const t_d = (slo(nd0) | (slo(nd1 + asr15(nd0)) << 15n)) & MASK30;
  const t_e = (slo(ne0) | (slo(ne1 + asr15(ne0)) << 15n)) & MASK30;
  const k_d = (((~t_d + 1n) & MASK30) * PINV30) & MASK30, k_e = (((~t_e + 1n) & MASK30) * PINV30) & MASK30;
  const kdL = k_d & MASK15, kdH = k_d >> 15n, keL = k_e & MASK15, keH = k_e >> 15n;
  let cd = asr15(nd1 + kdL * p1 + kdH * p0 + asr15(nd0 + kdL * p0));
  let ce = asr15(ne1 + keL * p1 + keH * p0 + asr15(ne0 + keL * p0));
  trk('carry', cd, ce);
  let dp = d1, ep = e1;
  for (let w = 1; w < NW; w++) {
    // even limb (index 2w)
    const di_e = BigInt(D[w] & MASK), ei_e = BigInt(E[w] & MASK);
    const pi_e = BigInt(pLimb(2 * w)), pim1_e = BigInt(pLimb(2 * w - 1));
    const nd_e = uL * di_e + vL * ei_e + uH * dp + vH * ep + kdL * pi_e + kdH * pim1_e + cd;
    const ne_e = qL * di_e + rL * ei_e + qH * dp + rH * ep + keL * pi_e + keH * pim1_e + ce;
    trk('de', nd_e, ne_e); cd = asr15(nd_e); ce = asr15(ne_e); trk('carry', cd, ce);
    // odd limb (index 2w+1)
    const diRaw = (D[w] >>> 15) & MASK, eiRaw = (E[w] >>> 15) & MASK;
    const di_o = (2 * w + 1 === TOPL) ? sext(diRaw) : BigInt(diRaw);
    const ei_o = (2 * w + 1 === TOPL) ? sext(eiRaw) : BigInt(eiRaw);
    const pi_o = BigInt(pLimb(2 * w + 1)), pim1_o = BigInt(pLimb(2 * w));
    const nd_o = uL * di_o + vL * ei_o + uH * di_e + vH * ei_e + kdL * pi_o + kdH * pim1_o + cd;
    const ne_o = qL * di_o + rL * ei_o + qH * di_e + rH * ei_e + keL * pi_o + keH * pim1_o + ce;
    trk('de', nd_o, ne_o); cd = asr15(nd_o); ce = asr15(ne_o); trk('carry', cd, ce);
    D[w - 1] = (Number(slo(nd_e)) | (Number(slo(nd_o)) << 15)) >>> 0;
    E[w - 1] = (Number(slo(ne_e)) | (Number(slo(ne_o)) << 15)) >>> 0;
    dp = di_o; ep = ei_o;
  }
  const ptop = BigInt(pLimb(TOPL));
  const nd_t = uH * dp + vH * ep + kdH * ptop + cd, ne_t = qH * dp + rH * ep + keH * ptop + ce;
  trk('de', nd_t, ne_t);
  D[TOPW] = (Number(slo(nd_t)) | (Number(slo(asr15(nd_t))) << 15)) >>> 0;
  E[TOPW] = (Number(slo(ne_t)) | (Number(slo(asr15(ne_t))) << 15)) >>> 0;
}

const reduceCanon = (W) => toWordsCanon(((fromWordsSigned(W) % P) + P) % P);

function frInvPacked(aMont, cc) {
  let F = toWordsSigned(P), G = toWordsSigned(((aMont % P) + P) % P);
  let D = toWordsCanon(0n), E = toWordsCanon(1n);
  let delta = 1;
  let Fr = P, Gr = ((aMont % P) + P) % P, Dr = 0n, Er = 1n;
  const INV2B = modinv(1n << BigInt(BATCH), P);
  for (let it = 0; it < NUM_OUTER; it++) {
    if (Gr === 0n) break;
    const m = divsteps(delta, fromWordsSigned(F), fromWordsSigned(G));
    delta = m.delta;
    applyFG(m, F, G); applyDE(m, D, E);
    D = reduceCanon(D); E = reduceCanon(E);
    const nF = (m.u * Fr + m.v * Gr) >> BigInt(BATCH), nG = (m.q * Fr + m.r * Gr) >> BigInt(BATCH);
    const nD = (((m.u * Dr + m.v * Er) % P) * INV2B % P + P) % P, nE = (((m.q * Dr + m.r * Er) % P) * INV2B % P + P) % P;
    Fr = nF; Gr = nG; Dr = nD; Er = nE;
    if (cc && (fromWordsSigned(F) !== Fr || fromWordsSigned(G) !== Gr || fromWordsCanon(D) !== Dr || fromWordsCanon(E) !== Er))
      return { mismatchAt: it };
  }
  let dv = fromWordsCanon(reduceCanon(D));
  if (fromWordsSigned(F) < 0n) dv = (P - dv) % P;
  return { inv: montmul(dv, R3) };
}

const rnd = () => { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 32n) | BigInt((Math.random() * 2 ** 32) >>> 0); return v % P; };
const TRIALS = parseInt(process.argv[2] || '20000', 10);
const edges = [1n, 2n, 3n, P - 1n, P - 2n, (P - 1n) / 2n, R % P];
let fail = 0, mism = 0, run = 0, first = null;
const check = (A, cc) => { run++; const a = (A * R) % P; if (a === 0n) return; const res = frInvPacked(a, cc); if (res.mismatchAt !== undefined) { mism++; if (!first) first = res; return; } const want = (modinv(A, P) * R) % P; if (res.inv !== want) { fail++; if (!first) first = { A: A.toString(), got: res.inv.toString(), want: want.toString() }; } };
for (const A of edges) check(A, true);
for (let i = 0; i < TRIALS; i++) check(rnd() || 1n, i < 200);
const bits = (x) => x === 0n ? 0 : x.toString(2).length - 1;
console.log(`checked=${run}  mismatch_vs_bigint=${mism}  FAIL_inverse=${fail}`);
console.log(`max|fg col|=2^${bits(stats.fg)}  max|de col|=2^${bits(stats.de)}  max|carry|=2^${bits(stats.carry)}`);
if (first) console.log('FIRST', JSON.stringify(first).slice(0, 200));
console.log(`PK15_PACKED_VERDICT=${fail === 0 && mism === 0 ? 'PASS' : 'FAIL'}`);
process.exit(fail === 0 && mism === 0 ? 0 : 1);
