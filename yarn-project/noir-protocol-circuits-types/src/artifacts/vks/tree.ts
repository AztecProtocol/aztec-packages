import { VK_TREE_HEIGHT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { assertLength } from '@aztec/foundation/serialize';
import type { MerkleTree } from '@aztec/foundation/trees';
import { VerificationKeyAsFields, VerificationKeyData } from '@aztec/stdlib/vks';

import { vkTree } from '../../vk_tree.js';

export function getVKTree(): MerkleTree {
  return vkTree;
}

export function getVKTreeRoot() {
  return Fr.fromBuffer(vkTree.root);
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

  const index = vkTree.getIndex(hash.toBuffer());
  if (index < 0) {
    throw new Error(`VK index for ${hash.toString()} not found in VK tree`);
  }
  return index;
}

export function getVKSiblingPath(vkIndex: number) {
  return assertLength<Fr, typeof VK_TREE_HEIGHT>(
    vkTree.getSiblingPath(vkIndex).map(buf => new Fr(buf)),
    VK_TREE_HEIGHT,
  );
}
