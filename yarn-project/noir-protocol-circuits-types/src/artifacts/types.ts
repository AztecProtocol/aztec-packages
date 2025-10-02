import type { NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';
import type { CircuitName } from '@aztec/stdlib/stats';
import type { VerificationKeyData } from '@aztec/stdlib/vks';

import type { PrivateResetArtifact } from '../private_kernel_reset_types.js';

export type ClientProtocolArtifact =
  | 'PrivateKernelInitArtifact'
  | 'PrivateKernelInnerArtifact'
  | 'PrivateKernelTailArtifact'
  | 'PrivateKernelTailToPublicArtifact'
  | 'HidingKernelToRollup'
  | 'HidingKernelToPublic'
  | PrivateResetArtifact;

// These are all circuits that should generate proofs with the `recursive` flag.
export type ServerProtocolArtifact =
  | 'ParityBaseArtifact'
  | 'ParityRootArtifact'
  | 'PublicTube'
  | 'PrivateTxBaseRollupArtifact'
  | 'PublicTxBaseRollupArtifact'
  | 'TxMergeRollupArtifact'
  | 'BlockRootFirstRollupArtifact'
  | 'BlockRootSingleTxFirstRollupArtifact'
  | 'BlockRootEmptyTxFirstRollupArtifact'
  | 'BlockRootRollupArtifact'
  | 'BlockRootSingleTxRollupArtifact'
  | 'BlockMergeRollupArtifact'
  | 'CheckpointRootRollupArtifact'
  | 'CheckpointRootSingleBlockRollupArtifact'
  | 'CheckpointPaddingRollupArtifact'
  | 'CheckpointMergeRollupArtifact'
  | 'RootRollupArtifact';

export type ProtocolArtifact = ServerProtocolArtifact | ClientProtocolArtifact;

// TODO: Change the names in the Artifact types above to not include the word 'Artifact'.
export type ServerProtocolCircuitName = ServerProtocolArtifact;
export type ProtocolCircuitName = ProtocolArtifact;

export interface ArtifactProvider {
  getClientCircuitArtifactByName(artifact: ClientProtocolArtifact): Promise<NoirCompiledCircuitWithName>;
  getSimulatedClientCircuitArtifactByName(artifact: ClientProtocolArtifact): Promise<NoirCompiledCircuitWithName>;
  getCircuitVkByName(artifact: ClientProtocolArtifact): Promise<VerificationKeyData>;
}

export function mapProtocolArtifactNameToCircuitName(artifact: ProtocolArtifact): CircuitName {
  switch (artifact) {
    case 'ParityBaseArtifact':
      return 'parity-base';
    case 'ParityRootArtifact':
      return 'parity-root';
    case 'PublicTube':
      return 'tube-public';
    case 'PrivateTxBaseRollupArtifact':
      return 'rollup-tx-base-private';
    case 'PublicTxBaseRollupArtifact':
      return 'rollup-tx-base-public';
    case 'TxMergeRollupArtifact':
      return 'rollup-tx-merge';
    case 'BlockRootFirstRollupArtifact':
      return 'rollup-block-root-first';
    case 'BlockRootSingleTxFirstRollupArtifact':
      return 'rollup-block-root-first-single-tx';
    case 'BlockRootEmptyTxFirstRollupArtifact':
      return 'rollup-block-root-first-empty-tx';
    case 'BlockRootRollupArtifact':
      return 'rollup-block-root';
    case 'BlockRootSingleTxRollupArtifact':
      return 'rollup-block-root-single-tx';
    case 'BlockMergeRollupArtifact':
      return 'rollup-block-merge';
    case 'CheckpointRootRollupArtifact':
      return 'rollup-checkpoint-root';
    case 'CheckpointRootSingleBlockRollupArtifact':
      return 'rollup-checkpoint-root-single-block';
    case 'CheckpointPaddingRollupArtifact':
      return 'rollup-checkpoint-padding';
    case 'CheckpointMergeRollupArtifact':
      return 'rollup-checkpoint-merge';
    case 'RootRollupArtifact':
      return 'rollup-root';
    case 'PrivateKernelInitArtifact':
      return 'private-kernel-init';
    case 'PrivateKernelInnerArtifact':
      return 'private-kernel-inner';
    case 'PrivateKernelTailArtifact':
      return 'private-kernel-tail';
    case 'PrivateKernelTailToPublicArtifact':
      return 'private-kernel-tail-to-public';
    case 'HidingKernelToRollup':
      return 'hiding-kernel-to-rollup';
    case 'HidingKernelToPublic':
      return 'hiding-kernel-to-public';
    default: {
      if (artifact.startsWith('PrivateKernelReset')) {
        return 'private-kernel-reset';
      }
      throw new Error(`Unknown circuit type: ${artifact}`);
    }
  }
}
