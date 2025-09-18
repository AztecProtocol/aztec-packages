import {
  BLOCK_MERGE_ROLLUP_VK_INDEX,
  BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP_VK_INDEX,
  BLOCK_ROOT_FIRST_ROLLUP_VK_INDEX,
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
  PRIVATE_KERNEL_INIT_INDEX,
  PRIVATE_KERNEL_INNER_INDEX,
  PRIVATE_KERNEL_TAIL_INDEX,
  PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX,
  PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
  PUBLIC_TUBE_VK_INDEX,
  PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
  ROOT_ROLLUP_VK_INDEX,
  TX_MERGE_ROLLUP_VK_INDEX,
} from '@aztec/constants';
import { VerificationKeyData } from '@aztec/stdlib/vks';

import ParityBase from '../../../artifacts/parity_base.json' with { type: 'json' };
import ParityRoot from '../../../artifacts/parity_root.json' with { type: 'json' };
import BlockMergeRollup from '../../../artifacts/rollup_block_merge.json' with { type: 'json' };
import BlockRootRollup from '../../../artifacts/rollup_block_root.json' with { type: 'json' };
import BlockRootFirstRollup from '../../../artifacts/rollup_block_root_first.json' with { type: 'json' };
import BlockRootEmptyTxFirstRollup from '../../../artifacts/rollup_block_root_first_empty_tx.json' with { type: 'json' };
import BlockRootSingleTxFirstRollup from '../../../artifacts/rollup_block_root_first_single_tx.json' with { type: 'json' };
import BlockRootSingleTxRollup from '../../../artifacts/rollup_block_root_single_tx.json' with { type: 'json' };
import CheckpointMergeRollup from '../../../artifacts/rollup_checkpoint_merge.json' with { type: 'json' };
import CheckpointPaddingRollup from '../../../artifacts/rollup_checkpoint_padding.json' with { type: 'json' };
import CheckpointRootRollup from '../../../artifacts/rollup_checkpoint_root.json' with { type: 'json' };
import CheckpointRootSingleBlockRollup from '../../../artifacts/rollup_checkpoint_root_single_block.json' with { type: 'json' };
import RootRollup from '../../../artifacts/rollup_root.json' with { type: 'json' };
import PrivateTxBaseRollup from '../../../artifacts/rollup_tx_base_private.json' with { type: 'json' };
import PublicTxBaseRollup from '../../../artifacts/rollup_tx_base_public.json' with { type: 'json' };
import TxMergeRollup from '../../../artifacts/rollup_tx_merge.json' with { type: 'json' };
import PublicTube from '../../../artifacts/tube_public.json' with { type: 'json' };
import { PrivateKernelResetVkIndexes } from '../../private_kernel_reset_vks.js';
import { abiToVKData } from '../../utils/vk_json.js';
import type { ProtocolCircuitName, ServerProtocolCircuitName } from '../types.js';

export const ServerCircuitVks: Record<ServerProtocolCircuitName, VerificationKeyData> = {
  ParityBaseArtifact: abiToVKData(ParityBase),
  ParityRootArtifact: abiToVKData(ParityRoot),
  PublicTube: abiToVKData(PublicTube),
  PrivateTxBaseRollupArtifact: abiToVKData(PrivateTxBaseRollup),
  PublicTxBaseRollupArtifact: abiToVKData(PublicTxBaseRollup),
  TxMergeRollupArtifact: abiToVKData(TxMergeRollup),
  BlockRootFirstRollupArtifact: abiToVKData(BlockRootFirstRollup),
  BlockRootSingleTxFirstRollupArtifact: abiToVKData(BlockRootSingleTxFirstRollup),
  BlockRootEmptyTxFirstRollupArtifact: abiToVKData(BlockRootEmptyTxFirstRollup),
  BlockRootSingleTxRollupArtifact: abiToVKData(BlockRootSingleTxRollup),
  BlockRootRollupArtifact: abiToVKData(BlockRootRollup),
  BlockMergeRollupArtifact: abiToVKData(BlockMergeRollup),
  CheckpointRootRollupArtifact: abiToVKData(CheckpointRootRollup),
  CheckpointRootSingleBlockRollupArtifact: abiToVKData(CheckpointRootSingleBlockRollup),
  CheckpointPaddingRollupArtifact: abiToVKData(CheckpointPaddingRollup),
  CheckpointMergeRollupArtifact: abiToVKData(CheckpointMergeRollup),
  RootRollupArtifact: abiToVKData(RootRollup),
};

export const ProtocolCircuitVkIndexes: Record<ProtocolCircuitName, number> = {
  PrivateKernelInitArtifact: PRIVATE_KERNEL_INIT_INDEX,
  PrivateKernelInnerArtifact: PRIVATE_KERNEL_INNER_INDEX,
  PrivateKernelTailArtifact: PRIVATE_KERNEL_TAIL_INDEX,
  PrivateKernelTailToPublicArtifact: PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX,
  HidingKernelToRollup: HIDING_KERNEL_TO_ROLLUP_VK_INDEX,
  HidingKernelToPublic: HIDING_KERNEL_TO_PUBLIC_VK_INDEX,
  PublicTube: PUBLIC_TUBE_VK_INDEX,
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
  BlockMergeRollupArtifact: BLOCK_MERGE_ROLLUP_VK_INDEX,
  CheckpointRootRollupArtifact: CHECKPOINT_ROOT_ROLLUP_VK_INDEX,
  CheckpointRootSingleBlockRollupArtifact: CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP_VK_INDEX,
  CheckpointPaddingRollupArtifact: CHECKPOINT_PADDING_ROLLUP_VK_INDEX,
  CheckpointMergeRollupArtifact: CHECKPOINT_MERGE_ROLLUP_VK_INDEX,
  RootRollupArtifact: ROOT_ROLLUP_VK_INDEX,
  ...PrivateKernelResetVkIndexes,
};
