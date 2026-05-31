import { writeFileSync } from 'fs';
import { P, R, NUM_LIMBS, W, montmul_native22, montref, toLimbs22, fromLimbs22, N0, PLIMB, modinv } from './native22_host.mjs';
const N = Number(process.argv[2] ?? 150000);
const plimb = PLIMB, n0 = N0;
let s = 0x12345678n;
const rnd = () => { let a = 0n; for (let i = 0; i < 9; i++) { s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); a = (a << 30n) ^ (s >> 17n); } return ((a % P) + P) % P; };
const montIn = a => (a * (R % P)) % P;
let fails = 0, firstFail = null, maxlimb = 0;
function check(am, bm, label) {
  const aL = toLimbs22(am), bL = toLimbs22(bm);
  const outL = montmul_native22(aL, bL, n0, plimb);
  for (const x of outL) if (x > maxlimb) maxlimb = x;
  const got = ((fromLimbs22(outL) % P) + P) % P;
  const want = montref(am, bm);
  if (got !== want) { fails++; if (!firstFail) firstFail = { label, am, bm, got, want, outL }; }
}
// edges
const edges = [0n, 1n, 2n, P - 1n, P - 2n, R % P, (R * R) % P, (P + 1n) / 2n, (1n << 253n) % P];
for (const a of edges) for (const b of edges) check(montIn(a), montIn(b), `edge`);
// one-hot limbs (arbitrary residues with a single high limb set)
for (let k = 0; k < NUM_LIMBS; k++) { const am = (1n << (BigInt(k) * 22n)) % P; check(am, rnd(), `oh-a${k}`); check(rnd(), am, `oh-b${k}`); }
// raw residues
for (let i = 0; i < N; i++) check(rnd(), rnd(), `rand`);
const total = edges.length * edges.length + 2 * NUM_LIMBS + N;
const out = [];
out.push(fails === 0 ? `NATIVE22 montmul host: PASS (${total} trials, 0 fails)  maxlimb=${maxlimb} (<2^22=${maxlimb < 4194304})` : `NATIVE22 montmul host: FAIL ${fails}/${total}`);
if (firstFail) { out.push(`firstfail ${firstFail.label}`); out.push(` am=${firstFail.am.toString(16)}`); out.push(` got =${firstFail.got.toString(16)}`); out.push(` want=${firstFail.want.toString(16)}`); out.push(` outL=[${firstFail.outL.join(',')}]`); }
out.push(`N0=${n0} PLIMB=[${plimb.join(',')}]`);
writeFileSync('/tmp/vnative.txt', out.join('\n') + '\n');
console.log(out[0]);
