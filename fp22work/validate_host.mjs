// Validate the host fp22 montmul model against the BigInt reference.
// Usage: node validate_host.mjs [N]
import {
  P, R, NUM_LIMBS, W,
  montmul_fp22, montref, modinv,
  toLimbs22, fromLimbs22,
  N0_F32, PLIMB,
} from './fp22_host.mjs';

const N = Number(process.argv[2] ?? 100000);

// deterministic PRNG (mulberry32-ish on BigInt) for reproducibility
let seed = 0x12345678n;
function nextRand() {
  // xorshift128-ish over 256 bits to get a uniform [0,p)
  let acc = 0n;
  for (let i = 0; i < 9; i++) {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    acc = (acc << 30n) ^ (seed >> 17n);
  }
  return ((acc % P) + P) % P;
}

function montIn(a) { return (a * (R % P)) % P; } // to Montgomery (R=2^264)

let fails = 0;
let firstFail = null;

function check(am, bm, label) {
  // am, bm are Montgomery residues (integers in [0,p))
  const aL = toLimbs22(am);
  const bL = toLimbs22(bm);
  const outL = montmul_fp22(aL.map(Number), bL.map(Number), N0_F32, PLIMB.map(Number));
  const got = ((fromLimbs22(outL) % P) + P) % P;
  const want = montref(am, bm);
  if (got !== want) {
    fails++;
    if (!firstFail) firstFail = { label, am, bm, got, want, outL };
  }
}

// --- edge cases ---
const edgesRaw = [0n, 1n, 2n, P - 1n, P - 2n, (R % P), (R * R) % P, (P + 1n) / 2n];
for (const a of edgesRaw) {
  for (const b of edgesRaw) {
    check(montIn(a), montIn(b), `edge(${a},${b})`);
  }
}
// one-hot limbs: am = 2^(22k) (as a residue), b random
for (let k = 0; k < NUM_LIMBS; k++) {
  const am = (1n << (BigInt(k) * 22n)) % P;
  check(am, nextRand(), `onehot-a-${k}`);
  check(nextRand(), am, `onehot-b-${k}`);
}
// also test raw residues directly (not via montIn) - these are arbitrary
// 12x22 limb patterns < p, exactly what flows in the pipeline.
for (let i = 0; i < N; i++) {
  check(nextRand(), nextRand(), `rand-${i}`);
}

const total = edgesRaw.length * edgesRaw.length + 2 * NUM_LIMBS + N;
if (fails === 0) {
  console.log(`HOST fp22 montmul: PASS  (${total} trials, 0 fails)`);
} else {
  console.log(`HOST fp22 montmul: FAIL  (${fails}/${total} fails)`);
  const f = firstFail;
  console.log('first fail:', f.label);
  console.log('  am =', f.am.toString(16));
  console.log('  bm =', f.bm.toString(16));
  console.log('  got  =', f.got.toString(16));
  console.log('  want =', f.want.toString(16));
  console.log('  diff =', ((f.got - f.want) % P).toString());
  process.exit(1);
}
