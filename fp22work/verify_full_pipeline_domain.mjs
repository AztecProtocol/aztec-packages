// THE decisive correctness model for fp22-native wiring.
//
// The existing 20x13 pipeline Montgomery radix is R260 = 2^260 mod p
// (r = 2^(20*13) mod p, confirmed in cuzk/utils.ts:73). Points enter as x*R260.
// My native multiply computes a*b*2^-264. Question: does splicing the native-264
// multiply into a pipeline whose VALUES are in R260-Montgomery form give the
// right MSM, or do I also have to convert entry to R264?
//
// We model an EC affine-add reduction (the walker's core) end to end:
//   entry:    coords scaled by R_in
//   hot loop: sub (R-agnostic), montmul = a*b*2^-R_mul, inverse returns R_mul-inv
//   exit:     read coords, rescale by R_in^-1 (the pipeline's de-Montgomery)
// and compare the de-Montgomerified result against the canonical (plain-integer)
// affine sum. Whichever (R_in, R_mul) pair reproduces the canonical sum is correct.
import { P, montmul as mm264, N0, PLIMB, toLimbs22, fromLimbs22, modinv } from './native22_r264_host.mjs';

const R260 = (1n << 260n) % P;
const R264 = (1n << 264n) % P;
const Rinv260 = modinv(1n << 260n, P);
const Rinv264 = modinv(1n << 264n, P);

const sub = (u, v) => ((u - v) % P + P) % P;
// native montmul (a*b*2^-264) on integers
const mpNative = (a, b) => fromLimbs22(mm264(toLimbs22(a % P), toLimbs22(b % P), N0, PLIMB)) % P;
// plain montmuls for the R260 reference
const mp260 = (a, b) => (a * b % P) * Rinv260p % P;
const Rinv260p = modinv(R260, P); // a*b*R260^-1 where R260 already = 2^260 mod p... use exact:
// Use exact 2^-260 to avoid R260-vs-2^260 confusion:
const mm260 = (a, b) => (a * b % P) * modinv(1n << 260n, P) % P;

// Montgomery inverse for radix 2^E given the divstep core returns canonical a^-1:
// inv_E(aMont) = (aMont)^-1 * (2^E)^? ... we use the proven contract:
//   the WGSL inverse returns: canonical_inv(g) folded by R^3 via the montmul.
//   With montmul radix 2^M and fold const R3=(2^F)^3, result = g^-1 * 2^(3F-M).
// For a SELF-CONSISTENT pipeline we need inv to map (a*R_in) -> a^-1*R_in, i.e.
//   the inverse's output Montgomery radix must equal R_in, AND it is computed with
//   the same montmul (radix R_mul). Solve fold so that:
//   mp_Rmul(canon_inv(a*R_in), R3) = a^-1 * R_in
//   canon_inv(a*R_in) = a^-1 * R_in^-1 (since core inverts the integer a*R_in)
//   => a^-1*R_in^-1 * R3 * 2^-Rmul = a^-1*R_in  => R3 = R_in^2 * 2^Rmul.
// So the fold constant is R_in^2 * 2^Rmul (mod p). This must hold for the pipeline
// to be consistent — it ties R_in and R_mul together through ONE constant.
function makeInv(R_in_exp, R_mul_mp) {
  const Rin = (1n << BigInt(R_in_exp)) % P;
  return (aMont, R3) => R_mul_mp(modinv(aMont, P), R3); // canon_inv * R3 via montmul
}

function ecAdd(x1, y1, x2, y2, mp, inv, R3) {
  const dx = sub(x2, x1), dy = sub(y2, y1);
  const invdx = inv(dx, R3);
  const lam = mp(dy, invdx);
  const x3 = sub(sub(mp(lam, lam), x1), x2);
  const y3 = sub(mp(lam, sub(x1, x3)), y1);
  return [x3, y3];
}

function randF() { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 32n) | BigInt((Math.random() * 0x100000000) >>> 0); return v % P; }

// canonical (plain) affine add as ground truth
function ecAddPlain(x1, y1, x2, y2) {
  const dx = sub(x2, x1), dy = sub(y2, y1);
  const lam = dy * modinv(dx, P) % P;
  const x3 = sub(sub(lam * lam % P, x1), x2);
  const y3 = sub(lam * (sub(x1, x3)) % P, y1);
  return [x3, y3];
}

function trial(R_in_exp, mp, mpForInv) {
  const Rin = (1n << BigInt(R_in_exp)) % P;
  const RinInv = modinv(1n << BigInt(R_in_exp), P);
  // consistent fold const R3 = R_in^2 * 2^Rmul ; but our mp* already fixes Rmul.
  // For native mp (Rmul=264): R3 = R_in^2 * 2^264.
  // For mm260   (Rmul=260): R3 = R_in^2 * 2^260.
  const Rmul = mp === mpNative ? 264n : 260n;
  const R3 = (Rin * Rin % P) * ((1n << Rmul) % P) % P;
  const inv = (aMont, r3) => mpForInv(modinv(aMont, P), r3);
  let bad = 0;
  for (let i = 0; i < 20000; i++) {
    const x1 = randF(), y1 = randF(), x2 = randF(), y2 = randF();
    if (x1 === x2) continue;
    const [cx, cy] = ecAddPlain(x1, y1, x2, y2);
    const X1 = x1 * Rin % P, Y1 = y1 * Rin % P, X2 = x2 * Rin % P, Y2 = y2 * Rin % P;
    const [X3, Y3] = ecAdd(X1, Y1, X2, Y2, mp, inv, R3);
    const gx = X3 * RinInv % P, gy = Y3 * RinInv % P;
    if (gx !== cx || gy !== cy) bad++;
  }
  return bad;
}

// Case 1 (CURRENT WIRING): entry R260, native-264 multiply  -> MIXED domain.
const mixed = trial(260, mpNative, mpNative);
// Case 2 (coherent native): entry R264, native-264 multiply.
const pureNative = trial(264, mpNative, mpNative);
// Sanity: entry R260, R260 multiply (the original pipeline) must pass.
const original = trial(260, mm260, mm260);

console.log('Case CURRENT-WIRING (entry R260 + native-264 mul):  fails=' + mixed + (mixed === 0 ? '  PASS' : '  FAIL <-- domain mismatch'));
console.log('Case COHERENT-NATIVE (entry R264 + native-264 mul): fails=' + pureNative + (pureNative === 0 ? '  PASS' : '  FAIL'));
console.log('Case ORIGINAL        (entry R260 + R260 mul):       fails=' + original + (original === 0 ? '  PASS' : '  FAIL'));
console.log('');
if (mixed === 0) {
  console.log('VERDICT: native-264 multiply is domain-COMPATIBLE with R260 entry. No entry change needed.');
} else if (pureNative === 0) {
  console.log('VERDICT: native-264 needs R264 ENTRY too. convert/decompress must scale by 2^264, not 2^260.');
} else {
  console.log('VERDICT: neither — re-derive.');
}
