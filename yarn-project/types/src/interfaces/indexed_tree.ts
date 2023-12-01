/**
 * A leaf of a tree.
 */
export interface LeafData {
  /**
   * A value of the leaf.
   */
  value: bigint;
  /**
   * An index of the next leaf.
   */
  nextIndex: bigint;
  /**
   * A value of the next leaf.
   */
  nextValue: bigint;
}

/* eslint-disable */

export interface IndexedTreeLeaf {
  getKey(): bigint;
  toBuffer(): Buffer;
  isEmpty(): boolean;
}

export interface IndexedTreeLeafPreimage<Leaf extends IndexedTreeLeaf> {
  key: bigint;
  nextKey: bigint;
  nextIndex: bigint;

  asLeaf(): Leaf;
  toBuffer(): Buffer;
  toHashInputs(): Buffer[];
  clone(): IndexedTreeLeafPreimage<Leaf>;
}
