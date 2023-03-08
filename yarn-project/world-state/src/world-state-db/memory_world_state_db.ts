import { default as LevelUp } from 'levelup';
import { MemDown } from 'memdown';
import { BatchUpdate, TreeInfo, WorldStateDB, WorldStateTreeId } from './index.js';
import { MerkleTree, Pedersen, HashPath } from '@aztec/merkle-tree';

export class MemoryWorldStateDb implements WorldStateDB {
  private trees: MerkleTree[] = [];

  constructor() {
    const db = new LevelUp(MemDown());
    const hasher = new Pedersen();
    this.trees = [new MerkleTree(db, hasher, `${WorldStateTreeId[WorldStateTreeId.CONTRACT_TREE]}`, 32)];
  }

  public getTreeInfo() {
    const treeInfo = {
      treeId: WorldStateTreeId.CONTRACT_TREE,
      root: this.trees[WorldStateTreeId.CONTRACT_TREE].getRoot(),
      size: this.trees[WorldStateTreeId.CONTRACT_TREE].getSize(),
    } as TreeInfo;
    return Promise.resolve([treeInfo]);
  }

  public getHashPath(treeId: WorldStateTreeId, index: number): Promise<HashPath> {
    return this.trees[treeId].getHashPath(index);
  }

  public async insertElements(batches: BatchUpdate[]): Promise<TreeInfo[]> {
    const results: TreeInfo[] = [];
    for (const batch of batches) {
      await this.trees[batch.treeId].updateElements(this.trees[batch.treeId].getSize(), batch.elements);
      results.push({
        treeId: batch.treeId,
        size: this.trees[batch.treeId].getSize(),
        root: this.trees[batch.treeId].getRoot(),
      } as TreeInfo);
    }
    return results;
  }
}
