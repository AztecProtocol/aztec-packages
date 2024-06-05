import {
  BASE_PARITY_INDEX,
  BASE_ROLLUP_INDEX,
  EMPTY_NESTED_INDEX,
  Fr,
  MERGE_ROLLUP_INDEX,
  type MerkleTree,
  MerkleTreeCalculator,
  PRIVATE_KERNEL_EMPTY_INDEX,
  PRIVATE_KERNEL_INIT_INDEX,
  PRIVATE_KERNEL_INNER_INDEX,
  PRIVATE_KERNEL_RESET_BIG_INDEX,
  PRIVATE_KERNEL_RESET_FULL_INDEX,
  PRIVATE_KERNEL_RESET_MEDIUM_INDEX,
  PRIVATE_KERNEL_RESET_SMALL_INDEX,
  PRIVATE_KERNEL_TAIL_INDEX,
  PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX,
  PUBLIC_KERNEL_APP_LOGIC_INDEX,
  PUBLIC_KERNEL_SETUP_INDEX,
  PUBLIC_KERNEL_TAIL_INDEX,
  PUBLIC_KERNEL_TEARDOWN_INDEX,
  ROOT_PARITY_INDEX,
  ROOT_ROLLUP_INDEX,
  VK_TREE_HEIGHT,
  VerificationKeyAsFields,
} from '@aztec/circuits.js';

import { type ClientProtocolArtifact, type ProtocolArtifact, type ServerProtocolArtifact } from './artifacts.js';
import EmptyNestedVkJson from './target/keys/empty_nested.vk.json' assert { type: 'json' };
import BaseParityVkJson from './target/keys/parity_base.vk.json' assert { type: 'json' };
import RootParityVkJson from './target/keys/parity_root.vk.json' assert { type: 'json' };
import PrivateKernelEmptyVkJson from './target/keys/private_kernel_empty.vk.json' assert { type: 'json' };
import PrivateKernelInitVkJson from './target/keys/private_kernel_init.vk.json' assert { type: 'json' };
import PrivateKernelInnerVkJson from './target/keys/private_kernel_inner.vk.json' assert { type: 'json' };
import PrivateKernelResetFullVkJson from './target/keys/private_kernel_reset.vk.json' assert { type: 'json' };
import PrivateKernelResetBigVkJson from './target/keys/private_kernel_reset_big.vk.json' assert { type: 'json' };
import PrivateKernelResetMediumVkJson from './target/keys/private_kernel_reset_medium.vk.json' assert { type: 'json' };
import PrivateKernelResetSmallVkJson from './target/keys/private_kernel_reset_small.vk.json' assert { type: 'json' };
import PrivateKernelTailVkJson from './target/keys/private_kernel_tail.vk.json' assert { type: 'json' };
import PrivateKernelTailToPublicVkJson from './target/keys/private_kernel_tail_to_public.vk.json' assert { type: 'json' };
import PublicKernelAppLogicVkJson from './target/keys/public_kernel_app_logic.vk.json' assert { type: 'json' };
import PublicKernelSetupVkJson from './target/keys/public_kernel_setup.vk.json' assert { type: 'json' };
import PublicKernelTailVkJson from './target/keys/public_kernel_tail.vk.json' assert { type: 'json' };
import PublicKernelTeardownVkJson from './target/keys/public_kernel_teardown.vk.json' assert { type: 'json' };
import BaseRollupVkJson from './target/keys/rollup_base.vk.json' assert { type: 'json' };
import MergeRollupVkJson from './target/keys/rollup_merge.vk.json' assert { type: 'json' };
import RootRollupVkJson from './target/keys/rollup_root.vk.json' assert { type: 'json' };

function jsonToVKData(json: any): VerificationKeyAsFields {
  const vk = new VerificationKeyAsFields(
    json.slice(1).map((str: `0x${string}`) => new Fr(Buffer.from(str.slice(2), 'hex'))),
    new Fr(Buffer.from(json[0].slice(2), 'hex')),
  );
  return vk;
}

const ServerCircuitVks: Record<ServerProtocolArtifact, VerificationKeyAsFields> = {
  EmptyNestedArtifact: jsonToVKData(EmptyNestedVkJson),
  PrivateKernelEmptyArtifact: jsonToVKData(PrivateKernelEmptyVkJson),
  PublicKernelSetupArtifact: jsonToVKData(PublicKernelSetupVkJson),
  PublicKernelAppLogicArtifact: jsonToVKData(PublicKernelAppLogicVkJson),
  PublicKernelTeardownArtifact: jsonToVKData(PublicKernelTeardownVkJson),
  PublicKernelTailArtifact: jsonToVKData(PublicKernelTailVkJson),
  BaseParityArtifact: jsonToVKData(BaseParityVkJson),
  RootParityArtifact: jsonToVKData(RootParityVkJson),
  BaseRollupArtifact: jsonToVKData(BaseRollupVkJson),
  MergeRollupArtifact: jsonToVKData(MergeRollupVkJson),
  RootRollupArtifact: jsonToVKData(RootRollupVkJson),
};

const ClientCircuitVks: Record<ClientProtocolArtifact, VerificationKeyAsFields> = {
  PrivateKernelInitArtifact: jsonToVKData(PrivateKernelInitVkJson),
  PrivateKernelInnerArtifact: jsonToVKData(PrivateKernelInnerVkJson),
  PrivateKernelResetFullArtifact: jsonToVKData(PrivateKernelResetFullVkJson),
  PrivateKernelResetBigArtifact: jsonToVKData(PrivateKernelResetBigVkJson),
  PrivateKernelResetMediumArtifact: jsonToVKData(PrivateKernelResetMediumVkJson),
  PrivateKernelResetSmallArtifact: jsonToVKData(PrivateKernelResetSmallVkJson),
  PrivateKernelTailArtifact: jsonToVKData(PrivateKernelTailVkJson),
  PrivateKernelTailToPublicArtifact: jsonToVKData(PrivateKernelTailToPublicVkJson),
};

export const ProtocolCircuitVks: Record<ProtocolArtifact, VerificationKeyAsFields> = {
  ...ClientCircuitVks,
  ...ServerCircuitVks,
};

export const ProtocolCircuitVkIndexes: Record<ProtocolArtifact, number> = {
  EmptyNestedArtifact: EMPTY_NESTED_INDEX,
  PrivateKernelEmptyArtifact: PRIVATE_KERNEL_EMPTY_INDEX,
  PrivateKernelInitArtifact: PRIVATE_KERNEL_INIT_INDEX,
  PrivateKernelInnerArtifact: PRIVATE_KERNEL_INNER_INDEX,
  PrivateKernelResetFullArtifact: PRIVATE_KERNEL_RESET_FULL_INDEX,
  PrivateKernelResetBigArtifact: PRIVATE_KERNEL_RESET_BIG_INDEX,
  PrivateKernelResetMediumArtifact: PRIVATE_KERNEL_RESET_MEDIUM_INDEX,
  PrivateKernelResetSmallArtifact: PRIVATE_KERNEL_RESET_SMALL_INDEX,
  PrivateKernelTailArtifact: PRIVATE_KERNEL_TAIL_INDEX,
  PrivateKernelTailToPublicArtifact: PRIVATE_KERNEL_TAIL_TO_PUBLIC_INDEX,
  PublicKernelSetupArtifact: PUBLIC_KERNEL_SETUP_INDEX,
  PublicKernelAppLogicArtifact: PUBLIC_KERNEL_APP_LOGIC_INDEX,
  PublicKernelTeardownArtifact: PUBLIC_KERNEL_TEARDOWN_INDEX,
  PublicKernelTailArtifact: PUBLIC_KERNEL_TAIL_INDEX,
  BaseParityArtifact: BASE_PARITY_INDEX,
  RootParityArtifact: ROOT_PARITY_INDEX,
  BaseRollupArtifact: BASE_ROLLUP_INDEX,
  MergeRollupArtifact: MERGE_ROLLUP_INDEX,
  RootRollupArtifact: ROOT_ROLLUP_INDEX,
};

function buildVKTree() {
  const calculator = new MerkleTreeCalculator(VK_TREE_HEIGHT);
  const vkHashes = new Array(2 ** VK_TREE_HEIGHT).fill(Buffer.alloc(32));

  for (const [key, value] of Object.entries(ProtocolCircuitVks)) {
    const index = ProtocolCircuitVkIndexes[key as ProtocolArtifact];
    vkHashes[index] = value.hash.toBuffer();
  }

  return calculator.computeTree(vkHashes);
}

let vkTree: MerkleTree | undefined;

export function getVKTree() {
  if (!vkTree) {
    vkTree = buildVKTree();
  }
  return vkTree;
}
