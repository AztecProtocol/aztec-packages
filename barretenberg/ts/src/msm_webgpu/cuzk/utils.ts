import { assert } from "../assert.js";
import * as bigintCryptoUtils from "bigint-crypto-utils";

// Note on dropped helpers: the tal-webgpu utils.ts also contained
// `bigIntPointToExtPointType`, `extPointTypeToBigIntPoint`,
// `points_to_u8s_for_gpu`, `u8s_to_points`, `are_point_arr_equal`,
// `bigints_to_16_bit_words_for_gpu`, `genRandomFieldElement`. None of those
// are referenced from the BN254 MSM hot path; they're CPU/test scaffolding
// that pulled in @celo/bls12377js, @noble/curves and a custom FieldMath
// class. Drop the dependency chain by dropping the functions.

export const decompose_scalars = (
  scalars: bigint[],
  num_words: number,
  word_size: number,
): number[][] => {
  const as_limbs: number[][] = [];
  for (const scalar of scalars) {
    const limbs = to_words_le(scalar, num_words, word_size);
    as_limbs.push(Array.from(limbs));
  }
  const result: number[][] = [];
  for (let i = 0; i < num_words; i++) {
    const t = as_limbs.map((limbs) => limbs[i]);
    result.push(t);
  }
  return result;
};

export const decompose_scalars_signed = (
  scalars: bigint[],
  num_words: number,
  word_size: number,
): number[][] => {
  const l = 2 ** word_size;
  const shift = 2 ** (word_size - 1);

  const as_limbs: number[][] = [];

  for (const scalar of scalars) {
    const limbs = to_words_le(scalar, num_words, word_size);
    const signed_slices: number[] = Array(limbs.length).fill(0);

    let carry = 0;
    for (let i = 0; i < limbs.length; i++) {
      signed_slices[i] = limbs[i] + carry;
      if (signed_slices[i] >= l / 2) {
        signed_slices[i] = (l - signed_slices[i]) * -1;
        if (signed_slices[i] === -0) {
          signed_slices[i] = 0;
        }

        carry = 1;
      } else {
        carry = 0;
      }
    }

    if (carry === 1) {
      console.error(scalar);
      throw new Error("final carry is 1");
    }

    as_limbs.push(Array.from(signed_slices).map((x) => x + shift));
  }

  const result: number[][] = [];
  for (let i = 0; i < num_words; i++) {
    const t = as_limbs.map((limbs) => limbs[i]);
    result.push(t);
  }
  return result;
};

export const u8s_to_bigints = (
  u8s: Uint8Array,
  num_words: number,
  word_size: number,
): bigint[] => {
  const num_u8s_per_scalar = num_words * 4;
  const result = [];
  for (let i = 0; i < u8s.length / num_u8s_per_scalar; i++) {
    const p = i * num_u8s_per_scalar;
    const s = u8s.slice(p, p + num_u8s_per_scalar);
    result.push(u8s_to_bigint(s, num_words, word_size));
  }
  return result;
};

export const u8s_to_bigints_without_assertion = (
  u8s: Uint8Array,
  num_words: number,
  word_size: number,
): bigint[] => {
  const num_u8s_per_scalar = num_words * 4;
  const result = [];
  for (let i = 0; i < u8s.length / num_u8s_per_scalar; i++) {
    const p = i * num_u8s_per_scalar;
    const s = u8s.slice(p, p + num_u8s_per_scalar);
    result.push(u8s_to_bigint_without_assertion(s, num_words, word_size));
  }
  return result;
};

export const u8s_to_bigint = (
  u8s: Uint8Array,
  num_words: number,
  word_size: number,
): bigint => {
  const a = new Uint16Array(u8s.buffer);
  const limbs: number[] = [];
  for (let i = 0; i < a.length; i += 2) {
    limbs.push(a[i]);
  }

  return from_words_le(new Uint16Array(limbs), num_words, word_size);
};

export const u8s_to_bigint_without_assertion = (
  u8s: Uint8Array,
  num_words: number,
  word_size: number,
): bigint => {
  const a = new Uint16Array(u8s.buffer);
  const limbs: number[] = [];
  for (let i = 0; i < a.length; i += 2) {
    limbs.push(a[i]);
  }

  return from_words_le_without_assertion(new Uint16Array(limbs), num_words, word_size);
};

export const numbers_to_u8s_for_gpu = (vals: number[]): Uint8Array => {
  const max = 2 ** 32;
  for (const val of vals) {
    assert(val < max);
  }
  const b = new Uint32Array(vals);
  return new Uint8Array(b.buffer);
};

export const u8s_to_numbers = (u8s: Uint8Array): number[] => {
  const result: number[] = [];
  assert(u8s.length % 4 === 0);
  for (let i = 0; i < u8s.length / 4; i++) {
    const n0 = u8s[i * 4];
    const n1 = u8s[i * 4 + 1];
    result.push(n1 * 256 + n0);
  }
  return result;
};

export const u8s_to_numbers_32 = (u8s: Uint8Array): number[] => {
  const result: number[] = [];
  assert(u8s.length % 4 === 0);
  for (let i = 0; i < u8s.length / 4; i++) {
    const n0 = u8s[i * 4];
    const n1 = u8s[i * 4 + 1];
    const n2 = u8s[i * 4 + 2];
    const n3 = u8s[i * 4 + 3];
    result.push(n3 * 16777216 + n2 * 65536 + n1 * 256 + n0);
  }
  return result;
};

export const bigints_to_u8_for_gpu = (
  vals: bigint[],
  num_words: number,
  word_size: number,
): Uint8Array => {
  const size = vals.length * num_words * 4;
  const result = new Uint8Array(size);

  for (let i = 0; i < vals.length; i++) {
    const bytes = bigint_to_u8_for_gpu(vals[i], num_words, word_size);
    for (let j = 0; j < bytes.length; j++) {
      result[i * bytes.length + j] = bytes[j];
    }
  }

  return result;
};

export const bigint_to_u8_for_gpu = (
  val: bigint,
  num_words: number,
  word_size: number,
): Uint8Array => {
  const result = new Uint8Array(num_words * 4);
  const limbs = to_words_le(BigInt(val), num_words, word_size);
  for (let i = 0; i < limbs.length; i++) {
    const i4 = i * 4;
    result[i4] = limbs[i] & 255;
    result[i4 + 1] = limbs[i] >> 8;
  }

  return result;
};

export const gen_wgsl_limbs_code = (
  val: bigint,
  var_name: string,
  num_words: number,
  word_size: number,
): string => {
  const limbs = to_words_le(val, num_words, word_size);
  let r = "";
  for (let i = 0; i < limbs.length; i++) {
    r += `    ${var_name}.limbs[${i}]` + " = " + limbs[i].toString() + "u;\n";
  }
  return r;
};

// f32 variant of gen_wgsl_limbs_code: emits `<n>.0` literals instead of `<n>u`.
// Used by the FMA-Montgomery (23-bit f32 limb) path. Does its own
// little-endian limb extraction because `to_words_le` returns a
// Uint16Array, which truncates any word_size > 16.
export const gen_wgsl_limbs_code_f32 = (
  val: bigint,
  var_name: string,
  num_words: number,
  word_size: number,
): string => {
  const mask = (BigInt(1) << BigInt(word_size)) - BigInt(1);
  let r = "";
  let v = val;
  for (let i = 0; i < num_words; i++) {
    const limb = Number(v & mask);
    r += `    ${var_name}.limbs[${i}]` + " = " + limb.toString() + ".0;\n";
    v >>= BigInt(word_size);
  }
  return r;
};

export const gen_p_limbs_f32 = (
  p: bigint,
  num_words: number,
  word_size: number,
): string => {
  return gen_wgsl_limbs_code_f32(p, "p", num_words, word_size);
};

export const gen_barrett_domb_m_limbs = (
  m: bigint,
  num_words: number,
  word_size: number,
): string => {
  return gen_wgsl_limbs_code(m, "m", num_words, word_size);
};

export const gen_p_limbs = (
  p: bigint,
  num_words: number,
  word_size: number,
): string => {
  return gen_wgsl_limbs_code(p, "p", num_words, word_size);
};

// Emit a comma-separated `array<i32, 9>` initializer list for the 9 × 29-bit
// limbs of a non-negative bigint. Used to inject the BN254 base-field modulus
// `p` into the apply_matrix bench shader as a literal `BigIntBY` initializer.
//
// Pre: p in [0, 2^256). Post: e.g. "1, 2, 3, 4, 5, 6, 7, 8, 9" suitable for
// substitution inside `BigIntBY(array<i32, 9>({{{ p_limbs_by }}}))`.
export const gen_p_limbs_by_initializer = (p: bigint): string => {
  if (p < 0n) {
    throw new Error("gen_p_limbs_by_initializer: negative input");
  }
  const BY_NUM_LIMBS = 9;
  const BY_LIMB_BITS = 29n;
  const BY_LIMB_MASK = (1n << BY_LIMB_BITS) - 1n;
  const limbs: string[] = [];
  // 9 × 29-bit limb decomposition matches Wasm9x29::fromBigint exactly.
  // Limbs are non-negative for inputs in [0, 2^256) since the top limb's
  // bit 28 is 0 for p < 2^254.
  const mask64 = (1n << 64n) - 1n;
  const d0 = p & mask64;
  const d1 = (p >> 64n) & mask64;
  const d2 = (p >> 128n) & mask64;
  const d3 = (p >> 192n) & mask64;
  limbs.push((d0 & BY_LIMB_MASK).toString());
  limbs.push(((d0 >> 29n) & BY_LIMB_MASK).toString());
  limbs.push((((d0 >> 58n) & 0x3Fn) | ((d1 & 0x7FFFFFn) << 6n)).toString());
  limbs.push(((d1 >> 23n) & BY_LIMB_MASK).toString());
  limbs.push((((d1 >> 52n) & 0xFFFn) | ((d2 & 0x1FFFFn) << 12n)).toString());
  limbs.push(((d2 >> 17n) & BY_LIMB_MASK).toString());
  limbs.push((((d2 >> 46n) & 0x3FFFFn) | ((d3 & 0x7FFn) << 18n)).toString());
  limbs.push(((d3 >> 11n) & BY_LIMB_MASK).toString());
  limbs.push(((d3 >> 40n) & 0xFFFFFFn).toString());
  if (limbs.length !== BY_NUM_LIMBS) {
    throw new Error(`gen_p_limbs_by_initializer: expected ${BY_NUM_LIMBS} limbs, got ${limbs.length}`);
  }
  return limbs.join(", ");
};

// p_inv = p^(-1) mod 2^58 for the BY safegcd 2-adic correction step. WASM's
// `Wasm9x29::apply_matrix` accepts this as a single u64; WGSL has no native
// u64 so we split it as two u32s — low 32 bits and high (up to 26) bits. The
// caller injects these as constants into the by_apply_matrix_de Mustache
// substitution `{{ p_inv_by_lo }}` / `{{ p_inv_by_hi }}`.
//
// Returns { lo, hi } where (lo + hi * 2^32) === p_inv and 0 <= lo < 2^32,
// 0 <= hi < 2^26.
export const compute_by_p_inv_split = (p: bigint): { lo: number; hi: number } => {
  const BATCH = 58n;
  const MASK_BATCH = (1n << BATCH) - 1n;
  if (p < 1n) {
    throw new Error("compute_by_p_inv_split: p must be positive");
  }
  if ((p & 1n) === 0n) {
    throw new Error("compute_by_p_inv_split: p must be odd");
  }
  // Hensel lift: invert p mod 2, then double precision each Newton step
  // until we have >= 58 bits. inv_n satisfies p * inv_n ≡ 1 mod 2^n.
  // Newton's formula: inv' = inv * (2 - p * inv) mod 2^(2k), valid when
  // inv was valid mod 2^k. Start at k=1 (inv=1 works since p is odd).
  let inv = 1n;
  let cur = 1n;
  while (cur < BATCH) {
    cur *= 2n;
    const mask = (1n << cur) - 1n;
    inv = (inv * (2n - p * inv)) & mask;
  }
  inv &= MASK_BATCH;
  if (((p * inv) & MASK_BATCH) !== 1n) {
    throw new Error("compute_by_p_inv_split: Hensel lift failed sanity check");
  }
  const lo = Number(inv & ((1n << 32n) - 1n));
  const hi = Number((inv >> 32n) & ((1n << 32n) - 1n));
  return { lo, hi };
};

// p_inv = p^(-1) mod 2^26 for the Option A BY safegcd inverse driver
// (BATCH=26 / NUM_OUTER=29 on 20 x 13-bit BigInt). Mirrors compute_by_p_inv_split
// but at 26-bit precision so it fits in a single u32 WGSL constant.
//
// Pre:  p odd, positive.
// Post: low 26 bits of p^(-1) mod 2^26 packed in a u32, satisfying
//       (p * out) & ((1<<26) - 1) === 1.
export const compute_by_p_inv_a = (p: bigint): number => {
  const BATCH = 26n;
  const MASK_BATCH = (1n << BATCH) - 1n;
  if (p < 1n) {
    throw new Error("compute_by_p_inv_a: p must be positive");
  }
  if ((p & 1n) === 0n) {
    throw new Error("compute_by_p_inv_a: p must be odd");
  }
  let inv = 1n;
  let cur = 1n;
  while (cur < BATCH) {
    cur *= 2n;
    const mask = (1n << cur) - 1n;
    inv = (inv * (2n - p * inv)) & mask;
  }
  inv &= MASK_BATCH;
  if (((p * inv) & MASK_BATCH) !== 1n) {
    throw new Error("compute_by_p_inv_a: Hensel lift failed sanity check");
  }
  return Number(inv);
};

export const gen_r_limbs = (
  r: bigint,
  num_words: number,
  word_size: number,
): string => {
  return gen_wgsl_limbs_code(r, "r", num_words, word_size);
};

export const gen_d_limbs = (
  d: bigint,
  num_words: number,
  word_size: number,
): string => {
  return gen_wgsl_limbs_code(d, "d", num_words, word_size);
};

export const gen_mu_limbs = (
  p: bigint,
  num_words: number,
  word_size: number,
): string => {
  let x = BigInt(1);
  while (BigInt(2) ** x < p) {
    x += BigInt(1);
  }

  const mu = BigInt(4) ** x / p;
  return gen_wgsl_limbs_code(mu, "mu", num_words, word_size);
};

export const to_words_le = (
  val: bigint,
  num_words: number,
  word_size: number,
): Uint32Array => {
  // Uint32Array, not Uint16Array: a limb holds word_size bits, and word_size can
  // exceed 16 (the 13×21 representation uses 21-bit limbs). Uint16Array silently
  // truncated bits [16, word_size), corrupting every generated BigInt constant.
  const words = new Uint32Array(num_words);
  const mask = BigInt(2 ** word_size - 1);
  for (let i = 0; i < num_words; i++) {
    const idx = num_words - 1 - i;
    const shift = BigInt(idx * word_size);
    const w = (val >> shift) & mask;
    words[idx] = Number(w);
  }
  return words;
};

export const from_words_le = (
  words: Uint16Array,
  num_words: number,
  word_size: number,
): bigint => {
  assert(num_words == words.length);
  let val = BigInt(0);
  for (let i = 0; i < num_words; i++) {
    assert(words[i] < 2 ** word_size);
    assert(words[i] >= 0);
    val +=
      BigInt(2) ** BigInt((num_words - i - 1) * word_size) *
      BigInt(words[num_words - 1 - i]);
  }
  return val;
};

export const from_words_le_without_assertion = (
  words: Uint16Array,
  num_words: number,
  word_size: number,
): bigint => {
  let val = BigInt(0);
  for (let i = 0; i < num_words; i++) {
    val +=
      BigInt(2) ** BigInt((num_words - i - 1) * word_size) *
      BigInt(words[num_words - 1 - i]);
  }
  return val;
};

export const calc_num_words = (word_size: number, p_width: number): number => {
  let num_words = Math.floor(p_width / word_size);
  while (num_words * word_size <= p_width) {
    num_words++;
  }

  if (p_width === 377 && word_size === 15) {
    num_words = 27;
  }

  return num_words;
};

export const compute_mont_radix = (num_words: number, word_size: number) => {
  return BigInt(2) ** BigInt(num_words * word_size);
};

// p^(-1) mod 2^bits via Hensel/Newton lifting. p must be odd.
export const compute_mod_inverse_pow2 = (
  p: bigint,
  bits: number,
): number => {
  assert((p & BigInt(1)) === BigInt(1), "p must be odd to invert mod 2^k");
  const mod = BigInt(1) << BigInt(bits);
  const mask = mod - BigInt(1);
  let y = BigInt(1);
  for (let i = 0; i < bits; i++) {
    y = (y * (BigInt(2) - p * y)) & mask;
  }
  assert(((p * y) & mask) === BigInt(1));
  return Number(y);
};

export const compute_mont_constants = (
  p: bigint,
  r: bigint,
  word_size: number,
) => {
  const egcdResult: { g: bigint; x: bigint; y: bigint } =
    bigintCryptoUtils.eGcd(r, p);
  let rinv = egcdResult.x;
  let pprime = egcdResult.y;

  if (rinv < BigInt(0)) {
    rinv = (rinv % p) + p;
  }

  if (pprime < BigInt(0)) {
    pprime = (pprime % r) + r;
  }

  let x = (r * rinv - p * pprime) % p;
  if (x < BigInt(0)) {
    x += p;
  }
  assert(x === BigInt(1));
  assert((r * rinv) % p === BigInt(1));
  assert((p * pprime) % r === BigInt(1));

  const neg_n_inv = r - pprime;
  const n0 = Number(neg_n_inv % BigInt(2) ** BigInt(word_size));

  return { rinv, n0 };
};

export const compute_misc_params = (
  p: bigint,
  word_size: number,
): {
  num_words: number;
  word_size: number;
  max_terms: number;
  k: number;
  nsafe: number;
  n0: bigint;
  r: bigint;
  rinv: bigint;
  barrett_domb_m: bigint;
} => {
  assert(word_size > 0);
  const p_width = p.toString(2).length;
  const max_int_width = 32;
  const num_words = calc_num_words(word_size, p_width);
  const max_terms = num_words * 2;

  const rhs = 2 ** max_int_width;
  let k = 1;
  while (k * 2 ** (2 * word_size) <= rhs) {
    k += 1;
  }

  const nsafe = Math.floor(k / 2);
  const r = compute_mont_radix(num_words, word_size);
  const { rinv, n0 } = compute_mont_constants(p, r, word_size);

  const z = num_words * word_size - p_width;
  const barrett_domb_m = BigInt(2 ** (2 * p_width + z)) / p;

  return {
    word_size,
    num_words,
    max_terms,
    k,
    nsafe,
    n0: BigInt(n0),
    r: r % p,
    rinv,
    barrett_domb_m,
  };
};
