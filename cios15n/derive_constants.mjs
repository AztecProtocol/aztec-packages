// Derive and VERIFY BN254 Fq constants for the native 17x15 (R=2^255) representation.
// ONE rep, ONE R=2^255, native 15-bit. No 13-bit, no 2^260, no correction.
// Mirrors compute_misc_params(p,15) / gen_p_limbs(p,17,15) from the codebase.
// Writes constants.json + a dense human summary.

const p = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

const B = 15n;          // limb bits
const N = 17;           // number of limbs (15*17 = 255 >= 254)
const Bn = 1n << B;     // 2^15 = 32768
const MASK = Bn - 1n;   // 32767
const R = 1n << (B * BigInt(N)); // 2^255

function toLimbs(x, n = N) {
  const out = [];
  let v = x;
  for (let i = 0; i < n; i++) { out.push(Number(v & MASK)); v >>= B; }
  if (v !== 0n) throw new Error(`value does not fit in ${n} limbs of ${B} bits: ${x}`);
  return out;
}
function egcd(a, b) {
  if (b === 0n) return [a, 1n, 0n];
  const [g, x, y] = egcd(b, a % b);
  return [g, y, x - (a / b) * y];
}
function modinv(a, m) {
  const [g, x] = egcd(((a % m) + m) % m, m);
  if (g !== 1n) throw new Error('no inverse');
  return ((x % m) + m) % m;
}

// N0 = -p^{-1} mod 2^B
const pInvMod2B = modinv(p % Bn, Bn);
const N0 = (Bn - pInvMod2B) % Bn;
const check = (N0 * p) % Bn;                 // MUST be 2^B - 1 = 32767
const N0_ok = check === (Bn - 1n);

const Rmodp = R % p;
const R2 = (Rmodp * Rmodp) % p;
const R3 = (R2 * Rmodp) % p;

const p_fits_N = (() => { try { toLimbs(p); return true; } catch { return false; } })();
const p_lt_254 = p < (1n << 254n);
const R_gt_p = R > p;

const pLimbs = toLimbs(p);
const topLimb = pLimbs[N - 1];
const topLimbBits = topLimb === 0 ? 0 : topLimb.toString(2).length;

const out = {
  p: p.toString(),
  B: Number(B), N, R: R.toString(), MASK: Number(MASK),
  N0: Number(N0), N0_ok, N0_p_mod_2B: Number(check),
  p_limbs: pLimbs,
  R_limbs: toLimbs(Rmodp),
  R2_limbs: toLimbs(R2),
  R3_limbs: toLimbs(R3),
  Rmodp: Rmodp.toString(), R2: R2.toString(), R3: R3.toString(),
  p_fits_N, p_lt_254, R_gt_p, topLimb, topLimbBits,
};

import { writeFileSync } from 'node:fs';
writeFileSync(new URL('./constants.json', import.meta.url), JSON.stringify(out, null, 2));

const summary = [
  `N0=${N0}`, `N0_ok=${N0_ok}`, `N0p_mod2B=${check}(want32767)`,
  `p_fits17=${p_fits_N}`, `p_lt254=${p_lt_254}`, `R_gt_p=${R_gt_p}`,
  `topLimb=${topLimb}`, `topLimbBits=${topLimbBits}`,
  `p_limbs=[${pLimbs.join(',')}]`,
  `R_limbs=[${out.R_limbs.join(',')}]`,
  `R2_limbs=[${out.R2_limbs.join(',')}]`,
  `R3_limbs=[${out.R3_limbs.join(',')}]`,
].join(' ');
writeFileSync('/tmp/const_summary.txt', summary + '<<E');
console.log(summary);
