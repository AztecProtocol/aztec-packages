import { LeafData, SiblingPath } from '@aztec/merkle-tree';

export * from './merkle_trees.js';
export { LeafData } from '@aztec/merkle-tree';

/**
 * Defines the possible Merkle tree IDs.
 */
export enum MerkleTreeId {
  CONTRACT_TREE = 0,
  CONTRACT_TREE_ROOTS_TREE = 1,
  NULLIFIER_TREE = 2,
  DATA_TREE = 3,
  DATA_TREE_ROOTS_TREE = 4,
}

export type IndexedMerkleTreeId = MerkleTreeId.NULLIFIER_TREE;

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
}

/**
 * Defines the interface for Merkle Tree operations.
 */
export interface MerkleTreeOperations {
  /**
   * Returns information about the given tree
   * @param treeId - The tree to be queried
   * @param includeUncommitted - Set to true to include uncommitted updates in the returned info
   */
  getTreeInfo(treeId: MerkleTreeId, includeUncommitted?: boolean): Promise<TreeInfo>;
  /**
   * Appends leaves to a given tree
   * @param treeId - The tree to be updated
   * @param leaves - The set of leaves to be appended
   */
  appendLeaves(treeId: MerkleTreeId, leaves: Buffer[]): Promise<void>;
  /**
   *
   * @param treeId - The tree to be queried for a sibling path
   * @param index - The index of the leaf for which a sibling path should be returned
   * @param includeUncommitted - Set to true to include uncommitted updates in the calculation
   */
  getSiblingPath(treeId: MerkleTreeId, index: bigint, includeUncommitted?: boolean): Promise<SiblingPath>;
  /**
   * Returns the previous index for a given value in an indexed tree
   * @param treeId - The tree for which the previous value index is required
   * @param value - The value to be queried
   * @param includeUncommitted - Set to true to include uncommitted state in the calcuation
   */
  getPreviousValueIndex(
    treeId: IndexedMerkleTreeId,
    value: bigint,
    includeUncommitted?: boolean,
  ): Promise<{ index: number; alreadyPresent: boolean }>;
  /**
   * Returns the data at a specific leaf
   * @param treeId - The tree for which leaf data should be returned
   * @param index - The index of the leaf required
   * @param includeUncommitted - Set to true to include uncommitted updates in the queired daatset
   */
  getLeafData(treeId: IndexedMerkleTreeId, index: number, includeUncommitted?: boolean): Promise<LeafData | undefined>;
  /**
   * Returns the index containing a leaf value
   * @param treeId - The tree for which the index should be returned
   * @param value - The value to search for in the tree
   * @param includeUncommitted - Set to true to include uncommitted updates in the queired daatset
   */
  findLeafIndex(treeId: MerkleTreeId, value: Buffer, includeUncommitted?: boolean): Promise<bigint | undefined>;
  getLeafValue(treeId: MerkleTreeId, index: bigint, includeUncommitted?: boolean): Promise<Buffer | undefined>;
}

/**
 * Defines the interface for a database that stores Merkle trees.
 */
export interface MerkleTreeDb extends MerkleTreeOperations {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/**
 * Outputs a tree leaves to console.log for debugging purposes.
 */
export async function inspectTree(db: MerkleTreeOperations, treeId: MerkleTreeId) {
  const info = await db.getTreeInfo(treeId);
  const output = [`Tree id=${treeId} size=${info.size} root=0x${info.root.toString('hex')}`];
  for (let i = 0; i < info.size; i++) {
    output.push(
      ` Leaf ${i}: ${await db.getLeafValue(treeId, BigInt(i)).then(x => x?.toString('hex') ?? '[undefined]')}`,
    );
  }
  console.log(output.join('\n'));
}
