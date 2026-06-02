// Host model + validator for the 15-bit Bernstein-Yang safegcd inverse
// (fr_inv_by_loop_pk15), the 15-bit sibling of fr_inv_by_loop_pk.
//
// STAGE 1 (this pass): validate the ALGORITHM at BATCH=30 / NUM_OUTER on full
// BigInt values — confirm it computes the Montgomery inverse, find the minimum
// NUM_OUTER, and confirm the SAME final montmul(d, R^3) correction the 13-bit pk
// uses still applies (it only fixes the Montgomery domain R^-1 -> R, independent
// of BATCH). divsteps mirror byl_divsteps exactly, just BATCH=30 (=2*15, so the
// matrix application's >>30 is a clean 2-limb drop in the eventual WGSL).
//
// BATCH=30: after 30 divsteps |u,v,q,r| <= 2^30, which fits i32 (the divstep
// accumulators) — that's why 30 and not 26. NUM_OUTER must give BATCH*NUM_OUTER
// >= the BY divstep bound for 256-bit (~745); we sweep to find the min that is
// correct over all tests.

import { readFileSync } from 'node:fs';
const C = JSON.parse(readFileSync(new URL('./constants.json', import.meta.url)));
const P = BigInt(C.p);
const R = (1n << 255n) % P;                          // Montgomery R = 2^255 mod p
const BATCH = parseInt(process.env.BATCH || '30', 10);

function modinv(a, m) {
  a = ((a % m) + m) % m;
  let [old_r, r] = [a, m], [old_s, s] = [1n, 0n];
  while (r !== 0n) { const q = old_r / r;[old_r, r] = [r, old_r - q * r];[old_s, s] = [s, old_s - q * s]; }
  return ((old_s % m) + m) % m;
}
const R3 = (R * R * R) % P;
const INV2_BATCH = modinv(1n << BigInt(BATCH), P);    // 2^-BATCH mod p
const montmul = (x, y) => (x * y % P) * modinv(R, P) % P;   // x*y*R^-1 mod p

// asr: arithmetic shift right by n for signed BigInt (floor division by 2^n).
const asr = (x, n) => x >> BigInt(n);

// BATCH divsteps on the low bits of (f,g). Mirrors byl_divsteps (branchless in
// WGSL; plain here). Returns the 2x2 matrix [[u,v],[q,r]] and the new delta.
// The decisions depend only on g's low bit + delta, so feeding full f,g (BigInt)
// yields the identical matrix to feeding just the low BATCH+1 bits.
function divsteps(delta, f0, g0) {
  let u = 1n, v = 0n, q = 0n, r = 1n;
  let f = f0, g = g0, d = delta;
  for (let i = 0; i < BATCH; i++) {
    const gOdd = (g & 1n) === 1n;
    const swap = gOdd && d > 0;
    const addc = gOdd && d <= 0;
    let nf, ng, nu, nv, nq, nr, nd;
    if (swap) { nf = g; ng = g - f; nu = 2n * q; nv = 2n * r; nq = q - u; nr = r - v; nd = 1 - d; }
    else if (addc) { nf = f; ng = g + f; nu = 2n * u; nv = 2n * v; nq = q + u; nr = r + v; nd = d + 1; }
    else { nf = f; ng = g; nu = 2n * u; nv = 2n * v; nq = q; nr = r; nd = d + 1; }
    f = nf; g = asr(ng, 1); u = nu; v = nv; q = nq; r = nr; d = nd;
  }
  return { u, v, q, r, delta: d };
}

// Bernstein-Yang inverse of `a` (in Montgomery form) -> a^-1 in Montgomery form.
function fr_inv_pk15(a, NUM_OUTER) {
  let f = P, g = ((a % P) + P) % P;
  let d = 0n, e = 1n;
  let delta = 1;
  let maxMatrix = 0n;
  for (let it = 0; it < NUM_OUTER; it++) {
    if (g === 0n) break;
    const m = divsteps(delta, f, g);
    delta = m.delta;
    for (const x of [m.u, m.v, m.q, m.r]) { const ax = x < 0n ? -x : x; if (ax > maxMatrix) maxMatrix = ax; }
    // (f,g) <- ((u*f+v*g)>>BATCH, (q*f+r*g)>>BATCH)  — exact (low BATCH bits are 0)
    const nf = asr(m.u * f + m.v * g, BATCH);
    const ng = asr(m.q * f + m.r * g, BATCH);
    f = nf; g = ng;
    // (d,e) <- ((u*d+v*e)*2^-BATCH mod p, (q*d+r*e)*2^-BATCH mod p)
    const nd = (((m.u * d + m.v * e) % P) * INV2_BATCH % P + P) % P;
    const ne = (((m.q * d + m.r * e) % P) * INV2_BATCH % P + P) % P;
    d = nd; e = ne;
  }
  // sign(f) fix + Montgomery correction (montmul by R^3 == multiply by R^2)
  let dn = ((d % P) + P) % P;
  if (f < 0n) dn = (P - dn) % P;
  return { inv: montmul(dn, R3), maxMatrix, gZero: g === 0n };
}

const rnd = () => { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 32n) | BigInt((Math.random() * 2 ** 32) >>> 0); return v % P; };

if (process.argv.includes('--sweep')) {
  // find the minimum NUM_OUTER that inverts correctly over edges + randoms
  const As = [1n, 2n, P - 1n, P - 2n, (P - 1n) / 2n, 3n, R % P];
  for (let i = 0; i < 4000; i++) As.push(rnd() || 1n);
  for (let NO = 23; NO <= 30; NO++) {
    let fail = 0, maxM = 0n;
    for (const A of As) {
      const a = (A * R) % P;                 // Montgomery form of A
      if (a === 0n) continue;
      const { inv, maxMatrix, gZero } = fr_inv_pk15(a, NO);
      const want = (modinv(A, P) * R) % P;   // Montgomery form of A^-1
      if (!gZero || inv !== want) fail++;
      if (maxMatrix > maxM) maxM = maxMatrix;
    }
    console.log(`NUM_OUTER=${NO}  fails=${fail}/${As.length}  maxMatrix=${maxM} (2^${maxM === 0n ? 0 : (maxM.toString(2).length - 1)})  matrixFitsI32=${maxM < (1n << 31n)}`);
  }
}

if (process.argv.includes('--validate')) {
  const NO = parseInt(process.argv[process.argv.indexOf('--validate') + 1] || '25', 10);
  const TRIALS = parseInt(process.argv[process.argv.indexOf('--validate') + 2] || '50000', 10);
  const edges = [1n, 2n, 3n, P - 1n, P - 2n, (P - 1n) / 2n, R % P, (R * R) % P];
  let fail = 0, maxM = 0n, run = 0, first = null;
  const check = (A) => {
    run++;
    const a = (A * R) % P; if (a === 0n) return;
    const { inv, maxMatrix } = fr_inv_pk15(a, NO);
    const want = (modinv(A, P) * R) % P;
    if (inv !== want) { fail++; if (!first) first = { A: A.toString(), got: inv.toString(), want: want.toString() }; }
    if (maxMatrix > maxM) maxM = maxMatrix;
  };
  for (const A of edges) check(A);
  for (let i = 0; i < TRIALS; i++) check(rnd() || 1n);
  console.log(`BATCH=${BATCH} NUM_OUTER=${NO}  checked=${run}  maxMatrix=2^${maxM.toString(2).length - 1} (i32-safe=${maxM < (1n << 31n)})`);
  console.log(`FAIL_montgomery_inverse=${fail}`);
  if (first) console.log(`FIRST_FAIL ${JSON.stringify(first)}`);
  console.log(`PK15_ALGO_VERDICT=${fail === 0 ? 'PASS' : 'FAIL'}`);
  process.exit(fail === 0 ? 0 : 1);
}
