import { L2Block, MerkleTreeId, SiblingPath } from '@aztec/circuit-types';
import { Header, NullifierLeafPreimage, StateReference } from '@aztec/circuits.js';
import { IndexedTreeLeafPreimage } from '@aztec/foundation/trees';
import { BatchInsertionResult } from '@aztec/merkle-tree';

import { MerkleTreeDb } from './merkle_tree_db.js';
import { HandleL2BlockResult, MerkleTreeOperations, TreeInfo } from './merkle_tree_operations.js';

/**
 * Wraps a MerkleTreeDbOperations to call all functions with a preset includeUncommitted flag.
 */
export class MerkleTreeOperationsFacade implements MerkleTreeOperations {
  constructor(private trees: MerkleTreeDb, private includeUncommitted: boolean) {}

  /**
   * Returns the tree info for the specified tree id.
   * @param treeId - Id of the tree to get information from.
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   * @returns The tree info for the specified tree.
   */
  getTreeInfo(treeId: MerkleTreeId): Promise<TreeInfo> {
    return this.trees.getTreeInfo(treeId, this.includeUncommitted);
  }

  /**
   * Get the current state reference.
   * @returns The current state reference.
   */
  getStateReference(): Promise<StateReference> {
    return this.trees.getStateReference(this.includeUncommitted);
  }

  /**
   * Builds the initial header.
   * @returns The initial header.
   */
  buildInitialHeader(): Promise<Header> {
    return this.trees.buildInitialHeader(this.includeUncommitted);
  }

  /**
   * Appends a set of leaf values to the tree.
   * @param treeId - Id of the tree to append leaves to.
   * @param leaves - The set of leaves to be appended.
   * @returns The tree info of the specified tree.
   */
  appendLeaves(treeId: MerkleTreeId, leaves: Buffer[]): Promise<void> {
    return this.trees.appendLeaves(treeId, leaves);
  }

  /**
   * Returns the sibling path for a requested leaf index.
   * @param treeId - Id of the tree to get the sibling path from.
   * @param index - The index of the leaf for which a sibling path is required.
   * @returns A promise with the sibling path of the specified leaf index.
   */
  async getSiblingPath<N extends number>(treeId: MerkleTreeId, index: bigint): Promise<SiblingPath<N>> {
    const path = await this.trees.getSiblingPath(treeId, index, this.includeUncommitted);
    return path as unknown as SiblingPath<N>;
  }

  /**
   * Finds the index of the largest leaf whose value is less than or equal to the provided value.
   * @param treeId - The ID of the tree to search.
   * @param value - The value to be inserted into the tree.
   * @param includeUncommitted - If true, the uncommitted changes are included in the search.
   * @returns The found leaf index and a flag indicating if the corresponding leaf's value is equal to `newValue`.
   */
  getPreviousValueIndex(
    treeId: MerkleTreeId.NULLIFIER_TREE,
    value: bigint,
  ): Promise<
    | {
        /**
         * The index of the found leaf.
         */
        index: bigint;
        /**
         * A flag indicating if the corresponding leaf's value is equal to `newValue`.
         */
        alreadyPresent: boolean;
      }
    | undefined
  > {
    return this.trees.getPreviousValueIndex(treeId, value, this.includeUncommitted);
  }

  /**
   * Updates a leaf in a tree at a given index.
   * @param treeId - The ID of the tree.
   * @param leaf - The new leaf value.
   * @param index - The index to insert into.
   * @returns Empty promise.
   */
  updateLeaf(treeId: MerkleTreeId.NULLIFIER_TREE, leaf: NullifierLeafPreimage, index: bigint): Promise<void> {
    return this.trees.updateLeaf(treeId, leaf, index);
  }

  /**
   * Gets the leaf data at a given index and tree.
   * @param treeId - The ID of the tree get the leaf from.
   * @param index - The index of the leaf to get.
   * @returns Leaf preimage.
   */
  async getLeafPreimage(
    treeId: MerkleTreeId.NULLIFIER_TREE,
    index: bigint,
  ): Promise<IndexedTreeLeafPreimage | undefined> {
    const preimage = await this.trees.getLeafPreimage(treeId, index, this.includeUncommitted);
    return preimage as IndexedTreeLeafPreimage | undefined;
  }

  /**
   * Returns the index of a leaf given its value, or undefined if no leaf with that value is found.
   * @param treeId - The ID of the tree.
   * @param value - The leaf value to look for.
   * @returns The index of the first leaf found with a given value (undefined if not found).
   */
  findLeafIndex(treeId: MerkleTreeId, value: Buffer): Promise<bigint | undefined> {
    return this.trees.findLeafIndex(treeId, value, this.includeUncommitted);
  }

  /**
   * Gets the value at the given index.
   * @param treeId - The ID of the tree to get the leaf value from.
   * @param index - The index of the leaf.
   * @param includeUncommitted - Indicates whether to include uncommitted changes.
   * @returns Leaf value at the given index (undefined if not found).
   */
  getLeafValue(treeId: MerkleTreeId, index: bigint): Promise<Buffer | undefined> {
    return this.trees.getLeafValue(treeId, index, this.includeUncommitted);
  }

  /**
   * Inserts the new block hash into the archive.
   * This includes all of the current roots of all of the data trees and the current blocks global vars.
   * @param header - The header to insert into the archive.
   */
  public updateArchive(header: Header): Promise<void> {
    return this.trees.updateArchive(header, this.includeUncommitted);
  }

  /**
   * Handles a single L2 block (i.e. Inserts the new note hashes into the merkle tree).
   * @param block - The L2 block to handle.
   * @returns Whether the block handled was produced by this same node.
   */
  public handleL2Block(block: L2Block): Promise<HandleL2BlockResult> {
    return this.trees.handleL2Block(block);
  }

  /**
   * Commits all pending updates.
   * @returns Empty promise.
   */
  public async commit(): Promise<void> {
    return await this.trees.commit();
  }

  /**
   * Rolls back all pending updates.
   * @returns Empty promise.
   */
  public async rollback(): Promise<void> {
    return await this.trees.rollback();
  }

  /**
   * Batch insert multiple leaves into the tree.
   * @param treeId - The ID of the tree.
   * @param leaves - Leaves to insert into the tree.
   * @param subtreeHeight - Height of the subtree.
   * @returns The data for the leaves to be updated when inserting the new ones.
   */
  public batchInsert<TreeHeight extends number, SubtreeSiblingPathHeight extends number>(
    treeId: MerkleTreeId,
    leaves: Buffer[],
    subtreeHeight: number,
  ): Promise<BatchInsertionResult<TreeHeight, SubtreeSiblingPathHeight>> {
    return this.trees.batchInsert(treeId, leaves, subtreeHeight);
  }
}
