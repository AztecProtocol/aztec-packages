import {
  BASE_PARITY_INDEX,
  BLOCK_MERGE_ROLLUP_INDEX,
  BLOCK_ROOT_ROLLUP_EMPTY_INDEX,
  BLOCK_ROOT_ROLLUP_INDEX,
  BLOCK_ROOT_ROLLUP_PADDING_INDEX,
  BLOCK_ROOT_ROLLUP_SINGLE_TX_INDEX,
  MERGE_ROLLUP_INDEX,
  PRIVATE_BASE_ROLLUP_VK_INDEX,
  PRIVATE_KERNEL_INIT_INDEX,
  PRIVATE_KERNEL_INNER_INDEX,
  PRIVATE_KERNEL_TAIL_INDEX,
  PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX,
  PRIVATE_TUBE_VK_INDEX,
  PUBLIC_BASE_ROLLUP_VK_INDEX,
  PUBLIC_TUBE_VK_INDEX,
  ROOT_PARITY_INDEX,
  ROOT_ROLLUP_INDEX,
} from '@aztec/constants';
import { VerificationKeyData } from '@aztec/stdlib/vks';

import BaseParityVkJson from '../../../artifacts/keys/parity_base.vk.data.json' with { type: 'json' };
import RootParityVkJson from '../../../artifacts/keys/parity_root.vk.data.json' with { type: 'json' };
import PrivateTubeVkJson from '../../../artifacts/keys/private_tube.vk.data.json' with { type: 'json' };
import PublicTubeVkJson from '../../../artifacts/keys/public_tube.vk.data.json' with { type: 'json' };
import PrivateBaseRollupVkJson from '../../../artifacts/keys/rollup_base_private.vk.data.json' with { type: 'json' };
import PublicBaseRollupVkJson from '../../../artifacts/keys/rollup_base_public.vk.data.json' with { type: 'json' };
import BlockMergeRollupVkJson from '../../../artifacts/keys/rollup_block_merge.vk.data.json' with { type: 'json' };
import BlockRootRollupVkJson from '../../../artifacts/keys/rollup_block_root.vk.data.json' with { type: 'json' };
import EmptyBlockRootRollupVkJson from '../../../artifacts/keys/rollup_block_root_empty.vk.data.json' with { type: 'json' };
import PaddingBlockRootRollupVkJson from '../../../artifacts/keys/rollup_block_root_padding.vk.data.json' with { type: 'json' };
import SingleTxBlockRootRollupVkJson from '../../../artifacts/keys/rollup_block_root_single_tx.vk.data.json' with { type: 'json' };
import MergeRollupVkJson from '../../../artifacts/keys/rollup_merge.vk.data.json' with { type: 'json' };
import RootRollupVkJson from '../../../artifacts/keys/rollup_root.vk.data.json' with { type: 'json' };
import { PrivateKernelResetVkIndexes } from '../../private_kernel_reset_vks.js';
import { keyJsonToVKData } from '../../utils/vk_json.js';
import type { ProtocolCircuitName, ServerProtocolCircuitName } from '../types.js';

export const ServerCircuitVks: Record<ServerProtocolCircuitName, VerificationKeyData> = {
  BaseParityArtifact: keyJsonToVKData(BaseParityVkJson),
  RootParityArtifact: keyJsonToVKData(RootParityVkJson),
  PrivateBaseRollupArtifact: keyJsonToVKData(PrivateBaseRollupVkJson),
  PublicBaseRollupArtifact: keyJsonToVKData(PublicBaseRollupVkJson),
  MergeRollupArtifact: keyJsonToVKData(MergeRollupVkJson),
  BlockRootRollupArtifact: keyJsonToVKData(BlockRootRollupVkJson),
  SingleTxBlockRootRollupArtifact: keyJsonToVKData(SingleTxBlockRootRollupVkJson),
  EmptyBlockRootRollupArtifact: keyJsonToVKData(EmptyBlockRootRollupVkJson),
  PaddingBlockRootRollupArtifact: keyJsonToVKData(PaddingBlockRootRollupVkJson),
  BlockMergeRollupArtifact: keyJsonToVKData(BlockMergeRollupVkJson),
  RootRollupArtifact: keyJsonToVKData(RootRollupVkJson),
  PrivateTube: keyJsonToVKData(PrivateTubeVkJson),
  PublicTube: keyJsonToVKData(PublicTubeVkJson),
};

export const ProtocolCircuitVkIndexes: Record<ProtocolCircuitName, number> = {
  PrivateKernelInitArtifact: PRIVATE_KERNEL_INIT_INDEX,
  PrivateKernelInnerArtifact: PRIVATE_KERNEL_INNER_INDEX,
  PrivateKernelTailArtifact: PRIVATE_KERNEL_TAIL_INDEX,
  PrivateKernelTailToPublicArtifact: PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX,
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
  PrivateTube: PRIVATE_TUBE_VK_INDEX,
  PublicTube: PUBLIC_TUBE_VK_INDEX,
  ...PrivateKernelResetVkIndexes,
};
