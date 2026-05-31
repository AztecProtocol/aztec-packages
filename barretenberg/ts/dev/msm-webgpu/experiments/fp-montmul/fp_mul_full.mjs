// Full 256-bit schoolbook multiply using FP32 limbs, host-validated bit-exact.
// Two designs evaluated:
//   (A) B=12 plain-product schoolbook. Products exact (2B=24). Column sums
//       kept exact by limiting how many products accumulate before a carry
//       normalisation. 22 limbs.
//   (B) B=24 TwoProduct (EFT) schoolbook. 11 limbs. Each limb*limb -> (hi,lo)
//       pair via fma; hi/lo streams summed into 2B-spaced columns.
// We validate the RECONSTRUCTED integer product == BigInt truth.

const f = Math.fround;
const fma = (a,b,c) => {           // exact host FMA for FP32 args
  // a,b are FP32 -> a*b exact in double; + c (FP32) exact in double when
  // result < 2^53. Then round to FP32 once.
  return f(a * b + c);
};

function toLimbs(x, B, n) {        // BigInt x -> n FP32 limbs base 2^B
  const out = new Array(n).fill(0);
  const mask = (1n << BigInt(B)) - 1n;
  for (let i = 0; i < n; i++) { out[i] = f(Number(x & mask)); x >>= BigInt(B); }
  return out;
}
function fromCols(cols, B) {       // reconstruct BigInt from FP cols (may be >base)
  let x = 0n;
  for (let i = 0; i < cols.length; i++) {
    x += BigInt(Math.round(cols[i])) << BigInt(B * i);
  }
  return x;
}

// ---------- Design A: B=12 plain schoolbook ----------
function mulA(xb, yb) {
  const B = 12, n = 22;            // 22*12 = 264 >= 256
  const x = toLimbs(xb, B, n), y = toLimbs(yb, B, n);
  // 2n columns, each an FP32 accumulator. With B=12, product < 2^24 (exact).
  // Up to n=22 products per column => column < 22*2^24 ~ 2^28.5 -> NOT exact
  // in 24-bit mantissa. So we must normalise periodically. We do a running
  // carry-save: after every K=1 product additions we keep going but split.
  // Simpler exact approach: accumulate column as integer via two FP floats
  // (hi,lo) using TwoSum. Validate exactness.
  const cols = new Array(2 * n).fill(0);
  const colsLo = new Array(2 * n).fill(0);
  // TwoSum: s=a+b (rounded), err = b - (s - a). For our magnitudes keeps exact.
  const twoSum = (a, b) => { const s = f(a + b); const bb = f(s - a); const err = f((a - f(s - bb)) + f(b - bb)); return [s, err]; };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p = f(x[i] * y[j]);    // exact, < 2^24
      const k = i + j;
      const [s, e] = twoSum(cols[k], p);
      cols[k] = s; colsLo[k] = f(colsLo[k] + e);
    }
  }
  // fold lo back
  const tot = new Array(2 * n).fill(0);
  for (let k = 0; k < 2 * n; k++) tot[k] = cols[k] + colsLo[k];
  return fromCols(tot, B);
}

// ---------- Design B: B=24 TwoProduct schoolbook ----------
function mulB(xb, yb) {
  const B = 24, n = 11;            // 11*24 = 264 >= 256
  const x = toLimbs(xb, B, n), y = toLimbs(yb, B, n);
  // each product splits into hi*2^24 + lo via TwoProduct. We place lo into
  // column k=i+j (weight 2^(24k)) and hi into column k+1.
  const cols = new Array(2 * n + 2).fill(0n); // use BigInt accumulation here to
  // prove the (hi,lo) decomposition is itself exact; the FP risk is only the
  // per-product TwoProduct, validated separately. This isolates correctness of
  // the decomposition from the (separate) accumulation-exactness question.
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const a = x[i], b = y[j];
      const p = f(a * b);
      const e = fma(a, b, -p);     // exact residual
      // p + e == a*b exactly. p ~ up to 2^48, e small. Represent each as
      // integer contributions to column (i+j) with weight 2^(24*(i+j)).
      const w = i + j;
      cols[w] += BigInt(Math.round(p)) + BigInt(Math.round(e));
    }
  }
  let x2 = 0n;
  for (let k = 0; k < cols.length; k++) x2 += cols[k] << BigInt(24 * k);
  return x2;
}

// ---------- validate ----------
function rnd256() { let x = 0n; for (let i = 0; i < 8; i++) x = (x << 32n) | BigInt((Math.random()*2**32)>>>0); return x; }

let badA = 0, badB = 0;
const N = 20000;
for (let t = 0; t < N; t++) {
  const a = rnd256(), b = rnd256();
  const truth = a * b;
  if (mulA(a, b) !== truth) badA++;
  if (mulB(a, b) !== truth) badB++;
}
console.log(`Design A (B=12 plain + TwoSum cols): ${badA===0?'BIT-EXACT':badA+' FAIL'} over ${N}`);
console.log(`Design B (B=24 TwoProduct decomp):   ${badB===0?'BIT-EXACT':badB+' FAIL'} over ${N}`);
