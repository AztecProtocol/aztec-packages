import { SiblingPath } from './sibling_path.js';

export enum MerkleTreeId {
  CONTRACT_TREE = 0,
  CONTRACT_TREE_ROOTS_TREE = 1,
  NULLIFIER_TREE = 2,
}

export interface TreeInfo {
  treeId: MerkleTreeId;
  root: Buffer;
  size: bigint;
}

export interface BatchUpdate {
  treeId: MerkleTreeId;
  elements: Buffer[];
}

export interface SiblingPathSource {
  getSiblingPath(index: bigint): Promise<SiblingPath>;
}

export interface MerkleTree extends SiblingPathSource {
  getRoot(): Buffer;
  getNumLeaves(): bigint;
  appendLeaves(leaves: Buffer[]): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface MerkleTreeDb {
  getTreeInfo(treeId: MerkleTreeId): Promise<TreeInfo>;
  appendLeaves(treeId: MerkleTreeId, leaves: Buffer[]): Promise<void>;
  getSiblingPath(treeId: MerkleTreeId, index: bigint): Promise<SiblingPath>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
