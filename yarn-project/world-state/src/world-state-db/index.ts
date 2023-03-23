<<<<<<< HEAD
/**
 * Defines what kind of tree we are dealing with.
=======
export * from './memory_world_state_db.js';
/**
 * Defines the possible tree IDs.
>>>>>>> master
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
<<<<<<< HEAD
   * The number of leaves.
=======
   * The number of leaves in the tree.
>>>>>>> master
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
