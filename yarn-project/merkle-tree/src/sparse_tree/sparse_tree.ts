import { TreeBase } from '../tree_base.js';

/**
 * A Merkle tree implementation that uses a LevelDB database to store the tree.
 */
export class SparseMerkleTree extends TreeBase {
  /**
   * Appends the given leaves to the tree.
   * @param leaves - The leaves to append.
   * @returns Empty promise.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public appendLeaves(leaves: Buffer[]): Promise<void> {
    throw Error('Not implemented');
  }

  /**
   * Updates a leaf in the tree.
   * @param leaf - New contents of the leaf.
   * @param index - Index of the leaf to be updated.
   */
  public async updateLeaf(leaf: Buffer, index: bigint): Promise<void> {
    if (index > this.maxIndex) {
      throw Error(`Index out of bounds. Index ${index}, max index: ${this.maxIndex}.`);
    }
    const insertingZeroElement = leaf.equals(SparseMerkleTree.ZERO_ELEMENT);
    const originallyZeroElement = (await this.getLeafValue(index, true))?.equals(SparseMerkleTree.ZERO_ELEMENT);
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
