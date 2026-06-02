// Native 17x15 CIOS Montgomery multiply generator for BN254 Fq.
// ONE rep (17x15), ONE R=2^255, NATIVE 15-bit reduction (reduces by 2^255).
// NO 13-bit, NO 2^260, NO repack, NO domain correction. In and out are 17x15.
//
// REGIME-DEFER (NOT the old COLCARRY slop): the multiply and reduction terms
// are FUSED into one sweep per outer iteration and carries are DEFERRED — a
// slot accumulates several 15x15 (<=2^30) products with NO per-column mask/shift,
// and is carry-normalized only every K outer iterations, where K is the MAXIMUM
// period that keeps the per-slot worst case < 2^32. We do NOT carry-reduce when
// it is not required.
//
// Emits:
//   (1) WGSL fn montmul_cios15native(a,b)->BigInt with NAMED scalar accumulators
//       s0..s_{N-1} (no dynamic indexing), fully unrolled, compile-time indices.
//   (2) A host JS mirror montmulMirror(a,b) executing the IDENTICAL u32 dataflow.
//
// BOUND (the reason K is what it is) — symbolic per-slot worst case following the
// ACTUAL deferred dataflow: each fused line s[j-1] = s[j] + x_i*y_j + q_i*p_j adds
// at most 2*PROD (PROD = (2^15-1)^2) on top of the (un-normalized) neighbour s[j];
// the periodic normalize at i+1 == 0 (mod K) resets every slot to < 2^15 + carry.
// maxDeferK() below tracks that bound exactly and returns the largest K whose
// peak (INCLUDING the normalize-time s_k + carry) is < 2^32. For B=15,N=17 => K=2
// (K=3 crosses 2^32). Every emitted u32 temporary is < 2^32 by this proof; the
// host mirror uses exact JS integer arithmetic (< 2^53) and matches bit-for-bit.

import { readFileSync } from 'node:fs';
const C = JSON.parse(readFileSync(new URL('./constants.json', import.meta.url)));
export const CONST = C;

const B = C.B, N = C.N, MASK = C.MASK, N0 = C.N0, P = C.p_limbs;
const Bb = BigInt(B);

// ---------------------------------------------------------------------------
// maxDeferK — largest normalize period K keeping the fused-deferred per-slot
// worst case (and the normalize-time carry-add) < 2^32. Mirrors the analysis in
// cuzk/cios_limb_gen.ts so this generator is principled, not hand-tuned.
// ---------------------------------------------------------------------------
export function maxDeferK() {
  const U32 = 1n << 32n;
  const PROD = BigInt(MASK) * BigInt(MASK);
  const tryK = (K) => {
    const Bnd = new Array(N).fill(0n);
    let peak = 0n;
    for (let i = 0; i < N; i++) {
      const t = Bnd[0] + PROD;
      if (t + PROD > peak) peak = t + PROD; // the c = (t + q*p0) term
      const c = (t + PROD) >> Bb;
      const nb = new Array(N).fill(0n);
      nb[0] = Bnd[1] + 2n * PROD + c;
      for (let j = 2; j < N - 1; j++) nb[j - 1] = Bnd[j] + 2n * PROD;
      nb[N - 2] = 2n * PROD;
      for (let k = 0; k < N; k++) { Bnd[k] = nb[k]; if (Bnd[k] > peak) peak = Bnd[k]; }
      if ((i + 1) % K === 0 && i + 1 < N) {
        let carry = 0n;
        for (let k = 0; k < N; k++) {
          const v = Bnd[k] + carry;
          if (v > peak) peak = v;
          carry = v >> Bb;
          Bnd[k] = BigInt(MASK);
        }
      }
    }
    return { ok: peak < U32, peak };
  };
  for (let K = N; K >= 1; K--) {
    const r = tryK(K);
    if (r.ok) return { K, peak: r.peak };
  }
  return { K: null, peak: null };
}

export const DEFER = maxDeferK();

// ---------------------------------------------------------------------------
// HOST MIRROR — reproduces the emitted WGSL u32 dataflow EXACTLY. The deferred
// accumulation lines do NO carry extraction (plain sums, < 2^32 by the bound);
// only the periodic + final normalize sweeps extract carries. JS `>>` is 32-bit
// SIGNED, so carries use Math.floor(v / 2^B) (v can exceed 2^31); the limb is
// v % 2^B (== WGSL `v & MASK` for 0 <= v < 2^32).
// ---------------------------------------------------------------------------
const TWO_B = 2 ** B;
const lo = (v) => v % TWO_B;
const sh = (v) => Math.floor(v / TWO_B);

export function montmulMirror(a, b) {
  const K = DEFER.K;
  const x = a.map((t) => t >>> 0);
  const y = b.map((t) => t >>> 0);
  const s = new Array(N).fill(0); // s0..s_{N-1}; s_{N-1} is the carry sink

  for (let i = 0; i < N; i++) {
    // ---- fused multiply + reduce, carries DEFERRED ----
    const t = s[0] + x[i] * y[0];
    const qi = (N0 * lo(t)) & MASK;
    const c = sh(t + qi * P[0]);
    s[0] = s[1] + x[i] * y[1] + qi * P[1] + c;
    for (let j = 2; j < N - 1; j++) s[j - 1] = s[j] + x[i] * y[j] + qi * P[j];
    s[N - 2] = s[N - 1] + x[i] * y[N - 1] + qi * P[N - 1];
    s[N - 1] = 0;

    // ---- periodic carry normalize (only when the bound requires) ----
    if ((i + 1) % K === 0 && i + 1 < N) {
      let cn = 0;
      for (let k = 0; k < N - 1; k++) { const v = s[k] + cn; cn = sh(v); s[k] = lo(v); }
      s[N - 1] = cn;
    }
  }
  // ---- final carry normalize ----
  let cc = 0;
  for (let k = 0; k < N; k++) { const v = s[k] + cc; cc = sh(v); s[k] = lo(v); }

  // result in s0..s_{N-1} in [0, 2p); native conditional subtract p
  return condSubP(s);
}

// Conditional subtract p if value >= p, native 15-bit limbs. Mirrors WGSL emit.
export function condSubP(sIn) {
  const s = sIn.slice(0, N);
  const d = new Array(N);
  let borrow = 0;
  for (let j = 0; j < N; j++) {
    const dd = (s[j] | 0) - (P[j] | 0) - (borrow | 0);
    d[j] = dd & MASK;
    borrow = dd < 0 ? 1 : 0;
  }
  const out = new Array(N);
  for (let j = 0; j < N; j++) out[j] = borrow === 0 ? d[j] : (s[j] & MASK);
  return out;
}

// ---------------------------------------------------------------------------
// WGSL EMITTER — fully unrolled, NAMED scalar accumulators s0..s_{N-1},
// compile-time indices only. REGIME-DEFER (normalize every K). Only >>15 and
// &32767 (limb-aligned), never a shift/mask crossing a limb bound.
// ---------------------------------------------------------------------------
export function emitWGSL(fnName = 'montmul_cios15native') {
  const K = DEFER.K;
  const L = [];
  const w = (x) => L.push(x);
  w(`// AUTO-GENERATED by gen_cios15n.mjs — native 17x15 CIOS, R=2^255, NO correction.`);
  w(`// REGIME-DEFER K=${K}: fused multiply+reduce, carries deferred; carry-normalize`);
  w(`// only every ${K} outer iters (max period keeping every u32 slot < 2^32).`);
  w(`fn ${fnName}(a: BigInt, b: BigInt) -> BigInt {`);
  for (let k = 0; k < N; k++) w(`  var s${k}: u32 = 0u;`);
  for (let j = 0; j < N; j++) w(`  let p${j}: u32 = ${P[j]}u;`);
  w(`  let N0: u32 = ${N0}u;`);
  // native identity unpack into register-resident operand limbs
  for (let k = 0; k < N; k++) w(`  let x${k}: u32 = a.limbs[${k}];`);
  for (let k = 0; k < N; k++) w(`  let y${k}: u32 = b.limbs[${k}];`);

  for (let i = 0; i < N; i++) {
    w(`  {   // ===== outer i=${i} : fused multiply+reduce (deferred carries) =====`);
    w(`    let t: u32 = s0 + x${i} * y0;`);
    w(`    let qi: u32 = (N0 * (t & ${MASK}u)) & ${MASK}u;`);
    w(`    let c: u32 = (t + qi * p0) >> ${B}u;`);
    w(`    s0 = s1 + x${i} * y1 + qi * p1 + c;`);
    for (let j = 2; j < N - 1; j++) w(`    s${j - 1} = s${j} + x${i} * y${j} + qi * p${j};`);
    w(`    s${N - 2} = s${N - 1} + x${i} * y${N - 1} + qi * p${N - 1};`);
    w(`    s${N - 1} = 0u;`);
    w(`  }`);
    if ((i + 1) % K === 0 && i + 1 < N) {
      w(`  {   // periodic carry normalize (K=${K})`);
      w(`    var cn: u32 = 0u;`);
      for (let k = 0; k < N - 1; k++) w(`    { let v: u32 = s${k} + cn; cn = v >> ${B}u; s${k} = v & ${MASK}u; }`);
      w(`    s${N - 1} = cn;`);
      w(`  }`);
    }
  }

  w(`  // ---- final carry normalize ----`);
  w(`  var cc: u32 = 0u;`);
  for (let k = 0; k < N; k++) w(`  { let v: u32 = s${k} + cc; cc = v >> ${B}u; s${k} = v & ${MASK}u; }`);

  w(`  // ---- final conditional subtract of p (native 15-bit) ----`);
  w(`  var out: BigInt;`);
  w(`  var borrow: i32 = 0;`);
  w(`  var dd: i32;`);
  for (let j = 0; j < N; j++) {
    w(`  dd = i32(s${j}) - ${P[j]} - borrow; out.limbs[${j}] = u32(dd) & ${MASK}u; borrow = select(0, 1, dd < 0);`);
  }
  for (let j = 0; j < N; j++) w(`  out.limbs[${j}] = select(out.limbs[${j}], s${j}, borrow != 0);`);
  w(`  return out;`);
  w(`}`);
  return L.join('\n');
}

if (process.argv.includes('--emit')) {
  const wgsl = emitWGSL();
  const { writeFileSync } = await import('node:fs');
  writeFileSync(new URL('./montmul_cios15native.wgsl.gen', import.meta.url), wgsl);
  console.log(`emitted ${wgsl.split('\n').length} lines (REGIME-DEFER K=${DEFER.K}, peak=${DEFER.peak} < 2^32)`);
}

if (process.argv.includes('--validate')) {
  const Pbig = BigInt(C.p);
  const Rinv = (() => { const R = (1n << 255n) % Pbig; let [a, m] = [R, Pbig], [x0, x1] = [0n, 1n]; while (a > 1n) { const q = a / m;[a, m] = [m, a - q * m];[x0, x1] = [x1 - q * x0, x0]; } return ((x1 % Pbig) + Pbig) % Pbig; })();
  const toLimbs = (v) => { const l = []; for (let i = 0; i < N; i++) { l.push(Number(v & BigInt(MASK))); v >>= Bb; } return l; };
  const fromLimbs = (l) => { let v = 0n; for (let i = N - 1; i >= 0; i--) v = (v << Bb) + BigInt(l[i]); return v; };
  const rnd = () => { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 32n) | BigInt((Math.random() * 2 ** 32) >>> 0); return v % Pbig; };
  const TRIALS = parseInt(process.argv[process.argv.indexOf('--validate') + 1] || '120000', 10);
  const edges = [[0n, 0n], [Pbig - 1n, Pbig - 1n], [1n, 1n], [Pbig - 1n, 1n], [(1n << 255n) % Pbig, (1n << 255n) % Pbig], [Pbig - 2n, Pbig - 2n], [2n, (Pbig - 1n) / 2n]];
  let fail = 0, nz = 0, run = 0, first = null;
  const check = (a, b) => { run++; const got = fromLimbs(montmulMirror(toLimbs(a), toLimbs(b))); const want = (a * b % Pbig) * Rinv % Pbig; if (got !== want) { fail++; if (!first) first = { a: a.toString(), b: b.toString(), got: got.toString(), want: want.toString() }; } if (got !== 0n) nz++; };
  for (const [a, b] of edges) check(a, b);
  for (let t = 0; t < TRIALS; t++) check(rnd(), rnd());
  console.log(`DEFER K=${DEFER.K} peak=${DEFER.peak}  checked=${run} (incl ${edges.length} edges) nonzero=${nz}`);
  console.log(`FAIL_montmulMirror_vs_2^-255=${fail}`);
  if (first) console.log(`FIRST_FAIL ${JSON.stringify(first)}`);
  console.log(`GEN_CIOS15N_VERDICT=${fail === 0 && nz > 0 ? 'PASS' : 'FAIL'}`);
  process.exit(fail === 0 && nz > 0 ? 0 : 1);
}
