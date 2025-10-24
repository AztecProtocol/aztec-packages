/**
 * Re-export generated curve constants for all curves.
 * These constants are generated at build time from barretenberg native binary.
 */

export {
  BN254_FR_MODULUS,
  BN254_FQ_MODULUS,
  BN254_G1_GENERATOR,
  BN254_G2_GENERATOR,
  GRUMPKIN_FR_MODULUS,
  GRUMPKIN_FQ_MODULUS,
  GRUMPKIN_G1_GENERATOR,
  SECP256K1_FR_MODULUS,
  SECP256K1_FQ_MODULUS,
  SECP256K1_G1_GENERATOR,
  SECP256R1_FR_MODULUS,
  SECP256R1_FQ_MODULUS,
  SECP256R1_G1_GENERATOR,
} from '../cbind/generated/curve_constants.js';
