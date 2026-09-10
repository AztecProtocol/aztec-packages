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
export { splitHonkProof, reconstructHonkProof, deflattenFields, type ProofData } from './proof.js';
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
} from '@aztec-foundation/bb.js-api';

export { toChonkProof } from '@aztec-foundation/bb.js-api';

/**
 * @deprecated Fq2 coordinates are typed per curve now (see Bn254G2Point).
 * Kept so consumers of the previous public API keep compiling.
 */
export type Field2 = [Uint8Array, Uint8Array];

export { CircuitKind } from './circuit_kind.js';

// Curve constants, for callers doing their own field arithmetic.
export * from './curve_constants.js';

export { findBbBinary, findNapiBinary } from './backends/node/platform.js';
