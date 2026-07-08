import {
  BLOCK_MERGE_ROLLUP_VK_INDEX,
  BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
  BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
  BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX,
  BLOCK_ROOT_ROLLUP_VK_INDEX,
  BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
  BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
  CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
  CHECKPOINT_PADDING_ROLLUP_VK_INDEX,
  CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
  CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
  HIDING_KERNEL_TO_PUBLIC_VK_INDEX,
  HIDING_KERNEL_TO_ROLLUP_VK_INDEX,
  PARITY_BASE_VK_INDEX,
  PARITY_ROOT_VK_INDEX,
  PRIVATE_KERNEL_INIT_2_VK_INDEX,
  PRIVATE_KERNEL_INIT_3_VK_INDEX,
  PRIVATE_KERNEL_INIT_4_VK_INDEX,
  PRIVATE_KERNEL_INIT_5_VK_INDEX,
  PRIVATE_KERNEL_INIT_VK_INDEX,
  PRIVATE_KERNEL_INNER_2_VK_INDEX,
  PRIVATE_KERNEL_INNER_3_VK_INDEX,
  PRIVATE_KERNEL_INNER_4_VK_INDEX,
  PRIVATE_KERNEL_INNER_5_VK_INDEX,
  PRIVATE_KERNEL_INNER_VK_INDEX,
  PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
  PUBLIC_CHONK_VERIFIER_VK_INDEX,
  PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
  ROOT_ROLLUP_VK_INDEX,
  TX_MERGE_ROLLUP_VK_INDEX,
} from '@aztec/constants';
import { VerificationKeyData } from '@aztec/stdlib/vks';

import PublicChonkVerifier from '../../../artifacts/chonk_verifier_public.json' with { type: 'json' };
import ParityBase from '../../../artifacts/parity_base.json' with { type: 'json' };
import ParityRoot from '../../../artifacts/parity_root.json' with { type: 'json' };
import BlockMergeRollup from '../../../artifacts/rollup_block_merge.json' with { type: 'json' };
import BlockRootRollup from '../../../artifacts/rollup_block_root.json' with { type: 'json' };
import BlockRootFirstRollup from '../../../artifacts/rollup_block_root_first.json' with { type: 'json' };
import BlockRootEmptyTxFirstRollup from '../../../artifacts/rollup_block_root_first_empty_tx.json' with { type: 'json' };
import BlockRootSingleTxFirstRollup from '../../../artifacts/rollup_block_root_first_single_tx.json' with { type: 'json' };
import BlockRootMsgsOnlyRollup from '../../../artifacts/rollup_block_root_msgs_only.json' with { type: 'json' };
import BlockRootSingleTxRollup from '../../../artifacts/rollup_block_root_single_tx.json' with { type: 'json' };
import CheckpointMergeRollup from '../../../artifacts/rollup_checkpoint_merge.json' with { type: 'json' };
import CheckpointPaddingRollup from '../../../artifacts/rollup_checkpoint_padding.json' with { type: 'json' };
import CheckpointRootRollup from '../../../artifacts/rollup_checkpoint_root.json' with { type: 'json' };
import CheckpointRootSingleBlockRollup from '../../../artifacts/rollup_checkpoint_root_single_block.json' with { type: 'json' };
import RootRollup from '../../../artifacts/rollup_root.json' with { type: 'json' };
import PrivateTxBaseRollup from '../../../artifacts/rollup_tx_base_private.json' with { type: 'json' };
import PublicTxBaseRollup from '../../../artifacts/rollup_tx_base_public.json' with { type: 'json' };
import TxMergeRollup from '../../../artifacts/rollup_tx_merge.json' with { type: 'json' };
import {
  PrivateKernelResetTailToPublicVkIndexes,
  PrivateKernelResetTailVkIndexes,
  PrivateKernelResetVkIndexes,
} from '../../private_kernel_reset_vks.js';
import { abiToVKData } from '../../utils/vk_json.js';
import type { ProtocolCircuitName, ServerProtocolCircuitName } from '../types.js';

export const ServerCircuitVks: Record<ServerProtocolCircuitName, VerificationKeyData> = {
  ParityBaseArtifact: abiToVKData(ParityBase),
  ParityRootArtifact: abiToVKData(ParityRoot),
  PublicChonkVerifier: abiToVKData(PublicChonkVerifier),
  PrivateTxBaseRollupArtifact: abiToVKData(PrivateTxBaseRollup),
  PublicTxBaseRollupArtifact: abiToVKData(PublicTxBaseRollup),
  TxMergeRollupArtifact: abiToVKData(TxMergeRollup),
  BlockRootFirstRollupArtifact: abiToVKData(BlockRootFirstRollup),
  BlockRootSingleTxFirstRollupArtifact: abiToVKData(BlockRootSingleTxFirstRollup),
  BlockRootEmptyTxFirstRollupArtifact: abiToVKData(BlockRootEmptyTxFirstRollup),
  BlockRootSingleTxRollupArtifact: abiToVKData(BlockRootSingleTxRollup),
  BlockRootRollupArtifact: abiToVKData(BlockRootRollup),
  BlockRootMsgsOnlyRollupArtifact: abiToVKData(BlockRootMsgsOnlyRollup),
  BlockMergeRollupArtifact: abiToVKData(BlockMergeRollup),
  CheckpointRootRollupArtifact: abiToVKData(CheckpointRootRollup),
  CheckpointRootSingleBlockRollupArtifact: abiToVKData(CheckpointRootSingleBlockRollup),
  CheckpointPaddingRollupArtifact: abiToVKData(CheckpointPaddingRollup),
  CheckpointMergeRollupArtifact: abiToVKData(CheckpointMergeRollup),
  RootRollupArtifact: abiToVKData(RootRollup),
};

export const ProtocolCircuitVkIndexes: Record<ProtocolCircuitName, number> = {
  PrivateKernelInitArtifact: PRIVATE_KERNEL_INIT_VK_INDEX,
  PrivateKernelInit2Artifact: PRIVATE_KERNEL_INIT_2_VK_INDEX,
  PrivateKernelInit3Artifact: PRIVATE_KERNEL_INIT_3_VK_INDEX,
  PrivateKernelInit4Artifact: PRIVATE_KERNEL_INIT_4_VK_INDEX,
  PrivateKernelInit5Artifact: PRIVATE_KERNEL_INIT_5_VK_INDEX,
  PrivateKernelInnerArtifact: PRIVATE_KERNEL_INNER_VK_INDEX,
  PrivateKernelInner2Artifact: PRIVATE_KERNEL_INNER_2_VK_INDEX,
  PrivateKernelInner3Artifact: PRIVATE_KERNEL_INNER_3_VK_INDEX,
  PrivateKernelInner4Artifact: PRIVATE_KERNEL_INNER_4_VK_INDEX,
  PrivateKernelInner5Artifact: PRIVATE_KERNEL_INNER_5_VK_INDEX,
  // Tail and tail-to-public are produced by the PrivateKernelResetTail* / PrivateKernelResetTailToPublic*
  // families below.
  HidingKernelToRollup: HIDING_KERNEL_TO_ROLLUP_VK_INDEX,
  HidingKernelToPublic: HIDING_KERNEL_TO_PUBLIC_VK_INDEX,
  PublicChonkVerifier: PUBLIC_CHONK_VERIFIER_VK_INDEX,
  ParityBaseArtifact: PARITY_BASE_VK_INDEX,
  ParityRootArtifact: PARITY_ROOT_VK_INDEX,
  PrivateTxBaseRollupArtifact: PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
  PublicTxBaseRollupArtifact: PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
  TxMergeRollupArtifact: TX_MERGE_ROLLUP_VK_INDEX,
  BlockRootFirstRollupArtifact: BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
  BlockRootSingleTxFirstRollupArtifact: BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP_VK_INDEX,
  BlockRootEmptyTxFirstRollupArtifact: BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
  BlockRootRollupArtifact: BLOCK_ROOT_ROLLUP_VK_INDEX,
  BlockRootSingleTxRollupArtifact: BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
  BlockRootMsgsOnlyRollupArtifact: BLOCK_ROOT_MSGS_ONLY_ROLLUP_VK_INDEX,
  BlockMergeRollupArtifact: BLOCK_MERGE_ROLLUP_VK_INDEX,
  CheckpointRootRollupArtifact: CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
  CheckpointRootSingleBlockRollupArtifact: CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
  CheckpointPaddingRollupArtifact: CHECKPOINT_PADDING_ROLLUP_VK_INDEX,
  CheckpointMergeRollupArtifact: CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
  RootRollupArtifact: ROOT_ROLLUP_VK_INDEX,
  ...PrivateKernelResetVkIndexes,
  ...PrivateKernelResetTailVkIndexes,
  ...PrivateKernelResetTailToPublicVkIndexes,
};
