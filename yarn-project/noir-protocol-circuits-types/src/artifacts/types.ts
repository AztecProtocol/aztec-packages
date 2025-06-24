import type { NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';
import type { VerificationKeyData } from '@aztec/stdlib/vks';

import type { PrivateResetArtifact } from '../private_kernel_reset_types.js';

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

// TODO: Change the names in the Artifact types above to not include the word 'Artifact'.
export type ServerProtocolCircuitName = ServerProtocolArtifact | 'PrivateTube' | 'PublicTube';
export type ProtocolCircuitName = ProtocolArtifact | 'PrivateTube' | 'PublicTube';

export interface ArtifactProvider {
  getClientCircuitArtifactByName(artifact: ClientProtocolArtifact): Promise<NoirCompiledCircuitWithName>;
  getSimulatedClientCircuitArtifactByName(artifact: ClientProtocolArtifact): Promise<NoirCompiledCircuitWithName>;
  getCircuitVkByName(artifact: ClientProtocolArtifact): Promise<VerificationKeyData>;
}
