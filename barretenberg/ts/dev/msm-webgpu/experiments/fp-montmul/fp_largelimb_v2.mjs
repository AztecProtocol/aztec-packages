// Float-limb FP32 multiply, robust deferred-carry. Cleaner formulation:
// Two accumulator banks per column are unnecessary; the real requirement is just
// that no FP32 accumulator ever reaches 2^24 (so every add is exact-integer).
// We accumulate lo into acc[k] and hiScaled into acc[k+1], and FLUSH (renormalize
// every column) whenever we've added G rows since the last flush, chosen so the
// worst accumulator stays < 2^24. After a flush each acc[k] is in (-R/2, R/2], i.e.
// |acc| < 2^(B-1), so the NEXT G rows add at most G*(2 contributions)*2^B and must
// keep |acc| < 2^24:   2^(B-1) + 2*G*2^B < 2^24  => G < (2^24 - 2^(B-1))/2^(B+1).
//
// All ops mirror WGSL (Math.fround). Host FMA emulated exactly via double.
const f = Math.fround;
const fma = (x,y,z) => f(x*y + z);

function maxG(B) {
  return Math.max(1, Math.floor((2**24 - 2**(B-1)) / 2**(B+1)));
}

// FLOOR-based renorm. NOTE: we originally used the magic-constant accumulator split
// (v+Cn-Cn) but the Mali shader backend's fast-math reassociation FOLDS that chain to
// zero (hv==v => v-hv==0), eliminating the whole multiply (malioc A collapses 50->0).
// floor(v*Rinv) survives the backend and is bit-exact for B<=22. This matches the
// shipped WGSL exactly.
function renorm(acc, NCOL, R, Rinv) {
  for (let k = 0; k < NCOL + 1; k++) {
    const hv = f(Math.floor(f(acc[k] * Rinv))); // floor(acc/R), signed-correct
    acc[k]   = f(acc[k] - f(hv * R));           // remainder in [0,R)
    acc[k+1] = f(acc[k+1] + hv);
  }
}

function mul(aL, bL, B, G) {
  const NL = aL.length, NCOL = 2*NL;
  const R = 2**B, Rinv = f(1/R);
  // Product split: products a*b are NONnegative, in [0, 2^(2B)); Chi=2^(23+B) ok
  // (a*b+Chi stays in band [2^(23+B), 2^(24+B)) since 2B<=23+B for B<=23).
  const ChiB = f(2 ** (23 + B));
  // Accumulator split: acc values are SIGNED (can be negative). Use the centered
  // magic constant 1.5*2^(23+B) so v+Cn stays in band [2^(23+B),2^(24+B)) for
  // v in (-2^(23+B-1), +2^(23+B-1)) i.e. |v| < 2^(22+B) -- far above our |acc|<2^24.
  const Cn   = f(3 * 2 ** (22 + B));
  const acc = new Array(NCOL + 2).fill(0);
  let since = 0;
  for (let i = 0; i < NL; i++) {
    for (let j = 0; j < NL; j++) {
      const k = i + j;
      const t  = fma(aL[i], bL[j], ChiB);
      const hi = f(t - ChiB);
      const lo = fma(aL[i], bL[j], -hi);
      acc[k]   = f(acc[k] + lo);
      acc[k+1] = f(acc[k+1] + f(hi * Rinv));
    }
    if (++since >= G) { renorm(acc, NCOL, R, Rinv); since = 0; }
  }
  renorm(acc, NCOL, R, Rinv);
  // final: acc[k] in (-R/2,R/2]; produce nonneg base-R limbs with signed carry.
  // Use BigInt for the final reconstruction-by-carry to avoid FP fragility here;
  // (in WGSL the final pass is the same magic-split chain + a sign fixup, validated
  //  separately). Here we just verify the accumulators sum to the true product.
  let val = 0n;
  for (let k = 0; k < acc.length; k++) {
    if (!Number.isInteger(acc[k])) return { bad: true };
    val += BigInt(acc[k]) << BigInt(B*k);
  }
  return { val };
}

function check(B, G, trials) {
  const NL = Math.ceil(256/B);
  let bad = 0, nonint = 0;
  for (let t = 0; t < trials; t++) {
    const a = [], b = []; let A = 0n, Bb = 0n;
    for (let k = 0; k < NL; k++) {
      const av = Math.floor(Math.random()*2**B), bv = Math.floor(Math.random()*2**B);
      a.push(av); b.push(bv);
      A += BigInt(av)<<BigInt(B*k); Bb += BigInt(bv)<<BigInt(B*k);
    }
    const r = mul(a,b,B,G);
    if (r.bad) { nonint++; bad++; continue; }
    if (r.val !== A*Bb) bad++;
  }
  return { bad, nonint };
}

console.log('=== float-limb multiply, deferred carry, theory G and exactness ===');
for (const B of [16, 18, 20, 22]) {
  const NL = Math.ceil(256/B);
  const G = maxG(B);
  const flushes = Math.ceil(NL / G);
  const r = check(B, G, 100000);
  console.log(`B=${B} NL=${NL} prods=${NL*NL} maxG=${G} flushes=${flushes}: ` +
    `${r.bad===0?'EXACT(100k)':r.bad+' FAIL ('+r.nonint+' nonint)'}`);
}
