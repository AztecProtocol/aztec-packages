// Standalone generator for the native 12x22-bit Montgomery multiply WGSL.
// Emits `fn montgomery_product_22(a8, b8) -> array<u32,8>` plus the helpers
// unpack8_to_22 / pack22_to_8. Fully unrolled, named scalars, compile-time
// indices only (no dynamic indexing — the LS-trap rule). Mirrors the host
// model in native22_host.mjs op-for-op.
//
// Usage: node gen_native22.mjs [r260|r264] > out.wgsl   (default r260)
// r260: produce x*y*2^-260 mod p (matches montgomery_product_f8 — drop-in).
// r264: produce x*y*2^-264 mod p (uniform-22 domain).

const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const NUM_LIMBS = 12, NH = 24, NCOL11 = 48, G11 = 3;
const WB = 22n, W = 1n << WB;
function modinv(a, m) { let [or, r] = [((a % m) + m) % m, m]; let [os, s] = [1n, 0n]; while (r) { const q = or / r;[or, r] = [r, or - q * r];[os, s] = [s, os - q * s]; } return ((os % m) + m) % m; }
const N0 = ((1n << WB) - modinv(P, 1n << WB)) % (1n << WB);
const PL = (() => { const o = []; let x = P; for (let i = 0; i < NUM_LIMBS; i++) { o.push(Number(x & (W - 1n))); x >>= WB; } return o; })();

export function genNative22(domain = 'r260') {
  const L = [];
  const e = s => L.push(s);

  // ---- unpack 8x u32 -> 12x22 (value-preserving bit-repack). limb m =
  // bits [22m, 22m+22) of the 256-bit integer. ----
  function unpackExpr(m) {
    const lo = 22 * m, end = lo + 22;
    const parts = [];
    let bit = lo;
    while (bit < end) {
      const w0 = Math.floor(bit / 32);
      if (w0 > 7) break; // bits >= 256 are zero (operands < 2^254)
      const off = bit % 32;
      const take = Math.min(32 - off, end - bit, 256 - bit);
      const sh = bit - lo;
      const maskv = (1 << take) - 1 >>> 0;
      let term = `((a[${w0}u] >> ${off}u) & ${maskv >>> 0}u)`;
      if (sh > 0) term = `(${term} << ${sh}u)`;
      parts.push(term);
      bit += take;
    }
    return parts.join(' | ');
  }
  e(`// === NATIVE 12x22-bit Montgomery multiply (montmul=fp22native) ===`);
  e(`// 11-bit operand split (Mali-safe: every half-product < 2^22, no fma),`);
  e(`// 48-col 11-bit f32 grid with G=${G11} floor renorm + integer-round-trip`);
  e(`// reassociation barrier; integer 22-bit CIOS reduce; ${domain === 'r260' ? '2^4 fixup to 2^-260' : 'pure 2^-264'}.`);
  e(`// Host bit-exact (native22_host.mjs): x*y*2^-${domain === 'r260' ? '260' : '264'} mod p.`);
  e(`const FP22_W11: f32 = 2048.0;`);
  e(`const FP22_W11_INV: f32 = 0.00048828125;`);
  e(`const FP22_N0_22: u32 = ${N0.toString()}u;`);
  e('');
  // p limbs as compile-time constants
  for (let i = 0; i < NUM_LIMBS; i++) e(`const FP22_P${i}: u32 = ${PL[i]}u;`);
  e('');

  e(`fn montgomery_product_22(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {`);
  // unpack a,b into 22-bit f32 limbs (named af0..af11, bf0..bf11)
  for (let m = 0; m < NUM_LIMBS; m++) e(`    let af${m}: f32 = f32(${unpackExpr(m).replace(/\ba\[/g, 'a[')});`);
  for (let m = 0; m < NUM_LIMBS; m++) e(`    let bf${m}: f32 = f32(${unpackExpr(m).replace(/\ba\[/g, 'b[')});`);
  // 11-bit half-limb split: xH/xL, yH/yL
  for (let m = 0; m < NUM_LIMBS; m++) {
    e(`    let aH${m}: f32 = floor(af${m} * FP22_W11_INV); let aL${m}: f32 = af${m} - aH${m} * FP22_W11;`);
  }
  for (let m = 0; m < NUM_LIMBS; m++) {
    e(`    let bH${m}: f32 = floor(bf${m} * FP22_W11_INV); let bL${m}: f32 = bf${m} - bH${m} * FP22_W11;`);
  }
  // half-limb arrays in index order: hx[0]=aL0, hx[1]=aH0, hx[2]=aL1, ...
  const hx = i => (i % 2 === 0 ? `aL${i / 2}` : `aH${(i - 1) / 2}`);
  const hy = i => (i % 2 === 0 ? `bL${i / 2}` : `bH${(i - 1) / 2}`);
  // 48 column accumulators
  for (let k = 0; k <= NCOL11; k++) e(`    var d${k}: f32 = 0.0;`);
  // schoolbook rows with G-renorm + integer-round-trip barrier
  let since = 0;
  for (let i = 0; i < NH; i++) {
    e(`    // row i=${i}`);
    for (let j = 0; j < NH; j++) {
      const k = i + j;
      e(`    d${k} = d${k} + ${hx(i)} * ${hy(j)};`);
    }
    if (++since >= G11) {
      e(`    {  // renorm (integer-round-trip reassociation barrier)`);
      for (let k = 0; k < NCOL11; k++) {
        e(`        { let hv: f32 = floor(d${k} * FP22_W11_INV); d${k} = f32(u32(d${k} - hv * FP22_W11)); d${k + 1} = d${k + 1} + hv; }`);
      }
      e(`    }`);
      since = 0;
    }
  }
  // final renorm (also barriered)
  e(`    {  // final renorm`);
  for (let k = 0; k < NCOL11; k++) {
    e(`        { let hv: f32 = floor(d${k} * FP22_W11_INV); d${k} = f32(u32(d${k} - hv * FP22_W11)); d${k + 1} = d${k + 1} + hv; }`);
  }
  e(`    }`);
  // fold 48x11 -> 24x22 u32 columns Pk (carry-propagated)
  e(`    // fold 48 x 11-bit cols -> 24 x 22-bit u32 product limbs`);
  for (let k = 0; k < NH; k++) {
    e(`    var P${k}: u32 = u32(d${2 * k}) + (u32(d${2 * k + 1}) << 11u);`);
  }
  e(`    var P${NH}: u32 = 0u;`);
  e(`    {  // carry-propagate product limbs to [0, 2^22)`);
  e(`        var c: u32 = 0u;`);
  for (let k = 0; k <= NH; k++) {
    e(`        { let v: u32 = P${k} + c; P${k} = v & 4194303u; c = v >> 22u; }`);
  }
  e(`    }`);
  // integer 22-bit CIOS reduce: 12 outer steps. t[k] = P[k]. We keep limbs
  // P0..P24 and reduce in place. m = (P[i]*n0) mod 2^22; P += m*p << (22*i).
  e(`    // integer 22-bit CIOS Montgomery reduce (no float, no 13-bit)`);
  for (let i = 0; i < NUM_LIMBS; i++) {
    e(`    {  // CIOS step i=${i}`);
    e(`        let m: u32 = (P${i} * FP22_N0_22) & 4194303u;`);
    e(`        var c: u32 = 0u;`);
    for (let j = 0; j < NUM_LIMBS; j++) {
      // v = P[i+j] + m*p[j] + c ; but m*p[j] can be up to (2^22-1)^2 ~ 2^44 —
      // exceeds u32. Split via the 22-bit half: use u32 mul lo + hi parts.
      // Instead compute the 44-bit product with two 22-bit pieces:
      //   prod = m * p[j]; lo = prod & 2^22-1; hi = prod >> 22.
      // WGSL u32 mul wraps at 2^32, so m*p[j] overflows. Decompose m and p[j]
      // each (<2^22) into 11-bit halves and accumulate — or use mulhilo on u32.
      // Simpler: m<2^22, p[j]<2^22; split p[j] into pjlo(11) pjhi(11):
      //   m*p[j] = m*pjlo + (m*pjhi)<<11. m*pjlo < 2^33 overflows too.
      // Use full 22x22 -> 44 via 11-bit decomposition of BOTH:
      //   handled by helper fp22_madd below.
      e(`        { let r2: vec2<u32> = fp22_madd(m, FP22_P${j}, P${i + j}, c); P${i + j} = r2.x; c = r2.y; }`);
    }
    // Unrolled carry propagation across the remaining limbs (no dynamic index):
    for (let k = i + NUM_LIMBS; k <= NH; k++) {
      e(`        { let v: u32 = P${k} + c; P${k} = v & 4194303u; c = v >> 22u; }`);
    }
    e(`    }`);
  }
  // result = limbs P12..P23 (12 limbs), possible top in P24.
  e(`    // residue = P12..P23 (12 x 22-bit), in [0, 2p)`);
  for (let j = 0; j < NUM_LIMBS; j++) e(`    var r${j}: u32 = P${NUM_LIMBS + j};`);
  e(`    var rtop: u32 = P${2 * NUM_LIMBS};`);
  // conditional subtract p (account for top limb)
  e(`    {  // conditional subtract p`);
  e(`        var brw: u32 = 0u; var ds: array<u32, ${NUM_LIMBS}>;`);
  for (let j = 0; j < NUM_LIMBS; j++) {
    e(`        { let t1: u32 = r${j} - FP22_P${j}; let v: u32 = t1 - brw; ds[${j}] = v & 4194303u; brw = (select(0u,1u,r${j} < FP22_P${j}) + select(0u,1u,t1 < brw)); }`);
  }
  // useD = (rtop>0) || (brw==0)
  e(`        let useD: bool = (rtop > 0u) || (brw == 0u);`);
  for (let j = 0; j < NUM_LIMBS; j++) e(`        r${j} = select(r${j}, ds[${j}], useD);`);
  e(`    }`);
  if (domain === 'r260') {
    // four doublings mod p to convert 2^-264 -> 2^-260
    e(`    // R264 -> R260 fixup: multiply by 2^4 (four doublings mod p)`);
    e(`    for (var dd: u32 = 0u; dd < 4u; dd = dd + 1u) {`);
    e(`        var s: array<u32, ${NUM_LIMBS}>; var c: u32 = 0u;`);
    for (let j = 0; j < NUM_LIMBS; j++) e(`        { let v: u32 = (r${j} << 1u) + c; s[${j}] = v & 4194303u; c = v >> 22u; }`);
    e(`        var brw: u32 = 0u; var ds: array<u32, ${NUM_LIMBS}>;`);
    for (let j = 0; j < NUM_LIMBS; j++) e(`        { let t1: u32 = s[${j}] - FP22_P${j}; let v: u32 = t1 - brw; ds[${j}] = v & 4194303u; brw = (select(0u,1u,s[${j}] < FP22_P${j}) + select(0u,1u,t1 < brw)); }`);
    e(`        let useD: bool = (c > 0u) || (brw == 0u);`);
    for (let j = 0; j < NUM_LIMBS; j++) e(`        r${j} = select(s[${j}], ds[${j}], useD);`);
    e(`    }`);
  }
  // pack 12x22 -> 8x u32
  e(`    // pack 12 x 22-bit -> 8 x u32`);
  e(`    var w: array<u32, 8>;`);
  for (let wi = 0; wi < 8; wi++) {
    const lo = 32 * wi, end = lo + 32;
    const parts = [];
    for (let m = 0; m < NUM_LIMBS; m++) {
      const mlo = 22 * m, mhi = mlo + 22;
      if (mhi <= lo || mlo >= end) continue;
      const shift = mlo - lo; // may be negative
      if (shift >= 0) parts.push(`(r${m} << ${shift}u)`);
      else parts.push(`(r${m} >> ${-shift}u)`);
    }
    e(`    w[${wi}u] = ${parts.join(' | ')};`);
  }
  e(`    return w;`);
  e(`}`);
  return L.join('\n');
}

// helper fp22_madd: returns vec2(lo, carry_out) = (acc + m*pj + cin) split as
// (low 22 bits, high bits). m, pj < 2^22; acc,cin small. m*pj is up to 2^44 so
// we decompose pj into 11-bit halves (m*half < 2^33 still overflows u32!). So
// decompose BOTH m and pj into 11-bit halves => 4 sub-products each < 2^22.
export function genMaddHelper() {
  return `
// (acc + m*pj + cin) -> vec2(low22, carryOut). m,pj in [0,2^22). Decomposes
// both into 11-bit halves so every sub-product < 2^22 (no u32 overflow), then
// reassembles in 22-bit radix. Pure integer — bit-exact on every GPU.
fn fp22_madd(m: u32, pj: u32, acc: u32, cin: u32) -> vec2<u32> {
    let mlo: u32 = m & 2047u; let mhi: u32 = m >> 11u;
    let plo: u32 = pj & 2047u; let phi: u32 = pj >> 11u;
    // m*pj = mlo*plo + (mlo*phi + mhi*plo)<<11 + (mhi*phi)<<22
    let s0: u32 = mlo * plo;            // < 2^22
    let s1: u32 = mlo * phi + mhi * plo; // < 2^23
    let s2: u32 = mhi * phi;            // < 2^22
    // low 22 bits: s0 + (s1<<11) folded, plus acc + cin
    // assemble into a 44-bit value across two u32 carefully.
    let low0: u32 = s0 + ((s1 & 2047u) << 11u) + acc + cin; // < 2^24
    let lo: u32 = low0 & 4194303u;
    let carryFromLow: u32 = low0 >> 22u; // small
    let hi: u32 = s2 + (s1 >> 11u) + carryFromLow; // < 2^23
    return vec2<u32>(lo, hi);
}
`;
}

// allow CLI use
if (import.meta.url === `file://${process.argv[1]}`) {
  const dom = process.argv[2] === 'r264' ? 'r264' : 'r260';
  process.stdout.write(genMaddHelper() + '\n' + genNative22(dom) + '\n');
}
