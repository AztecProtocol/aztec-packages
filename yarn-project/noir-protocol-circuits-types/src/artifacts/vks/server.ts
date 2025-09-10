import {
  BASE_PARITY_INDEX,
  BLOCK_MERGE_ROLLUP_INDEX,
  BLOCK_ROOT_ROLLUP_EMPTY_INDEX,
  BLOCK_ROOT_ROLLUP_INDEX,
  BLOCK_ROOT_ROLLUP_PADDING_INDEX,
  BLOCK_ROOT_ROLLUP_SINGLE_TX_INDEX,
  HIDING_KERNEL_TO_PUBLIC_VK_INDEX,
  HIDING_KERNEL_TO_ROLLUP_VK_INDEX,
  MERGE_ROLLUP_INDEX,
  PRIVATE_BASE_ROLLUP_VK_INDEX,
  PRIVATE_KERNEL_INIT_INDEX,
  PRIVATE_KERNEL_INNER_INDEX,
  PRIVATE_KERNEL_TAIL_INDEX,
  PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX,
  PUBLIC_BASE_ROLLUP_VK_INDEX,
  PUBLIC_TUBE_VK_INDEX,
  ROOT_PARITY_INDEX,
  ROOT_ROLLUP_INDEX,
} from '@aztec/constants';
import { VerificationKeyData } from '@aztec/stdlib/vks';

import BaseParity from '../../../artifacts/parity_base.json' with { type: 'json' };
import RootParity from '../../../artifacts/parity_root.json' with { type: 'json' };
import PrivateBaseRollup from '../../../artifacts/rollup_base_private.json' with { type: 'json' };
import PublicBaseRollup from '../../../artifacts/rollup_base_public.json' with { type: 'json' };
import BlockMergeRollup from '../../../artifacts/rollup_block_merge.json' with { type: 'json' };
import BlockRootRollup from '../../../artifacts/rollup_block_root.json' with { type: 'json' };
import EmptyBlockRootRollup from '../../../artifacts/rollup_block_root_empty.json' with { type: 'json' };
import PaddingBlockRootRollup from '../../../artifacts/rollup_block_root_padding.json' with { type: 'json' };
import SingleTxBlockRootRollup from '../../../artifacts/rollup_block_root_single_tx.json' with { type: 'json' };
import MergeRollup from '../../../artifacts/rollup_merge.json' with { type: 'json' };
import RootRollup from '../../../artifacts/rollup_root.json' with { type: 'json' };
import PublicTube from '../../../artifacts/tube_public.json' with { type: 'json' };
import { PrivateKernelResetVkIndexes } from '../../private_kernel_reset_vks.js';
import { abiToVKData } from '../../utils/vk_json.js';
import type { ProtocolCircuitName, ServerProtocolCircuitName } from '../types.js';

export const ServerCircuitVks: Record<ServerProtocolCircuitName, VerificationKeyData> = {
  BaseParityArtifact: abiToVKData(BaseParity),
  RootParityArtifact: abiToVKData(RootParity),
  PublicTube: abiToVKData(PublicTube),
  PrivateBaseRollupArtifact: abiToVKData(PrivateBaseRollup),
  PublicBaseRollupArtifact: abiToVKData(PublicBaseRollup),
  MergeRollupArtifact: abiToVKData(MergeRollup),
  BlockRootRollupArtifact: abiToVKData(BlockRootRollup),
  SingleTxBlockRootRollupArtifact: abiToVKData(SingleTxBlockRootRollup),
  EmptyBlockRootRollupArtifact: abiToVKData(EmptyBlockRootRollup),
  PaddingBlockRootRollupArtifact: abiToVKData(PaddingBlockRootRollup),
  BlockMergeRollupArtifact: abiToVKData(BlockMergeRollup),
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
  BaseParityArtifact: BASE_PARITY_INDEX,
  RootParityArtifact: ROOT_PARITY_INDEX,
  PrivateBaseRollupArtifact: PRIVATE_BASE_ROLLUP_VK_INDEX,
  PublicBaseRollupArtifact: PUBLIC_BASE_ROLLUP_VK_INDEX,
  MergeRollupArtifact: MERGE_ROLLUP_INDEX,
  BlockRootRollupArtifact: BLOCK_ROOT_ROLLUP_INDEX,
  SingleTxBlockRootRollupArtifact: BLOCK_ROOT_ROLLUP_SINGLE_TX_INDEX,
  EmptyBlockRootRollupArtifact: BLOCK_ROOT_ROLLUP_EMPTY_INDEX,
  PaddingBlockRootRollupArtifact: BLOCK_ROOT_ROLLUP_PADDING_INDEX,
  BlockMergeRollupArtifact: BLOCK_MERGE_ROLLUP_INDEX,
  RootRollupArtifact: ROOT_ROLLUP_INDEX,
  ...PrivateKernelResetVkIndexes,
};
