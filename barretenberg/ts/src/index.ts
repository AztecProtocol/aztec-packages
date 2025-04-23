export { Crs, GrumpkinCrs } from './crs/index.js';
export {
  type BackendOptions,
  Barretenberg,
  BarretenbergSync,
  BarretenbergVerifier,
  UltraPlonkBackend,
  UltraHonkBackend,
  AztecClientBackend,
} from './barretenberg/index.js';

export { RawBuffer, Fr } from './types/index.js';
export { splitHonkProof, reconstructHonkProof, deflattenFields, type ProofData } from './proof/index.js';
