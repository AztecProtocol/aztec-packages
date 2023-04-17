import { TreeBase } from '../tree_base.js';

/**
 * A Merkle tree implementation that uses a LevelDB database to store the tree.
 */
export class StandardMerkleTree extends TreeBase {
  /**
   * Appends the given leaves to the tree.
   * @param leaves - The leaves to append.
   * @returns Empty promise.
   */
  public async appendLeaves(leaves: Buffer[]): Promise<void> {
    const numLeaves = this.getNumLeaves(true);
    if (numLeaves + BigInt(leaves.length) - 1n > this.maxIndex) {
      throw Error(`Can't append beyond max index. Max index: ${this.maxIndex}`);
    }
    for (let i = 0; i < leaves.length; i++) {
      const index = numLeaves + BigInt(i);
      await this.addLeafToCacheAndHashToRoot(leaves[i], index);
    }
    this.cachedSize = numLeaves + BigInt(leaves.length);
  }

  /**
   * Updates a leaf in the tree.
   * @param leaf - New contents of the leaf.
   * @param index - Index of the leaf to be updated.
   */
  public async updateLeaf(leaf: Buffer, index: bigint) {
    if (index > this.maxIndex) {
      throw Error(`Index out of bounds. Index ${index}, max index: ${this.maxIndex}.`);
    }
    await this.addLeafToCacheAndHashToRoot(leaf, index);
    const numLeaves = this.getNumLeaves(true);
    if (index >= numLeaves) {
      this.cachedSize = index + 1n;
    }
  }

  /**
   * Force increase the size of the tree
   */
  public forceAppendEmptyLeaf() {
    const newSize = (this.cachedSize ?? this.size) + 1n;
    if (newSize - 1n > this.maxIndex) {
      throw Error(`Can't append beyond max index. Max index: ${this.maxIndex}`);
    }
    this.cachedSize = newSize;
  }
}
