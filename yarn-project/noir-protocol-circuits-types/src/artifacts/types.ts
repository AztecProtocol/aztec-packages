import { type NoirCompiledCircuit } from '@aztec/types/noir';

import { type PrivateResetArtifact } from '../private_kernel_reset_types.js';

export type ClientProtocolArtifact =
  | 'PrivateKernelInitArtifact'
  | 'PrivateKernelInnerArtifact'
  | 'PrivateKernelTailArtifact'
  | 'PrivateKernelTailToPublicArtifact'
  | PrivateResetArtifact;

// These are all circuits that should generate proofs with the `recursive` flag.
export type ServerProtocolArtifact =
  | 'BaseParityArtifact'
  | 'RootParityArtifact'
  | 'PrivateBaseRollupArtifact'
  | 'PublicBaseRollupArtifact'
  | 'MergeRollupArtifact'
  | 'BlockRootRollupArtifact'
  | 'SingleTxBlockRootRollupArtifact'
  | 'EmptyBlockRootRollupArtifact'
  | 'BlockMergeRollupArtifact'
  | 'RootRollupArtifact';

export type ProtocolArtifact = ServerProtocolArtifact | ClientProtocolArtifact;

export interface ArtifactProvider {
  getClientCircuitArtifactByName(artifact: ClientProtocolArtifact): Promise<NoirCompiledCircuit>;
  getSimulatedClientCircuitArtifactByName(artifact: ClientProtocolArtifact): Promise<NoirCompiledCircuit>;
}
