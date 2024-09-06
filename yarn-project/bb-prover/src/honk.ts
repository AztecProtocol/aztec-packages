import { RECURSIVE_PROOF_LENGTH, VERIFICATION_KEY_LENGTH_IN_FIELDS } from '@aztec/circuits.js';
import { type ProtocolArtifact } from '@aztec/noir-protocol-circuits-types';

export type UltraHonkFlavor = 'ultra_honk' | 'ultra_keccak_honk';

const UltraKeccakHonkCircuits = ['BlockRootRollupArtifact'] as const;
type UltraKeccakHonkCircuits = (typeof UltraKeccakHonkCircuits)[number];
type UltraHonkCircuits = Exclude<ProtocolArtifact, UltraKeccakHonkCircuits>;

export function getUltraHonkFlavorForCircuit(artifact: UltraKeccakHonkCircuits): 'ultra_keccak_honk';
export function getUltraHonkFlavorForCircuit(artifact: UltraHonkCircuits): 'ultra_honk';
export function getUltraHonkFlavorForCircuit(artifact: ProtocolArtifact): UltraHonkFlavor;
export function getUltraHonkFlavorForCircuit(artifact: ProtocolArtifact): UltraHonkFlavor {
  return isUltraKeccakHonkCircuit(artifact) ? 'ultra_keccak_honk' : 'ultra_honk';
}

function isUltraKeccakHonkCircuit(artifact: ProtocolArtifact): artifact is UltraKeccakHonkCircuits {
  return UltraKeccakHonkCircuits.includes(artifact as UltraKeccakHonkCircuits);
}

// TODO (alexg) remove these once UltraKeccakHonk proofs are the same size as regular UltraHonk proofs
// see https://github.com/AztecProtocol/aztec-packages/pull/8243
export function getExpectedVerificationKeyLength(artifact: ProtocolArtifact): number {
  return getUltraHonkFlavorForCircuit(artifact) === 'ultra_keccak_honk' ? 120 : VERIFICATION_KEY_LENGTH_IN_FIELDS;
}

export function getExpectedProofLength(artifact: UltraKeccakHonkCircuits): 393;
export function getExpectedProofLength(artifact: UltraHonkCircuits): typeof RECURSIVE_PROOF_LENGTH;
export function getExpectedProofLength(artifact: ProtocolArtifact): number;
export function getExpectedProofLength(artifact: ProtocolArtifact): number {
  return isUltraKeccakHonkCircuit(artifact) ? 393 : RECURSIVE_PROOF_LENGTH;
}
