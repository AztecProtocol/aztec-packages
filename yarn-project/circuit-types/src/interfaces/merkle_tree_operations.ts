import {
  type Fr,
  type Header,
  type NullifierLeaf,
  type PublicDataTreeLeaf,
  type StateReference,
} from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { type IndexedTreeLeafPreimage } from '@aztec/foundation/trees';

import { type MerkleTreeId } from '../merkle_tree_id.js';
import { type SiblingPath } from '../sibling_path/sibling_path.js';

/**
 * Type alias for the nullifier tree ID.
 */
export type IndexedTreeId = MerkleTreeId.NULLIFIER_TREE | MerkleTreeId.PUBLIC_DATA_TREE;

export type FrTreeId = Exclude<MerkleTreeId, IndexedTreeId>;

/**
 * Witness data for a leaf update.
 */
export interface LeafUpdateWitnessData<N extends number> {
  /**
   * Preimage of the leaf before updating.
   */
  leafPreimage: IndexedTreeLeafPreimage;
  /**
   * Sibling path to prove membership of the leaf.
   */
  siblingPath: SiblingPath<N>;
  /**
   * The index of the leaf.
   */
  index: bigint;
}

/**
 * The result of a batch insertion in an indexed merkle tree.
 */
export interface BatchInsertionResult<TreeHeight extends number, SubtreeSiblingPathHeight extends number> {
  /**
   * Data for the leaves to be updated when inserting the new ones.
   */
  lowLeavesWitnessData?: LeafUpdateWitnessData<TreeHeight>[];
  /**
   * Sibling path "pointing to" where the new subtree should be inserted into the tree.
   */
  newSubtreeSiblingPath: SiblingPath<SubtreeSiblingPathHeight>;
  /**
   * The new leaves being inserted in high to low order. This order corresponds with the order of the low leaves witness.
   */
  sortedNewLeaves: Buffer[];
  /**
   * The indexes of the sorted new leaves to the original ones.
   */
  sortedNewLeavesIndexes: number[];
}

/**
 * The result of a sequential insertion in an indexed merkle tree.
 */
export interface SequentialInsertionResult<TreeHeight extends number> {
  /**
   * Data for the leaves to be updated when inserting the new ones.
   */
  lowLeavesWitnessData: LeafUpdateWitnessData<TreeHeight>[];
  /**
   * Data for the inserted leaves
   */
  insertionWitnessData: LeafUpdateWitnessData<TreeHeight>[];
}

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

type LeafTypes = {
  [MerkleTreeId.NULLIFIER_TREE]: Buffer;
  [MerkleTreeId.NOTE_HASH_TREE]: Fr;
  [MerkleTreeId.PUBLIC_DATA_TREE]: Buffer;
  [MerkleTreeId.L1_TO_L2_MESSAGE_TREE]: Fr;
  [MerkleTreeId.ARCHIVE]: Fr;
};

type LeafValueTypes = {
  [MerkleTreeId.NULLIFIER_TREE]: NullifierLeaf;
  [MerkleTreeId.NOTE_HASH_TREE]: Fr;
  [MerkleTreeId.PUBLIC_DATA_TREE]: PublicDataTreeLeaf;
  [MerkleTreeId.L1_TO_L2_MESSAGE_TREE]: Fr;
  [MerkleTreeId.ARCHIVE]: Fr;
};

export type MerkleTreeLeafType<ID extends MerkleTreeId> = LeafTypes[ID];

export type MerkleTreeLeafValue<ID extends MerkleTreeId> = LeafValueTypes[ID];

/**
 * Defines the interface for operations on a set of Merkle Trees.
 */
export interface MerkleTreeReadOperations {
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
   * Gets the initial header.
   */
  getInitialHeader(): Header;

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
  >;

  /**
   * Returns the data at a specific leaf.
   * @param treeId - The tree for which leaf data should be returned.
   * @param index - The index of the leaf required.
   */
  getLeafPreimage<ID extends IndexedTreeId>(treeId: ID, index: bigint): Promise<IndexedTreeLeafPreimage | undefined>;

  /**
   * Returns the index containing a leaf value.
   * @param treeId - The tree for which the index should be returned.
   * @param value - The value to search for in the tree.
   */
  findLeafIndex<ID extends MerkleTreeId>(treeId: ID, value: MerkleTreeLeafType<ID>): Promise<bigint | undefined>;

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
  ): Promise<bigint | undefined>;

  /**
   * Gets the value for a leaf in the tree.
   * @param treeId - The tree for which the index should be returned.
   * @param index - The index of the leaf.
   */
  getLeafValue<ID extends MerkleTreeId>(
    treeId: ID,
    index: bigint,
  ): Promise<MerkleTreeLeafType<typeof treeId> | undefined>;

  /**
   * Get the block numbers for a set of leaf indices
   * @param treeId - The tree for which the block numbers should be returned.
   * @param leafIndices - The indices to be queried.
   */
  getBlockNumbersForLeafIndices<ID extends MerkleTreeId>(
    treeId: ID,
    leafIndices: bigint[],
  ): Promise<(bigint | undefined)[]>;
}

export interface MerkleTreeWriteOperations extends MerkleTreeReadOperations {
  /**
   * Appends leaves to a given tree.
   * @param treeId - The tree to be updated.
   * @param leaves - The set of leaves to be appended.
   */
  appendLeaves<ID extends MerkleTreeId>(treeId: ID, leaves: MerkleTreeLeafType<ID>[]): Promise<void>;

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
  batchInsert<TreeHeight extends number, SubtreeSiblingPathHeight extends number, ID extends IndexedTreeId>(
    treeId: ID,
    leaves: Buffer[],
    subtreeHeight: number,
  ): Promise<BatchInsertionResult<TreeHeight, SubtreeSiblingPathHeight>>;

  /**
   * Inserts multiple leaves into the tree, getting witnesses at every step.
   * Note: This method doesn't support inserting empty leaves.
   * @param treeId - The tree on which to insert.
   * @param leaves - The leaves to insert.
   * @returns The witnesses for the low leaf updates and the insertions.
   */
  sequentialInsert<TreeHeight extends number, ID extends IndexedTreeId>(
    treeId: ID,
    leaves: Buffer[],
  ): Promise<SequentialInsertionResult<TreeHeight>>;

  /**
   * Closes the database, discarding any uncommitted changes.
   */
  close(): Promise<void>;
}

/**
 * Outputs a tree leaves using for debugging purposes.
 */
export async function inspectTree(
  db: MerkleTreeReadOperations,
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
  log.info(output.join('\n'));
}
