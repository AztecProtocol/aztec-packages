import { TreeSnapshotBuilder } from '../snapshots/snapshot_builder.js';
import { MerkleTree } from './merkle_tree.js';

/**
 * A Merkle tree that supports updates at arbitrary indices but not appending.
 */
export interface UpdateOnlyTree extends MerkleTree, TreeSnapshotBuilder {
  /**
   * Updates a leaf at a given index in the tree.
   * @param leaf - The leaf value to be updated.
   * @param index - The leaf to be updated.
   */
  updateLeaf(leaf: Buffer, index: bigint): Promise<void>;
}
