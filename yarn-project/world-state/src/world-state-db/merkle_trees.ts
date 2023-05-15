import { PrimitivesWasm } from '@aztec/barretenberg.js/wasm';
import {
  Fr,
  NullifierLeafPreimage,
  CONTRACT_TREE_HEIGHT,
  CONTRACT_TREE_ROOTS_TREE_HEIGHT,
  L1_TO_L2_MESSAGES_ROOTS_TREE_HEIGHT,
  L1_TO_L2_MESSAGES_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  PRIVATE_DATA_TREE_HEIGHT,
  PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
  BaseRollupInputs,
} from '@aztec/circuits.js';

import { WasmWrapper } from '@aztec/foundation/wasm';
import {
  AppendOnlyTree,
  IndexedTree,
  LeafData,
  Pedersen,
  SiblingPath,
  SparseTree,
  StandardIndexedTree,
  StandardTree,
  UpdateOnlyTree,
  newTree,
} from '@aztec/merkle-tree';
import { default as levelup } from 'levelup';
import { MerkleTreeOperationsFacade } from '../merkle-tree/merkle_tree_operations_facade.js';
import {
  INITIAL_NULLIFIER_TREE_SIZE,
  IndexedTreeId,
  MerkleTreeDb,
  MerkleTreeOperations,
  PublicTreeId,
  TreeInfo,
} from './index.js';
import { MerkleTreeId } from '@aztec/types';
import { SerialQueue } from '@aztec/foundation/fifo';
import { toBigIntBE, toBufferBE } from '@aztec/foundation/bigint-buffer';

/**
 * All of the data required for the circuit compute and verify nullifiers.
 */
export interface LowNullifierWitnessData {
  /**
   * Preimage of the low nullifier that proves non membership.
   */
  preimage: NullifierLeafPreimage;
  /**
   * Sibling path to prove membership of low nullifier.
   */
  siblingPath: SiblingPath;
  /**
   * The index of low nullifier.
   */
  index: bigint;
}

// Pre-compute empty nullifier witness
const EMPTY_LOW_NULLIFIER_WITNESS: LowNullifierWitnessData = {
  preimage: NullifierLeafPreimage.empty(),
  index: 0n,
  siblingPath: new SiblingPath(Array(NULLIFIER_TREE_HEIGHT).fill(toBufferBE(0n, 32))),
};

/**
 * A convenience class for managing multiple merkle trees.
 */
export class MerkleTrees implements MerkleTreeDb {
  private trees: (AppendOnlyTree | UpdateOnlyTree)[] = [];
  private jobQueue = new SerialQueue();

  constructor(private db: levelup.LevelUp) {}

  /**
   * Initialises the collection of Merkle Trees.
   * @param optionalWasm - WASM instance to use for hashing (if not provided PrimitivesWasm will be used).
   */
  public async init(optionalWasm?: WasmWrapper) {
    const wasm = optionalWasm ?? (await PrimitivesWasm.get());
    const hasher = new Pedersen(wasm);
    const contractTree: AppendOnlyTree = await newTree(
      StandardTree,
      this.db,
      hasher,
      `${MerkleTreeId[MerkleTreeId.CONTRACT_TREE]}`,
      CONTRACT_TREE_HEIGHT,
    );
    const contractTreeRootsTree: AppendOnlyTree = await newTree(
      StandardTree,
      this.db,
      hasher,
      `${MerkleTreeId[MerkleTreeId.CONTRACT_TREE_ROOTS_TREE]}`,
      CONTRACT_TREE_ROOTS_TREE_HEIGHT,
    );
    const nullifierTree = await newTree(
      StandardIndexedTree,
      this.db,
      hasher,
      `${MerkleTreeId[MerkleTreeId.NULLIFIER_TREE]}`,
      NULLIFIER_TREE_HEIGHT,
      INITIAL_NULLIFIER_TREE_SIZE,
    );
    const privateDataTree: AppendOnlyTree = await newTree(
      StandardTree,
      this.db,
      hasher,
      `${MerkleTreeId[MerkleTreeId.PRIVATE_DATA_TREE]}`,
      PRIVATE_DATA_TREE_HEIGHT,
    );
    const privateDataTreeRootsTree: AppendOnlyTree = await newTree(
      StandardTree,
      this.db,
      hasher,
      `${MerkleTreeId[MerkleTreeId.PRIVATE_DATA_TREE_ROOTS_TREE]}`,
      PRIVATE_DATA_TREE_ROOTS_TREE_HEIGHT,
    );
    const publicDataTree: UpdateOnlyTree = await newTree(
      SparseTree,
      this.db,
      hasher,
      `${MerkleTreeId[MerkleTreeId.PUBLIC_DATA_TREE]}`,
      PUBLIC_DATA_TREE_HEIGHT,
    );
    const l1Tol2MessagesTree: AppendOnlyTree = await newTree(
      StandardTree,
      this.db,
      hasher,
      `${MerkleTreeId[MerkleTreeId.L1_TO_L2_MESSAGES_TREE]}`,
      L1_TO_L2_MESSAGES_TREE_HEIGHT,
    );
    const l1Tol2MessagesRootsTree: AppendOnlyTree = await newTree(
      StandardTree,
      this.db,
      hasher,
      `${MerkleTreeId[MerkleTreeId.L1_TO_L2_MESSAGES_ROOTS_TREE]}`,
      L1_TO_L2_MESSAGES_ROOTS_TREE_HEIGHT,
    );
    this.trees = [
      contractTree,
      contractTreeRootsTree,
      nullifierTree,
      privateDataTree,
      privateDataTreeRootsTree,
      publicDataTree,
      l1Tol2MessagesTree,
      l1Tol2MessagesRootsTree,
    ];

    this.jobQueue.start();

    // The roots trees must contain the empty roots of their data trees
    await this.updateHistoricRootsTrees(true);
    const historicRootsTrees = [contractTreeRootsTree, privateDataTreeRootsTree, l1Tol2MessagesRootsTree];
    await Promise.all(historicRootsTrees.map(tree => tree.commit()));
  }

  /**
   * Method to asynchronously create and initialise a MerkleTrees instance.
   * @param db - The db instance to use for data persistance.
   * @param wasm - WASM instance to use for hashing (if not provided PrimitivesWasm will be used).
   * @returns - A fully initialised MerkleTrees instance.
   */
  public static async new(db: levelup.LevelUp, wasm?: WasmWrapper) {
    const merkleTrees = new MerkleTrees(db);
    await merkleTrees.init(wasm);
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
   * Inserts into the roots trees (CONTRACT_TREE_ROOTS_TREE, PRIVATE_DATA_TREE_ROOTS_TREE, L1_TO_L2_MESSAGES_TREE_ROOTS_TREE)
   * the current roots of the corresponding trees (CONTRACT_TREE, PRIVATE_DATA_TREE, L1_TO_L2_MESSAGES_TREE).
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   */
  public async updateHistoricRootsTrees(includeUncommitted: boolean) {
    for (const [newTree, rootTree] of [
      [MerkleTreeId.PRIVATE_DATA_TREE, MerkleTreeId.PRIVATE_DATA_TREE_ROOTS_TREE],
      [MerkleTreeId.CONTRACT_TREE, MerkleTreeId.CONTRACT_TREE_ROOTS_TREE],
      [MerkleTreeId.L1_TO_L2_MESSAGES_TREE, MerkleTreeId.L1_TO_L2_MESSAGES_ROOTS_TREE],
    ] as const) {
      const newTreeInfo = await this.getTreeInfo(newTree, includeUncommitted);
      await this.appendLeaves(rootTree, [newTreeInfo.root]);
    }
  }

  /**
   * Gets the tree info for the specified tree.
   * @param treeId - Id of the tree to get information from.
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   * @returns The tree info for the specified tree.
   */
  public async getTreeInfo(treeId: MerkleTreeId, includeUncommitted: boolean): Promise<TreeInfo> {
    return await this.synchronise(() => this._getTreeInfo(treeId, includeUncommitted));
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
    return await this.synchronise(() => this.trees[treeId].getLeafValue(index, includeUncommitted));
  }

  /**
   * Gets the sibling path for a leaf in a tree.
   * @param treeId - The ID of the tree.
   * @param index - The index of the leaf.
   * @param includeUncommitted - Indicates whether the sibling path should incro include uncommitted data.
   * @returns The sibling path for the leaf.
   */
  public async getSiblingPath(treeId: MerkleTreeId, index: bigint, includeUncommitted: boolean): Promise<SiblingPath> {
    return await this.synchronise(() => this._getSiblingPath(treeId, index, includeUncommitted));
  }

  /**
   * Appends leaves to a tree.
   * @param treeId - The ID of the tree.
   * @param leaves - The leaves to append.
   * @returns Empty promise.
   */
  public async appendLeaves(treeId: MerkleTreeId, leaves: Buffer[]): Promise<void> {
    return await this.synchronise(() => this._appendLeaves(treeId, leaves));
  }

  /**
   * Commits all pending updates.
   * @returns Empty promise.
   */
  public async commit(): Promise<void> {
    return await this.synchronise(() => this._commit());
  }

  /**
   * Rolls back all pending updates.
   * @returns Empty promise.
   */
  public async rollback(): Promise<void> {
    return await this.synchronise(() => this._rollback());
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
    return await this.synchronise(() =>
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
    return await this.synchronise(() =>
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
    return await this.synchronise(async () => {
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
    const tree = this.trees[treeId];
    if (!('updateLeaf' in tree)) {
      throw new Error('Tree does not support `updateLeaf` method');
    }
    return await this.synchronise(() => tree.updateLeaf(leaf, index));
  }

  /**
   * Helper function to find the sibling path of a subtree. This task is added to the job queue.
   * @param treeId - Tree ID to perform the search on.
   * @param subtreeHeight - Height of the subtree we're getting.
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   * @returns The Path to the subtree sibling.
   */
  public async getSubtreeSiblingPath(treeId: MerkleTreeId, subtreeHeight: number, includeUncommitted: boolean) {
    return await this.synchronise(() => this._getSubtreeSiblingPath(treeId, subtreeHeight, includeUncommitted));
  }

  /**
   * Batch inserts leaves into the nullifier tree.
   * @param leaves - Values to insert into the tree.
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   * @returns The witness data for the leaves to be updated when inserting the new ones.
   */
  public async performBaseRollupBatchInsertionProofs(
    leaves: Buffer[],
    includeUncommitted: boolean,
  ): Promise<[LowNullifierWitnessData[], Fr[]] | [undefined, Fr[]]> {
    return await this.synchronise(() => this._performBaseRollupBatchInsertionProofs(leaves, includeUncommitted));
  }

  /**
   * Waits for all jobs to finish before executing the given function.
   * @param fn - The function to execute.
   * @returns Promise containing the result of the function.
   */
  private async synchronise<T>(fn: () => Promise<T>): Promise<T> {
    return await this.jobQueue.put(fn);
  }

  /* eslint-disable jsdoc/require-description-complete-sentence */
  /* The following doc block messes up with complete-sentence, so we just disable it */

  /**
   *
   * Each base rollup needs to provide non membership / inclusion proofs for each of the nullifier.
   * This method will return membership proofs and perform partial node updates that will
   * allow the circuit to incrementally update the tree and perform a batch insertion.
   *
   * This offers massive circuit performance savings over doing incremental insertions.
   *
   * A description of the algorithm can be found here: https://colab.research.google.com/drive/1A0gizduSi4FIiIJZ8OylwIpO9-OTqV-R
   *
   * WARNING: This function has side effects, it will insert values into the tree.
   *
   * Assumptions:
   * 1. There are 8 nullifiers provided and they are either unique or empty. (denoted as 0)
   * 2. If kc 0 has 1 nullifier, and kc 1 has 3 nullifiers the layout will assume to be the sparse
   *   nullifier layout: [kc0-0, 0, 0, 0, kc1-0, kc1-1, kc1-2, 0]
   *
   * Algorithm overview
   *
   * In general, if we want to batch insert items, we first to update their low nullifier to point to them,
   * then batch insert all of the values as at once in the final step.
   * To update a low nullifier, we provide an insertion proof that the low nullifier currently exists to the
   * circuit, then update the low nullifier.
   * Updating this low nullifier will in turn change the root of the tree. Therefore future low nullifier insertion proofs
   * must be given against this new root.
   * As a result, each low nullifier membership proof will be provided against an intermediate tree state, each with differing
   * roots.
   *
   * This become tricky when two items that are being batch inserted need to update the same low nullifier, or need to use
   * a value that is part of the same batch insertion as their low nullifier. In this case a zero low nullifier path is given
   * to the circuit, and it must determine from the set of batch inserted values if the insertion is valid.
   *
   * The following example will illustrate attempting to insert 2,3,20,19 into a tree already containing 0,5,10,15
   *
   * The example will explore two cases. In each case the values low nullifier will exist within the batch insertion,
   * One where the low nullifier comes before the item in the set (2,3), and one where it comes after (20,19).
   *
   * The original tree:                       Pending insertion subtree
   *
   *  index     0       1       2       3         -       -       -       -
   *  -------------------------------------      ----------------------------
   *  val       0       5      10      15         -       -       -       -
   *  nextIdx   1       2       3       0         -       -       -       -
   *  nextVal   5      10      15       0         -       -       -       -
   *
   *
   * Inserting 2: (happy path)
   * 1. Find the low nullifier (0) - provide inclusion proof
   * 2. Update its pointers
   * 3. Insert 2 into the pending subtree
   *
   *  index     0       1       2       3         4       -       -       -
   *  -------------------------------------      ----------------------------
   *  val       0       5      10      15         2       -       -       -
   *  nextIdx   4       2       3       0         1       -       -       -
   *  nextVal   2      10      15       0         5       -       -       -
   *
   * Inserting 3: The low nullifier exists within the insertion current subtree
   * 1. When looking for the low nullifier for 3, we will receive 0 again as we have not inserted 2 into the main tree
   *    This is problematic, as we cannot use either 0 or 2 as our inclusion proof.
   *    Why cant we?
   *      - Index 0 has a val 0 and nextVal of 2. This is NOT enough to prove non inclusion of 2.
   *      - Our existing tree is in a state where we cannot prove non inclusion of 3.
   *    We do not provide a non inclusion proof to out circuit, but prompt it to look within the insertion subtree.
   * 2. Update pending insertion subtree
   * 3. Insert 3 into pending subtree
   *
   * (no inclusion proof provided)
   *  index     0       1       2       3         4       5       -       -
   *  -------------------------------------      ----------------------------
   *  val       0       5      10      15         2       3       -       -
   *  nextIdx   4       2       3       0         5       1       -       -
   *  nextVal   2      10      15       0         3       5       -       -
   *
   * Inserting 20: (happy path)
   * 1. Find the low nullifier (15) - provide inculsion proof
   * 2. Update its pointers
   * 3. Insert 20 into the pending subtree
   *
   *  index     0       1       2       3         4       5       6       -
   *  -------------------------------------      ----------------------------
   *  val       0       5      10      15         2       3      20       -
   *  nextIdx   4       2       3       6         5       1       0       -
   *  nextVal   2      10      15      20         3       5       0       -
   *
   * Inserting 19:
   * 1. In this case we can find a low nullifier, but we are updating a low nullifier that has already been updated
   *    We can provide an inclusion proof of this intermediate tree state.
   * 2. Update its pointers
   * 3. Insert 19 into the pending subtree
   *
   *  index     0       1       2       3         4       5       6       7
   *  -------------------------------------      ----------------------------
   *  val       0       5      10      15         2       3      20       19
   *  nextIdx   4       2       3       7         5       1       0       6
   *  nextVal   2      10      15      19         3       5       0       20
   *
   * Perform subtree insertion
   *
   *  index     0       1       2       3       4       5       6       7
   *  ---------------------------------------------------------------------
   *  val       0       5      10      15       2       3      20       19
   *  nextIdx   4       2       3       7       5       1       0       6
   *  nextVal   2      10      15      19       3       5       0       20
   *
   * TODO: this implementation will change once the zero value is changed from h(0,0,0). Changes incoming over the next sprint
   * @param leaves - Values to insert into the tree
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   * @returns The witness data for the leaves to be updated when inserting the new ones.
   */
  private async _performBaseRollupBatchInsertionProofs(
    leaves: Buffer[],
    includeUncommitted: boolean,
  ): Promise<[LowNullifierWitnessData[], Fr[]] | [undefined, Fr[]]> {
    // Keep track of touched low nullifiers
    const touched = new Map<number, bigint[]>();

    // Accumulators
    const lowNullifierWitnesses: LowNullifierWitnessData[] = [];
    const pendingInsertionSubtree: NullifierLeafPreimage[] = [];

    // Start info
    const dbInfo = await this.getTreeInfo(MerkleTreeId.NULLIFIER_TREE, includeUncommitted);
    const startInsertionIndex: bigint = dbInfo.size;

    // Get insertion path for each leaf
    for (let i = 0; i < leaves.length; i++) {
      const newValue = toBigIntBE(leaves[i]);

      // Keep space and just insert zero values
      if (newValue === 0n) {
        pendingInsertionSubtree.push(NullifierLeafPreimage.empty());
        lowNullifierWitnesses.push(EMPTY_LOW_NULLIFIER_WITNESS);
        continue;
      }

      const indexOfPrevious = await this.getPreviousValueIndex(
        MerkleTreeId.NULLIFIER_TREE,
        newValue,
        includeUncommitted,
      );

      // If a touched node has a value that is less greater than the current value
      const prevNodes = touched.get(indexOfPrevious.index);
      if (prevNodes && prevNodes.some(v => v < newValue)) {
        // check the pending low nullifiers for a low nullifier that works
        // This is the case where the next value is less than the pending
        for (let j = 0; j < pendingInsertionSubtree.length; j++) {
          if (pendingInsertionSubtree[j].leafValue.isZero()) continue;

          if (
            pendingInsertionSubtree[j].leafValue.value < newValue &&
            (pendingInsertionSubtree[j].nextValue.value > newValue || pendingInsertionSubtree[j].nextValue.isZero())
          ) {
            // add the new value to the pending low nullifiers
            const currentLeafLowNullifier = new NullifierLeafPreimage(
              new Fr(newValue),
              pendingInsertionSubtree[j].nextValue,
              Number(pendingInsertionSubtree[j].nextIndex),
            );

            pendingInsertionSubtree.push(currentLeafLowNullifier);

            // Update the pending low nullifier to point at the new value
            pendingInsertionSubtree[j].nextValue = new Fr(newValue);
            pendingInsertionSubtree[j].nextIndex = Number(startInsertionIndex) + i;

            break;
          }
        }

        // Any node updated in this space will need to calculate its low nullifier from a previously inserted value
        lowNullifierWitnesses.push(EMPTY_LOW_NULLIFIER_WITNESS);
      } else {
        // Update the touched mapping
        if (prevNodes) {
          prevNodes.push(newValue);
          touched.set(indexOfPrevious.index, prevNodes);
        } else {
          touched.set(indexOfPrevious.index, [newValue]);
        }

        // get the low nullifier
        const lowNullifier = await this.getLeafData(
          MerkleTreeId.NULLIFIER_TREE,
          indexOfPrevious.index,
          includeUncommitted,
        );
        if (lowNullifier === undefined) {
          return [
            undefined,
            await this.getSubtreeSiblingPath(
              MerkleTreeId.NULLIFIER_TREE,
              BaseRollupInputs.NULLIFIER_SUBTREE_HEIGHT,
              includeUncommitted,
            ),
          ];
        }

        const lowNullifierPreimage = new NullifierLeafPreimage(
          new Fr(lowNullifier.value),
          new Fr(lowNullifier.nextValue),
          Number(lowNullifier.nextIndex),
        );
        const siblingPath = await this.getSiblingPath(
          MerkleTreeId.NULLIFIER_TREE,
          BigInt(indexOfPrevious.index),
          includeUncommitted,
        );

        // Update the running paths
        const witness: LowNullifierWitnessData = {
          preimage: lowNullifierPreimage,
          index: BigInt(indexOfPrevious.index),
          siblingPath: siblingPath,
        };
        lowNullifierWitnesses.push(witness);

        // The low nullifier the inserted value will have
        const currentLeafLowNullifier = new NullifierLeafPreimage(
          new Fr(newValue),
          new Fr(lowNullifier.nextValue),
          Number(lowNullifier.nextIndex),
        );
        pendingInsertionSubtree.push(currentLeafLowNullifier);

        // Update the old low nullifier
        lowNullifier.nextValue = newValue;
        lowNullifier.nextIndex = startInsertionIndex + BigInt(i);

        await this.updateLeaf(MerkleTreeId.NULLIFIER_TREE, lowNullifier, BigInt(indexOfPrevious.index));
      }
    }

    const newNullifiersSubtreeSiblingPath = await this.getSubtreeSiblingPath(
      MerkleTreeId.NULLIFIER_TREE,
      BaseRollupInputs.NULLIFIER_SUBTREE_HEIGHT,
      includeUncommitted,
    );

    // Perform batch insertion of new pending values
    for (let i = 0; i < pendingInsertionSubtree.length; i++) {
      const asLeafData: LeafData = {
        value: pendingInsertionSubtree[i].leafValue.value,
        nextValue: pendingInsertionSubtree[i].nextValue.value,
        nextIndex: BigInt(pendingInsertionSubtree[i].nextIndex),
      };

      await this.updateLeaf(MerkleTreeId.NULLIFIER_TREE, asLeafData, startInsertionIndex + BigInt(i));
    }

    return [lowNullifierWitnesses, newNullifiersSubtreeSiblingPath];
  }

  /**
   * Helper function to find the sibling path of a subtree.
   * @param treeId - Tree ID to perform the search on.
   * @param subtreeHeight - Height of the subtree we're getting.
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   * @returns The Path to the subtree sibling.
   */
  private async _getSubtreeSiblingPath(
    treeId: MerkleTreeId,
    subtreeHeight: number,
    includeUncommitted: boolean,
  ): Promise<Fr[]> {
    const nextAvailableLeafIndex = await this.getTreeInfo(treeId, includeUncommitted).then(t => t.size);
    const fullSiblingPath = await this.getSiblingPath(treeId, nextAvailableLeafIndex, includeUncommitted);

    // Drop the first subtreeHeight items since we only care about the path to the subtree root
    return fullSiblingPath.data.slice(subtreeHeight).map(b => Fr.fromBuffer(b));
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
  private _getSiblingPath(treeId: MerkleTreeId, index: bigint, includeUncommitted: boolean): Promise<SiblingPath> {
    return Promise.resolve(this.trees[treeId].getSiblingPath(index, includeUncommitted));
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

  /**
   * Commits all pending updates.
   * @returns Empty promise.
   */
  private async _commit(): Promise<void> {
    for (const tree of this.trees) {
      await tree.commit();
    }
  }

  /**
   * Rolls back all pending updates.
   * @returns Empty promise.
   */
  private async _rollback(): Promise<void> {
    for (const tree of this.trees) {
      await tree.rollback();
    }
  }
}
