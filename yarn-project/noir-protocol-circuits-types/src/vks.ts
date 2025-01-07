import {
  BASE_PARITY_INDEX,
  BLOCK_MERGE_ROLLUP_INDEX,
  BLOCK_ROOT_ROLLUP_EMPTY_INDEX,
  BLOCK_ROOT_ROLLUP_INDEX,
  BLOCK_ROOT_ROLLUP_SINGLE_TX_INDEX,
  Fr,
  MERGE_ROLLUP_INDEX,
  type MerkleTree,
  MerkleTreeCalculator,
  PRIVATE_BASE_ROLLUP_VK_INDEX,
  PRIVATE_KERNEL_INIT_INDEX,
  PRIVATE_KERNEL_INNER_INDEX,
  PRIVATE_KERNEL_TAIL_INDEX,
  PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX,
  PUBLIC_BASE_ROLLUP_VK_INDEX,
  ROOT_PARITY_INDEX,
  ROOT_ROLLUP_INDEX,
  TUBE_VK_INDEX,
  VK_TREE_HEIGHT,
  VerificationKeyAsFields,
  VerificationKeyData,
} from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { assertLength } from '@aztec/foundation/serialize';

import BaseParityVkJson from '../artifacts/keys/parity_base.vk.data.json' assert { type: 'json' };
import RootParityVkJson from '../artifacts/keys/parity_root.vk.data.json' assert { type: 'json' };
import PrivateKernelInitVkJson from '../artifacts/keys/private_kernel_init.vk.data.json' assert { type: 'json' };
import PrivateKernelInnerVkJson from '../artifacts/keys/private_kernel_inner.vk.data.json' assert { type: 'json' };
import PrivateKernelTailVkJson from '../artifacts/keys/private_kernel_tail.vk.data.json' assert { type: 'json' };
import PrivateKernelTailToPublicVkJson from '../artifacts/keys/private_kernel_tail_to_public.vk.data.json' assert { type: 'json' };
import PrivateBaseRollupVkJson from '../artifacts/keys/rollup_base_private.vk.data.json' assert { type: 'json' };
import PublicBaseRollupVkJson from '../artifacts/keys/rollup_base_public.vk.data.json' assert { type: 'json' };
import BlockMergeRollupVkJson from '../artifacts/keys/rollup_block_merge.vk.data.json' assert { type: 'json' };
import BlockRootRollupVkJson from '../artifacts/keys/rollup_block_root.vk.data.json' assert { type: 'json' };
import EmptyBlockRootRollupVkJson from '../artifacts/keys/rollup_block_root_empty.vk.data.json' assert { type: 'json' };
import SingleTxBlockRootRollupVkJson from '../artifacts/keys/rollup_block_root_single_tx.vk.data.json' assert { type: 'json' };
import MergeRollupVkJson from '../artifacts/keys/rollup_merge.vk.data.json' assert { type: 'json' };
import RootRollupVkJson from '../artifacts/keys/rollup_root.vk.data.json' assert { type: 'json' };
import TubeVkJson from '../artifacts/keys/tube.vk.data.json' assert { type: 'json' };
import { type ClientProtocolArtifact, type ProtocolArtifact, type ServerProtocolArtifact } from './artifacts/index.js';
import { PrivateKernelResetVkIndexes, PrivateKernelResetVks } from './private_kernel_reset_data.js';
import { keyJsonToVKData } from './utils/vk_json.js';

// TODO Include this in the normal maps when the tube is implemented in noir
export const TubeVk = keyJsonToVKData(TubeVkJson);

export const ServerCircuitVks: Record<ServerProtocolArtifact, VerificationKeyData> = {
  BaseParityArtifact: keyJsonToVKData(BaseParityVkJson),
  RootParityArtifact: keyJsonToVKData(RootParityVkJson),
  PrivateBaseRollupArtifact: keyJsonToVKData(PrivateBaseRollupVkJson),
  PublicBaseRollupArtifact: keyJsonToVKData(PublicBaseRollupVkJson),
  MergeRollupArtifact: keyJsonToVKData(MergeRollupVkJson),
  BlockRootRollupArtifact: keyJsonToVKData(BlockRootRollupVkJson),
  SingleTxBlockRootRollupArtifact: keyJsonToVKData(SingleTxBlockRootRollupVkJson),
  EmptyBlockRootRollupArtifact: keyJsonToVKData(EmptyBlockRootRollupVkJson),
  BlockMergeRollupArtifact: keyJsonToVKData(BlockMergeRollupVkJson),
  RootRollupArtifact: keyJsonToVKData(RootRollupVkJson),
};

export const ClientCircuitVks: Record<ClientProtocolArtifact, VerificationKeyData> = {
  PrivateKernelInitArtifact: keyJsonToVKData(PrivateKernelInitVkJson),
  PrivateKernelInnerArtifact: keyJsonToVKData(PrivateKernelInnerVkJson),
  PrivateKernelTailArtifact: keyJsonToVKData(PrivateKernelTailVkJson),
  PrivateKernelTailToPublicArtifact: keyJsonToVKData(PrivateKernelTailToPublicVkJson),
  ...PrivateKernelResetVks,
};

export const ProtocolCircuitVks: Record<ProtocolArtifact, VerificationKeyData> = {
  ...ClientCircuitVks,
  ...ServerCircuitVks,
};

export const ProtocolCircuitVkIndexes: Record<ProtocolArtifact, number> = {
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
  BlockMergeRollupArtifact: BLOCK_MERGE_ROLLUP_INDEX,
  RootRollupArtifact: ROOT_ROLLUP_INDEX,
  ...PrivateKernelResetVkIndexes,
};

function buildVKTree() {
  const calculator = new MerkleTreeCalculator(VK_TREE_HEIGHT, Buffer.alloc(32), (a, b) =>
    poseidon2Hash([a, b]).toBuffer(),
  );
  const vkHashes = new Array(2 ** VK_TREE_HEIGHT).fill(Buffer.alloc(32));

  for (const [key, value] of Object.entries(ProtocolCircuitVks)) {
    const index = ProtocolCircuitVkIndexes[key as ProtocolArtifact];
    vkHashes[index] = value.keyAsFields.hash.toBuffer();
  }

  vkHashes[TUBE_VK_INDEX] = TubeVk.keyAsFields.hash.toBuffer();

  return calculator.computeTree(vkHashes);
}

let vkTree: MerkleTree | undefined;

export function getVKTree() {
  if (!vkTree) {
    vkTree = buildVKTree();
  }
  return vkTree;
}

export function getVKTreeRoot() {
  return Fr.fromBuffer(getVKTree().root);
}

export function getVKIndex(vk: VerificationKeyData | VerificationKeyAsFields | Fr) {
  let hash;
  if (vk instanceof VerificationKeyData) {
    hash = vk.keyAsFields.hash;
  } else if (vk instanceof VerificationKeyAsFields) {
    hash = vk.hash;
  } else {
    hash = vk;
  }

  const index = getVKTree().getIndex(hash.toBuffer());
  if (index < 0) {
    throw new Error(`VK index for ${hash.toString()} not found in VK tree`);
  }
  return index;
}

export function getVKSiblingPath(vkIndex: number) {
  return assertLength<Fr, typeof VK_TREE_HEIGHT>(
    getVKTree()
      .getSiblingPath(vkIndex)
      .map(buf => new Fr(buf)),
    VK_TREE_HEIGHT,
  );
}
