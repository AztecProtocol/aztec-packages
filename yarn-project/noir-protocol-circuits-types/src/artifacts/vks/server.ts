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
  PRIVATE_TUBE_VK_INDEX,
  PRIVATE_TX_BASE_ROLLUP_VK_INDEX,
  PUBLIC_TUBE_VK_INDEX,
  PUBLIC_TX_BASE_ROLLUP_VK_INDEX,
  ROOT_ROLLUP_VK_INDEX,
  TX_MERGE_ROLLUP_VK_INDEX,
} from '@aztec/constants';
import { VerificationKeyData } from '@aztec/stdlib/vks';

import ParityBaseVkJson from '../../../artifacts/keys/parity_base.vk.data.json' with { type: 'json' };
import ParityRootVkJson from '../../../artifacts/keys/parity_root.vk.data.json' with { type: 'json' };
import PrivateTubeVkJson from '../../../artifacts/keys/private_tube.vk.data.json' with { type: 'json' };
import PublicTubeVkJson from '../../../artifacts/keys/public_tube.vk.data.json' with { type: 'json' };
import BlockMergeRollupVkJson from '../../../artifacts/keys/rollup_block_merge.vk.data.json' with { type: 'json' };
import BlockRootRollupVkJson from '../../../artifacts/keys/rollup_block_root.vk.data.json' with { type: 'json' };
import BlockRootFirstRollupVkJson from '../../../artifacts/keys/rollup_block_root_first.vk.data.json' with { type: 'json' };
import BlockRootEmptyTxFirstRollupVkJson from '../../../artifacts/keys/rollup_block_root_first_empty_tx.vk.data.json' with { type: 'json' };
import BlockRootSingleTxFirstRollupVkJson from '../../../artifacts/keys/rollup_block_root_first_single_tx.vk.data.json' with { type: 'json' };
import BlockRootSingleTxRollupVkJson from '../../../artifacts/keys/rollup_block_root_single_tx.vk.data.json' with { type: 'json' };
import CheckpointMergeRollupVkJson from '../../../artifacts/keys/rollup_checkpoint_merge.vk.data.json' with { type: 'json' };
import CheckpointPaddingRollupVkJson from '../../../artifacts/keys/rollup_checkpoint_padding.vk.data.json' with { type: 'json' };
import CheckpointRootRollupVkJson from '../../../artifacts/keys/rollup_checkpoint_root.vk.data.json' with { type: 'json' };
import CheckpointRootSingleBlockRollupVkJson from '../../../artifacts/keys/rollup_checkpoint_root_single_block.vk.data.json' with { type: 'json' };
import RootRollupVkJson from '../../../artifacts/keys/rollup_root.vk.data.json' with { type: 'json' };
import PrivateTxBaseRollupVkJson from '../../../artifacts/keys/rollup_tx_base_private.vk.data.json' with { type: 'json' };
import PublicTxBaseRollupVkJson from '../../../artifacts/keys/rollup_tx_base_public.vk.data.json' with { type: 'json' };
import TxMergeRollupVkJson from '../../../artifacts/keys/rollup_tx_merge.vk.data.json' with { type: 'json' };
import { PrivateKernelResetVkIndexes } from '../../private_kernel_reset_vks.js';
import { keyJsonToVKData } from '../../utils/vk_json.js';
import type { ProtocolCircuitName, ServerProtocolCircuitName } from '../types.js';

export const ServerCircuitVks: Record<ServerProtocolCircuitName, VerificationKeyData> = {
  ParityBaseArtifact: keyJsonToVKData(ParityBaseVkJson),
  ParityRootArtifact: keyJsonToVKData(ParityRootVkJson),
  PrivateTxBaseRollupArtifact: keyJsonToVKData(PrivateTxBaseRollupVkJson),
  PublicTxBaseRollupArtifact: keyJsonToVKData(PublicTxBaseRollupVkJson),
  TxMergeRollupArtifact: keyJsonToVKData(TxMergeRollupVkJson),
  BlockRootFirstRollupArtifact: keyJsonToVKData(BlockRootFirstRollupVkJson),
  BlockRootSingleTxFirstRollupArtifact: keyJsonToVKData(BlockRootSingleTxFirstRollupVkJson),
  BlockRootEmptyTxFirstRollupArtifact: keyJsonToVKData(BlockRootEmptyTxFirstRollupVkJson),
  BlockRootSingleTxRollupArtifact: keyJsonToVKData(BlockRootSingleTxRollupVkJson),
  BlockRootRollupArtifact: keyJsonToVKData(BlockRootRollupVkJson),
  BlockMergeRollupArtifact: keyJsonToVKData(BlockMergeRollupVkJson),
  CheckpointRootRollupArtifact: keyJsonToVKData(CheckpointRootRollupVkJson),
  CheckpointRootSingleBlockRollupArtifact: keyJsonToVKData(CheckpointRootSingleBlockRollupVkJson),
  CheckpointPaddingRollupArtifact: keyJsonToVKData(CheckpointPaddingRollupVkJson),
  CheckpointMergeRollupArtifact: keyJsonToVKData(CheckpointMergeRollupVkJson),
  RootRollupArtifact: keyJsonToVKData(RootRollupVkJson),
  PrivateTube: keyJsonToVKData(PrivateTubeVkJson),
  PublicTube: keyJsonToVKData(PublicTubeVkJson),
};

export const ProtocolCircuitVkIndexes: Record<ProtocolCircuitName, number> = {
  PrivateKernelInitArtifact: PRIVATE_KERNEL_INIT_INDEX,
  PrivateKernelInnerArtifact: PRIVATE_KERNEL_INNER_INDEX,
  PrivateKernelTailArtifact: PRIVATE_KERNEL_TAIL_INDEX,
  PrivateKernelTailToPublicArtifact: PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX,
  HidingKernelToRollup: HIDING_KERNEL_TO_ROLLUP_VK_INDEX,
  HidingKernelToPublic: HIDING_KERNEL_TO_PUBLIC_VK_INDEX,
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
  PrivateTube: PRIVATE_TUBE_VK_INDEX,
  PublicTube: PUBLIC_TUBE_VK_INDEX,
  ...PrivateKernelResetVkIndexes,
};
