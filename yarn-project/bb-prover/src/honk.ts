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
