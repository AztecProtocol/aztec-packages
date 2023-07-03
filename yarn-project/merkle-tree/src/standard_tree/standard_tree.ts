import { AppendOnlyTree } from '../interfaces/append_only_tree.js';
import { TreeBase, indexToKeyHash } from '../tree_base.js';

/**
 * A Merkle tree implementation that uses a LevelDB database to store the tree.
 */
export class StandardTree extends TreeBase implements AppendOnlyTree {
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

    // 1. Insert all the leaves,
    // 2. on the level above, update all values from Math.floor(firstIndex/2) to Math.floor(lastIndex/2)
    //    --> if Math.floor(firstIndex/2) == Math.floor(lastIndex/2) then we can switch to standard hash to root method

    // 1. Insert all the leaves
    let firstIndex = numLeaves;
    let level = this.depth;
    for (let i = 0; i < leaves.length; i++) {
      const cacheKey = indexToKeyHash(this.name, level, firstIndex + BigInt(i));
      this.cache[cacheKey] = leaves[i];
    }

    // 2. Start hashing layers above
    let lastIndex = firstIndex + BigInt(leaves.length);
    while (level > 0) {
      firstIndex >>= 1n;
      lastIndex >>= 1n;
      // Iterate over all the affected nodes at this level
      for (let index = firstIndex; index <= lastIndex; index++) {
        const lhs = await this.getLatestValueAtIndex(level, index * 2n, true);
        const rhs = await this.getLatestValueAtIndex(level, index * 2n + 1n, true);
        const cacheKey = indexToKeyHash(this.name, level - 1, index);
        this.cache[cacheKey] = this.hasher.compress(lhs, rhs);
      }

      level -= 1;
    }
    this.cachedSize = numLeaves + BigInt(leaves.length);
  }
}
