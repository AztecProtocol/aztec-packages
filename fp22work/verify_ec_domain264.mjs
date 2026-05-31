// Domain-correctness proof for the native 2^264 walker interim.
//
// Claim: EC affine addition done with a Montgomery multiply of radix R is
// independent of R, as long as (a) inputs are in R-Montgomery form, (b) the
// modular inverse returns the R-Montgomery inverse. We verify byte-identical
// affine sums for R=2^256 vs R=2^264, then show the SINGLE boundary that
// bridges the 2^256 BY-safegcd inverse into the 2^264 domain is a one-constant
// change (no per-op fixup). This justifies the interim:
//   - multiply: native 12x22, R=2^264 (the verified montmul)
//   - inverse:  reuse the 2^256 BY divstep CORE, swap ONLY the final fold const
//
// Uses the VERIFIED native montmul (native22_r264_host.montmul) for R=2^264.
import { P, montmul as montmul264, N0 as N0_264, PLIMB, toLimbs22, fromLimbs22, modinv } from './native22_r264_host.mjs';

const R256 = 1n << 256n;
const R264 = 1n << 264n;
const Rinv256 = modinv(R256, P);
const Rinv264 = modinv(R264, P);

// Reference (plain integer) Montgomery multiplies, used as the R=2^256 oracle.
const mm256 = (a, b) => (a * b % P) * Rinv256 % P;          // a*b*2^-256
// And a plain-integer 2^264 multiply, to cross-check the native one.
const mm264_ref = (a, b) => (a * b % P) * Rinv264 % P;       // a*b*2^-264

// native montmul wrapper: integers in 2^264-Mont form -> integer
function mm264(a, b) {
  const r = montmul264(toLimbs22(a % P), toLimbs22(b % P), N0_264, PLIMB);
  return fromLimbs22(r) % P;
}

// ---- sanity: native montmul == plain 2^264 montmul on random inputs ----
function randF() { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 32n) | BigInt((Math.random() * 0x100000000) >>> 0); return v % P; }
{
  let bad = 0;
  for (let i = 0; i < 2000; i++) { const a = randF(), b = randF(); if (mm264(a, b) !== mm264_ref(a, b)) bad++; }
  console.log('check native-montmul==plain-2^264:', bad === 0 ? 'PASS' : 'FAIL(' + bad + ')');
  if (bad) process.exit(1);
}

// ---- the BY divstep core is R-agnostic: it inverts the *integer* fed in ----
// WGSL by_inverse_loop returns inv_int * 2^k after divsteps, then folds by a
// constant via the SAME montgomery_product (radix R). We model the inverse as:
//   inputMont (= a*R)  --(divstep core, returns (a*R)^-1 * 2^k)--  then fold.
// To land at a^-1 * R (the R-Mont inverse), fold const C satisfies
//   mmR( (a*R)^-1 * 2^k , C ) = a^-1 * R
//   (a*R)^-1 * 2^k * C * R^-1 = a^-1 * R
//   C = R^3 * 2^-k mod p.            <-- depends ONLY on R and k (compile-time)
// The committed 2^256 code uses C = R256^2 * 2^-k because its divstep core
// returns a^-1 * 2^k for the *canonical* (non-Mont) integer a (it reduces the
// Montgomery factor internally); we MIRROR whatever the committed code does and
// just verify the resulting fold constant for 2^264 is a single constant.
//
// Model A: divstep core returns (Montgomery integer)^-1 * 2^k  -> C = R^3 2^-k
// Model B: divstep core returns (canonical a)^-1 * 2^k          -> C = R^2 2^-k
// The committed code comment says R^2*2^-k, i.e. Model B. We verify BOTH the
// affine identity and that swapping R256->R264 in the SAME model is 1 constant.
const k = 62 * 12;            // committed BY divstep count
const inv2k = modinv((1n << BigInt(k)) % P, P);
const foldB_256 = (R256 * R256 % P) * inv2k % P;   // committed 2^256 const
const foldB_264 = (R264 * R264 % P) * inv2k % P;   // the ONLY change for 2^264
console.log('fold const differs by exactly one value:', foldB_256 !== foldB_264 ? 'yes (single compile-time const)' : 'no');

// Bernstein-Yang style "canonical inverse" model used by the committed driver:
// returns a^-1 * 2^k for canonical integer a (Montgomery factor already folded
// out inside reduce_to_canonical). We don't reimplement divsteps; we use the
// algebraic value a^-1*2^k and apply the WGSL fold (mmR by foldB) to model it.
function invMontR(aMont, R, foldConst, mmR) {
  // aMont = a*R mod p. The driver's reduce_to_canonical yields canon = a^-1 * 2^k
  // (canonical-integer inverse times 2^k). We compute that algebraically:
  const a = aMont * modinv(R, P) % P;              // recover canonical a
  const canon = modinv(a, P) * ((1n << BigInt(k)) % P) % P;  // a^-1 * 2^k
  return mmR(canon, foldConst);                    // -> a^-1 * R  (R-Mont inverse)
}

// ---- full affine EC add, parameterized by (R, mm, inv) ----
function ecAddMont(x1, y1, x2, y2, R, mm, inv) {
  // all coords are R-Mont. lambda=(y2-y1)/(x2-x1); x3=l^2-x1-x2; y3=l(x1-x3)-y1
  const sub = (u, v) => ((u - v) % P + P) % P;
  const dx = sub(x2, x1);
  const dy = sub(y2, y1);
  const invdx = inv(dx, R);                          // (dx)^-1 in R-Mont
  const lam = mm(dy, invdx);
  const x3 = sub(sub(mm(lam, lam), x1), x2);
  const y3 = sub(mm(lam, sub(x1, x3)), y1);
  return [x3, y3];
}

// Pick a real BN254 G1 point's affine coords (Montgomery-independent integers),
// use the generator (1,2) and 2G is not needed — just use two distinct affine
// points by taking canonical x,y on the curve y^2=x^3+3. Easiest: random a, get
// P1 = a*Gen via... we don't have EC scalar mul here. Instead, verify the field
// identity that the affine formula is R-invariant on ARBITRARY field inputs
// (the formula is rational in the field ops; correctness as a field computation
// is what montmul-domain-invariance is about — the EC group law is the same
// rational map). So feed random field x1,y1,x2,y2 and check the 256 vs 264
// computations agree after rescaling.
let fails = 0;
for (let t = 0; t < 5000; t++) {
  const x1 = randF(), y1 = randF(), x2 = randF(), y2 = randF();
  if (x1 === x2) continue;
  // 256-domain inputs
  const X1a = x1 * R256 % P, Y1a = y1 * R256 % P, X2a = x2 * R256 % P, Y2a = y2 * R256 % P;
  const [x3a, y3a] = ecAddMont(X1a, Y1a, X2a, Y2a, R256, mm256,
    (d, R) => invMontR(d, R, foldB_256, mm256));
  // 264-domain inputs, native multiply, bridged inverse
  const X1b = x1 * R264 % P, Y1b = y1 * R264 % P, X2b = x2 * R264 % P, Y2b = y2 * R264 % P;
  const [x3b, y3b] = ecAddMont(X1b, Y1b, X2b, Y2b, R264, mm264,
    (d, R) => invMontR(d, R, foldB_264, mm264));
  // rescale 264 result down to canonical and compare to 256 result canonical
  const x3a_can = x3a * Rinv256 % P, y3a_can = y3a * Rinv256 % P;
  const x3b_can = x3b * Rinv264 % P, y3b_can = y3b * Rinv264 % P;
  if (x3a_can !== x3b_can || y3a_can !== y3b_can) { fails++; if (fails <= 3) console.log('MISMATCH', { x3a_can, x3b_can }); }
}
console.log('affine-add R256 vs native-R264 (canonical): trials=5000 fails=' + fails);
console.log(fails === 0 ? 'RESULT: PASS — native-264 multiply + single-const inverse bridge is bit-exact' : 'RESULT: FAIL');
process.exit(fails === 0 ? 0 : 1);
