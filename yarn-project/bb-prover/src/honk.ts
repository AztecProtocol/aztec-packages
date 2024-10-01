import { type ProtocolArtifact } from '@aztec/noir-protocol-circuits-types';

export type UltraHonkFlavor = 'ultra_honk' | 'ultra_keccak_honk';

const UltraKeccakHonkCircuits = ['RootRollupArtifact'] as const satisfies ProtocolArtifact[];
export type UltraKeccakHonkProtocolArtifact = (typeof UltraKeccakHonkCircuits)[number];
export type UltraHonkProtocolArtifact = Exclude<ProtocolArtifact, UltraKeccakHonkProtocolArtifact>;

export function getUltraHonkFlavorForCircuit(artifact: UltraKeccakHonkProtocolArtifact): 'ultra_keccak_honk';
export function getUltraHonkFlavorForCircuit(artifact: UltraHonkProtocolArtifact): 'ultra_honk';
export function getUltraHonkFlavorForCircuit(artifact: ProtocolArtifact): UltraHonkFlavor;
export function getUltraHonkFlavorForCircuit(artifact: ProtocolArtifact): UltraHonkFlavor {
  return isUltraKeccakHonkCircuit(artifact) ? 'ultra_keccak_honk' : 'ultra_honk';
}

function isUltraKeccakHonkCircuit(artifact: ProtocolArtifact): artifact is UltraKeccakHonkProtocolArtifact {
  return UltraKeccakHonkCircuits.includes(artifact as UltraKeccakHonkProtocolArtifact);
}
