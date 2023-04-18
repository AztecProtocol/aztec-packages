import { AppendOnlyMerkleTree } from '../interfaces/append_only_merkle_tree.js';
import { MerkleTreeBaseStaticInitializable } from '../merkle_tree_base_static_initializable.js';

/**
 * A Merkle tree implementation that uses a LevelDB database to store the tree.
 */
export class StandardMerkleTree extends MerkleTreeBaseStaticInitializable implements AppendOnlyMerkleTree {
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
}
