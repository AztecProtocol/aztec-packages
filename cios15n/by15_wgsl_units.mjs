// Unit tests for the WGSL-specific encodings in by_inverse_loop_15.template.wgsl.
// The algorithm + limb columns are already validated (by15_safegcd_limb.mjs);
// these confirm the 3 things the WGSL adds: (1) the 2-word macc/carry15 column
// accumulator, (2) byl15_low_u64 extraction, (3) the low-64 byl15_divsteps matrix.
// All JS uses exact integer / BigInt math but emulates u32/i32 wrap precisely.

import { readFileSync } from 'node:fs';
const TWO32 = 2 ** 32, U32 = (x) => x >>> 0, I32 = (x) => x | 0;
const ri = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

// ---- (1) macc / carry15 (faithful JS emulation of the WGSL) ----
function macc(st, prod) {                 // st={hi:i32, lo:u32}; prod: i32
  const plo = U32(prod);
  const sum = st.lo + plo;                // exact (< 2^33)
  st.lo = U32(sum);
  st.hi = I32(st.hi + (prod >> 31) + (sum >= TWO32 ? 1 : 0));
}
const carry15 = (hi, lo) => I32((hi << 17) + (lo >>> 15));

function testMacc() {
  let fail = 0, maxV = 0n;
  for (let t = 0; t < 2_000_000; t++) {
    const n = ri(2, 6);                    // up to 6 products (de worst case)
    const prods = [];
    for (let i = 0; i < n; i++) prods.push(ri(-(2 ** 30), 2 ** 30));
    const cin = ri(-(2 ** 18), 2 ** 18);   // incoming carry
    const st = { hi: 0, lo: 0 };
    macc(st, cin);
    for (const p of prods) macc(st, p);
    // true value (BigInt)
    let val = BigInt(cin); for (const p of prods) val += BigInt(p);
    const a = val < 0n ? -val : val; if (a > maxV) maxV = a;
    // value the (hi,lo) pair represents
    const emu = BigInt(st.hi) * (1n << 32n) + BigInt(st.lo);
    const limbEmu = st.lo & 32767, carryEmu = carry15(st.hi, st.lo);
    const limbTrue = Number(((val % 32768n) + 32768n) % 32768n);
    const carryTrue = Number(val >> 15n);  // arithmetic floor
    if (emu !== val || limbEmu !== limbTrue || carryEmu !== carryTrue) {
      fail++; if (fail <= 3) console.log(`  macc FAIL val=${val} emu=${emu} limb ${limbEmu}/${limbTrue} carry ${carryEmu}/${carryTrue}`);
    }
  }
  console.log(`(1) macc/carry15: fails=${fail}  max|col|=2^${(maxV.toString(2).length - 1)}  (carry15 fits i32 over all)`);
  return fail === 0;
}

// ---- (2) byl15_low_u64 ----
const C = JSON.parse(readFileSync(new URL('./constants.json', import.meta.url)));
function low_u64_emu(L) {
  const l0 = L[0], l1 = L[1], l2 = L[2], l3 = L[3], l4 = L[4];
  const lo = U32(l0 | (l1 << 15) | (l2 << 30));
  const hi = U32((l2 >>> 2) | (l3 << 13) | (l4 << 28));
  return BigInt(lo) | (BigInt(hi) << 32n);
}
function testLow64() {
  let fail = 0;
  for (let t = 0; t < 200000; t++) {
    const L = []; for (let i = 0; i < 18; i++) L.push(ri(0, 32767));
    let v = 0n; for (let i = 17; i >= 0; i--) v = (v << 15n) + BigInt(L[i]);
    const want = v & ((1n << 64n) - 1n);
    if (low_u64_emu(L) !== want) { fail++; if (fail <= 3) console.log(`  low64 FAIL`); }
  }
  console.log(`(2) byl15_low_u64: fails=${fail}`);
  return fail === 0;
}

// ---- (3) byl15_divsteps (low-64 vec2 emulation) vs full-BigInt divsteps ----
const P = BigInt(C.p), BATCH = 30;
const asr = (x, n) => x >> BigInt(n);
function divstepsFull(delta, f0, g0) {     // reference: exact BigInt
  let u = 1n, v = 0n, q = 0n, r = 1n, f = f0, g = g0, d = delta;
  for (let i = 0; i < BATCH; i++) {
    const gOdd = (g & 1n) === 1n, swap = gOdd && d > 0, addc = gOdd && d <= 0;
    let nf, ng, nu, nv, nq, nr, nd;
    if (swap) { nf = g; ng = g - f; nu = 2n * q; nv = 2n * r; nq = q - u; nr = r - v; nd = 1 - d; }
    else if (addc) { nf = f; ng = g + f; nu = 2n * u; nv = 2n * v; nq = q + u; nr = r + v; nd = d + 1; }
    else { nf = f; ng = g; nu = 2n * u; nv = 2n * v; nq = q; nr = r; nd = d + 1; }
    f = nf; g = ng >> 1n; u = nu; v = nv; q = nq; r = nr; d = nd;
  }
  return { u, v, q, r };
}
// vec2<u32> helpers (mirror the WGSL)
const v2 = (lo, hi) => ({ x: U32(lo), y: U32(hi) });
const u64add = (a, b) => { const lo = a.x + b.x; return v2(lo, a.y + b.y + (lo >= TWO32 ? 1 : 0)); };
const u64sub = (a, b) => { const lo = a.x - b.x; return v2(lo >>> 0, U32(a.y - b.y - (a.x < b.x ? 1 : 0))); };
const u64shr1 = (a) => v2((a.x >>> 1) | U32(a.y << 31), a.y >>> 1);
function divstepsLow64(delta, f0, g0) {    // emulates byl15_divsteps
  const lo64 = (x) => { const m = (1n << 64n) - 1n; const w = ((x % (1n << 64n)) + (1n << 64n)) % (1n << 64n); return v2(Number(w & 0xffffffffn), Number((w >> 32n) & 0xffffffffn)); };
  let f_lo = lo64(f0), g_lo = lo64(g0);
  let u = 1, v = 0, q = 0, r = 1, d = delta;
  for (let i = 0; i < BATCH; i++) {
    const gOdd = (g_lo.x & 1) !== 0, swap = gOdd && d > 0, addc = gOdd && d <= 0;
    const gmf = u64sub(g_lo, f_lo), gpf = u64add(g_lo, f_lo);
    const gpre = swap ? gmf : (addc ? gpf : g_lo);
    const nf = swap ? g_lo : f_lo, ng = u64shr1(gpre);
    const nu = swap ? I32(q << 1) : I32(u << 1), nv = swap ? I32(r << 1) : I32(v << 1);
    const nq = swap ? I32(q - u) : (addc ? I32(q + u) : q), nr = swap ? I32(r - v) : (addc ? I32(r + v) : r);
    const nd = swap ? (1 - d) : (d + 1);
    f_lo = nf; g_lo = ng; u = nu; v = nv; q = nq; r = nr; d = nd;
  }
  return { u: BigInt(u), v: BigInt(v), q: BigInt(q), r: BigInt(r) };
}
function testDivsteps() {
  let fail = 0;
  const rnd = () => { let x = 0n; for (let i = 0; i < 8; i++) x = (x << 32n) | BigInt((Math.random() * TWO32) >>> 0); return x % P; };
  for (let t = 0; t < 200000; t++) {
    const f0 = P, g0 = rnd() || 1n;          // f=p, g random (as in the driver)
    const delta = ri(-20, 20);
    const a = divstepsFull(delta, f0, g0), b = divstepsLow64(delta, f0, g0);
    if (a.u !== b.u || a.v !== b.v || a.q !== b.q || a.r !== b.r) { fail++; if (fail <= 3) console.log(`  divstep FAIL delta=${delta} full=${JSON.stringify(a, (k, v) => v.toString())} low=${JSON.stringify(b, (k, v) => v.toString())}`); }
  }
  console.log(`(3) byl15_divsteps low-64 == full-BigInt matrix: fails=${fail}`);
  return fail === 0;
}

const ok1 = testMacc(), ok2 = testLow64(), ok3 = testDivsteps();
console.log(`WGSL_UNITS_VERDICT=${ok1 && ok2 && ok3 ? 'PASS' : 'FAIL'}`);
process.exit(ok1 && ok2 && ok3 ? 0 : 1);
