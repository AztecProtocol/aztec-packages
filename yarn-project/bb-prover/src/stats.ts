import type { ProtocolArtifact } from '@aztec/noir-protocol-circuits-types/types';
import type { CircuitName } from '@aztec/stdlib/stats';

export function mapProtocolArtifactNameToCircuitName(artifact: ProtocolArtifact): CircuitName {
  switch (artifact) {
    case 'BaseParityArtifact':
      return 'base-parity';
    case 'RootParityArtifact':
      return 'root-parity';
    case 'PrivateBaseRollupArtifact':
      return 'private-base-rollup';
    case 'PublicBaseRollupArtifact':
      return 'public-base-rollup';
    case 'MergeRollupArtifact':
      return 'merge-rollup';
    case 'BlockRootRollupArtifact':
      return 'block-root-rollup';
    case 'SingleTxBlockRootRollupArtifact':
      return 'single-tx-block-root-rollup';
    case 'EmptyBlockRootRollupArtifact':
      return 'empty-block-root-rollup';
    case 'PaddingBlockRootRollupArtifact':
      return 'padding-block-root-rollup';
    case 'BlockMergeRollupArtifact':
      return 'block-merge-rollup';
    case 'RootRollupArtifact':
      return 'root-rollup';
    case 'PrivateKernelInitArtifact':
      return 'ClientIVC';
    case 'PrivateKernelInnerArtifact':
      return 'ClientIVC';
    case 'PrivateKernelTailArtifact':
      return 'ClientIVC';
    case 'PrivateKernelTailToPublicArtifact':
      return 'private-kernel-tail-to-public';
    case 'HidingKernelToRollup':
      return 'hiding-kernel-to-rollup';
    case 'HidingKernelToPublic':
      return 'hiding-kernel-to-public';
    default: {
      if (artifact.startsWith('PrivateKernelReset')) {
        return 'ClientIVC';
      }
      throw new Error(`Unknown circuit type: ${artifact}`);
    }
  }
}
