export { Crs, GrumpkinCrs } from './crs/index.js';
export {
  type BackendOptions,
  BackendType,
  Barretenberg,
  BarretenbergSync,
  UltraHonkVerifierBackend,
  UltraHonkBackend,
  AztecClientBackend,
  flattenChonkProofFields,
  fieldToString,
  fieldsToStrings,
  type AztecClientProveResult,
  type UltraHonkBackendOptions,
  type VerifierTarget,
} from './barretenberg/index.js';

export { randomBytes } from './random/index.js';
export { splitHonkProof, reconstructHonkProof, deflattenFields, type ProofData } from './proof/index.js';
export { BBApiException } from './bbapi_exception.js';

// Export Point types for use in foundation and other packages
export type {
  AvmStat,
  Bn254G1Point,
  Bn254G2Point,
  ChonkProof,
  GrumpkinPoint,
  Secp256k1Point,
  Secp256r1Point,
} from './generated/api_types.js';

export { toChonkProof } from './generated/api_types.js';

/**
 * @deprecated Fq2 coordinates are typed per curve now (see Bn254G2Point).
 * Kept so consumers of the previous public API keep compiling.
 */
export type Field2 = [Uint8Array, Uint8Array];

export { CircuitKind } from './circuit_kind.js';

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
} from './generated/curve_constants.js';

export { findBbBinary, findNapiBinary } from './bb_backends/node/platform.js';
