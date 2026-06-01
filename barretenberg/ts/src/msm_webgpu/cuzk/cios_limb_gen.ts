// Parameterized CIOS Montgomery-multiply body generator for BN254 Fq across
// limb widths B ∈ {13,14,15,16}.  n = ceil(254/B) limbs (13→20, 14→19, 15→17,
// 16→16).  PRIMARY GOAL: fewer limbs ⇒ fewer live u32 accumulators ⇒ lower
// work-register count on Mali-G715 (cross the 32/64 occupancy cliff).
//
// This is the TypeScript port of dev/cios_limbgen.mjs (the validated generator;
// the host mirror cios_limb_validate.mjs proves each width bit-exact vs
// x·y·R⁻¹ mod p over 120k+ cases).  ShaderManager.renderCiosLimbMont(B) splices
// the body returned here over the Karatsuba scaffold's `fn montgomery_product`.
//
// Carry minimality (derived from a per-slot symbolic worst-case bound that
// follows the ACTUAL CIOS dataflow — mul terms + reduction terms + carry):
//   B=13: K=20 (pure defer)   → 20 carry-stmts (final pass only)  [repo sweet spot]
//   B=14: K=8  (norm every 8) → 57 carry-stmts (2 intra + final)
//   B=15: K=2  (norm every 2) → 153 carry-stmts (8 intra + final)
//   B=16: COLCARRY            → 544 carry-stmts (no fused K<=n stays < 2^32)
//
// All accumulators are named scalar `var`s with compile-time indices, fully
// unrolled — NEVER a dynamically-indexed array (that spills to thread-local
// memory and destroys the register thesis).

const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

function modinv(a: bigint, m: bigint): bigint {
  let [o, r] = [((a % m) + m) % m, m];
  let [os, s] = [1n, 0n];
  while (r !== 0n) {
    const q = o / r;
    [o, r] = [r, o - q * r];
    [os, s] = [s, os - q * s];
  }
  return ((os % m) + m) % m;
}

export interface CiosParams {
  B: number;
  n: number;
  Bb: bigint;
  RADIX: bigint;
  MASK: bigint;
  R: bigint;
  n0: bigint;
  p: bigint[];
}

// Montgomery-domain correction strategy for the delta<0 case (B=15: delta=-5).
//  - 'halve5' (default): |delta| SERIAL modular halvings (legacy path; keeps
//    cios13/14/16 byte-identical).
//  - 'div32' : single-pass Montgomery reduction by 2^|delta| (B=15 only). Cheaper,
//    algebraically identical (both are x.2^delta mod p).
export type Correction = 'halve5' | 'div32';

export function ciosParams(B: number): CiosParams {
  const n = Math.ceil(254 / B);
  const Bb = BigInt(B);
  const RADIX = 1n << Bb;
  const MASK = RADIX - 1n;
  const Rexp = BigInt(B * n);
  if (Rexp < 254n) throw new Error(`CIOS B=${B}: R=2^${B * n} < 2^254`);
  const R = 1n << Rexp;
  const np = modinv(P % RADIX, RADIX);
  const n0 = (RADIX - np) % RADIX;
  let x = P;
  const p: bigint[] = [];
  for (let i = 0; i < n; i++) {
    p.push(x & MASK);
    x >>= Bb;
  }
  return { B, n, Bb, RADIX, MASK, R, n0, p };
}

// Maximal periodic-normalize period K (=> fewest carries) for which the fused
// deferred CIOS per-slot symbolic worst-case stays < 2^32; null ⇒ COLCARRY.
function maxDeferK(pp: CiosParams): { K: number; intraPasses: number; carryStmts: number } | null {
  const { n, MASK, Bb } = pp;
  const U32 = 1n << 32n;
  const PROD = MASK * MASK;
  const tryK = (K: number): boolean => {
    const Bnd: bigint[] = new Array(n).fill(0n);
    let peak = 0n;
    for (let i = 0; i < n; i++) {
      const t = Bnd[0] + PROD;
      if (t + PROD > peak) peak = t + PROD;
      const c = (t + PROD) >> Bb;
      const nb: bigint[] = new Array(n).fill(0n);
      nb[0] = Bnd[1] + 2n * PROD + c;
      for (let j = 2; j < n - 1; j++) nb[j - 1] = Bnd[j] + 2n * PROD;
      nb[n - 2] = 2n * PROD;
      for (let k = 0; k < n; k++) {
        Bnd[k] = nb[k];
        if (Bnd[k] > peak) peak = Bnd[k];
      }
      if ((i + 1) % K === 0 && i + 1 < n) {
        let carry = 0n;
        for (let k = 0; k < n; k++) {
          const v = Bnd[k] + carry;
          carry = v >> Bb;
          Bnd[k] = MASK;
        }
      }
    }
    return peak < U32;
  };
  for (let K = n; K >= 1; K--) {
    if (tryK(K)) {
      const intraPasses = Math.max(0, Math.floor((n - 1) / K));
      return { K, intraPasses, carryStmts: intraPasses * n + n };
    }
  }
  return null;
}

// Module-scope WGSL consts the body needs (named *_B to avoid colliding with
// the 13-bit scaffold's WORD_SIZE/MASK/N0).
function emitConsts(pp: CiosParams): string {
  return (
    `const WS_B: u32 = ${pp.B}u;\n` +
    `const MASK_B: u32 = ${(1 << pp.B) - 1}u;\n` +
    `const N0_B: u32 = ${pp.n0}u;\n` +
    `const TWO_B: u32 = ${1 << pp.B}u;\n`
  );
}

// Recompose the scaffold's 20×13-bit BigInt input into n×B-bit limbs as
// compile-time-constant shifts (identity for B=13).
function emitUnpack(pp: CiosParams): string {
  const { n, B } = pp;
  if (B === 13) {
    let s = '';
    for (let k = 0; k < n; k++) s += `    let x${k}: u32 = (*x_ptr).limbs[${k}u];\n`;
    for (let k = 0; k < n; k++) s += `    let y${k}: u32 = (*y_ptr).limbs[${k}u];\n`;
    return s;
  }
  const emitOne = (name: string, src: string): string => {
    let out = '';
    for (let k = 0; k < n; k++) {
      const lo = k * B;
      const hi = Math.min((k + 1) * B, 260);
      const parts: string[] = [];
      let bit = lo;
      while (bit < hi) {
        const sLimb = Math.floor(bit / 13);
        const sBit = bit % 13;
        const take = Math.min(13 - sBit, hi - bit);
        const srcExpr = `${src}.limbs[${sLimb}u]`;
        const shifted = sBit === 0 ? srcExpr : `(${srcExpr} >> ${sBit}u)`;
        const m = (1 << take) - 1;
        const masked = `(${shifted} & ${m}u)`;
        const place = bit - lo;
        parts.push(place === 0 ? masked : `(${masked} << ${place}u)`);
        bit += take;
      }
      out += `    let ${name}${k}: u32 = ${parts.join(' | ')};\n`;
    }
    return out;
  };
  return emitOne('x', '(*x_ptr)') + emitOne('y', '(*y_ptr)');
}

// Montgomery-domain correction. The CIOS body internally reduces by
// R_int = 2^(B·n) (n outer iters), returning V = x·y·2^-(B·n) mod p — but the
// surrounding 20×13 pipeline works in R_pipe = 2^260 and expects x·y·2^-260.
// These coincide only for B=13 (13·20=260). For B≠13 we multiply V by the
// factor 2^delta mod p, delta = (B·n)−260 (B=14:+6, B=15:−5, B=16:−4), realized
// CHEAPLY (O(n·|delta|), not a second O(n²) multiply): repeated <<1 + cond-sub-p
// (delta>0) or repeated halve-mod-p (delta<0). MUST stay byte-identical to the
// validated host generator cios_limbgen.mjs (emitDomainCorrection).
function emitDomainCorrection(pp: CiosParams, correction: Correction = 'halve5'): string {
  const { n, p, B } = pp;
  const delta = B * n - 260;
  if (delta === 0) return '';
  let s = `\n    // Montgomery-domain correction: V·2^(${delta}) mod p so the result is in\n`;
  s += `    // the pipeline's 2^260 domain (internal CIOS reduces by 2^(${B}·${n})=2^${B * n}).\n`;
  s += emitCondSubP(pp, '    ');
  if (delta > 0) {
    for (let it = 0; it < delta; it++) {
      s += `    {   // <<1 (correction step ${it + 1}/${delta})\n`;
      s += '        var sh: u32 = 0u;\n';
      for (let k = 0; k < n; k++)
        s += `        { let v: u32 = (s${k} << 1u) | sh; sh = v >> WS_B; s${k} = v & MASK_B; }\n`;
      s += '    }\n';
      s += emitCondSubP(pp, '    ');
    }
  } else if (correction === 'div32' && delta === -5) {
    // CHEAP single-pass correction for B=15 (delta=-5): x.2^-5 mod p via ONE
    // Montgomery reduction by 2^5=32 (q = s + k5*p with q == 0 mod 32; then q>>5),
    // replacing the 5 SERIAL halvings.  k5 = (s mod 32).(-p^-1 mod 32) mod 32 =
    // (s0*9)&31  (-p^-1 mod 32 = 9 for BN254 Fq).  q == 0 mod 32 => low 5 bits
    // drop; shift the whole number right by 5.  Algebraically identical to halve5
    // (both x.2^-5 mod p) and validated bit-exact against it.
    const negpinv5 = (() => {
      const Rk = 32n;
      const p0 = P & (Rk - 1n);
      let inv = 1n;
      for (let i = 0; i < 5; i++) inv = (inv * (2n - p0 * inv)) & (Rk - 1n);
      return Number((Rk - inv) & (Rk - 1n));
    })();
    s += '    {   // correction: single-pass division by 2^5 (Montgomery reduction by 32)\n';
    s += `        let k5: u32 = (s0 * ${negpinv5}u) & 31u;   // -p^-1 mod 32 = ${negpinv5}\n`;
    s += '        var c5: u32 = 0u;\n';
    for (let k = 0; k < n; k++)
      s += `        let q${k}: u32 = s${k} + k5 * ${p[k]}u + c5; let lo${k}: u32 = q${k} & MASK_B; c5 = q${k} >> WS_B;\n`;
    s += '        let qn: u32 = c5;\n';
    for (let k = 0; k < n; k++) {
      const hi = k === n - 1 ? 'qn' : `lo${k + 1}`;
      s += `        s${k} = (lo${k} >> 5u) | ((${hi} << ${B - 5}u) & MASK_B);\n`;
    }
    s += '    }\n';
    s += emitCondSubP(pp, '    ');
  } else {
    const h = -delta;
    for (let it = 0; it < h; it++) {
      s += `    {   // halve mod p (correction step ${it + 1}/${h})\n`;
      s += '        let odd: u32 = s0 & 1u;\n';
      s += '        let amsk: u32 = 0u - odd;        // 0xffffffff if odd else 0\n';
      s += '        var ca: u32 = 0u;\n';
      for (let k = 0; k < n; k++)
        s += `        { let v: u32 = s${k} + (${p[k]}u & amsk) + ca; ca = v >> WS_B; s${k} = v & MASK_B; }\n`;
      s += '        // shift right by 1 across limbs; ca holds the bit above limb n-1.\n';
      s += `        var hi: u32 = ca;\n`;
      for (let k = n - 1; k >= 0; k--)
        s += `        { let cur: u32 = s${k}; s${k} = (cur >> 1u) | (hi << ${B - 1}u); hi = cur & 1u; }\n`;
      s += '    }\n';
    }
  }
  return s;
}

// Branchless conditional-subtract of p (radix 2^B) over s0..s_{n-1} in-place:
// s := s − p if s ≥ p else s. `ind` is the indentation prefix.
function emitCondSubP(pp: CiosParams, ind: string): string {
  const { n, p } = pp;
  let s = `${ind}{   // conditional subtract p (radix 2^B), branchless borrow chain.\n`;
  s += `${ind}    var brw: u32 = 0u;\n`;
  for (let k = 0; k < n; k++) {
    s +=
      `${ind}    let d${k}: u32 = (s${k} | TWO_B) - ${p[k]}u - brw; ` +
      `let r${k}: u32 = d${k} & MASK_B; brw = 1u - (d${k} >> WS_B);\n`;
  }
  s += `${ind}    let ge: u32 = 1u - brw;\n`;
  s += `${ind}    let msk: u32 = 0u - ge;\n`;
  for (let k = 0; k < n; k++) s += `${ind}    s${k} = (r${k} & msk) | (s${k} & ~msk);\n`;
  s += `${ind}}\n`;
  return s;
}

// Conditional subtract p (radix 2^B) over normalized s0..s_{n-1}, then repack
// n×B → 20×13 and return via the scaffold's conditional_reduce (idempotent).
function emitPackReduce(pp: CiosParams): string {
  const { n, p, B } = pp;
  let s = '\n    // conditional subtract p (radix 2^B), branchless borrow chain.\n';
  s += '    {\n';
  s += '        var brw: u32 = 0u;\n';
  for (let k = 0; k < n; k++) {
    s +=
      `        let d${k}: u32 = (s${k} | TWO_B) - ${p[k]}u - brw; ` +
      `let r${k}: u32 = d${k} & MASK_B; brw = 1u - (d${k} >> WS_B);\n`;
  }
  s += '        let ge: u32 = 1u - brw;\n';
  s += '        let msk: u32 = 0u - ge;\n';
  for (let k = 0; k < n; k++) s += `        s${k} = (r${k} & msk) | (s${k} & ~msk);\n`;
  s += '    }\n';
  s += '\n    var s: BigInt;\n';
  if (B === 13) {
    for (let k = 0; k < n; k++) s += `    s.limbs[${k}u] = s${k};\n`;
  } else {
    for (let k = 0; k < 20; k++) {
      const lo = k * 13;
      const hi = (k + 1) * 13;
      const parts: string[] = [];
      let bit = lo;
      while (bit < hi) {
        const sLimb = Math.floor(bit / B);
        if (sLimb >= n) break;
        const sBit = bit % B;
        const take = Math.min(B - sBit, hi - bit);
        const shifted = sBit === 0 ? `s${sLimb}` : `(s${sLimb} >> ${sBit}u)`;
        const m = (1 << take) - 1;
        const masked = `(${shifted} & ${m}u)`;
        const place = bit - lo;
        parts.push(place === 0 ? masked : `(${masked} << ${place}u)`);
        bit += take;
      }
      s += `    s.limbs[${k}u] = ${parts.length ? parts.join(' | ') : '0u'};\n`;
    }
  }
  s += '    return conditional_reduce(&s);\n';
  return s;
}

function genDefer(pp: CiosParams, K: number, correction: Correction = 'halve5'): string {
  const { n, p, B } = pp;
  const intra = Math.max(0, Math.floor((n - 1) / K));
  let s = '';
  s += `// REGIME-DEFER CIOS, B=${B}, n=${n}, normalize-period K=${K} (${intra} intra-loop\n`;
  s += `// carry pass${intra === 1 ? '' : 'es'} + 1 final). Fused mul+reduce, deferred carries;\n`;
  s += `// K is MAXIMAL period keeping the per-slot worst-case < 2^32 ⇒ fewest carries.\n`;
  s += `fn montgomery_product(x_ptr: ptr<function, BigInt>, y_ptr: ptr<function, BigInt>) -> BigInt {\n`;
  for (let k = 0; k < n; k++) s += `    var s${k}: u32 = 0u;\n`;
  s += emitUnpack(pp);
  s += '\n';
  for (let i = 0; i < n; i++) {
    s += `    {   // ===== outer i=${i} =====\n`;
    s += `        let t: u32 = s0 + x${i} * y0;\n`;
    s += `        let qi: u32 = (N0_B * (t & MASK_B)) & MASK_B;\n`;
    s += `        let c: u32 = (t + qi * ${p[0]}u) >> WS_B;\n`;
    s += `        s0 = s1 + x${i} * y1 + qi * ${p[1]}u + c;\n`;
    for (let j = 2; j < n - 1; j++) s += `        s${j - 1} = s${j} + x${i} * y${j} + qi * ${p[j]}u;\n`;
    // Top line absorbs s_{n-1} (carry sink from periodic normalize; 0 for K=n).
    s += `        s${n - 2} = s${n - 1} + x${i} * y${n - 1} + qi * ${p[n - 1]}u;\n`;
    s += `        s${n - 1} = 0u;\n`;
    s += `    }\n`;
    if ((i + 1) % K === 0 && i + 1 < n) {
      s += `    {   // periodic carry normalize (K=${K})\n`;
      s += `        var cn: u32 = 0u;\n`;
      for (let k = 0; k < n - 1; k++)
        s += `        { let v: u32 = s${k} + cn; cn = v >> WS_B; s${k} = v & MASK_B; }\n`;
      s += `        s${n - 1} = cn;\n`;
      s += `    }\n`;
    }
  }
  s += '\n    // final carry normalisation\n';
  s += '    var cc: u32 = 0u;\n';
  for (let k = 0; k < n; k++)
    s += `    { let v: u32 = s${k} + cc; cc = v >> WS_B; s${k} = v & MASK_B; }\n`;
  s += emitDomainCorrection(pp, correction);
  s += emitPackReduce(pp);
  s += `}\n`;
  return s;
}

function genColCarry(pp: CiosParams, correction: Correction = 'halve5'): string {
  const { n, p, B } = pp;
  let s = '';
  s += `// REGIME-COLCARRY CIOS, B=${B}, n=${n}. Canonical Acar/Koç CIOS, one product\n`;
  s += `// per column normalized immediately (no fused K<=n stays < 2^32 for B=16).\n`;
  s += `fn montgomery_product(x_ptr: ptr<function, BigInt>, y_ptr: ptr<function, BigInt>) -> BigInt {\n`;
  for (let k = 0; k <= n; k++) s += `    var s${k}: u32 = 0u;\n`;
  s += emitUnpack(pp);
  s += '\n';
  for (let i = 0; i < n; i++) {
    s += `    {   // ===== outer i=${i} =====\n`;
    s += `        var c: u32;\n`;
    s += `        { let v: u32 = s0 + x${i} * y0;            s0 = v & MASK_B; c = v >> WS_B; }\n`;
    for (let j = 1; j < n; j++)
      s += `        { let v: u32 = s${j} + x${i} * y${j} + c; s${j} = v & MASK_B; c = v >> WS_B; }\n`;
    s += `        { let v: u32 = s${n} + c;                   s${n} = v & MASK_B; }\n`;
    s += `        let m: u32 = (s0 * N0_B) & MASK_B;\n`;
    s += `        { let v: u32 = s0 + m * ${p[0]}u;          c = v >> WS_B; }\n`;
    for (let j = 1; j < n; j++)
      s += `        { let v: u32 = s${j} + m * ${p[j]}u + c;  s${j - 1} = v & MASK_B; c = v >> WS_B; }\n`;
    s += `        { let v: u32 = s${n} + c;                   s${n - 1} = v & MASK_B; c = v >> WS_B; }\n`;
    s += `        s${n} = c;\n`;
    s += `    }\n`;
  }
  s += emitDomainCorrection(pp, correction);
  s += emitPackReduce(pp);
  s += `}\n`;
  return s;
}

// Returns { consts, body } — `consts` are prepended at module scope before the
// spliced function; `body` is the `fn montgomery_product` replacement.
export function genCiosLimbBody(
  B: number,
  correction: Correction = 'halve5',
): { consts: string; body: string; regime: string; K: number | null } {
  const pp = ciosParams(B);
  const mk = maxDeferK(pp);
  if (mk) return { consts: emitConsts(pp), body: genDefer(pp, mk.K, correction), regime: 'DEFER', K: mk.K };
  return { consts: emitConsts(pp), body: genColCarry(pp, correction), regime: 'COLCARRY', K: null };
}
