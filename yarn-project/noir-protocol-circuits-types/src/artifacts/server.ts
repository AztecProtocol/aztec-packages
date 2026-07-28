import type { NoirCompiledCircuit, NoirCompiledCircuitWithName } from '@aztec/stdlib/noir';

import PublicChonkVerifierJson from '../../artifacts/chonk_verifier_public.json' with { type: 'json' };
import InboxParity64Json from '../../artifacts/inbox_parity_64.json' with { type: 'json' };
import InboxParity256Json from '../../artifacts/inbox_parity_256.json' with { type: 'json' };
import InboxParity1024Json from '../../artifacts/inbox_parity_1024.json' with { type: 'json' };
import BlockMergeRollupJson from '../../artifacts/rollup_block_merge.json' with { type: 'json' };
import BlockRootRollupJson from '../../artifacts/rollup_block_root.json' with { type: 'json' };
import BlockRootFirstRollupJson from '../../artifacts/rollup_block_root_first.json' with { type: 'json' };
import BlockRootEmptyTxFirstRollupJson from '../../artifacts/rollup_block_root_first_empty_tx.json' with { type: 'json' };
import BlockRootFirstRollupSimulatedJson from '../../artifacts/rollup_block_root_first_simulated.json' with { type: 'json' };
import BlockRootSingleTxFirstRollupJson from '../../artifacts/rollup_block_root_first_single_tx.json' with { type: 'json' };
import BlockRootSingleTxFirstRollupSimulatedJson from '../../artifacts/rollup_block_root_first_single_tx_simulated.json' with { type: 'json' };
import BlockRootMsgsOnlyRollupJson from '../../artifacts/rollup_block_root_msgs_only.json' with { type: 'json' };
import BlockRootRollupSimulatedJson from '../../artifacts/rollup_block_root_simulated.json' with { type: 'json' };
import BlockRootSingleTxRollupJson from '../../artifacts/rollup_block_root_single_tx.json' with { type: 'json' };
import BlockRootSingleTxRollupSimulatedJson from '../../artifacts/rollup_block_root_single_tx_simulated.json' with { type: 'json' };
import CheckpointMergeRollupJson from '../../artifacts/rollup_checkpoint_merge.json' with { type: 'json' };
import CheckpointPaddingRollupJson from '../../artifacts/rollup_checkpoint_padding.json' with { type: 'json' };
import CheckpointRootRollupJson from '../../artifacts/rollup_checkpoint_root.json' with { type: 'json' };
import CheckpointRootRollupSimulatedJson from '../../artifacts/rollup_checkpoint_root_simulated.json' with { type: 'json' };
import CheckpointRootSingleBlockRollupJson from '../../artifacts/rollup_checkpoint_root_single_block.json' with { type: 'json' };
import CheckpointRootSingleBlockRollupSimulatedJson from '../../artifacts/rollup_checkpoint_root_single_block_simulated.json' with { type: 'json' };
import RootRollupJson from '../../artifacts/rollup_root.json' with { type: 'json' };
import PrivateTxBaseRollupJson from '../../artifacts/rollup_tx_base_private.json' with { type: 'json' };
import PrivateTxBaseRollupSimulatedJson from '../../artifacts/rollup_tx_base_private_simulated.json' with { type: 'json' };
import PublicTxBaseRollupJson from '../../artifacts/rollup_tx_base_public.json' with { type: 'json' };
import PublicTxBaseRollupSimulatedJson from '../../artifacts/rollup_tx_base_public_simulated.json' with { type: 'json' };
import TxMergeRollupJson from '../../artifacts/rollup_tx_merge.json' with { type: 'json' };
import type { ServerProtocolArtifact } from './types.js';

export const ServerCircuitArtifacts: Record<ServerProtocolArtifact, NoirCompiledCircuit> = {
  InboxParity64Artifact: InboxParity64Json as NoirCompiledCircuit,
  InboxParity256Artifact: InboxParity256Json as NoirCompiledCircuit,
  InboxParity1024Artifact: InboxParity1024Json as NoirCompiledCircuit,
  PublicChonkVerifier: PublicChonkVerifierJson as NoirCompiledCircuit,
  PrivateTxBaseRollupArtifact: PrivateTxBaseRollupJson as NoirCompiledCircuit,
  PublicTxBaseRollupArtifact: PublicTxBaseRollupJson as NoirCompiledCircuit,
  TxMergeRollupArtifact: TxMergeRollupJson as NoirCompiledCircuit,
  BlockRootFirstRollupArtifact: BlockRootFirstRollupJson as NoirCompiledCircuit,
  BlockRootSingleTxFirstRollupArtifact: BlockRootSingleTxFirstRollupJson as NoirCompiledCircuit,
  BlockRootEmptyTxFirstRollupArtifact: BlockRootEmptyTxFirstRollupJson as NoirCompiledCircuit,
  BlockRootRollupArtifact: BlockRootRollupJson as NoirCompiledCircuit,
  BlockRootSingleTxRollupArtifact: BlockRootSingleTxRollupJson as NoirCompiledCircuit,
  BlockRootMsgsOnlyRollupArtifact: BlockRootMsgsOnlyRollupJson as NoirCompiledCircuit,
  BlockMergeRollupArtifact: BlockMergeRollupJson as NoirCompiledCircuit,
  CheckpointRootRollupArtifact: CheckpointRootRollupJson as NoirCompiledCircuit,
  CheckpointRootSingleBlockRollupArtifact: CheckpointRootSingleBlockRollupJson as NoirCompiledCircuit,
  CheckpointPaddingRollupArtifact: CheckpointPaddingRollupJson as NoirCompiledCircuit,
  CheckpointMergeRollupArtifact: CheckpointMergeRollupJson as NoirCompiledCircuit,
  RootRollupArtifact: RootRollupJson as NoirCompiledCircuit,
};

export const SimulatedServerCircuitArtifacts: Record<ServerProtocolArtifact, NoirCompiledCircuit> = {
  // No separate simulated build for the inbox parity ladder: they verify no child proofs, so the constrained
  // artifacts are used for simulation too.
  InboxParity64Artifact: InboxParity64Json as NoirCompiledCircuit,
  InboxParity256Artifact: InboxParity256Json as NoirCompiledCircuit,
  InboxParity1024Artifact: InboxParity1024Json as NoirCompiledCircuit,
  PublicChonkVerifier: PublicChonkVerifierJson as NoirCompiledCircuit,
  PrivateTxBaseRollupArtifact: PrivateTxBaseRollupSimulatedJson as NoirCompiledCircuit,
  PublicTxBaseRollupArtifact: PublicTxBaseRollupSimulatedJson as NoirCompiledCircuit,
  TxMergeRollupArtifact: TxMergeRollupJson as NoirCompiledCircuit,
  BlockRootFirstRollupArtifact: BlockRootFirstRollupSimulatedJson as NoirCompiledCircuit,
  BlockRootSingleTxFirstRollupArtifact: BlockRootSingleTxFirstRollupSimulatedJson as NoirCompiledCircuit,
  BlockRootEmptyTxFirstRollupArtifact: BlockRootEmptyTxFirstRollupJson as NoirCompiledCircuit,
  BlockRootRollupArtifact: BlockRootRollupSimulatedJson as NoirCompiledCircuit,
  BlockRootSingleTxRollupArtifact: BlockRootSingleTxRollupSimulatedJson as NoirCompiledCircuit,
  // No separate simulated build (mirrors the empty-tx-first variant): the message-only block root verifies no child
  // proofs, so the constrained artifact is used for simulation too.
  BlockRootMsgsOnlyRollupArtifact: BlockRootMsgsOnlyRollupJson as NoirCompiledCircuit,
  BlockMergeRollupArtifact: BlockMergeRollupJson as NoirCompiledCircuit,
  CheckpointRootRollupArtifact: CheckpointRootRollupSimulatedJson as NoirCompiledCircuit,
  CheckpointRootSingleBlockRollupArtifact: CheckpointRootSingleBlockRollupSimulatedJson as NoirCompiledCircuit,
  CheckpointPaddingRollupArtifact: CheckpointPaddingRollupJson as NoirCompiledCircuit,
  CheckpointMergeRollupArtifact: CheckpointMergeRollupJson as NoirCompiledCircuit,
  RootRollupArtifact: RootRollupJson as NoirCompiledCircuit,
};

export function getServerCircuitArtifact(name: ServerProtocolArtifact): NoirCompiledCircuitWithName {
  return {
    ...ServerCircuitArtifacts[name],
    name,
  };
}

export function getSimulatedServerCircuitArtifact(name: ServerProtocolArtifact): NoirCompiledCircuitWithName {
  return {
    ...SimulatedServerCircuitArtifacts[name],
    name,
  };
}
