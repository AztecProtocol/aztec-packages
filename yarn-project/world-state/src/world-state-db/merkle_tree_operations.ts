import { L2Block, MerkleTreeId, SiblingPath } from '@aztec/circuit-types';
import { Header, NullifierLeafPreimage, StateReference } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { IndexedTreeLeafPreimage } from '@aztec/foundation/trees';
import { BatchInsertionResult } from '@aztec/merkle-tree';

/**
 * Type alias for the nullifier tree ID.
 */
export type IndexedTreeId = MerkleTreeId.NULLIFIER_TREE | MerkleTreeId.PUBLIC_DATA_TREE;

/**
 *  Defines tree information.
 */
export interface TreeInfo {
  /**
   * The tree ID.
   */
  treeId: MerkleTreeId;
  /**
   * The tree root.
   */
  root: Buffer;
  /**
   * The number of leaves in the tree.
   */
  size: bigint;

  /**
   * The depth of the tree.
   */
  depth: number;
}

/**
 * Defines the interface for operations on a set of Merkle Trees.
 */
export interface MerkleTreeOperations {
  /**
   * Appends leaves to a given tree.
   * @param treeId - The tree to be updated.
   * @param leaves - The set of leaves to be appended.
   */
  appendLeaves(treeId: MerkleTreeId, leaves: Buffer[]): Promise<void>;

  /**
   * Returns information about the given tree.
   * @param treeId - The tree to be queried.
   */
  getTreeInfo(treeId: MerkleTreeId): Promise<TreeInfo>;

  /**
   * Gets the current state reference.
   */
  getStateReference(): Promise<StateReference>;

  /**
   * Builds the initial header.
   */
  buildInitialHeader(): Promise<Header>;

  /**
   * Gets sibling path for a leaf.
   * @param treeId - The tree to be queried for a sibling path.
   * @param index - The index of the leaf for which a sibling path should be returned.
   */
  getSiblingPath<N extends number>(treeId: MerkleTreeId, index: bigint): Promise<SiblingPath<N>>;

  /**
   * Returns the previous index for a given value in an indexed tree.
   * @param treeId - The tree for which the previous value index is required.
   * @param value - The value to be queried.
   */
  getPreviousValueIndex(
    treeId: IndexedTreeId,
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
  >;

  /**
   * Returns the data at a specific leaf.
   * @param treeId - The tree for which leaf data should be returned.
   * @param index - The index of the leaf required.
   */
  getLeafPreimage(treeId: IndexedTreeId, index: bigint): Promise<IndexedTreeLeafPreimage | undefined>;

  /**
   * Update the leaf data at the given index.
   * @param treeId - The tree for which leaf data should be edited.
   * @param leaf - The updated leaf value.
   * @param index - The index of the leaf to be updated.
   */
  updateLeaf(treeId: IndexedTreeId, leaf: NullifierLeafPreimage | Buffer, index: bigint): Promise<void>;

  /**
   * Returns the index containing a leaf value.
   * @param treeId - The tree for which the index should be returned.
   * @param value - The value to search for in the tree.
   */
  findLeafIndex(treeId: MerkleTreeId, value: Buffer): Promise<bigint | undefined>;

  /**
   * Gets the value for a leaf in the tree.
   * @param treeId - The tree for which the index should be returned.
   * @param index - The index of the leaf.
   */
  getLeafValue(treeId: MerkleTreeId, index: bigint): Promise<Buffer | undefined>;

  /**
   * Inserts the block hash into the archive.
   * This includes all of the current roots of all of the data trees and the current blocks global vars.
   * @param header - The header to insert into the archive.
   */
  updateArchive(header: Header): Promise<void>;

  /**
   * Batch insert multiple leaves into the tree.
   * @param leaves - Leaves to insert into the tree.
   * @param treeId - The tree on which to insert.
   * @param subtreeHeight - Height of the subtree.
   * @returns The witness data for the leaves to be updated when inserting the new ones.
   */
  batchInsert<TreeHeight extends number, SubtreeSiblingPathHeight extends number>(
    treeId: MerkleTreeId,
    leaves: Buffer[],
    subtreeHeight: number,
  ): Promise<BatchInsertionResult<TreeHeight, SubtreeSiblingPathHeight>>;

  /**
   * Handles a single L2 block (i.e. Inserts the new note hashes into the merkle tree).
   * @param block - The L2 block to handle.
   */
  handleL2Block(block: L2Block): Promise<HandleL2BlockResult>;

  /**
   * Commits pending changes to the underlying store.
   */
  commit(): Promise<void>;

  /**
   * Rolls back pending changes.
   */
  rollback(): Promise<void>;
}

/** Return type for handleL2Block */
export type HandleL2BlockResult = {
  /** Whether the block processed was emitted by our sequencer */ isBlockOurs: boolean;
};

/**
 * Outputs a tree leaves using for debugging purposes.
 */
export async function inspectTree(
  db: MerkleTreeOperations,
  treeId: MerkleTreeId,
  log = createDebugLogger('aztec:inspect-tree'),
) {
  const info = await db.getTreeInfo(treeId);
  const output = [`Tree id=${treeId} size=${info.size} root=0x${info.root.toString('hex')}`];
  for (let i = 0; i < info.size; i++) {
    output.push(
      ` Leaf ${i}: ${await db.getLeafValue(treeId, BigInt(i)).then(x => x?.toString('hex') ?? '[undefined]')}`,
    );
  }
  log(output.join('\n'));
}
