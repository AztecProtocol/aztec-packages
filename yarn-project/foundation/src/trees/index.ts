/* eslint-disable */

export interface IndexedTreeLeaf {
  getKey(): bigint;
  toBuffer(): Buffer;
  isEmpty(): boolean;
}

export interface IndexedTreeLeafPreimage<Leaf extends IndexedTreeLeaf> {
  getKey(): bigint;
  getNextKey(): bigint;
  getNextIndex(): bigint;

  asLeaf(): Leaf;
  toBuffer(): Buffer;
  toHashInputs(): Buffer[];
}
