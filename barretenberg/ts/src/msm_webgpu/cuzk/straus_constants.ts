import { BN254_BASE_FIELD, modInverse } from "./bn254.js";

const FQ_CUBE_ROOT_MONT_64_LIMBS: readonly bigint[] = [
  0x71930c11d782e155n,
  0xa6bb947cffbe3323n,
  0xaa303344d4741444n,
  0x2c3b3f0d26594943n,
];

/**
 * BN254 Fq cube root of unity (β), re-based from `bn254/fq.hpp`'s
 * 2^256-Montgomery form into this tree's `R = 2^(num_words·word_size)`
 * Montgomery form. Used to materialise the `BETA` constant inside the
 * `straus_main` kernel via `gen_wgsl_limbs_code`.
 *
 * See `STRAUS_REFERENCE.md` §3 for the source of the constants.
 */
export function fqCubeRootOfUnityMont(
  numWords: number,
  wordSize: number,
): bigint {
  const q = BN254_BASE_FIELD;
  let mont64 = 0n;
  for (let i = FQ_CUBE_ROOT_MONT_64_LIMBS.length - 1; i >= 0; i--) {
    mont64 = (mont64 << 64n) | FQ_CUBE_ROOT_MONT_64_LIMBS[i];
  }
  const R256ModQ = (1n << 256n) % q;
  const R256Inv = modInverse(R256ModQ, q);
  const betaNonMont = (mont64 * R256Inv) % q;
  const R = (1n << BigInt(numWords * wordSize)) % q;
  return (betaNonMont * R) % q;
}
