// Faithful check of the WGSL inverse contract under native R=2^264.
//
// WGSL fr_inv_by_loop contract (from the template comment):
//   "mp(d, R^3) = a^-1 * R   when a = a_real*R", where mp = montgomery_product
//    (radix R) and d = (a_real*R)^-1 reduced to canonical by the divstep core.
//
// The divstep CORE is integer-only (operates on f,g,d,e as plain integers mod p)
// and is therefore RADIX-AGNOSTIC: fed the SAME 256-bit integer `a`, it produces
// the SAME canonical d = a^-1 mod p regardless of which R the surrounding montmul
// uses. (Verified: the WGSL core has no R inside it — only p, p_inv mod 2^26.)
//
// So the ONLY R-dependent step is the final fold `mp(d, R^3)`. We prove that with
//   - mp        = the VERIFIED native 12x22 montmul (radix 2^264)
//   - R^3       = (2^264)^3 mod p   (the get_r_cubed constant for the 264 domain)
// the result is the correct 2^264-Montgomery inverse of the Montgomery input.
import { P, montmul as mm264, N0, PLIMB, toLimbs22, fromLimbs22, modinv } from './native22_r264_host.mjs';

const R = 1n << 264n;
const Rinv = modinv(R, P);
const R3 = (R * R % P) * (R % P) % P;            // get_r_cubed() for R=2^264

// native montmul on integers (both args reduced mod p)
function mp(a, b) { return fromLimbs22(mm264(toLimbs22(a % P), toLimbs22(b % P), N0, PLIMB)) % P; }

// model the divstep core's canonical output d for Montgomery input aMont:
//   it returns the canonical inverse of the *integer it is fed* = aMont, i.e.
//   d = aMont^-1 mod p.  (radix-agnostic; core has no R)
function divstepCoreInverse(aMont) { return modinv(aMont, P); }

function randF() { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 32n) | BigInt((Math.random() * 0x100000000) >>> 0); return v % P; }

let fails = 0;
const ex = [];
for (let i = 0; i < 50000; i++) {
  const aReal = randF();
  if (aReal === 0n) continue;
  const aMont = aReal * R % P;                  // 2^264-Montgomery input
  const d = divstepCoreInverse(aMont);          // canonical (aMont)^-1
  const got = mp(d, R3);                         // the WGSL final fold, native mp
  const exp = modinv(aReal, P) * R % P;          // a^-1 in 2^264-Montgomery form
  if (got !== exp) { fails++; if (ex.length < 3) ex.push({ aReal: aReal.toString(16), got: got.toString(16), exp: exp.toString(16) }); }
}
console.log('R^3 =', R3.toString(16).slice(0, 16) + '...');
console.log('native-264 inverse fold mp(d,R^3) == a^-1*R: trials=50000 fails=' + fails);
if (fails) { for (const e of ex) console.log(JSON.stringify(e)); }
console.log(fails === 0 ? 'RESULT: PASS — inverse bridges to 2^264 with ONLY the R^3 constant flipped' : 'RESULT: FAIL');
process.exit(fails === 0 ? 0 : 1);
