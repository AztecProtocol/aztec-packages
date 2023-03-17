import { default as LevelUp } from 'levelup';
import {
  StandardMerkleTree,
  Pedersen,
  SiblingPath,
  MerkleTree,
  MerkleTreeDb,
  MerkleTreeId,
  TreeInfo,
  IndexedTree,
} from '@aztec/merkle-tree';
import { SerialQueue } from '@aztec/foundation';

/**
 * A convenience class for managing multiple merkle trees.
 */
export class MerkleTrees implements MerkleTreeDb {
  private trees: MerkleTree[] = [];
  private jobQueue = new SerialQueue();

  constructor(db: LevelUp) {
    const hasher = new Pedersen();
    const contractTree = StandardMerkleTree.new(db, hasher, `${MerkleTreeId[MerkleTreeId.CONTRACT_TREE]}`, 32);
    const contractTreeRootsTree = StandardMerkleTree.new(
      db,
      hasher,
      `${MerkleTreeId[MerkleTreeId.CONTRACT_TREE_ROOTS_TREE]}`,
      7,
    );
    const nullifierTree = IndexedTree.new(db, hasher, `${MerkleTreeId[MerkleTreeId.NULLIFIER_TREE]}`, 32);
    this.trees = [contractTree, contractTreeRootsTree, nullifierTree];
    this.jobQueue.start();
  }

  /**
   * Stops the job queue (waits for all jobs to finish).
   */
  public async stop() {
    await this.jobQueue.end();
  }

  /**
   * Gets the tree info for all trees.
   * @returns The tree info for all trees.
   */
  public async getTreeInfo(): Promise<TreeInfo[]> {
    return await this.synchronise(() => this._getTreeInfo());
  }

  /**
   * Gets the sibling path for a leaf in a tree.
   * @param treeId - The ID of the tree.
   * @param index - The index of the leaf.
   * @returns The sibling path for the leaf.
   */
  public async getSiblingPath(treeId: MerkleTreeId, index: number): Promise<SiblingPath> {
    return await this.synchronise(() => this._getSiblingPath(treeId, index));
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
   * Waits for all jobs to finish before executing the given function.
   * @param fn - The function to execute.
   * @returns Promise containing the result of the function.
   */
  private async synchronise<T>(fn: () => Promise<T>): Promise<T> {
    return await this.jobQueue.put(fn);
  }

  /**
   * Returns the tree info for all trees.
   * @returns The tree info for all trees.
   */
  private _getTreeInfo(): Promise<TreeInfo[]> {
    return Promise.resolve(
      this.trees.map((tree, index) => {
        return {
          treeId: MerkleTreeId[index],
          root: tree.getRoot(),
          size: tree.getSize(),
        } as TreeInfo;
      }),
    );
  }

  /**
   * Returns the sibling path for a leaf in a tree.
   * @param treeId - Id of the tree to get the sibling path from.
   * @param index - Index of the leaf to get the sibling path for.
   * @returns Promise containing the sibling path for the leaf.
   */
  private _getSiblingPath(treeId: MerkleTreeId, index: number): Promise<SiblingPath> {
    return Promise.resolve(this.trees[treeId].getHashPath(index));
  }

  /**
   * Appends leaves to a tree.
   * @param treeId - Id of the tree to append leaves to.
   * @param leaves - Leaves to append.
   * @returns Empty promise.
   */
  private async _appendLeaves(treeId: MerkleTreeId, leaves: Buffer[]): Promise<void> {
    return await this.trees[treeId].appendLeaves(leaves);
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
