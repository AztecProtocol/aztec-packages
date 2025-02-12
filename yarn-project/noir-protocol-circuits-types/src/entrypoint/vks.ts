import { Fr, VK_TREE_HEIGHT, VerificationKeyAsFields, VerificationKeyData } from '@aztec/circuits.js';
import { assertLength } from '@aztec/foundation/serialize';

import { vkTree } from '../vk_tree.js';

export * from '../artifacts/vks.js';

export function getVKTree() {
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
