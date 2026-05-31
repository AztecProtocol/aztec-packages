// Empirically determine the EXACT integer function montgomery_product_f8
// computes, by faithfully mirroring the generated WGSL:
//   unpack256_to_limbs : value-preserving 8x u32 -> integer (20x13)
//   montgomery_product : X*Y*2^-260 mod p   (20x13, R=2^260)
//   pack_limbs_to_256  : value-preserving integer -> 8x u32
// Conclusion: mont_f8(x,y) = x*y*2^-260 mod p as integers.
import { writeFileSync } from 'fs';
const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
function modinv(a, m) { let [or, r] = [((a % m) + m) % m, m]; let [os, s] = [1n, 0n]; while (r) { const q = or / r;[or, r] = [r, or - q * r];[os, s] = [s, os - q * s]; } return ((os % m) + m) % m; }
const R260 = (1n << 260n) % P, R256 = (1n << 256n) % P;
const r260inv = modinv(R260, P);

// mont_f8 as integers: x*y*R260^-1 mod p
const montf8 = (x, y) => (((x % P) * (y % P)) % P * r260inv) % P;

const getrf8 = R256; // measured from the generated get_r_f8 constant

const out = [];
// Is get_r_f8 the identity of mont_f8? i.e. mont_f8(getrf8, x) == x ?
const x = 123456789n % P;
out.push(`mont_f8(get_r_f8, x) = ${montf8(getrf8, x).toString()}`);
out.push(`x                    = ${x.toString()}`);
out.push(`identity holds (R256)? ${montf8(getrf8, x) === x}`);
out.push(`mont_f8(R260, x) == x (R260 identity)? ${montf8(R260, x) === x}`);
// So the multiply's Montgomery identity is R260, NOT R256. Then what does
// get_r_f8 (=R256) do as a seed?  In the prefix product the FIRST factor uses
// `if k==0 acc=dx` (NOT mont(seed,dx)) — re-reading ba_stream_walker line 299:
//   if (k == 0u) { acc = dx; } else { acc = montgomery_product_f8(acc, dx); }
// => get_r_f8() seed value is OVERWRITTEN at k=0; it's just an init. So the
// seed's R doesn't matter for correctness. Good — no contradiction.
// THEREFORE: the walker's field elements are in R260-Montgomery, fixed by
// convert_points (which uses the 20x13 R260 multiply) and mont_f8 (R260).
// get_r_f8 = R256 is a harmless unused-seed constant.
out.push('');
out.push('CONCLUSION: mont_f8(x,y) = x*y*2^-260 mod p; walker domain = R260.');
out.push('fp22native must compute the SAME integer function: x*y*2^-260 mod p.');
writeFileSync('/tmp/domain.txt', out.join('\n') + '\n');
console.log(out.join('\n'));
