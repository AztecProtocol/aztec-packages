import { SiblingPathSource } from '../interfaces/merkle_tree.js';

/**
 * An interface for a tree that can record snapshots of its contents.
 */
export interface SnapshotBuilder {
  /**
   * Creates a snapshot of the tree at the given version.
   * @param block - The version to snapshot the tree at.
   */
  snapshot(block: number): Promise<SiblingPathSource>;

  /**
   * Returns a snapshot of the tree at the given version.
   * @param block - The version of the snapshot to return.
   */
  getSnapshot(block: number): Promise<SiblingPathSource>;
}
