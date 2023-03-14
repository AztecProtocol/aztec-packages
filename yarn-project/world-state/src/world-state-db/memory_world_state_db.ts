import { default as LevelUp } from 'levelup';
import {
  StandardMerkleTree,
  Pedersen,
  SiblingPath,
  MerkleTreeDb,
  MerkleTreeId,
  TreeInfo,
  IndexedTree,
} from '@aztec/merkle-tree';
import { SerialQueue } from '../serial_queue.js';

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

  public async stop() {
    await this.jobQueue.end();
  }

  public async getTreeInfo() {
    return await this.synchronise(() => this._getTreeInfo());
  }

  public async getSiblingPath(treeId: MerkleTreeId, index: number): Promise<SiblingPath> {
    return await this.synchronise(() => this._getSiblingPath(treeId, index));
  }

  public async appendLeaves(treeId: MerkleTreeId, leaves: Buffer[]): Promise<void> {
    return await this.synchronise(() => this._appendLeaves(treeId, leaves));
  }

  public async commit() {
    return await this.synchronise(() => this._commit());
  }

  public async rollback() {
    return await this.synchronise(() => this._rollback());
  }

  private async synchronise<T>(fn: () => Promise<T>): Promise<T> {
    return await this.jobQueue.put(fn);
  }

  private _getTreeInfo() {
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

  private _getSiblingPath(treeId: MerkleTreeId, index: number): Promise<SiblingPath> {
    return Promise.resolve(this.trees[treeId].getHashPath(index));
  }

  private async _appendLeaves(treeId: MerkleTreeId, leaves: Buffer[]) {
    return await this.trees[treeId].appendLeaves(leaves);
  }

  private async _commit() {
    for (const tree of this.trees) {
      await tree.commit();
    }
  }

  private async _rollback() {
    for (const tree of this.trees) {
      await tree.rollback();
    }
  }
}
