export { Crs, GrumpkinCrs } from './crs/index.js';
export {
  type BackendOptions,
  BackendType,
  Barretenberg,
  BarretenbergSync,
  UltraHonkVerifierBackend,
  UltraHonkBackend,
  AztecClientBackend,
  fieldToString,
  fieldsToStrings,
  type UltraHonkBackendOptions,
  type VerifierTarget,
} from './barretenberg/index.js';

export { randomBytes } from './random/index.js';
export { splitHonkProof, reconstructHonkProof, deflattenFields, type ProofData } from './proof/index.js';
export { BBApiException } from './bbapi_exception.js';

// Export Point types for use in foundation and other packages
export type {
  Bn254G1Point,
  Bn254G2Point,
  GrumpkinPoint,
  Secp256k1Point,
  Secp256r1Point,
  Field2,
} from './cbind/generated/api_types.js';

// Export curve constants for use in foundation
export {
  BN254_FQ_MODULUS,
  BN254_FR_MODULUS,
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
} from './cbind/generated/curve_constants.js';

export { findNapiBinary } from './bb_backends/node/platform.js';
