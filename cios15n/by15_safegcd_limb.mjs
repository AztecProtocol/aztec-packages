// STAGE 2: limb-level model of the 15-bit safegcd apply_matrix — the exact
// dataflow the WGSL fr_inv_by_loop_pk15 will run. Mirrors byl_apply_matrix_fg /
// byl_apply_matrix_de (rolling lookahead window; write out[i-2] == the >>30
// 2-limb drop) but at WS=15, N=17, BATCH=30, with each column accumulated in a
// 2-word (lo:u32 + hi:i32) accumulator because a column is a SIGNED sum of up to
// 4 (fg) / 6 (de) products of <=2^30 -> ~2^32 / ~2^33, exceeding one 32-bit lane.
// The extracted carry col>>15 is < 2^18 (fits i32). We DEFER: one extract per
// column (the minimum the >>15 limb structure needs), never per product.
//
// Validation: every outer iter, the limb-level (f,g,d,e) must reconstruct to the
// EXACT BigInt-algorithm (f,g,d,e); and the final inverse must equal modinv.
// We also record the true max |column| and |carry| to confirm the WGSL widths.

import { readFileSync } from 'node:fs';
const C = JSON.parse(readFileSync(new URL('./constants.json', import.meta.url)));
const P = BigInt(C.p);
// Safegcd INTERNAL limb count = field limbs + 1 slack limb. The BY intermediate
// d,e,f,g range over [-3p, 3p] ~ 2^255.6 before periodic reduction; 17x15=255
// bits (1 bit slack over the 254-bit field) is too tight, so use 18x15=270 bits
// (16 bits slack), mirroring byl using 20x13=260 (6 bits) not the field's width.
const N = C.N + 1, WS = 15, MASK = (1 << 15) - 1;
const TWO15 = 1n << 15n, MASK15 = TWO15 - 1n, TWO_SGN = 1n << BigInt(15 * (C.N + 1));
const BATCH = 30, NUM_OUTER = 25;
const PL = [...C.p_limbs.map(BigInt), 0n];   // 18 limbs (top slack limb = 0)
const PINV30 = 460954743n, MASK30 = (1n << 30n) - 1n;
const R = (1n << 255n) % P;

const modinv = (a, m) => { a = ((a % m) + m) % m; let [o, r] = [a, m], [os, s] = [1n, 0n]; while (r) { const q = o / r;[o, r] = [r, o - q * r];[os, s] = [s, os - q * s]; } return ((os % m) + m) % m; };
const R3 = (R * R * R) % P, INVR = modinv(R, P);
const montmul = (x, y) => (x * y % P) * INVR % P;

const slo = (x) => ((x % TWO15) + TWO15) % TWO15;       // low 15 bits of signed x
const asr15 = (x) => x >> 15n;                          // arithmetic >>15 (floor)
const signExtTop = (limb) => { const t = BigInt(limb) & MASK15; return (t & (1n << 14n)) ? t - TWO15 : t; };

// ---- conversions ----
const fromLimbsSigned = (L) => { let v = 0n; for (let i = N - 1; i >= 0; i--) v = (v << 15n) + BigInt(L[i]); if (BigInt(L[N - 1]) & (1n << 14n)) v -= TWO_SGN; return v; };
const toLimbsSigned = (x) => { let xc = ((x % TWO_SGN) + TWO_SGN) % TWO_SGN; const L = []; for (let i = 0; i < N; i++) { L.push(Number(xc & MASK15)); xc >>= 15n; } return L; };
const fromLimbsCanon = (L) => { let v = 0n; for (let i = N - 1; i >= 0; i--) v = (v << 15n) + BigInt(L[i]); return v; };
const toLimbsCanon = (x) => { x = ((x % P) + P) % P; const L = []; for (let i = 0; i < N; i++) { L.push(Number(x & MASK15)); x >>= 15n; } return L; };

const stats = { fg: 0n, de: 0n, carry: 0n };
const trkCol = (kind, ...vals) => { for (const v of vals) { const a = v < 0n ? -v : v; if (a > stats[kind]) stats[kind] = a; } };
const trkCarry = (...vals) => { for (const v of vals) { const a = v < 0n ? -v : v; if (a > stats.carry) stats.carry = a; } };

// divsteps: BATCH steps; matrix from low bits (full BigInt gives identical matrix).
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

// (f,g) <- ((u*f+v*g)>>30, (q*f+r*g)>>30). Rolling, write out[i-2]. 2-word col.
function applyFG(m, f, g) {
  const top = N - 1;
  const uL = slo(m.u), uH = asr15(m.u), vL = slo(m.v), vH = asr15(m.v);
  const qL = slo(m.q), qH = asr15(m.q), rL = slo(m.r), rH = asr15(m.r);
  const nf = new Array(N).fill(0), ng = new Array(N).fill(0);
  let cf = 0n, cg = 0n, fp = 0n, gp = 0n;
  for (let i = 0; i < N; i++) {
    const fi = (i === top) ? signExtTop(f[i]) : BigInt(f[i]);
    const gi = (i === top) ? signExtTop(g[i]) : BigInt(g[i]);
    const colF = uL * fi + vL * gi + uH * fp + vH * gp + cf;
    const colG = qL * fi + rL * gi + qH * fp + rH * gp + cg;
    trkCol('fg', colF, colG);
    cf = asr15(colF); cg = asr15(colG); trkCarry(cf, cg);
    if (i >= 2) { nf[i - 2] = Number(slo(colF)); ng[i - 2] = Number(slo(colG)); }
    fp = fi; gp = gi;
  }
  const colFt = uH * fp + vH * gp + cf, colGt = qH * fp + rH * gp + cg;
  trkCol('fg', colFt, colGt);
  nf[top - 1] = Number(slo(colFt)); ng[top - 1] = Number(slo(colGt));
  nf[top] = Number(slo(asr15(colFt))); ng[top] = Number(slo(asr15(colGt)));
  return [nf, ng];
}

// (d,e) <- ((u*d+v*e+k_d*p)>>30, (q*d+r*e+k_e*p)>>30), k*p cancels low 30 bits.
function applyDE(m, d, e) {
  const top = N - 1;
  const uL = slo(m.u), uH = asr15(m.u), vL = slo(m.v), vH = asr15(m.v);
  const qL = slo(m.q), qH = asr15(m.q), rL = slo(m.r), rH = asr15(m.r);
  const d0 = BigInt(d[0]), d1 = BigInt(d[1]), e0 = BigInt(e[0]), e1 = BigInt(e[1]);
  const p0 = PL[0], p1 = PL[1];
  // pre-k*p numerator limbs 0,1
  const nd0 = uL * d0 + vL * e0, ne0 = qL * d0 + rL * e0;
  const nd1 = uL * d1 + vL * e1 + uH * d0 + vH * e0, ne1 = qL * d1 + rL * e1 + qH * d0 + rH * e0;
  trkCol('de', nd0, ne0, nd1, ne1);
  const t_d = (slo(nd0) | (slo(nd1 + asr15(nd0)) << 15n)) & MASK30;
  const t_e = (slo(ne0) | (slo(ne1 + asr15(ne0)) << 15n)) & MASK30;
  const k_d = (((~t_d + 1n) & MASK30) * PINV30) & MASK30;
  const k_e = (((~t_e + 1n) & MASK30) * PINV30) & MASK30;
  const kdL = k_d & MASK15, kdH = k_d >> 15n, keL = k_e & MASK15, keH = k_e >> 15n;
  // carry into limb 2 (limbs 0,1 are now 0 mod 2^30)
  let cd = asr15(nd1 + kdL * p1 + kdH * p0 + asr15(nd0 + kdL * p0));
  let ce = asr15(ne1 + keL * p1 + keH * p0 + asr15(ne0 + keL * p0));
  trkCarry(cd, ce);
  const nd = new Array(N).fill(0), ne = new Array(N).fill(0);
  let dp = d1, ep = e1;
  for (let i = 2; i < N; i++) {
    const di = (i === top) ? signExtTop(d[i]) : BigInt(d[i]);
    const ei = (i === top) ? signExtTop(e[i]) : BigInt(e[i]);
    const pi = PL[i], pim1 = PL[i - 1];
    const colD = uL * di + vL * ei + uH * dp + vH * ep + kdL * pi + kdH * pim1 + cd;
    const colE = qL * di + rL * ei + qH * dp + rH * ep + keL * pi + keH * pim1 + ce;
    trkCol('de', colD, colE);
    cd = asr15(colD); ce = asr15(colE); trkCarry(cd, ce);
    nd[i - 2] = Number(slo(colD)); ne[i - 2] = Number(slo(colE));
    dp = di; ep = ei;
  }
  const ptop = PL[top];
  const colDt = uH * dp + vH * ep + kdH * ptop + cd, colEt = qH * dp + rH * ep + keH * ptop + ce;
  trkCol('de', colDt, colEt);
  nd[top - 1] = Number(slo(colDt)); ne[top - 1] = Number(slo(colEt));
  nd[top] = Number(slo(asr15(colDt))); ne[top] = Number(slo(asr15(colEt)));
  return [nd, ne];
}

function reduceCanon(L) { let v = fromLimbsSigned(L); v = ((v % P) + P) % P; return toLimbsCanon(v); }

function frInvLimb(aMont, crossCheck) {
  let f = toLimbsSigned(P), g = toLimbsSigned(((aMont % P) + P) % P);
  let d = toLimbsCanon(0n), e = toLimbsCanon(1n);
  let delta = 1;
  // BigInt reference state (for per-iter cross-check)
  let F = P, G = ((aMont % P) + P) % P, D = 0n, E = 1n;
  const INV2B = modinv(1n << BigInt(BATCH), P);
  for (let it = 0; it < NUM_OUTER; it++) {
    if (G === 0n) break;
    const m = divsteps(delta, fromLimbsSigned(f), fromLimbsSigned(g));
    delta = m.delta;
    [f, g] = applyFG(m, f, g);
    [d, e] = applyDE(m, d, e);
    d = reduceCanon(d); e = reduceCanon(e);
    // BigInt reference
    const nF = (m.u * F + m.v * G) >> BigInt(BATCH), nG = (m.q * F + m.r * G) >> BigInt(BATCH);
    const nD = (((m.u * D + m.v * E) % P) * INV2B % P + P) % P, nE = (((m.q * D + m.r * E) % P) * INV2B % P + P) % P;
    F = nF; G = nG; D = nD; E = nE;
    if (crossCheck) {
      const ok = fromLimbsSigned(f) === F && fromLimbsSigned(g) === G && fromLimbsCanon(d) === D && fromLimbsCanon(e) === E;
      if (!ok) return { mismatchAt: it, f: fromLimbsSigned(f), F, g: fromLimbsSigned(g), G, d: fromLimbsCanon(d), D, e: fromLimbsCanon(e), E };
    }
  }
  let dv = fromLimbsCanon(reduceCanon(d));
  if (fromLimbsSigned(f) < 0n) dv = (P - dv) % P;
  return { inv: montmul(dv, R3) };
}

const rnd = () => { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 32n) | BigInt((Math.random() * 2 ** 32) >>> 0); return v % P; };

const TRIALS = parseInt(process.argv[2] || '20000', 10);
const edges = [1n, 2n, 3n, P - 1n, P - 2n, (P - 1n) / 2n, R % P];
let fail = 0, mism = 0, run = 0, first = null;
const check = (A, cc) => {
  run++; const a = (A * R) % P; if (a === 0n) return;
  const res = frInvLimb(a, cc);
  if (res.mismatchAt !== undefined) { mism++; if (!first) first = res; return; }
  const want = (modinv(A, P) * R) % P;
  if (res.inv !== want) { fail++; if (!first) first = { A: A.toString(), got: res.inv.toString(), want: want.toString() }; }
};
for (const A of edges) check(A, true);            // cross-check limb-vs-BigInt on edges
for (let i = 0; i < TRIALS; i++) check(rnd() || 1n, i < 200); // cross-check first 200

const bits = (x) => x === 0n ? 0 : (x.toString(2).length);
console.log(`checked=${run}  mismatch_limb_vs_bigint=${mism}  FAIL_inverse=${fail}`);
console.log(`max|fg col|=2^${bits(stats.fg)}  max|de col|=2^${bits(stats.de)}  max|carry|=2^${bits(stats.carry)}`);
console.log(`  => fg col fits i32? ${stats.fg < (1n << 31n)}  fits u32? ${stats.fg < (1n << 32n)}  ; de col fits u32? ${stats.de < (1n << 32n)}  ; needs 2-word? ${stats.de >= (1n << 31n)}`);
console.log(`  => carry fits i32? ${stats.carry < (1n << 31n)}`);
if (first) console.log('FIRST_ISSUE', JSON.stringify(first, (k, v) => typeof v === 'bigint' ? v.toString() : v).slice(0, 400));
console.log(`PK15_LIMB_VERDICT=${fail === 0 && mism === 0 ? 'PASS' : 'FAIL'}`);
process.exit(fail === 0 && mism === 0 ? 0 : 1);
