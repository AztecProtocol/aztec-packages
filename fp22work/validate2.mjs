import { writeFileSync } from 'fs';
import { P, R, NUM_LIMBS, montmul_fp22, montref, toLimbs22, fromLimbs22, N0_F32, PLIMB } from './fp22_host2.mjs';
const N = Number(process.argv[2] ?? 150000);
const plimb = PLIMB.map(Number), n0 = N0_F32;
let s = 0x12345678n;
const rnd = () => { let a = 0n; for (let i = 0; i < 9; i++) { s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n); a = (a << 30n) ^ (s >> 17n); } return ((a % P) + P) % P; };
const montIn = a => (a * (R % P)) % P;
let fails = 0, firstFail = null;
function check(am, bm, label) {
  const outL = montmul_fp22(toLimbs22(am).map(Number), toLimbs22(bm).map(Number), n0, plimb);
  const got = ((fromLimbs22(outL) % P) + P) % P;
  const want = montref(am, bm);
  if (got !== want) { fails++; if (!firstFail) firstFail = { label, am, bm, got, want }; }
}
const edges = [0n, 1n, 2n, P - 1n, P - 2n, R % P, (R * R) % P, (P + 1n) / 2n];
for (const a of edges) for (const b of edges) check(montIn(a), montIn(b), `edge`);
for (let k = 0; k < NUM_LIMBS; k++) { const am = (1n << (BigInt(k) * 22n)) % P; check(am, rnd(), `oh-a`); check(rnd(), am, `oh-b`); }
// raw residues (arbitrary 12x22 patterns < p) — exactly what flows in-pipe
for (let i = 0; i < N; i++) check(rnd(), rnd(), `rand`);
const total = edges.length * edges.length + 2 * NUM_LIMBS + N;
const out = [];
out.push(fails === 0 ? `HOST v2 fp22 montmul: PASS (${total} trials, 0 fails)` : `HOST v2 fp22: FAIL ${fails}/${total}`);
if (firstFail) out.push(`firstfail ${firstFail.label} got=${firstFail.got} want=${firstFail.want}`);
writeFileSync('/tmp/fp22_v2.txt', out.join('\n') + '\n');
console.log('WROTE', out[0]);
