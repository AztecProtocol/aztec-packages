import {
  CONTRACT_TREE_HEIGHT,
  Fr,
  GlobalVariables,
  HISTORIC_BLOCKS_TREE_HEIGHT,
  L1_TO_L2_MSG_TREE_HEIGHT,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_SUBTREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/circuits.js';
import { computeBlockHash, computeGlobalsHash } from '@aztec/circuits.js/abis';
import { Committable } from '@aztec/foundation/committable';
import { SerialQueue } from '@aztec/foundation/fifo';
import { createDebugLogger } from '@aztec/foundation/log';
import {
  AppendOnlyTree,
  IndexedTree,
  LeafData,
  LowLeafWitnessData,
  Pedersen,
  SparseTree,
  StandardIndexedTree,
  StandardTree,
  UpdateOnlyTree,
  loadTree,
  newTree,
} from '@aztec/merkle-tree';
import { L2Block, MerkleTreeId, SiblingPath } from '@aztec/types';

import { default as levelup } from 'levelup';

import { MerkleTreeOperationsFacade } from '../merkle-tree/merkle_tree_operations_facade.js';
import {
  CurrentTreeRoots,
  HandleL2BlockResult,
  INITIAL_NULLIFIER_TREE_SIZE,
  IndexedTreeId,
  MerkleTreeDb,
  MerkleTreeOperations,
  PublicTreeId,
  TreeInfo,
} from './merkle_tree_db.js';

/**
 * Data necessary to reinitialize the merkle trees from Db.
 */
interface FromDbOptions {
  /**
   * The global variables from the last block.
   */
  globalVariables: GlobalVariables;
}

/**
 * A convenience class for managing multiple merkle trees.
 */
export class MerkleTrees implements MerkleTreeDb {
  private trees: (AppendOnlyTree | UpdateOnlyTree)[] = [];
  private latestGlobalVariablesHash: Committable<Fr>;
  private jobQueue = new SerialQueue();

  constructor(private db: levelup.LevelUp, private log = createDebugLogger('aztec:merkle_trees')) {
    this.latestGlobalVariablesHash = new Committable(Fr.ZERO);
  }

  /**
   * initializes the collection of Merkle Trees.
   * @param fromDbOptions - Options to initialize the trees from the database.
   */
  public async init(fromDbOptions?: FromDbOptions) {
    const fromDb = fromDbOptions !== undefined;
    const initializeTree = fromDb ? loadTree : newTree;

    const hasher = new Pedersen();
    const contractTree: AppendOnlyTree = await initializeTree(
      StandardTree,
      this.db,
      hasher,
      `${MerkleTreeId[MerkleTreeId.CONTRACT_TREE]}`,
      CONTRACT_TREE_HEIGHT,
    );
    const nullifierTree = await initializeTree(
      StandardIndexedTree,
      this.db,
      hasher,
      `${MerkleTreeId[MerkleTreeId.NULLIFIER_TREE]}`,
      NULLIFIER_TREE_HEIGHT,
      INITIAL_NULLIFIER_TREE_SIZE,
    );
    const noteHashTree: AppendOnlyTree = await initializeTree(
      StandardTree,
      this.db,
      hasher,
      `${MerkleTreeId[MerkleTreeId.NOTE_HASH_TREE]}`,
      NOTE_HASH_TREE_HEIGHT,
    );
    const publicDataTree: UpdateOnlyTree = await initializeTree(
      SparseTree,
      this.db,
      hasher,
      `${MerkleTreeId[MerkleTreeId.PUBLIC_DATA_TREE]}`,
      PUBLIC_DATA_TREE_HEIGHT,
    );
    const l1Tol2MessagesTree: AppendOnlyTree = await initializeTree(
      StandardTree,
      this.db,
      hasher,
      `${MerkleTreeId[MerkleTreeId.L1_TO_L2_MESSAGES_TREE]}`,
      L1_TO_L2_MSG_TREE_HEIGHT,
    );
    const historicBlocksTree: AppendOnlyTree = await initializeTree(
      StandardTree,
      this.db,
      hasher,
      `${MerkleTreeId[MerkleTreeId.BLOCKS_TREE]}`,
      HISTORIC_BLOCKS_TREE_HEIGHT,
    );
    this.trees = [contractTree, nullifierTree, noteHashTree, publicDataTree, l1Tol2MessagesTree, historicBlocksTree];

    this.jobQueue.start();

    // The first leaf in the blocks tree contains the empty roots of the other trees and empty global variables.
    if (!fromDb) {
      const initialGlobalVariablesHash = computeGlobalsHash(GlobalVariables.empty());
      await this._updateLatestGlobalVariablesHash(initialGlobalVariablesHash);
      await this._updateHistoricBlocksTree(initialGlobalVariablesHash, true);
      await this._commit();
    } else {
      await this._updateLatestGlobalVariablesHash(computeGlobalsHash(fromDbOptions.globalVariables));
    }
  }

  /**
   * Method to asynchronously create and initialize a MerkleTrees instance.
   * @param db - The db instance to use for data persistance.
   * @returns - A fully initialized MerkleTrees instance.
   */
  public static async new(db: levelup.LevelUp) {
    const merkleTrees = new MerkleTrees(db);
    await merkleTrees.init();
    return merkleTrees;
  }

  /**
   * Stops the job queue (waits for all jobs to finish).
   */
  public async stop() {
    await this.jobQueue.end();
  }

  /**
   * Gets a view of this db that returns uncommitted data.
   * @returns - A facade for this instance.
   */
  public asLatest(): MerkleTreeOperations {
    return new MerkleTreeOperationsFacade(this, true);
  }

  /**
   * Gets a view of this db that returns committed data only.
   * @returns - A facade for this instance.
   */
  public asCommitted(): MerkleTreeOperations {
    return new MerkleTreeOperationsFacade(this, false);
  }

  /**
   * Inserts into the roots trees (CONTRACT_TREE_ROOTS_TREE, NOTE_HASH_TREE_ROOTS_TREE, L1_TO_L2_MESSAGES_TREE_ROOTS_TREE)
   * the current roots of the corresponding trees (CONTRACT_TREE, NOTE_HASH_TREE, L1_TO_L2_MESSAGES_TREE).
   * @param globalsHash - The current global variables hash.
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   */
  public async updateHistoricBlocksTree(globalsHash: Fr, includeUncommitted: boolean) {
    await this.synchronize(() => this._updateHistoricBlocksTree(globalsHash, includeUncommitted));
  }

  /**
   * Updates the latest global variables hash
   * @param globalVariablesHash - The latest global variables hash
   */
  public async updateLatestGlobalVariablesHash(globalVariablesHash: Fr) {
    return await this.synchronize(() => this._updateLatestGlobalVariablesHash(globalVariablesHash));
  }

  /**
   * Gets the global variables hash from the previous block
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   */
  public async getLatestGlobalVariablesHash(includeUncommitted: boolean): Promise<Fr> {
    return await this.synchronize(() => this._getGlobalVariablesHash(includeUncommitted));
  }

  /**
   * Gets the tree info for the specified tree.
   * @param treeId - Id of the tree to get information from.
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   * @returns The tree info for the specified tree.
   */
  public async getTreeInfo(treeId: MerkleTreeId, includeUncommitted: boolean): Promise<TreeInfo> {
    return await this.synchronize(() => this._getTreeInfo(treeId, includeUncommitted));
  }

  /**
   * Get the current roots of the commitment trees.
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   * @returns The current roots of the trees.
   */
  public async getTreeRoots(includeUncommitted: boolean): Promise<CurrentTreeRoots> {
    const roots = await this.synchronize(() => Promise.resolve(this._getAllTreeRoots(includeUncommitted)));

    return {
      noteHashTreeRoot: roots[0],
      nullifierTreeRoot: roots[1],
      contractDataTreeRoot: roots[2],
      l1Tol2MessagesTreeRoot: roots[3],
      publicDataTreeRoot: roots[4],
      blocksTreeRoot: roots[5],
    };
  }

  private async _getCurrentBlockHash(globalsHash: Fr, includeUncommitted: boolean): Promise<Fr> {
    const roots = (await this._getAllTreeRoots(includeUncommitted)).map(root => Fr.fromBuffer(root));
    return computeBlockHash(globalsHash, roots[0], roots[1], roots[2], roots[3], roots[4]);
  }

  private _getAllTreeRoots(includeUncommitted: boolean): Promise<Buffer[]> {
    const roots = [
      MerkleTreeId.NOTE_HASH_TREE,
      MerkleTreeId.NULLIFIER_TREE,
      MerkleTreeId.CONTRACT_TREE,
      MerkleTreeId.L1_TO_L2_MESSAGES_TREE,
      MerkleTreeId.PUBLIC_DATA_TREE,
      MerkleTreeId.BLOCKS_TREE,
    ].map(tree => this.trees[tree].getRoot(includeUncommitted));

    return Promise.resolve(roots);
  }

  /**
   * Gets the value at the given index.
   * @param treeId - The ID of the tree to get the leaf value from.
   * @param index - The index of the leaf.
   * @param includeUncommitted - Indicates whether to include uncommitted changes.
   * @returns Leaf value at the given index (undefined if not found).
   */
  public async getLeafValue(
    treeId: MerkleTreeId,
    index: bigint,
    includeUncommitted: boolean,
  ): Promise<Buffer | undefined> {
    return await this.synchronize(() => this.trees[treeId].getLeafValue(index, includeUncommitted));
  }

  /**
   * Gets the sibling path for a leaf in a tree.
   * @param treeId - The ID of the tree.
   * @param index - The index of the leaf.
   * @param includeUncommitted - Indicates whether the sibling path should include uncommitted data.
   * @returns The sibling path for the leaf.
   */
  public async getSiblingPath<N extends number>(
    treeId: MerkleTreeId,
    index: bigint,
    includeUncommitted: boolean,
  ): Promise<SiblingPath<N>> {
    return await this.synchronize(() => this._getSiblingPath(treeId, index, includeUncommitted));
  }

  /**
   * Appends leaves to a tree.
   * @param treeId - The ID of the tree.
   * @param leaves - The leaves to append.
   * @returns Empty promise.
   */
  public async appendLeaves(treeId: MerkleTreeId, leaves: Buffer[]): Promise<void> {
    return await this.synchronize(() => this._appendLeaves(treeId, leaves));
  }

  /**
   * Commits all pending updates.
   * @returns Empty promise.
   */
  public async commit(): Promise<void> {
    return await this.synchronize(() => this._commit());
  }

  /**
   * Rolls back all pending updates.
   * @returns Empty promise.
   */
  public async rollback(): Promise<void> {
    return await this.synchronize(() => this._rollback());
  }

  /**
   * Finds the index of the largest leaf whose value is less than or equal to the provided value.
   * @param treeId - The ID of the tree to search.
   * @param value - The value to be inserted into the tree.
   * @param includeUncommitted - If true, the uncommitted changes are included in the search.
   * @returns The found leaf index and a flag indicating if the corresponding leaf's value is equal to `newValue`.
   */
  public async getPreviousValueIndex(
    treeId: IndexedTreeId,
    value: bigint,
    includeUncommitted: boolean,
  ): Promise<{
    /**
     * The index of the found leaf.
     */
    index: number;
    /**
     * A flag indicating if the corresponding leaf's value is equal to `newValue`.
     */
    alreadyPresent: boolean;
  }> {
    return await this.synchronize(() =>
      Promise.resolve(this._getIndexedTree(treeId).findIndexOfPreviousValue(value, includeUncommitted)),
    );
  }

  /**
   * Gets the leaf data at a given index and tree.
   * @param treeId - The ID of the tree get the leaf from.
   * @param index - The index of the leaf to get.
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   * @returns Leaf data.
   */
  public async getLeafData(
    treeId: IndexedTreeId,
    index: number,
    includeUncommitted: boolean,
  ): Promise<LeafData | undefined> {
    return await this.synchronize(() =>
      Promise.resolve(this._getIndexedTree(treeId).getLatestLeafDataCopy(index, includeUncommitted)),
    );
  }

  /**
   * Returns the index of a leaf given its value, or undefined if no leaf with that value is found.
   * @param treeId - The ID of the tree.
   * @param value - The leaf value to look for.
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   * @returns The index of the first leaf found with a given value (undefined if not found).
   */
  public async findLeafIndex(
    treeId: MerkleTreeId,
    value: Buffer,
    includeUncommitted: boolean,
  ): Promise<bigint | undefined> {
    return await this.synchronize(async () => {
      const tree = this.trees[treeId];
      for (let i = 0n; i < tree.getNumLeaves(includeUncommitted); i++) {
        const currentValue = await tree.getLeafValue(i, includeUncommitted);
        if (currentValue && currentValue.equals(value)) {
          return i;
        }
      }
      return undefined;
    });
  }

  /**
   * Updates a leaf in a tree at a given index.
   * @param treeId - The ID of the tree.
   * @param leaf - The new leaf value.
   * @param index - The index to insert into.
   * @returns Empty promise.
   */
  public async updateLeaf(treeId: IndexedTreeId | PublicTreeId, leaf: LeafData | Buffer, index: bigint): Promise<void> {
    return await this.synchronize(() => this._updateLeaf(treeId, leaf, index));
  }

  /**
   * Handles a single L2 block (i.e. Inserts the new commitments into the merkle tree).
   * @param block - The L2 block to handle.
   * @returns Whether the block handled was produced by this same node.
   */
  public async handleL2Block(block: L2Block): Promise<HandleL2BlockResult> {
    return await this.synchronize(() => this._handleL2Block(block));
  }

  /**
   * Batch insert multiple leaves into the tree.
   * @param treeId - The ID of the tree.
   * @param leaves - Leaves to insert into the tree.
   * @param subtreeHeight - Height of the subtree.
   * @returns The data for the leaves to be updated when inserting the new ones.
   */
  public async batchInsert<
    TreeHeight extends number,
    SubtreeHeight extends number,
    SubtreeSiblingPathHeight extends number,
  >(
    treeId: MerkleTreeId,
    leaves: Buffer[],
    subtreeHeight: SubtreeHeight,
  ): Promise<
    | [LowLeafWitnessData<TreeHeight>[], SiblingPath<SubtreeSiblingPathHeight>]
    | [undefined, SiblingPath<SubtreeSiblingPathHeight>]
  > {
    const tree = this.trees[treeId] as StandardIndexedTree;
    if (!('batchInsert' in tree)) {
      throw new Error('Tree does not support `batchInsert` method');
    }
    return await this.synchronize(() => tree.batchInsert(leaves, subtreeHeight));
  }

  /**
   * Waits for all jobs to finish before executing the given function.
   * @param fn - The function to execute.
   * @returns Promise containing the result of the function.
   */
  private async synchronize<T>(fn: () => Promise<T>): Promise<T> {
    return await this.jobQueue.put(fn);
  }

  private _updateLatestGlobalVariablesHash(globalVariablesHash: Fr): Promise<void> {
    this.latestGlobalVariablesHash.set(globalVariablesHash);
    return Promise.resolve();
  }

  private _getGlobalVariablesHash(includeUncommitted: boolean): Promise<Fr> {
    return Promise.resolve(this.latestGlobalVariablesHash.get(includeUncommitted));
  }

  private async _updateHistoricBlocksTree(globalsHash: Fr, includeUncommitted: boolean) {
    const blockHash = await this._getCurrentBlockHash(globalsHash, includeUncommitted);
    await this._appendLeaves(MerkleTreeId.BLOCKS_TREE, [blockHash.toBuffer()]);
  }

  /**
   * Returns the tree info for the specified tree id.
   * @param treeId - Id of the tree to get information from.
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   * @returns The tree info for the specified tree.
   */
  private _getTreeInfo(treeId: MerkleTreeId, includeUncommitted: boolean): Promise<TreeInfo> {
    const treeInfo = {
      treeId,
      root: this.trees[treeId].getRoot(includeUncommitted),
      size: this.trees[treeId].getNumLeaves(includeUncommitted),
      depth: this.trees[treeId].getDepth(),
    } as TreeInfo;
    return Promise.resolve(treeInfo);
  }

  /**
   * Returns an instance of an indexed tree.
   * @param treeId - Id of the tree to get an instance of.
   * @returns The indexed tree for the specified tree id.
   */
  private _getIndexedTree(treeId: IndexedTreeId): IndexedTree {
    return this.trees[treeId] as IndexedTree;
  }

  /**
   * Returns the sibling path for a leaf in a tree.
   * @param treeId - Id of the tree to get the sibling path from.
   * @param index - Index of the leaf to get the sibling path for.
   * @param includeUncommitted - Indicates whether to include uncommitted updates in the sibling path.
   * @returns Promise containing the sibling path for the leaf.
   */
  private _getSiblingPath<N extends number>(
    treeId: MerkleTreeId,
    index: bigint,
    includeUncommitted: boolean,
  ): Promise<SiblingPath<N>> {
    return Promise.resolve(this.trees[treeId].getSiblingPath<N>(index, includeUncommitted));
  }

  /**
   * Appends leaves to a tree.
   * @param treeId - Id of the tree to append leaves to.
   * @param leaves - Leaves to append.
   * @returns Empty promise.
   */
  private async _appendLeaves(treeId: MerkleTreeId, leaves: Buffer[]): Promise<void> {
    const tree = this.trees[treeId];
    if (!('appendLeaves' in tree)) {
      throw new Error('Tree does not support `appendLeaves` method');
    }
    return await tree.appendLeaves(leaves);
  }

  private async _updateLeaf(
    treeId: IndexedTreeId | PublicTreeId,
    leaf: LeafData | Buffer,
    index: bigint,
  ): Promise<void> {
    const tree = this.trees[treeId];
    if (!('updateLeaf' in tree)) {
      throw new Error('Tree does not support `updateLeaf` method');
    }
    return await tree.updateLeaf(leaf, index);
  }

  /**
   * Commits all pending updates.
   * @returns Empty promise.
   */
  private async _commit(): Promise<void> {
    for (const tree of this.trees) {
      await tree.commit();
    }
    this.latestGlobalVariablesHash.commit();
  }

  /**
   * Rolls back all pending updates.
   * @returns Empty promise.
   */
  private async _rollback(): Promise<void> {
    for (const tree of this.trees) {
      await tree.rollback();
    }
    this.latestGlobalVariablesHash.rollback();
  }

  /**
   * Handles a single L2 block (i.e. Inserts the new commitments into the merkle tree).
   * @param l2Block - The L2 block to handle.
   */
  private async _handleL2Block(l2Block: L2Block): Promise<HandleL2BlockResult> {
    const treeRootWithIdPairs = [
      [l2Block.endContractTreeSnapshot.root, MerkleTreeId.CONTRACT_TREE],
      [l2Block.endNullifierTreeSnapshot.root, MerkleTreeId.NULLIFIER_TREE],
      [l2Block.endNoteHashTreeSnapshot.root, MerkleTreeId.NOTE_HASH_TREE],
      [l2Block.endPublicDataTreeRoot, MerkleTreeId.PUBLIC_DATA_TREE],
      [l2Block.endL1ToL2MessagesTreeSnapshot.root, MerkleTreeId.L1_TO_L2_MESSAGES_TREE],
      [l2Block.endHistoricBlocksTreeSnapshot.root, MerkleTreeId.BLOCKS_TREE],
    ] as const;
    const compareRoot = (root: Fr, treeId: MerkleTreeId) => {
      const treeRoot = this.trees[treeId].getRoot(true);
      return treeRoot.equals(root.toBuffer());
    };
    const ourBlock = treeRootWithIdPairs.every(([root, id]) => compareRoot(root, id));
    if (ourBlock) {
      this.log(`Block ${l2Block.number} is ours, committing world state`);
      await this._commit();
    } else {
      this.log(`Block ${l2Block.number} is not ours, rolling back world state and committing state from chain`);
      await this._rollback();

      // Sync the append only trees
      for (const [tree, leaves] of [
        [MerkleTreeId.CONTRACT_TREE, l2Block.newContracts],
        [MerkleTreeId.NOTE_HASH_TREE, l2Block.newCommitments],
        [MerkleTreeId.L1_TO_L2_MESSAGES_TREE, l2Block.newL1ToL2Messages],
      ] as const) {
        await this._appendLeaves(
          tree,
          leaves.map(fr => fr.toBuffer()),
        );
      }

      // Sync the indexed trees
      await (this.trees[MerkleTreeId.NULLIFIER_TREE] as StandardIndexedTree).batchInsert(
        l2Block.newNullifiers.map(fr => fr.toBuffer()),
        NULLIFIER_SUBTREE_HEIGHT,
      );

      // Sync the public data tree
      for (const dataWrite of l2Block.newPublicDataWrites) {
        if (dataWrite.isEmpty()) {
          continue;
        }
        const { newValue, leafIndex } = dataWrite;
        await this._updateLeaf(MerkleTreeId.PUBLIC_DATA_TREE, newValue.toBuffer(), leafIndex.value);
      }

      // Sync and add the block to the historic blocks tree
      const globalVariablesHash = computeGlobalsHash(l2Block.globalVariables);
      await this._updateLatestGlobalVariablesHash(globalVariablesHash);
      this.log(`Synced global variables with hash ${globalVariablesHash}`);

      const blockHash = await this._getCurrentBlockHash(globalVariablesHash, true);
      await this._appendLeaves(MerkleTreeId.BLOCKS_TREE, [blockHash.toBuffer()]);

      await this._commit();
    }

    for (const [root, treeId] of treeRootWithIdPairs) {
      const treeName = MerkleTreeId[treeId];
      const info = await this._getTreeInfo(treeId, false);
      const syncedStr = '0x' + info.root.toString('hex');
      const rootStr = root.toString();
      // Sanity check that the rebuilt trees match the roots published by the L2 block
      if (!info.root.equals(root.toBuffer())) {
        throw new Error(
          `Synced tree root ${treeName} does not match published L2 block root: ${syncedStr} != ${rootStr}`,
        );
      } else {
        this.log(`Tree ${treeName} synched with size ${info.size} root ${rootStr}`);
      }
    }

    return { isBlockOurs: ourBlock };
  }
}
