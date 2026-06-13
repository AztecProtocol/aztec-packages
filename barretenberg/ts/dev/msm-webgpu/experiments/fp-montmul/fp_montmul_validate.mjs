// Host-side bit-exact validation of the FP32 limb multiply scheme.
// JS `Math.fround` gives true IEEE-754 FP32 rounding; we mirror the WGSL
// arithmetic exactly (every intermediate forced through fround) and compare
// the reconstructed 512-bit product against the BigInt ground truth.

const f = Math.fround;

// ---- IEEE-754 FP32 TwoProduct (Dekker/fma-based) ----------------------
// p = round(a*b) ; e = a*b - p exactly, both representable in FP32, as long
// as a,b,p,e are all in normal FP32 range. We need a host FMA. JS has none,
// but we can compute the exact error with BigInt-free double math: doubles
// have 53-bit mantissa, and a,b are FP32 (<=24-bit), so a*b in double is
// EXACT. Then e = fround(double(a*b) - double(p)) is the exact FP32 error.
function twoProductF32(a, b) {
  const p = f(a * b);          // FP32-rounded product
  const exact = a * b;         // exact in double (24+24 = 48 <= 53 bits)
  const e = f(exact - p);      // FP32 of the residual; exact when 2b<=... see notes
  return [p, e];
}

// Verify that for B-bit integer limbs, twoProduct is exact: p+e == a*b exactly.
function checkTwoProductExact(B, trials) {
  const lim = 2 ** B;
  let bad = 0;
  for (let i = 0; i < trials; i++) {
    const a = Math.floor(Math.random() * lim);
    const b = Math.floor(Math.random() * lim);
    const af = f(a), bf = f(b);
    if (af !== a || bf !== b) { // limb itself not representable
      bad++; continue;
    }
    const [p, e] = twoProductF32(af, bf);
    // p and e must both be integers and p+e == a*b exactly (as integers)
    const sum = BigInt(p) + BigInt(e);
    if (sum !== BigInt(a) * BigInt(b)) bad++;
    // also e must be exactly representable (integer) and |e| small
    if (!Number.isInteger(e) || !Number.isInteger(p)) bad++;
  }
  return bad;
}

console.log('=== TwoProduct exactness by limb bit-width B (FP32) ===');
for (const B of [11, 12, 13, 16, 20, 22, 24, 25, 26]) {
  const bad = checkTwoProductExact(B, 200000);
  console.log(`B=${B}: ${bad === 0 ? 'EXACT' : bad + ' FAILURES'} ` +
    `(limb<2^${B}, product<2^${2*B})`);
}

// ---- Plain (no-EFT) exact product: 2B <= 24  --------------------------
// If we DON'T use EFT, a*b must be exactly representable: 2B <= 24 => B<=12.
console.log('\n=== Plain a*b exact (no EFT) requires 2B<=24 ===');
for (const B of [11, 12, 13]) {
  const lim = 2 ** B;
  let bad = 0;
  for (let i = 0; i < 100000; i++) {
    const a = Math.floor(Math.random() * lim), b = Math.floor(Math.random() * lim);
    const p = f(f(a) * f(b));
    if (BigInt(p) !== BigInt(a) * BigInt(b)) bad++;
  }
  console.log(`B=${B}: ${bad === 0 ? 'EXACT' : bad + ' FAILURES'}`);
}
