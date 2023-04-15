import { default as memdown, type MemDown } from 'memdown';
import { MerkleTree } from '../merkle_tree.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

export const appendLeaves = async (appendImplemented: boolean, tree: MerkleTree, leaves: Buffer[]) => {
  if (appendImplemented) {
    await tree.appendLeaves(leaves);
  } else {
    // This branch is used by the sparse tree test suite, which does not implement appendLeaves
    for (const value of leaves) {
      const index = tree.getNumLeaves(true);
      await tree.updateLeaf(value, index);
    }
  }
};
