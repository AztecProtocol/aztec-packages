// Native 12×22-bit Montgomery multiply WGSL generator — R = 2^264 ONLY.
//
// THE PRINCIPLE: one representation (12 × 22-bit limbs), one R (2^264) fitted to
// it, native 22-bit Montgomery reduction. There is NO 13-bit limb, NO 2^260, and
// NO "domain correction" anywhere in this file. The emitted `montgomery_product_22`
// computes a·b·2^-264 mod p, canonical in [0,p).
//
// This is the in-tree TypeScript twin of fp22work/gen_native22_r264.mjs (host
// bit-exact, verify_native_r264.mjs: 5124 trials, 0 fails; constants checked by
// xcheck_gen_vs_host.mjs). It additionally emits a BigInt-ptr wrapper so the
// native multiply is a drop-in over the karat scaffold's `fn montgomery_product`.
//
// Multiply: 11-bit operand split (Mali-safe — every half-product < 2^22 is exact
// in f32 with NO fma, NO magic-constant snap, NO Dekker residual). 48-col 11-bit
// f32 grid, floor renorm every G=3 rows with an integer-round-trip reassociation
// barrier. Reduce: integer 22-bit CIOS; n0 = -p^-1 mod 2^22 = 418697 (PER-LIMB).

const NUM_LIMBS = 12;
const NH = 24;
const NCOL11 = 48;
const G11 = 3;
const WB = 22n;
const W = 1n << WB;

function modinvLocal(a: bigint, m: bigint): bigint {
  let [or, r] = [((a % m) + m) % m, m];
  let [os, s] = [1n, 0n];
  while (r !== 0n) {
    const q = or / r;
    [or, r] = [r, or - q * r];
    [os, s] = [s, os - q * s];
  }
  return ((os % m) + m) % m;
}

// Build the native body for a given prime p (defaults baked for BN254 below at
// the callsite). n0 and the 12 p-limbs are derived from p so this stays general.
export function genNative22R264Body(p: bigint): string {
  const N0 = ((1n << WB) - modinvLocal(p, 1n << WB)) % (1n << WB); // 418697 for BN254
  const PL: number[] = (() => {
    const o: number[] = [];
    let x = p;
    for (let i = 0; i < NUM_LIMBS; i++) {
      o.push(Number(x & (W - 1n)));
      x >>= WB;
    }
    return o;
  })();

  const maddHelper = `
// (acc + m*pj + cin) -> vec2(low22, carryOut). m,pj in [0,2^22). Decomposes both
// into 11-bit halves so every sub-product < 2^22 (no u32 overflow), then
// reassembles in 22-bit radix. Pure integer — bit-exact on every GPU.
fn fp22_madd(m: u32, pj: u32, acc: u32, cin: u32) -> vec2<u32> {
    let mlo: u32 = m & 2047u; let mhi: u32 = m >> 11u;
    let plo: u32 = pj & 2047u; let phi: u32 = pj >> 11u;
    let s0: u32 = mlo * plo;
    let s1: u32 = mlo * phi + mhi * plo;
    let s2: u32 = mhi * phi;
    let low0: u32 = s0 + ((s1 & 2047u) << 11u) + acc + cin;
    let lo: u32 = low0 & 4194303u;
    let carryFromLow: u32 = low0 >> 22u;
    let hi: u32 = s2 + (s1 >> 11u) + carryFromLow;
    return vec2<u32>(lo, hi);
}
`;

  const L: string[] = [];
  const e = (s: string): number => L.push(s);

  // Unpack a 22-bit limb m from an 8×32 word array `arr` (bit window [22m,22m+22)).
  function unpackExpr(arr: string, m: number): string {
    const lo = 22 * m;
    const end = lo + 22;
    const parts: string[] = [];
    let bit = lo;
    while (bit < end) {
      const w0 = Math.floor(bit / 32);
      if (w0 > 7) break;
      const off = bit % 32;
      const take = Math.min(32 - off, end - bit, 256 - bit);
      const sh = bit - lo;
      const maskv = ((1 << take) - 1) >>> 0;
      let term = `((${arr}[${w0}u] >> ${off}u) & ${maskv >>> 0}u)`;
      if (sh > 0) term = `(${term} << ${sh}u)`;
      parts.push(term);
      bit += take;
    }
    return parts.join(' | ');
  }

  e(`// === NATIVE 12x22-bit Montgomery multiply, R = 2^264 (no 13-bit, no correction) ===`);
  e(`const FP22_W11: f32 = 2048.0;`);
  e(`const FP22_W11_INV: f32 = 0.00048828125;`);
  e(`const FP22_N0_22: u32 = ${N0.toString()}u;   // -p^-1 mod 2^22 (per-limb)`);
  e('');
  for (let i = 0; i < NUM_LIMBS; i++) e(`const FP22_P${i}: u32 = ${PL[i]}u;`);
  e('');
  e(`fn montgomery_product_22(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {`);
  for (let m = 0; m < NUM_LIMBS; m++) e(`    let af${m}: f32 = f32(${unpackExpr('a', m)});`);
  for (let m = 0; m < NUM_LIMBS; m++) e(`    let bf${m}: f32 = f32(${unpackExpr('b', m)});`);
  for (let m = 0; m < NUM_LIMBS; m++)
    e(`    let aH${m}: f32 = floor(af${m} * FP22_W11_INV); let aL${m}: f32 = af${m} - aH${m} * FP22_W11;`);
  for (let m = 0; m < NUM_LIMBS; m++)
    e(`    let bH${m}: f32 = floor(bf${m} * FP22_W11_INV); let bL${m}: f32 = bf${m} - bH${m} * FP22_W11;`);
  const hx = (i: number): string => (i % 2 === 0 ? `aL${i / 2}` : `aH${(i - 1) / 2}`);
  const hy = (i: number): string => (i % 2 === 0 ? `bL${i / 2}` : `bH${(i - 1) / 2}`);
  for (let k = 0; k <= NCOL11; k++) e(`    var d${k}: f32 = 0.0;`);
  let since = 0;
  for (let i = 0; i < NH; i++) {
    for (let j = 0; j < NH; j++) {
      const k = i + j;
      e(`    d${k} = d${k} + ${hx(i)} * ${hy(j)};`);
    }
    if (++since >= G11) {
      e(`    {`);
      for (let k = 0; k < NCOL11; k++)
        e(`        { let hv: f32 = floor(d${k} * FP22_W11_INV); d${k} = f32(u32(d${k} - hv * FP22_W11)); d${k + 1} = d${k + 1} + hv; }`);
      e(`    }`);
      since = 0;
    }
  }
  e(`    {`);
  for (let k = 0; k < NCOL11; k++)
    e(`        { let hv: f32 = floor(d${k} * FP22_W11_INV); d${k} = f32(u32(d${k} - hv * FP22_W11)); d${k + 1} = d${k + 1} + hv; }`);
  e(`    }`);
  for (let k = 0; k < NH; k++) e(`    var P${k}: u32 = u32(d${2 * k}) + (u32(d${2 * k + 1}) << 11u);`);
  e(`    var P${NH}: u32 = 0u;`);
  e(`    {`);
  e(`        var c: u32 = 0u;`);
  for (let k = 0; k <= NH; k++) e(`        { let v: u32 = P${k} + c; P${k} = v & 4194303u; c = v >> 22u; }`);
  e(`    }`);
  for (let i = 0; i < NUM_LIMBS; i++) {
    e(`    {`);
    e(`        let m: u32 = (P${i} * FP22_N0_22) & 4194303u;`);
    e(`        var c: u32 = 0u;`);
    for (let j = 0; j < NUM_LIMBS; j++)
      e(`        { let r2: vec2<u32> = fp22_madd(m, FP22_P${j}, P${i + j}, c); P${i + j} = r2.x; c = r2.y; }`);
    for (let k = i + NUM_LIMBS; k <= NH; k++) e(`        { let v: u32 = P${k} + c; P${k} = v & 4194303u; c = v >> 22u; }`);
    e(`    }`);
  }
  for (let j = 0; j < NUM_LIMBS; j++) e(`    var r${j}: u32 = P${NUM_LIMBS + j};`);
  e(`    var rtop: u32 = P${2 * NUM_LIMBS};`);
  e(`    {`);
  e(`        var brw: u32 = 0u; var ds: array<u32, ${NUM_LIMBS}>;`);
  for (let j = 0; j < NUM_LIMBS; j++)
    e(`        { let t1: u32 = r${j} - FP22_P${j}; let v: u32 = t1 - brw; ds[${j}] = v & 4194303u; brw = (select(0u,1u,r${j} < FP22_P${j}) + select(0u,1u,t1 < brw)); }`);
  e(`        let useD: bool = (rtop > 0u) || (brw == 0u);`);
  for (let j = 0; j < NUM_LIMBS; j++) e(`        r${j} = select(r${j}, ds[${j}], useD);`);
  e(`    }`);
  // NOTE: NO 2^260 fixup. The residue is already a*b*2^-264 mod p — the native R.
  e(`    var w: array<u32, 8>;`);
  for (let wi = 0; wi < 8; wi++) {
    const lo = 32 * wi;
    const end = lo + 32;
    const parts: string[] = [];
    for (let m = 0; m < NUM_LIMBS; m++) {
      const mlo = 22 * m;
      const mhi = mlo + 22;
      if (mhi <= lo || mlo >= end) continue;
      const shift = mlo - lo;
      if (shift >= 0) parts.push(`(r${m} << ${shift}u)`);
      else parts.push(`(r${m} >> ${-shift}u)`);
    }
    e(`    w[${wi}u] = ${parts.join(' | ')};`);
  }
  e(`    return w;`);
  e(`}`);
  return maddHelper + '\n' + L.join('\n');
}

// ---- BigInt(20×13) <-> 8×32 word repack (pure bit-shuffle, SAME integer) ----
const BI_WS = 13;
const BI_NUM = 20;

function words8FromBigIntExprs(src: string, dst8: string): string {
  const lines: string[] = [];
  for (let wi = 0; wi < 8; wi++) {
    const lo = 32 * wi;
    const end = lo + 32;
    const parts: string[] = [];
    for (let li = 0; li < BI_NUM; li++) {
      const llo = BI_WS * li;
      const lhi = llo + BI_WS;
      if (lhi <= lo || llo >= end) continue;
      const shift = llo - lo;
      if (shift >= 0) parts.push(`(${src}.limbs[${li}u] << ${shift}u)`);
      else parts.push(`(${src}.limbs[${li}u] >> ${-shift}u)`);
    }
    lines.push(`    ${dst8}[${wi}u] = ${parts.join(' | ')};`);
  }
  return lines.join('\n');
}

function bigInt20x13FromWords8Exprs(wsrc: string, dst: string): string {
  const lines: string[] = [];
  const mask = (1 << BI_WS) - 1;
  for (let li = 0; li < BI_NUM; li++) {
    const llo = BI_WS * li;
    const lend = llo + BI_WS;
    const parts: string[] = [];
    let bit = llo;
    while (bit < lend) {
      const w0 = Math.floor(bit / 32);
      if (w0 > 7) break;
      const off = bit % 32;
      const take = Math.min(32 - off, lend - bit);
      const sh = bit - llo;
      const m = ((1 << take) - 1) >>> 0;
      let term = `((${wsrc}[${w0}u] >> ${off}u) & ${m >>> 0}u)`;
      if (sh > 0) term = `(${term} << ${sh}u)`;
      parts.push(term);
      bit += take;
    }
    lines.push(`    ${dst}.limbs[${li}u] = (${parts.join(' | ')}) & ${mask >>> 0}u;`);
  }
  return lines.join('\n');
}

// Native multiply exposed with the BigInt-ptr signature so it is a drop-in over
// the karat scaffold's `fn montgomery_product`. The 20×13<->8×32 repack is a pure
// bit-shuffle on the SAME integer (NOT a domain conversion).
export function genFp22NativeMontgomeryProductBody(p: bigint): string {
  const native = genNative22R264Body(p);
  const wrapper = `
// Native 12x22-bit R=2^264 Montgomery multiply with the BigInt-ptr signature.
// 20x13<->8x32 repack is a pure bit-shuffle on the SAME integer.
fn montgomery_product(x_ptr: ptr<function, BigInt>, y_ptr: ptr<function, BigInt>) -> BigInt {
    var xb: BigInt = *x_ptr;
    var yb: BigInt = *y_ptr;
    var aw8: array<u32, 8>;
${words8FromBigIntExprs('xb', 'aw8')}
    var bw8: array<u32, 8>;
${words8FromBigIntExprs('yb', 'bw8')}
    let rw8: array<u32, 8> = montgomery_product_22(aw8, bw8);
    var out: BigInt;
${bigInt20x13FromWords8Exprs('rw8', 'out')}
    return out;
}
`;
  return native + '\n' + wrapper;
}
