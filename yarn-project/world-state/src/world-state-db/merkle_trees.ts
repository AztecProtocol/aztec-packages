import { L2Block, MerkleTreeId, SiblingPath } from '@aztec/circuit-types';
import {
  ARCHIVE_HEIGHT,
  AppendOnlyTreeSnapshot,
  CONTRACT_TREE_HEIGHT,
  ContentCommitment,
  Fr,
  GlobalVariables,
  Header,
  L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_SUBTREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  NullifierLeaf,
  NullifierLeafPreimage,
  PUBLIC_DATA_SUBTREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
  PartialStateReference,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
  StateReference,
} from '@aztec/circuits.js';
import { SerialQueue } from '@aztec/foundation/fifo';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { IndexedTreeLeafPreimage } from '@aztec/foundation/trees';
import { AztecKVStore } from '@aztec/kv-store';
import {
  AppendOnlyTree,
  BatchInsertionResult,
  IndexedTree,
  Pedersen,
  StandardIndexedTree,
  StandardTree,
  UpdateOnlyTree,
  getTreeMeta,
  loadTree,
  newTree,
} from '@aztec/merkle-tree';
import { Hasher } from '@aztec/types/interfaces';

import { INITIAL_NULLIFIER_TREE_SIZE, INITIAL_PUBLIC_DATA_TREE_SIZE, MerkleTreeDb } from './merkle_tree_db.js';
import { HandleL2BlockResult, IndexedTreeId, MerkleTreeOperations, TreeInfo } from './merkle_tree_operations.js';
import { MerkleTreeOperationsFacade } from './merkle_tree_operations_facade.js';

/**
 * The nullifier tree is an indexed tree.
 */
class NullifierTree extends StandardIndexedTree {
  constructor(store: AztecKVStore, hasher: Hasher, name: string, depth: number, size: bigint = 0n, root?: Buffer) {
    super(store, hasher, name, depth, size, NullifierLeafPreimage, NullifierLeaf, root);
  }
}

/**
 * The public data tree is an indexed tree.
 */
class PublicDataTree extends StandardIndexedTree {
  constructor(store: AztecKVStore, hasher: Hasher, name: string, depth: number, size: bigint = 0n, root?: Buffer) {
    super(store, hasher, name, depth, size, PublicDataTreeLeafPreimage, PublicDataTreeLeaf, root);
  }
}

/**
 * A convenience class for managing multiple merkle trees.
 */
export class MerkleTrees implements MerkleTreeDb {
  private trees: (AppendOnlyTree | UpdateOnlyTree)[] = [];
  private jobQueue = new SerialQueue();

  private constructor(private store: AztecKVStore, private log: DebugLogger) {}

  /**
   * Method to asynchronously create and initialize a MerkleTrees instance.
   * @param store - The db instance to use for data persistance.
   * @returns - A fully initialized MerkleTrees instance.
   */
  public static async new(store: AztecKVStore, log = createDebugLogger('aztec:merkle_trees')) {
    const merkleTrees = new MerkleTrees(store, log);
    await merkleTrees.#init();
    return merkleTrees;
  }

  /**
   * Initializes the collection of Merkle Trees.
   */
  async #init() {
    const fromDb = this.#isDbPopulated();
    const initializeTree = fromDb ? loadTree : newTree;

    const hasher = new Pedersen();
    const contractTree: AppendOnlyTree = await initializeTree(
      StandardTree,
      this.store,
      hasher,
      `${MerkleTreeId[MerkleTreeId.CONTRACT_TREE]}`,
      CONTRACT_TREE_HEIGHT,
    );
    const nullifierTree = await initializeTree(
      NullifierTree,
      this.store,
      hasher,
      `${MerkleTreeId[MerkleTreeId.NULLIFIER_TREE]}`,
      NULLIFIER_TREE_HEIGHT,
      INITIAL_NULLIFIER_TREE_SIZE,
    );
    const noteHashTree: AppendOnlyTree = await initializeTree(
      StandardTree,
      this.store,
      hasher,
      `${MerkleTreeId[MerkleTreeId.NOTE_HASH_TREE]}`,
      NOTE_HASH_TREE_HEIGHT,
    );
    const publicDataTree = await initializeTree(
      PublicDataTree,
      this.store,
      hasher,
      `${MerkleTreeId[MerkleTreeId.PUBLIC_DATA_TREE]}`,
      PUBLIC_DATA_TREE_HEIGHT,
      INITIAL_PUBLIC_DATA_TREE_SIZE,
    );
    const l1Tol2MessageTree: AppendOnlyTree = await initializeTree(
      StandardTree,
      this.store,
      hasher,
      `${MerkleTreeId[MerkleTreeId.L1_TO_L2_MESSAGE_TREE]}`,
      L1_TO_L2_MSG_TREE_HEIGHT,
    );
    const archive: AppendOnlyTree = await initializeTree(
      StandardTree,
      this.store,
      hasher,
      `${MerkleTreeId[MerkleTreeId.ARCHIVE]}`,
      ARCHIVE_HEIGHT,
    );
    this.trees = [contractTree, nullifierTree, noteHashTree, publicDataTree, l1Tol2MessageTree, archive];

    this.jobQueue.start();

    if (!fromDb) {
      // We are not initializing from db so we need to populate the first leaf of the archive tree which is a hash of
      // the initial header.
      const initialHeder = await this.buildInitialHeader(true);
      await this.#updateArchive(initialHeder, true);
    }

    await this.#commit();
  }

  public async buildInitialHeader(includeUncommitted: boolean): Promise<Header> {
    const state = await this.getStateReference(includeUncommitted);
    return new Header(AppendOnlyTreeSnapshot.zero(), ContentCommitment.empty(), state, GlobalVariables.empty());
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
   * Updates the archive with the new block/header hash.
   * @param header - The header whose hash to insert into the archive.
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   */
  public async updateArchive(header: Header, includeUncommitted: boolean) {
    await this.synchronize(() => this.#updateArchive(header, includeUncommitted));
  }

  /**
   * Gets the tree info for the specified tree.
   * @param treeId - Id of the tree to get information from.
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   * @returns The tree info for the specified tree.
   */
  public async getTreeInfo(treeId: MerkleTreeId, includeUncommitted: boolean): Promise<TreeInfo> {
    return await this.synchronize(() => this.#getTreeInfo(treeId, includeUncommitted));
  }

  /**
   * Get the current state reference
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   * @returns The current state reference
   */
  public getStateReference(includeUncommitted: boolean): Promise<StateReference> {
    const getAppendOnlyTreeSnapshot = (treeId: MerkleTreeId) => {
      const tree = this.trees[treeId] as AppendOnlyTree;
      return new AppendOnlyTreeSnapshot(
        Fr.fromBuffer(tree.getRoot(includeUncommitted)),
        Number(tree.getNumLeaves(includeUncommitted)),
      );
    };

    const state = new StateReference(
      getAppendOnlyTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE),
      new PartialStateReference(
        getAppendOnlyTreeSnapshot(MerkleTreeId.NOTE_HASH_TREE),
        getAppendOnlyTreeSnapshot(MerkleTreeId.NULLIFIER_TREE),
        getAppendOnlyTreeSnapshot(MerkleTreeId.CONTRACT_TREE),
        getAppendOnlyTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE),
      ),
    );
    return Promise.resolve(state);
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
    return await this.synchronize(() => Promise.resolve(this.trees[treeId].getLeafValue(index, includeUncommitted)));
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
    return await this.synchronize(() => this.trees[treeId].getSiblingPath<N>(index, includeUncommitted));
  }

  /**
   * Appends leaves to a tree.
   * @param treeId - The ID of the tree.
   * @param leaves - The leaves to append.
   * @returns Empty promise.
   */
  public async appendLeaves(treeId: MerkleTreeId, leaves: Buffer[]): Promise<void> {
    return await this.synchronize(() => this.#appendLeaves(treeId, leaves));
  }

  /**
   * Commits all pending updates.
   * @returns Empty promise.
   */
  public async commit(): Promise<void> {
    return await this.synchronize(() => this.#commit());
  }

  /**
   * Rolls back all pending updates.
   * @returns Empty promise.
   */
  public async rollback(): Promise<void> {
    return await this.synchronize(() => this.#rollback());
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
    return await this.synchronize(() =>
      Promise.resolve(this.#getIndexedTree(treeId).findIndexOfPreviousKey(value, includeUncommitted)),
    );
  }

  /**
   * Gets the leaf data at a given index and tree.
   * @param treeId - The ID of the tree get the leaf from.
   * @param index - The index of the leaf to get.
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   * @returns Leaf preimage.
   */
  public async getLeafPreimage(
    treeId: IndexedTreeId,
    index: bigint,
    includeUncommitted: boolean,
  ): Promise<IndexedTreeLeafPreimage | undefined> {
    return await this.synchronize(() =>
      Promise.resolve(this.#getIndexedTree(treeId).getLatestLeafPreimageCopy(index, includeUncommitted)),
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
    return await this.synchronize(() => {
      const tree = this.trees[treeId];
      return Promise.resolve(tree.findLeafIndex(value, includeUncommitted));
    });
  }

  /**
   * Updates a leaf in a tree at a given index.
   * @param treeId - The ID of the tree.
   * @param leaf - The new leaf value.
   * @param index - The index to insert into.
   * @returns Empty promise.
   */
  public async updateLeaf(treeId: IndexedTreeId, leaf: Buffer, index: bigint): Promise<void> {
    return await this.synchronize(() => this.#updateLeaf(treeId, leaf, index));
  }

  /**
   * Handles a single L2 block (i.e. Inserts the new note hashes into the merkle tree).
   * @param block - The L2 block to handle.
   * @returns Whether the block handled was produced by this same node.
   */
  public async handleL2Block(block: L2Block): Promise<HandleL2BlockResult> {
    return await this.synchronize(() => this.#handleL2Block(block));
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
  ): Promise<BatchInsertionResult<TreeHeight, SubtreeSiblingPathHeight>> {
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

  async #updateArchive(header: Header, includeUncommitted: boolean) {
    const state = await this.getStateReference(includeUncommitted);

    // This method should be called only when the block builder already updated the state so we sanity check that it's
    // the case here.
    if (!state.toBuffer().equals(header.state.toBuffer())) {
      throw new Error('State in header does not match current state');
    }

    const blockHash = header.hash();
    await this.#appendLeaves(MerkleTreeId.ARCHIVE, [blockHash.toBuffer()]);
  }

  /**
   * Returns the tree info for the specified tree id.
   * @param treeId - Id of the tree to get information from.
   * @param includeUncommitted - Indicates whether to include uncommitted data.
   * @returns The tree info for the specified tree.
   */
  #getTreeInfo(treeId: MerkleTreeId, includeUncommitted: boolean): Promise<TreeInfo> {
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
  #getIndexedTree(treeId: IndexedTreeId): IndexedTree {
    return this.trees[treeId] as IndexedTree;
  }

  /**
   * Appends leaves to a tree.
   * @param treeId - Id of the tree to append leaves to.
   * @param leaves - Leaves to append.
   * @returns Empty promise.
   */
  async #appendLeaves(treeId: MerkleTreeId, leaves: Buffer[]): Promise<void> {
    const tree = this.trees[treeId];
    if (!('appendLeaves' in tree)) {
      throw new Error('Tree does not support `appendLeaves` method');
    }
    return await tree.appendLeaves(leaves);
  }

  async #updateLeaf(treeId: IndexedTreeId, leaf: Buffer, index: bigint): Promise<void> {
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
  async #commit(): Promise<void> {
    for (const tree of this.trees) {
      await tree.commit();
    }
  }

  /**
   * Rolls back all pending updates.
   * @returns Empty promise.
   */
  async #rollback(): Promise<void> {
    for (const tree of this.trees) {
      await tree.rollback();
    }
  }

  public getSnapshot(blockNumber: number) {
    return Promise.all(this.trees.map(tree => tree.getSnapshot(blockNumber)));
  }

  async #snapshot(blockNumber: number): Promise<void> {
    for (const tree of this.trees) {
      await tree.snapshot(blockNumber);
    }
  }

  /**
   * Handles a single L2 block (i.e. Inserts the new note hashes into the merkle tree).
   * @param l2Block - The L2 block to handle.
   */
  async #handleL2Block(l2Block: L2Block): Promise<HandleL2BlockResult> {
    const treeRootWithIdPairs = [
      [l2Block.header.state.partial.contractTree.root, MerkleTreeId.CONTRACT_TREE],
      [l2Block.header.state.partial.nullifierTree.root, MerkleTreeId.NULLIFIER_TREE],
      [l2Block.header.state.partial.noteHashTree.root, MerkleTreeId.NOTE_HASH_TREE],
      [l2Block.header.state.partial.publicDataTree.root, MerkleTreeId.PUBLIC_DATA_TREE],
      [l2Block.header.state.l1ToL2MessageTree.root, MerkleTreeId.L1_TO_L2_MESSAGE_TREE],
      [l2Block.archive.root, MerkleTreeId.ARCHIVE],
    ] as const;
    const compareRoot = (root: Fr, treeId: MerkleTreeId) => {
      const treeRoot = this.trees[treeId].getRoot(true);
      return treeRoot.equals(root.toBuffer());
    };
    const ourBlock = treeRootWithIdPairs.every(([root, id]) => compareRoot(root, id));
    if (ourBlock) {
      this.log(`Block ${l2Block.number} is ours, committing world state`);
      await this.#commit();
    } else {
      this.log(`Block ${l2Block.number} is not ours, rolling back world state and committing state from chain`);
      await this.#rollback();

      // Sync the append only trees
      for (const [tree, leaves] of [
        [MerkleTreeId.CONTRACT_TREE, l2Block.body.txEffects.flatMap(txEffect => txEffect.contractLeaves)],
        [MerkleTreeId.NOTE_HASH_TREE, l2Block.body.txEffects.flatMap(txEffect => txEffect.newNoteHashes)],
        [MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l2Block.body.l1ToL2Messages],
      ] as const) {
        await this.#appendLeaves(
          tree,
          leaves.map(fr => fr.toBuffer()),
        );
      }

      // Sync the indexed trees
      await (this.trees[MerkleTreeId.NULLIFIER_TREE] as StandardIndexedTree).batchInsert(
        l2Block.body.txEffects.flatMap(txEffect => txEffect.newNullifiers.map(nullifier => nullifier.toBuffer())),
        NULLIFIER_SUBTREE_HEIGHT,
      );

      const publicDataTree = this.trees[MerkleTreeId.PUBLIC_DATA_TREE] as StandardIndexedTree;

      const publicDataWrites = l2Block.body.txEffects.flatMap(txEffect => txEffect.newPublicDataWrites);

      // We insert the public data tree leaves with one batch per tx to avoid updating the same key twice
      for (let i = 0; i < publicDataWrites.length / MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX; i++) {
        await publicDataTree.batchInsert(
          publicDataWrites
            .slice(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * i, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * (i + 1))
            .map(write => new PublicDataTreeLeaf(write.leafIndex, write.newValue).toBuffer()),
          PUBLIC_DATA_SUBTREE_HEIGHT,
        );
      }

      // The last thing remaining is to update the archive
      await this.#updateArchive(l2Block.header, true);

      await this.#commit();
    }

    for (const [root, treeId] of treeRootWithIdPairs) {
      const treeName = MerkleTreeId[treeId];
      const info = await this.#getTreeInfo(treeId, false);
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
    await this.#snapshot(l2Block.number);

    return { isBlockOurs: ourBlock };
  }

  #isDbPopulated(): boolean {
    try {
      getTreeMeta(this.store, MerkleTreeId[MerkleTreeId.NULLIFIER_TREE]);
      // Tree meta was found --> db is populated
      return true;
    } catch (e) {
      // Tree meta was not found --> db is not populated
      return false;
    }
  }
}
