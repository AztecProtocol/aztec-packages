import { UpdateOnlyTree } from '../interfaces/update_only_tree.js';
import { TreeBaseStaticInitializable } from '../tree_base_static_initializable.js';

/**
 * A Merkle tree implementation that uses a LevelDB database to store the tree.
 */
export class SparseTree extends TreeBaseStaticInitializable implements UpdateOnlyTree {
  /**
   * Updates a leaf in the tree.
   * @param leaf - New contents of the leaf.
   * @param index - Index of the leaf to be updated.
   */
  public async updateLeaf(leaf: Buffer, index: bigint): Promise<void> {
    if (index > this.maxIndex) {
      throw Error(`Index out of bounds. Index ${index}, max index: ${this.maxIndex}.`);
    }
    const insertingZeroElement = leaf.equals(SparseTree.ZERO_ELEMENT);
    const originallyZeroElement = (await this.getLeafValue(index, true))?.equals(SparseTree.ZERO_ELEMENT);
    if (insertingZeroElement && originallyZeroElement) {
      return;
    }
    await this.addLeafToCacheAndHashToRoot(leaf, index);
    if (insertingZeroElement) {
      // Deleting element (originally non-zero and new value is zero)
      this.cachedSize = (this.cachedSize ?? this.size) - 1n;
    } else if (originallyZeroElement) {
      // Inserting new element (originally zero and new value is non-zero)
      this.cachedSize = (this.cachedSize ?? this.size) + 1n;
    }
  }
}
