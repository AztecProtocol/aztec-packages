// No-GPU oracle for the Phase-0 BN254 scalar-field (F_r) Montgomery suite.
//
// The real GPU execution is validated in the browser (dev/sumcheck-webgpu),
// which Node/CI cannot run. This test instead closes the *codegen* loop that
// is the actual Phase-0 risk: it renders the real `gen_fr_ops_test_shader`
// output for field='scalar' and proves every baked constant (the modulus
// limbs, N0, R_INV, P_INV_MOD_2W) is the correct F_r value — not the base
// field's — and that (P_LIMB, N0) form a self-consistent Montgomery system
// via a full CIOS multiply checked against native BigInt modmul.

import { describe, expect, it } from '@jest/globals';

import { ShaderManager } from './cuzk/shader_manager.js';
import { BN254_CURVE_CONFIG } from './cuzk/curve_config.js';
import { BN254_BASE_FIELD, BN254_SCALAR_FIELD } from './cuzk/bn254.js';
import { compute_mod_inverse_pow2 } from './cuzk/utils.js';

const WORD_SIZE = 13;
const NUM_WORDS = 20;

function modinv(a: bigint, m: bigint): bigint {
  let [or, r] = [((a % m) + m) % m, m];
  let [os, s] = [1n, 0n];
  while (r !== 0n) {
    const q = or / r;
    [or, r] = [r, or - q * r];
    [os, s] = [s, os - q * s];
  }
  return ((os % m) + m) % m;
}

function toLimbs(v: bigint, numWords = NUM_WORDS, wordSize = WORD_SIZE): bigint[] {
  const mask = (1n << BigInt(wordSize)) - 1n;
  const out: bigint[] = [];
  let x = v;
  for (let i = 0; i < numWords; i++) {
    out.push(x & mask);
    x >>= BigInt(wordSize);
  }
  return out;
}

function fromLimbs(limbs: bigint[], wordSize = WORD_SIZE): bigint {
  let v = 0n;
  for (let i = limbs.length - 1; i >= 0; i--) v = (v << BigInt(wordSize)) + limbs[i];
  return v;
}

/** Reconstruct the integer from indexed WGSL consts `const <PREFIX>_<i>: u32 = <v>u;`. */
function parseIndexedConsts(src: string, prefix: string, count: number): bigint {
  const limbs = new Array<bigint>(count).fill(0n);
  const re = new RegExp(`const\\s+${prefix}_(\\d+)\\s*:\\s*u32\\s*=\\s*(\\d+)u;`, 'g');
  let m: RegExpExecArray | null;
  const seen = new Set<number>();
  while ((m = re.exec(src)) !== null) {
    const idx = Number(m[1]);
    limbs[idx] = BigInt(m[2]);
    seen.add(idx);
  }
  if (seen.size !== count) {
    throw new Error(`${prefix}: expected ${count} consts, found ${seen.size}`);
  }
  return fromLimbs(limbs);
}

/** Reconstruct the integer materialized by `get_p()` (its body is `p.limbs[i] = <v>u;`). */
function parseGetP(src: string): bigint {
  const limbs = new Array<bigint>(NUM_WORDS).fill(0n);
  const re = /\bp\.limbs\[(\d+)\]\s*=\s*(\d+)u;/g;
  let m: RegExpExecArray | null;
  const seen = new Set<number>();
  while ((m = re.exec(src)) !== null) {
    limbs[Number(m[1])] = BigInt(m[2]);
    seen.add(Number(m[1]));
  }
  if (seen.size !== NUM_WORDS) throw new Error(`get_p: expected ${NUM_WORDS} limbs, found ${seen.size}`);
  return fromLimbs(limbs);
}

function parseScalarConst(src: string, name: string): bigint {
  const m = src.match(new RegExp(`const\\s+${name}\\s*:\\s*u32\\s*=\\s*(\\d+)u;`));
  if (!m) throw new Error(`const ${name} not found`);
  return BigInt(m[1]);
}

/** Full CIOS Montgomery multiply using exactly (pLimbs, n0) — the same n0-driven
 *  reduction the shader's standard reduce performs. Inputs/outputs in [0, p). */
function montMulCIOS(a: bigint, b: bigint, p: bigint, n0: bigint): bigint {
  const W = 1n << BigInt(WORD_SIZE);
  const mask = W - 1n;
  const pL = toLimbs(p);
  const aL = toLimbs(a);
  const bL = toLimbs(b);
  const t = new Array<bigint>(NUM_WORDS + 2).fill(0n);
  for (let i = 0; i < NUM_WORDS; i++) {
    let carry = 0n;
    for (let j = 0; j < NUM_WORDS; j++) {
      const s = t[j] + aL[j] * bL[i] + carry;
      t[j] = s & mask;
      carry = s >> BigInt(WORD_SIZE);
    }
    let s = t[NUM_WORDS] + carry;
    t[NUM_WORDS] = s & mask;
    t[NUM_WORDS + 1] += s >> BigInt(WORD_SIZE);
    const m = (t[0] * n0) & mask;
    carry = 0n;
    for (let j = 0; j < NUM_WORDS; j++) {
      const ss = t[j] + m * pL[j] + carry;
      t[j] = ss & mask;
      carry = ss >> BigInt(WORD_SIZE);
    }
    s = t[NUM_WORDS] + carry;
    t[NUM_WORDS] = s & mask;
    t[NUM_WORDS + 1] += s >> BigInt(WORD_SIZE);
    for (let j = 0; j <= NUM_WORDS; j++) t[j] = t[j + 1];
    t[NUM_WORDS + 1] = 0n;
  }
  let res = fromLimbs(t.slice(0, NUM_WORDS + 1));
  while (res >= p) res -= p;
  return res;
}

describe('Fr (scalar-field) shader codegen', () => {
  const smFr = new ShaderManager(4, 1 << 8, BN254_CURVE_CONFIG, false, 'scalar');
  const src = smFr.gen_fr_ops_test_shader(64);

  it('targets F_r with the 20x13 layout', () => {
    expect(smFr.p).toBe(BN254_SCALAR_FIELD);
    expect(smFr.num_words).toBe(NUM_WORDS);
    expect(smFr.word_size).toBe(WORD_SIZE);
  });

  it('exposes the five memory-aware entry points at the requested workgroup size', () => {
    for (const fn of ['fr_add_main', 'fr_sub_main', 'fr_mul_main', 'fr_neg_main', 'fr_inv_main']) {
      expect(src).toMatch(new RegExp(`@workgroup_size\\(64\\)\\s*\\nfn\\s+${fn}\\b`));
    }
  });

  it('declares the shared (a_in, b_in, out_buf, params) binding layout', () => {
    expect(src).toMatch(/@group\(0\)\s*@binding\(0\)\s*var<storage,\s*read>\s*a_in/);
    expect(src).toMatch(/@group\(0\)\s*@binding\(1\)\s*var<storage,\s*read>\s*b_in/);
    expect(src).toMatch(/@group\(0\)\s*@binding\(2\)\s*var<storage,\s*read_write>\s*out_buf/);
    expect(src).toMatch(/@group\(0\)\s*@binding\(3\)\s*var<uniform>\s*params/);
  });

  it('bakes the F_r modulus into get_p() and the P_LIMB constants', () => {
    expect(parseGetP(src)).toBe(BN254_SCALAR_FIELD);
    expect(parseIndexedConsts(src, 'P_LIMB', NUM_WORDS)).toBe(BN254_SCALAR_FIELD);
  });

  it('bakes the correct N0, R_INV and P_INV_MOD_2W for F_r', () => {
    const p = BN254_SCALAR_FIELD;
    // compute_mod_inverse_pow2 returns a JS number; lift to BigInt to compare.
    const pInv2w = BigInt(compute_mod_inverse_pow2(p, WORD_SIZE));
    // N0 == -p^{-1} mod 2^13
    const expectedN0 = ((1n << 13n) - pInv2w) % (1n << 13n);
    expect(parseScalarConst(src, 'N0')).toBe(expectedN0);
    // R_INV == 2^{-13} mod p (reconstructed from the 20 indexed limbs)
    expect(parseIndexedConsts(src, 'R_INV', NUM_WORDS)).toBe(modinv(1n << BigInt(WORD_SIZE), p));
    // P_INV_MOD_2W == p^{-1} mod 2^13
    expect(parseScalarConst(src, 'P_INV_MOD_2W')).toBe(pInv2w);
  });

  it('(P_LIMB, N0) form a self-consistent Montgomery system over F_r', () => {
    const p = BN254_SCALAR_FIELD;
    const n0 = parseScalarConst(src, 'N0');
    const R = smFr.r; // 2^260 mod p
    const Rinv = smFr.rinv;
    const toMont = (x: bigint) => (x * R) % p;
    expect((R * Rinv) % p).toBe(1n);
    let s = 0xc0ffeen;
    const next = () => {
      s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 256n) - 1n);
      return s % p;
    };
    for (let k = 0; k < 1000; k++) {
      const x = next();
      const y = next();
      // Mont(x) * Mont(y) -> Mont(x*y)
      expect(montMulCIOS(toMont(x), toMont(y), p, n0)).toBe(toMont((x * y) % p));
    }
  });
});

describe('Fr vs base-field separation', () => {
  it('the base-field shader bakes F_q, distinct from F_r', () => {
    const smBase = new ShaderManager(4, 1 << 8, BN254_CURVE_CONFIG, false, 'base');
    // The base-field manager defaults are unchanged: it still targets F_q.
    expect(smBase.p).toBe(BN254_BASE_FIELD);
    const baseSrc = smBase.gen_fr_ops_test_shader(64);
    expect(parseGetP(baseSrc)).toBe(BN254_BASE_FIELD);
    expect(parseGetP(baseSrc)).not.toBe(BN254_SCALAR_FIELD);
  });
});
