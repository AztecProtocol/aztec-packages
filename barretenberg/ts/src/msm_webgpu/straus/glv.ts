import { BN254_SCALAR_FIELD, modInverse } from "../cuzk/bn254.js";

export const FR_ORDER = BN254_SCALAR_FIELD;

const TWO_64 = 1n << 64n;
const TWO_127 = 1n << 127n;
const TWO_128 = 1n << 128n;
const TWO_256 = 1n << 256n;
const MASK_128 = TWO_128 - 1n;
const MASK_256 = TWO_256 - 1n;

const ENDO_G1 =
  0x0000000000000002n * (TWO_64 * TWO_64) +
  0x4ccef014a773d2cfn * TWO_64 +
  0x7a7bd9d4391eb18dn;
const ENDO_G2 = 0x0000000000000002n * TWO_64 + 0xd91d232ec7e0b3d7n;
const ENDO_MINUS_B1 = 0x6f4d8248eeb859fcn * TWO_64 + 0x8211bbeb7d4f1128n;
const ENDO_B2 = 0x89d3256894d213e3n;

const FR_CUBE_ROOT_MONT_LIMBS: readonly bigint[] = [
  0x93e7cede4a0329b3n,
  0x7d4fdca77a96c167n,
  0x8be4ba08b19a750an,
  0x1cbd5653a5661c25n,
];

function limbsToBigInt(limbs: readonly bigint[]): bigint {
  let v = 0n;
  for (let i = limbs.length - 1; i >= 0; i--) {
    v = (v << 64n) | limbs[i];
  }
  return v;
}

const FR_R_INV = modInverse(TWO_256 % FR_ORDER, FR_ORDER);

/**
 * Fr's cube root of unity (the GLV eigenvalue λ), in non-Montgomery form.
 * Derived at module load from the Montgomery-form limbs in
 * `barretenberg/cpp/src/barretenberg/ecc/curves/bn254/fr.hpp`.
 */
export const FR_CUBE_ROOT_OF_UNITY =
  (limbsToBigInt(FR_CUBE_ROOT_MONT_LIMBS) * FR_R_INV) % FR_ORDER;

export interface EndoScalars {
  /** k1 ∈ [0, 2^128) */
  k1: bigint;
  /** k2 ∈ [0, 2^128) */
  k2: bigint;
}

/**
 * GLV scalar split for BN254 Fr. Decomposes a scalar `k ∈ [0, r)` into a
 * pair of 128-bit non-negative scalars `(k1, k2)` such that
 *
 *   k ≡ k1 − k2·λ  (mod r)
 *
 * where `λ = FR_CUBE_ROOT_OF_UNITY`. Both halves fit in 128 bits.
 *
 * Direct port of `Fr::split_into_endomorphism_scalars` from
 * `barretenberg/cpp/src/barretenberg/ecc/fields/field_declarations.hpp`
 * lines 501-530, using the lattice constants from `bn254/fr.hpp`.
 * See `STRAUS_REFERENCE.md` §2 for the C++ source and rationale.
 *
 * @param k Scalar in `[0, r)`. Must be already reduced.
 */
export function splitIntoEndomorphismScalars(k: bigint): EndoScalars {
  if (k < 0n || k >= FR_ORDER) {
    throw new Error("splitIntoEndomorphismScalars: input must be in [0, r)");
  }

  if (k < TWO_127) {
    return { k1: k, k2: 0n };
  }

  const c1 = (ENDO_G2 * k) >> 256n;
  const c2 = (ENDO_G1 * k) >> 256n;

  const q1Lo = (c1 * ENDO_MINUS_B1) & MASK_256;
  const q2Lo = (c2 * ENDO_B2) & MASK_256;

  let t1 = q2Lo - q1Lo;
  t1 %= FR_ORDER;
  if (t1 < 0n) t1 += FR_ORDER;

  if (t1 >= TWO_128) {
    t1 = (t1 + ENDO_MINUS_B1) % FR_ORDER;
  }

  const t2 = (t1 * FR_CUBE_ROOT_OF_UNITY + k) % FR_ORDER;

  return { k1: t2 & MASK_128, k2: t1 & MASK_128 };
}

/**
 * Encode a 128-bit non-negative scalar half as 4 × u32 little-endian limbs.
 * `out[0]` holds the low 32 bits of `half`. This is the layout the WGSL
 * kernels' `k1_lims` / `k2_lims` buffers consume.
 */
export function packHalfToU32Limbs(
  half: bigint,
): [number, number, number, number] {
  if (half < 0n || half >> 128n !== 0n) {
    throw new Error("packHalfToU32Limbs: half out of range");
  }
  const mask = 0xffffffffn;
  return [
    Number(half & mask),
    Number((half >> 32n) & mask),
    Number((half >> 64n) & mask),
    Number((half >> 96n) & mask),
  ];
}
