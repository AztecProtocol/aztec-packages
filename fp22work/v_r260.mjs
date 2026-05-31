// Validate the native-22 montmul AGAINST montgomery_product_f8's exact
// integer function: f(x,y) = x*y*2^-260 mod p (R260, the walker domain).
// Inputs are arbitrary integers in [0,p) (the 8x u32 packed residues), fed
// through unpack->12x22 (value-preserving), native-22 multiply, 2^4 fixup.
import { writeFileSync } from 'fs';
import {
  P, R, NUM_LIMBS, W, montmul_native22, toLimbs22, fromLimbs22, N0, PLIMB, modinv,
} from './native22_host.mjs';

const N = Number(process.argv[2] ?? 150000);
const plimb = PLIMB, n0 = N0;
const r260inv = modinv((1n << 260n) % P, P);
// the exact integer function montgomery_product_f8 computes:
const montf8 = (x, y) => (((x % P) * (y % P)) % P * r260inv) % P;

let s = 0x2468ace0n;
const rnd = () => { let a = 0n; for (let i = 0; i < 9; i++) { s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); a = (a << 30n) ^ (s >> 17n); } return ((a % P) + P) % P; };

let fails = 0, firstFail = null, maxlimb = 0;
function check(x, y, label) {
  // x,y are integers in [0,p) — exactly the packed 8x u32 residue values.
  const xL = toLimbs22(x), yL = toLimbs22(y);
  const outL = montmul_native22(xL, yL, n0, plimb);
  for (const v of outL) if (v > maxlimb) maxlimb = v;
  const got = ((fromLimbs22(outL) % P) + P) % P;
  const want = montf8(x, y);
  if (got !== want) { fails++; if (!firstFail) firstFail = { label, x, y, got, want, outL }; }
}
// edges: include p-1, 0, 1, R260, etc. as raw residues (NOT montIn — these
// are the literal packed values the walker holds).
const edges = [0n, 1n, 2n, P - 1n, P - 2n, (1n << 255n) % P, (P + 1n) / 2n, (1n << 13n), (1n << 260n) % P];
for (const a of edges) for (const b of edges) check(a, b, `edge`);
for (let k = 0; k < NUM_LIMBS; k++) { const a = (1n << (BigInt(k) * 22n)) % P; check(a, rnd(), `oh${k}`); check(rnd(), a, `ohb${k}`); }
for (let i = 0; i < N; i++) check(rnd(), rnd(), `rand`);
const total = edges.length * edges.length + 2 * NUM_LIMBS + N;
const out = [];
out.push(fails === 0
  ? `NATIVE22 vs montgomery_product_f8 (R260): PASS (${total} trials, 0 fails) maxlimb<2^22=${maxlimb < 4194304}`
  : `NATIVE22 vs mont_f8 (R260): FAIL ${fails}/${total}`);
if (firstFail) { out.push(`firstfail ${firstFail.label} x=${firstFail.x.toString(16)} y=${firstFail.y.toString(16)}`); out.push(` got =${firstFail.got.toString(16)}`); out.push(` want=${firstFail.want.toString(16)}`); }
writeFileSync('/tmp/vr260.txt', out.join('\n') + '\n');
console.log(out[0]);
