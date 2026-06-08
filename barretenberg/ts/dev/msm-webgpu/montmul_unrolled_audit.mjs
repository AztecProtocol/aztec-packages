// Direct, isolated audit of the unrolled f8_native CIOS montmul.
// Ports the WGSL montgomery_product_f8 (mont_pro_product_f8_native) to JS with
// EXACT u32 wrapping (>>> 0 at every WGSL op boundary), and compares to an
// exact bigint Montgomery reference x*y*R^-1 mod p (R = 2^260). Tracks the
// pre-wrap magnitude of every accumulator so a relaxed-accumulator u32 overflow
// is caught directly. No GPU, no platform — pure algorithm test.

const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const MASK = 8191; // 2^13 - 1
const WS = 13;
const R = (1n << 260n) % P; // 20 reduction steps of 2^-13 => R = 2^260
function egcd(a, b) {
  if (b === 0n) return [a, 1n, 0n];
  const [g, x, y] = egcd(b, a % b);
  return [g, y, x - (a / b) * y];
}
function modinv(a, m) {
  let [g, x] = egcd(((a % m) + m) % m, m);
  if (g !== 1n) throw new Error('no inverse');
  return ((x % m) + m) % m;
}
const RINV = modinv(R, P);

// p as twenty 13-bit limbs, taken verbatim from the WGSL window (qi * K terms).
const PL = [
  7495, 999, 1462, 280, 5058, 1350, 455, 4653, 362, 3260, 5655, 770, 7016, 2082, 1761, 5125, 305, 5015, 6419, 96,
];
// sanity: reconstruct p from limbs
let pCheck = 0n;
for (let k = 0; k < 20; k++) pCheck += BigInt(PL[k]) << BigInt(13 * k);
if (pCheck !== P) {
  console.log('FATAL: PL limbs do not reconstruct p', pCheck.toString(16));
  process.exit(1);
}
// N0 = -p^-1 mod 2^13
const N0 = Number(modinv((1n << 13n) - (P % (1n << 13n)), 1n << 13n));

function toWords8(v) {
  const w = new Array(8);
  for (let k = 0; k < 8; k++) {
    w[k] = Number((v >> BigInt(32 * k)) & 0xffffffffn) >>> 0;
  }
  return w;
}
function limbs20(v) {
  const l = new Array(20);
  for (let k = 0; k < 20; k++) l[k] = Number((v >> BigInt(13 * k)) & 8191n);
  return l;
}
function fromWords8(w) {
  let v = 0n;
  for (let k = 7; k >= 0; k--) v = (v << 32n) | BigInt(w[k] >>> 0);
  return v;
}

// Faithful WGSL working_x extraction (wd/off/hi). Returns 13-bit limb i of x.
function extract13(x, i) {
  const bit = 13 * i;
  const wd = bit >>> 5;
  const off = bit & 31;
  const nbr = x[Math.min(wd + 1, 7)] >>> 0;
  const hi = off > 19 && wd + 1 < 8 ? (nbr << (32 - off)) >>> 0 : 0;
  return (((x[Math.min(wd, 7)] >>> off) | hi) >>> 0) & MASK;
}

let maxPre = 0; // max pre-wrap value seen in any accumulator sum

function montmulWGSL(xWords, yBig, track) {
  const yv = limbs20(yBig);
  let s = new Array(19).fill(0);
  for (let i = 0; i < 20; i++) {
    const wx = extract13(xWords, i);
    const tPre = s[0] + wx * yv[0]; // WGSL: s0 + working_x*yv[0]
    if (track && tPre > maxPre) maxPre = tPre;
    const t = tPre >>> 0;
    const qi = ((N0 * (t & MASK)) >>> 0) & MASK;
    const cPre = t + qi * PL[0]; // WGSL: t + qi*7495
    if (track && cPre > maxPre) maxPre = cPre;
    const c = (cPre >>> 0) >>> WS;
    const sn = new Array(19);
    const a0 = s[1] + wx * yv[1] + qi * PL[1] + c; // s0 new
    if (track && a0 > maxPre) maxPre = a0;
    sn[0] = a0 >>> 0;
    for (let j = 1; j <= 17; j++) {
      const a = s[j + 1] + wx * yv[j + 1] + qi * PL[j + 1];
      if (track && a > maxPre) maxPre = a;
      sn[j] = a >>> 0;
    }
    const a18 = wx * yv[19] + qi * PL[19];
    if (track && a18 > maxPre) maxPre = a18;
    sn[18] = a18 >>> 0;
    s = sn;
  }
  // tail: carry-normalise
  for (let j = 0; j <= 17; j++) {
    s[j + 1] = (s[j + 1] + (s[j] >>> WS)) >>> 0;
    s[j] &= MASK;
  }
  const out = new Array(8);
  out[0] = (s[0] | (s[1] << 13) | (s[2] << 26)) >>> 0;
  out[1] = ((s[2] >>> 6) | (s[3] << 7) | (s[4] << 20)) >>> 0;
  out[2] = ((s[4] >>> 12) | (s[5] << 1) | (s[6] << 14) | (s[7] << 27)) >>> 0;
  out[3] = ((s[7] >>> 5) | (s[8] << 8) | (s[9] << 21)) >>> 0;
  out[4] = ((s[9] >>> 11) | (s[10] << 2) | (s[11] << 15) | (s[12] << 28)) >>> 0;
  out[5] = ((s[12] >>> 4) | (s[13] << 9) | (s[14] << 22)) >>> 0;
  out[6] = ((s[14] >>> 10) | (s[15] << 3) | (s[16] << 16) | (s[17] << 29)) >>> 0;
  out[7] = ((s[17] >>> 3) | ((s[18] & MASK) << 10) | (((s[18] >>> WS) & MASK) << 23)) >>> 0;
  // conditional reduce: subtract p if out >= p
  const P8 = toWords8(P);
  const d = new Array(8);
  let bc = 0;
  for (let k = 0; k < 8; k++) {
    const tt = (out[k] - P8[k]) >>> 0;
    const dk = (tt - bc) >>> 0;
    d[k] = dk;
    const b2 = (out[k] >>> 0 < P8[k] >>> 0 ? 1 : 0) | (tt >>> 0 < bc >>> 0 ? 1 : 0);
    bc = b2;
  }
  const reduce = bc === 0;
  for (let k = 0; k < 8; k++) out[k] = reduce ? d[k] : out[k];
  return fromWords8(out);
}

function reference(x, y) {
  return (x * y * RINV) % P;
}

// ---- validate the port: Montgomery identity montmul(x, R) == x ----
function montmul(xBig, yBig, track) {
  return montmulWGSL(toWords8(xBig), yBig, track);
}
let idOk = true;
for (let t = 0; t < 2000; t++) {
  const x =
    BigInt(
      '0x' +
        [...Array(8)]
          .map(() =>
            Math.floor(Math.random() * 4294967296)
              .toString(16)
              .padStart(8, '0'),
          )
          .join(''),
    ) % P;
  if (montmul(x, R) !== x) {
    idOk = false;
    console.log('identity FAIL x=0x' + x.toString(16));
    break;
  }
}
console.log('Montgomery identity montmul(x,R)==x over 2000 randoms:', idOk ? 'OK (port validated)' : 'BROKEN PORT');

// ---- fuzz for montmul != reference ----
function randField() {
  let v;
  do {
    v = BigInt(
      '0x' +
        [...Array(8)]
          .map(() =>
            Math.floor(Math.random() * 4294967296)
              .toString(16)
              .padStart(8, '0'),
          )
          .join(''),
    );
  } while (v >= P);
  return v;
}
const PM1 = P - 1n;
// craft a value whose 13-bit limbs are all maximal (<p) to maximise accumulator growth
let bigLimb = 0n;
for (let k = 0; k < 19; k++) bigLimb |= 8191n << BigInt(13 * k);
bigLimb &= (1n << 254n) - 1n;
if (bigLimb >= P) bigLimb %= P;

// Worst-case accumulator probe: all 13-bit limbs maximal (2^247-1 => limbs 0..18 == 8191)
// maximises relaxed-accumulator growth far beyond what random inputs reach.
const allMax = (1n << 247n) - 1n;
maxPre = 0;
montmul(allMax, allMax, true);
const wcAA = maxPre;
maxPre = 0;
for (let t = 0; t < 300000; t++) montmul(allMax, randField(), true);
const wcAR = maxPre;
maxPre = 0;
const wc = Math.max(wcAA, wcAR);
console.log(
  `worst-case accumulator (max-limb inputs): allMax*allMax=${wcAA}, allMax*rand(300k)=${wcAR}; ` +
    `headroom to 2^32 = ${4294967296 - wc} (${wc >= 4294967296 ? 'OVERFLOW' : 'safe'})`,
);

// Non-canonical (>= p) input pass: CIOS's single conditional subtract is only
// guaranteed to reduce inputs < p. Does a >= p input under-reduce (got = ref + k*p)?
function randFull() {
  return BigInt(
    '0x' +
      [...Array(8)]
        .map(() =>
          Math.floor(Math.random() * 4294967296)
            .toString(16)
            .padStart(8, '0'),
        )
        .join(''),
  );
}
let ncTested = 0,
  ncFails = 0,
  ncGEp = 0,
  ncFirst = null;
for (let t = 0; t < 1_000_000; t++) {
  const x = randFull(),
    y = randFull();
  if (x < P && y < P) continue; // only non-canonical cases
  const got = montmul(x, y, false);
  const ref = ((((x % P) * (y % P)) % P) * RINV) % P;
  ncTested++;
  if (got !== ref) {
    ncFails++;
    if (got >= P) ncGEp++;
    if (!ncFirst) ncFirst = [x, y, got, ref];
  }
}
console.log(
  `[>=p inputs] tested=${ncTested} fails=${ncFails} (got>=p non-canonical: ${ncGEp})` +
    (ncFirst ? ` firstDiff/p=${(ncFirst[2] - ncFirst[3]) % P === 0n ? (ncFirst[2] - ncFirst[3]) / P : 'n/a'}` : ''),
);

let fails = 0,
  firstFail = null,
  tested = 0;
const cases = [];
// adversarial fixed pairs
for (const a of [PM1, bigLimb, P - 2n, P >> 1n]) for (const b of [PM1, bigLimb, P - 2n, P >> 1n]) cases.push([a, b]);
for (const [x, y] of cases) {
  tested++;
  const got = montmul(x, y, true);
  const ref = reference(x, y);
  if (got !== ref) {
    fails++;
    if (!firstFail) firstFail = [x, y, got, ref];
  }
}
// random fuzz
for (let t = 0; t < 2_000_000; t++) {
  const x = randField(),
    y = randField();
  const got = montmul(x, y, true);
  const ref = reference(x, y);
  tested++;
  if (got !== ref) {
    fails++;
    if (!firstFail) firstFail = [x, y, got, ref];
    if (fails <= 3)
      console.log(
        `MISMATCH x=0x${x.toString(16)} y=0x${y.toString(16)}\n  got=0x${got.toString(16)}\n  ref=0x${ref.toString(16)}`,
      );
  }
  if (t % 500000 === 0 && t > 0)
    console.log(`  …${t} fuzzed, fails=${fails}, maxPreWrap=${maxPre} (2^32=${4294967296})`);
}
console.log('');
console.log(`tested=${tested} fails=${fails}`);
console.log(`max pre-wrap accumulator value = ${maxPre}  (u32 ceiling 2^32 = 4294967296; overflow if >=)`);
console.log(
  `overflow possible: ${maxPre >= 4294967296 ? 'YES — accumulator exceeds u32' : 'no — all sums stayed < 2^32'}`,
);
if (firstFail) {
  const [x, y, got, ref] = firstFail;
  console.log('FIRST FAIL:');
  console.log('  x  = 0x' + x.toString(16));
  console.log('  y  = 0x' + y.toString(16));
  console.log('  got= 0x' + got.toString(16));
  console.log('  ref= 0x' + ref.toString(16));
}
