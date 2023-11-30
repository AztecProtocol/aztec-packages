import { LeafData } from '@aztec/types';

import { MerkleTree } from './merkle_tree.js';

/**
 * A Merkle tree that supports updates at arbitrary indices but not appending.
 */
export interface UpdateOnlyTree extends MerkleTree {
  /**
   * Updates a leaf at a given index in the tree.
   * @param leaf - The leaf value to be updated.
   * @param index - The leaf to be updated.
   */
  // TODO: Make this strictly a Buffer
  updateLeaf(leaf: Buffer | LeafData, index: bigint): Promise<void>;
}
