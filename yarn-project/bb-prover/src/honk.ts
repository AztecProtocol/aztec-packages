import type { ServerProtocolArtifact } from '@aztec/noir-protocol-circuits-types/server';

export type UltraHonkFlavor = 'ultra_honk' | 'ultra_keccak_honk' | 'ultra_starknet_honk' | 'ultra_rollup_honk';

const UltraKeccakHonkCircuits = ['RootRollupArtifact'] as const satisfies ServerProtocolArtifact[];
const UltraHonkCircuits = ['BaseParityArtifact', 'RootParityArtifact'] as const satisfies ServerProtocolArtifact[];

export type UltraKeccakHonkServerProtocolArtifact = (typeof UltraKeccakHonkCircuits)[number];
export type UltraHonkServerProtocolArtifact = (typeof UltraHonkCircuits)[number];
export type UltraRollupHonkServerProtocolArtifact = Exclude<
  Exclude<ServerProtocolArtifact, UltraKeccakHonkServerProtocolArtifact>,
  UltraHonkServerProtocolArtifact
>;

export function getUltraHonkFlavorForCircuit(artifact: UltraKeccakHonkServerProtocolArtifact): 'ultra_keccak_honk';
export function getUltraHonkFlavorForCircuit(artifact: UltraHonkServerProtocolArtifact): 'ultra_honk';
export function getUltraHonkFlavorForCircuit(artifact: UltraRollupHonkServerProtocolArtifact): 'ultra_rollup_honk';
export function getUltraHonkFlavorForCircuit(artifact: ServerProtocolArtifact): UltraHonkFlavor;
export function getUltraHonkFlavorForCircuit(artifact: ServerProtocolArtifact): UltraHonkFlavor {
  // STARKNET: how to allow for the distinction between keccak/starknet? ultra_keccak_honk is returned in both cases
  if (isUltraKeccakHonkCircuit(artifact)) {
    return 'ultra_keccak_honk';
  } else if (UltraHonkCircuits.includes(artifact as UltraHonkServerProtocolArtifact)) {
    return 'ultra_honk';
  }
  return 'ultra_rollup_honk';
}

function isUltraKeccakHonkCircuit(artifact: ServerProtocolArtifact): artifact is UltraKeccakHonkServerProtocolArtifact {
  return UltraKeccakHonkCircuits.includes(artifact as UltraKeccakHonkServerProtocolArtifact);
}
