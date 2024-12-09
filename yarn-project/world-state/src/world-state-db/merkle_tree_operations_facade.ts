import { type BatchInsertionResult, type MerkleTreeId, type SiblingPath } from '@aztec/circuit-types';
import {
  type IndexedTreeId,
  type MerkleTreeLeafType,
  type MerkleTreeWriteOperations,
  type SequentialInsertionResult,
  type TreeInfo,
} from '@aztec/circuit-types/interfaces';
import { type BlockHeader, type StateReference } from '@aztec/circuits.js';
import { type IndexedTreeLeafPreimage } from '@aztec/foundation/trees';

import { type MerkleTrees } from './merkle_trees.js';

/**
 * Wraps a MerkleTreeDbOperations to call all functions with a preset includeUncommitted flag.
 */
export class MerkleTreeReadOperationsFacade implements MerkleTreeWriteOperations {
  constructor(protected trees: MerkleTrees, protected includeUncommitted: boolean) {}

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
   * Returns the initial header for the chain before the first block.
   * @returns The initial header.
   */
  getInitialHeader(): BlockHeader {
    return this.trees.getInitialHeader();
  }

  /**
   * Appends a set of leaf values to the tree.
   * @param treeId - Id of the tree to append leaves to.
   * @param leaves - The set of leaves to be appended.
   * @returns The tree info of the specified tree.
   */
  appendLeaves<ID extends MerkleTreeId>(treeId: ID, leaves: MerkleTreeLeafType<ID>[]): Promise<void> {
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
  getPreviousValueIndex<ID extends IndexedTreeId>(
    treeId: ID,
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
   * Gets the leaf data at a given index and tree.
   * @param treeId - The ID of the tree get the leaf from.
   * @param index - The index of the leaf to get.
   * @returns Leaf preimage.
   */
  async getLeafPreimage<ID extends IndexedTreeId>(
    treeId: ID,
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
  findLeafIndex<ID extends MerkleTreeId>(treeId: ID, value: MerkleTreeLeafType<ID>): Promise<bigint | undefined> {
    return this.trees.findLeafIndex(treeId, value, this.includeUncommitted);
  }

  /**
   * Returns the first index containing a leaf value after `startIndex`.
   * @param treeId - The tree for which the index should be returned.
   * @param value - The value to search for in the tree.
   * @param startIndex - The index to start searching from (used when skipping nullified messages)
   */
  findLeafIndexAfter<ID extends MerkleTreeId>(
    treeId: ID,
    value: MerkleTreeLeafType<ID>,
    startIndex: bigint,
  ): Promise<bigint | undefined> {
    return this.trees.findLeafIndexAfter(treeId, value, startIndex, this.includeUncommitted);
  }

  /**
   * Gets the value at the given index.
   * @param treeId - The ID of the tree to get the leaf value from.
   * @param index - The index of the leaf.
   * @param includeUncommitted - Indicates whether to include uncommitted changes.
   * @returns Leaf value at the given index (undefined if not found).
   */
  getLeafValue<ID extends MerkleTreeId>(
    treeId: ID,
    index: bigint,
  ): Promise<MerkleTreeLeafType<typeof treeId> | undefined> {
    return this.trees.getLeafValue(treeId, index, this.includeUncommitted) as Promise<
      MerkleTreeLeafType<typeof treeId> | undefined
    >;
  }

  /**
   * Inserts the new block hash into the archive.
   * This includes all of the current roots of all of the data trees and the current blocks global vars.
   * @param header - The header to insert into the archive.
   */
  public updateArchive(header: BlockHeader): Promise<void> {
    return this.trees.updateArchive(header);
  }

  /**
   * Batch insert multiple leaves into the tree.
   * @param treeId - The ID of the tree.
   * @param leaves - Leaves to insert into the tree.
   * @param subtreeHeight - Height of the subtree.
   * @returns The data for the leaves to be updated when inserting the new ones.
   */
  public batchInsert<TreeHeight extends number, SubtreeSiblingPathHeight extends number>(
    treeId: IndexedTreeId,
    leaves: Buffer[],
    subtreeHeight: number,
  ): Promise<BatchInsertionResult<TreeHeight, SubtreeSiblingPathHeight>> {
    return this.trees.batchInsert(treeId, leaves, subtreeHeight);
  }

  /**
   * Sequentially inserts multiple leaves into the tree.
   * @param treeId - The ID of the tree.
   * @param leaves - Leaves to insert into the tree.
   * @returns Witnesses for the operations performed.
   */
  public sequentialInsert<TreeHeight extends number>(
    _treeId: IndexedTreeId,
    _leaves: Buffer[],
  ): Promise<SequentialInsertionResult<TreeHeight>> {
    throw new Error('Method not implemented in legacy merkle tree');
  }

  getBlockNumbersForLeafIndices<ID extends MerkleTreeId>(
    _treeId: ID,
    _leafIndices: bigint[],
  ): Promise<(bigint | undefined)[]> {
    throw new Error('Method not implemented in legacy merkle tree');
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
