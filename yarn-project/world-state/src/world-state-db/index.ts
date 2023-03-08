import { HashPath } from '@aztec/merkle-tree';

export enum WorldStateTreeId {
  CONTRACT_TREE = 0,
}

export interface TreeInfo {
  treeId: WorldStateTreeId;
  root: Buffer;
  size: number;
}

export interface BatchUpdate {
  treeId: WorldStateTreeId;
  elements: Buffer[];
}

export interface WorldStateDB {
  getTreeInfo(): Promise<TreeInfo[]>;
  insertElements(batches: BatchUpdate[]): Promise<TreeInfo[]>;
  getHashPath(treeId: WorldStateTreeId, index: number): Promise<HashPath>;
}
