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
/**
 * `BbError` is thrown when bb answers a command with an error rather than a result. It comes from
 * the generated API, so the async and sync classes throw the same one, on every backend (bb's
 * wasm builds with exceptions, so a handler that throws is answered with an error response too).
 *
 * BBApiException is the name the previous API used, kept so existing callers keep compiling.
 */
export { BbError, BbError as BBApiException } from '@aztec-foundation/bb.js-api';

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

export { findBbBinary } from './backends/node/index.js';
