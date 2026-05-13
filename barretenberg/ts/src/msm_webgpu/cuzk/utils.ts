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
): Uint16Array => {
  const words = new Uint16Array(num_words);
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
