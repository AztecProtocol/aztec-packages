import { type ProtocolArtifact } from '@aztec/noir-protocol-circuits-types';

export type UltraHonkFlavor = 'ultra_honk' | 'ultra_keccak_honk' | 'ultra_rollup_honk';

const UltraKeccakHonkCircuits = ['RootRollupArtifact'] as const satisfies ProtocolArtifact[];
const UltraHonkCircuits = [
  'EmptyNestedArtifact',
  'PrivateKernelEmptyArtifact',
  'BaseParityArtifact',
  'RootParityArtifact',
] as const satisfies ProtocolArtifact[];

export type UltraKeccakHonkProtocolArtifact = (typeof UltraKeccakHonkCircuits)[number];
export type UltraHonkProtocolArtifact = (typeof UltraHonkCircuits)[number];
export type UltraRollupHonkProtocolArtifact = Exclude<
  Exclude<ProtocolArtifact, UltraKeccakHonkProtocolArtifact>,
  UltraHonkProtocolArtifact
>;

export function getUltraHonkFlavorForCircuit(artifact: UltraKeccakHonkProtocolArtifact): 'ultra_keccak_honk';
export function getUltraHonkFlavorForCircuit(artifact: UltraHonkProtocolArtifact): 'ultra_honk';
export function getUltraHonkFlavorForCircuit(artifact: UltraRollupHonkProtocolArtifact): 'ultra_honk';
export function getUltraHonkFlavorForCircuit(artifact: ProtocolArtifact): UltraHonkFlavor;
export function getUltraHonkFlavorForCircuit(artifact: ProtocolArtifact): UltraHonkFlavor {
  if (isUltraKeccakHonkCircuit(artifact)) return 'ultra_keccak_honk';
  else if (UltraHonkCircuits.includes(artifact as UltraHonkProtocolArtifact)) return 'ultra_honk';
  return 'ultra_honk';
}

function isUltraKeccakHonkCircuit(artifact: ProtocolArtifact): artifact is UltraKeccakHonkProtocolArtifact {
  return UltraKeccakHonkCircuits.includes(artifact as UltraKeccakHonkProtocolArtifact);
}
