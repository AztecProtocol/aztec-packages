/**
 * Defines what kind of tree we are dealing with.
 */
export enum WorldStateTreeId {
  CONTRACT_TREE = 0,
}

/**
 * Defines tree information.
 */
export interface TreeInfo {
  /**
   * The tree ID.
   */
  treeId: WorldStateTreeId;
  /**
   * The tree root.
   */
  root: Buffer;
  /**
   * The number of leaves.
   */
  size: number;
}

/**
 * Defines a batch update.
 */
export interface BatchUpdate {
  /**
   * The ID of a tree to be updated.
   */
  treeId: WorldStateTreeId;
  /**
   * The leaves to be updated.
   */
  elements: Buffer[];
}
