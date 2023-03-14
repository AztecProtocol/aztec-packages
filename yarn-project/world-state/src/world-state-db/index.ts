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
