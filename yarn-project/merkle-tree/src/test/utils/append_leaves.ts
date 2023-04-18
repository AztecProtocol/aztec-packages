import { AppendOnlyMerkleTree } from '../../interfaces/append_only_merkle_tree.js';
import { UpdateOnlyMerkleTree } from '../../interfaces/update_only_merkle_tree.js';

export const appendLeaves = async (tree: AppendOnlyMerkleTree | UpdateOnlyMerkleTree, leaves: Buffer[]) => {
  if ('appendLeaves' in tree) {
    // This branch is used by the standard tree test suite, which implements appendLeaves
    await tree.appendLeaves(leaves);
  } else {
    // This branch is used by the sparse tree test suite, which does not implement appendLeaves
    for (const value of leaves) {
      const index = tree.getNumLeaves(true);
      await tree.updateLeaf(value, index);
    }
  }
};
