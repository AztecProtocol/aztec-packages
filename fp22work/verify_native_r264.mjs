// Host bit-exact validator for the NATIVE 12x22 montmul, R = 2^264.
// Compares native22_r264_host.montmul (pure-native, NO r260, NO correction)
// against the BigInt reference x*y*2^-264 mod p. Structured edges + random.
import { P, R, NUM_LIMBS, W, N0, PLIMB, montmul, toLimbs22, fromLimbs22, modinv } from './native22_r264_host.mjs';

const Rinv = modinv(R, P);
const refMul = (a, b) => (a * b * Rinv) % P;
function randField() { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 32n) | BigInt((Math.random() * 0x100000000) >>> 0); return v % P; }
function one(a, b) { const got = fromLimbs22(montmul(toLimbs22(a), toLimbs22(b), N0, PLIMB)) % P; const exp = refMul(a, b); return { ok: got === exp, got, exp }; }

let fails = 0, n = 0; const ex = [];
function check(a, b, tag) { n++; const r = one(a, b); if (!r.ok) { fails++; if (ex.length < 5) ex.push({ tag, a: a.toString(16), b: b.toString(16), got: r.got.toString(16), exp: r.exp.toString(16) }); } }

const edges = [0n, 1n, 2n, P - 1n, P - 2n, (P - 1n) / 2n, R % P, (R * R) % P, W - 1n, (1n << 253n) % P];
for (const a of edges) for (const b of edges) check(a, b, 'edge');
for (let k = 0; k < NUM_LIMBS; k++) { const a = (1n << (22n * BigInt(k))) % P; check(a, (a - 1n + P) % P, 'limb'); check(P - a, P - 1n, 'limb2'); }
const N = parseInt(process.argv[2] || '120000', 10);
for (let i = 0; i < N; i++) check(randField(), randField(), 'rand');

console.log('NATIVE-R264 montmul host test: trials=' + n + ' fails=' + fails);
console.log('reference = x*y*2^-264 mod p ; R = 2^264 ; per-limb N0(2^22) = ' + N0);
if (fails) { console.log('FAIL:'); for (const e of ex) console.log(JSON.stringify(e)); process.exit(1); }
else console.log('RESULT: PASS (bit-exact vs 2^-264, zero r260, zero correction)');
