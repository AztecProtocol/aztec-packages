import { LeafData } from '@aztec/types';

import { SiblingPathSource } from '../interfaces/merkle_tree.js';

/**
 * An interface for a tree that can record snapshots of its contents.
 */
export interface TreeSnapshotBuilder<S extends TreeSnapshot = TreeSnapshot> {
  /**
   * Creates a snapshot of the tree at the given version.
   * @param block - The version to snapshot the tree at.
   */
  snapshot(block: number): Promise<S>;

  /**
   * Returns a snapshot of the tree at the given version.
   * @param block - The version of the snapshot to return.
   */
  getSnapshot(block: number): Promise<S>;
}

/**
 * A tree snapshot
 */
export interface TreeSnapshot extends SiblingPathSource {}

/** A snapshot of an indexed tree */
export interface IndexedTreeSnapshot extends SiblingPathSource {
  /**
   * Gets the historical data for a leaf
   * @param index - The index of the leaf to get the data for
   */
  getLatestLeafDataCopy(index: bigint): Promise<LeafData | undefined>;
}
