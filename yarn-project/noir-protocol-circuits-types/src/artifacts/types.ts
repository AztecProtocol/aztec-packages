import { type PrivateResetArtifact } from '../private_kernel_reset_types.js';

export type ClientProtocolArtifact =
  | 'PrivateKernelInitArtifact'
  | 'PrivateKernelInnerArtifact'
  | 'PrivateKernelTailArtifact'
  | 'PrivateKernelTailToPublicArtifact'
  | PrivateResetArtifact;

// These are all circuits that should generate proofs with the `recursive` flag.
export type ServerProtocolArtifact =
  | 'EmptyNestedArtifact'
  | 'PrivateKernelEmptyArtifact'
  | 'BaseParityArtifact'
  | 'RootParityArtifact'
  | 'PrivateBaseRollupArtifact'
  | 'PublicBaseRollupArtifact'
  | 'MergeRollupArtifact'
  | 'BlockRootRollupArtifact'
  | 'EmptyBlockRootRollupArtifact'
  | 'BlockMergeRollupArtifact'
  | 'RootRollupArtifact';

export type ProtocolArtifact = ServerProtocolArtifact | ClientProtocolArtifact;
