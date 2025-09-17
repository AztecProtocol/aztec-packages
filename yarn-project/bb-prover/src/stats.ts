import type { ProtocolArtifact } from '@aztec/noir-protocol-circuits-types/types';
import type { CircuitName } from '@aztec/stdlib/stats';

export function mapProtocolArtifactNameToCircuitName(artifact: ProtocolArtifact): CircuitName {
  switch (artifact) {
    case 'BaseParityArtifact':
      return 'base-parity';
    case 'RootParityArtifact':
      return 'root-parity';
    case 'PublicTube':
      return 'public-tube';
    case 'PrivateBaseRollupArtifact':
      return 'private-base-rollup';
    case 'PublicBaseRollupArtifact':
      return 'public-base-rollup';
    case 'MergeRollupArtifact':
      return 'merge-rollup';
    case 'BlockRootFirstRollupArtifact':
      return 'block-root-first-rollup';
    case 'BlockRootSingleTxFirstRollupArtifact':
      return 'block-root-single-tx-first-rollup';
    case 'BlockRootEmptyTxFirstRollupArtifact':
      return 'block-root-empty-tx-first-rollup';
    case 'BlockRootRollupArtifact':
      return 'block-root-rollup';
    case 'BlockRootSingleTxRollupArtifact':
      return 'block-root-single-tx-rollup';
    case 'BlockMergeRollupArtifact':
      return 'block-merge-rollup';
    case 'CheckpointRootRollupArtifact':
      return 'checkpoint-root-rollup';
    case 'CheckpointRootSingleBlockRollupArtifact':
      return 'checkpoint-root-single-block-rollup';
    case 'CheckpointPaddingRollupArtifact':
      return 'checkpoint-padding-rollup';
    case 'CheckpointMergeRollupArtifact':
      return 'checkpoint-merge-rollup';
    case 'RootRollupArtifact':
      return 'root-rollup';
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
