import { RECURSIVE_PROOF_LENGTH, VERIFICATION_KEY_LENGTH_IN_FIELDS } from '@aztec/circuits.js';
import { type ProtocolArtifact } from '@aztec/noir-protocol-circuits-types';

export type UltraHonkFlavor = 'ultra_honk' | 'ultra_keccak_honk';

const ULTRA_KECCAK_HONK_CIRCUITS = new Set<ProtocolArtifact>(['BlockRootRollupArtifact']);

export function getUltraHonkFlavorForCircuit(artifact: ProtocolArtifact): UltraHonkFlavor {
  if (ULTRA_KECCAK_HONK_CIRCUITS.has(artifact)) {
    return 'ultra_keccak_honk';
  } else {
    return 'ultra_honk';
  }
}

// TODO (alexg) remove these once UltraKeccakHonk proofs are the same size as regular UltraHonk proofs
export function getExpectedVerificationKeyLength(artifact: ProtocolArtifact): number {
  return getUltraHonkFlavorForCircuit(artifact) === 'ultra_keccak_honk' ? 120 : VERIFICATION_KEY_LENGTH_IN_FIELDS;
}

export function getExpectedProofLength(artifact: ProtocolArtifact): number {
  return getUltraHonkFlavorForCircuit(artifact) === 'ultra_keccak_honk' ? 393 : RECURSIVE_PROOF_LENGTH;
}
