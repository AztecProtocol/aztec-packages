import {
  BLOCK_MERGE_ROLLUP_VK_INDEX,
  BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX,
  BLOCK_ROOT_ROLLUP_VK_INDEX,
  BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
  CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
  CHECKPOINT_PADDING_ROLLUP_VK_INDEX,
  CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
  CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
  HIDING_KERNEL_TO_PUBLIC_VK_INDEX,
  HIDING_KERNEL_TO_ROLLUP_VK_INDEX,
  INBOX_PARITY_64_VK_INDEX,
  INBOX_PARITY_256_VK_INDEX,
  INBOX_PARITY_1024_VK_INDEX,
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
import InboxParity64 from '../../../artifacts/inbox_parity_64.json' with { type: 'json' };
import InboxParity256 from '../../../artifacts/inbox_parity_256.json' with { type: 'json' };
import InboxParity1024 from '../../../artifacts/inbox_parity_1024.json' with { type: 'json' };
import BlockMergeRollup from '../../../artifacts/rollup_block_merge.json' with { type: 'json' };
import BlockRootRollup from '../../../artifacts/rollup_block_root.json' with { type: 'json' };
import BlockRootNoTxsRollup from '../../../artifacts/rollup_block_root_no_txs.json' with { type: 'json' };
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
  InboxParity64Artifact: abiToVKData(InboxParity64),
  InboxParity256Artifact: abiToVKData(InboxParity256),
  InboxParity1024Artifact: abiToVKData(InboxParity1024),
  PublicChonkVerifier: abiToVKData(PublicChonkVerifier),
  PrivateTxBaseRollupArtifact: abiToVKData(PrivateTxBaseRollup),
  PublicTxBaseRollupArtifact: abiToVKData(PublicTxBaseRollup),
  TxMergeRollupArtifact: abiToVKData(TxMergeRollup),
  BlockRootSingleTxRollupArtifact: abiToVKData(BlockRootSingleTxRollup),
  BlockRootRollupArtifact: abiToVKData(BlockRootRollup),
  BlockRootNoTxsRollupArtifact: abiToVKData(BlockRootNoTxsRollup),
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
  InboxParity64Artifact: INBOX_PARITY_64_VK_INDEX,
  InboxParity256Artifact: INBOX_PARITY_256_VK_INDEX,
  InboxParity1024Artifact: INBOX_PARITY_1024_VK_INDEX,
  PrivateTxBaseRollupArtifact: PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
  PublicTxBaseRollupArtifact: PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
  TxMergeRollupArtifact: TX_MERGE_ROLLUP_VK_INDEX,
  BlockRootRollupArtifact: BLOCK_ROOT_ROLLUP_VK_INDEX,
  BlockRootSingleTxRollupArtifact: BLOCK_ROOT_SINGLE_TX_ROLLUP_VK_INDEX,
  BlockRootNoTxsRollupArtifact: BLOCK_ROOT_NO_TXS_ROLLUP_VK_INDEX,
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
