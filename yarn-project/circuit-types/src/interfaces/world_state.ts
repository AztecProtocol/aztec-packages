import type { MerkleTreeReadOperations, MerkleTreeWriteOperations } from './merkle_tree_operations.js';

/**
 * Defines the possible states of the world state synchronizer.
 */
export enum WorldStateRunningState {
  IDLE,
  SYNCHING,
  RUNNING,
  STOPPED,
}

/**
 * Defines the status of the world state synchronizer.
 */
export interface WorldStateStatus {
  /**
   * The current state of the world state synchronizer.
   */
  state: WorldStateRunningState;
  /**
   * The block number that the world state synchronizer is synced to.
   */
  syncedToL2Block: number;
}

/**
 * Defines the interface for a world state synchronizer.
 */
export interface WorldStateSynchronizer {
  /**
   * Starts the synchronizer.
   * @returns A promise that resolves once the initial sync is completed.
   */
  start(): void;

  /**
   * Returns the current status of the synchronizer.
   * @returns The current status of the synchronizer.
   */
  status(): Promise<WorldStateStatus>;

  /**
   * Stops the synchronizer.
   */
  stop(): Promise<void>;

  /**
   * Forces an immediate sync to an optionally provided minimum block number
   * @param minBlockNumber - The minimum block number that we must sync to
   * @returns A promise that resolves with the block number the world state was synced to
   */
  syncImmediate(minBlockNumber?: number): Promise<number>;

  /**
   * Pauses the synchronizer, syncs to the target block number, forks world state, and resumes.
   * @param targetBlockNumber - The block number to sync to.
   * @param forkIncludeUncommitted - Whether to include uncommitted data in the fork.
   * @returns The db forked at the requested target block number.
   */
  syncImmediateAndFork(targetBlockNumber: number): Promise<MerkleTreeWriteOperations>;

  /**
   * Forks the current in-memory state based off the current committed state, and returns an instance that cannot modify the underlying data store.
   */
  fork(block?: number): Promise<MerkleTreeWriteOperations>;

  /**
   * Returns an instance of MerkleTreeAdminOperations that will not include uncommitted data.
   */
  getCommitted(): MerkleTreeReadOperations;

  /**
   * Returns a readonly instance of MerkleTreeAdminOperations where the state is as it was at the given block number
   * @param block - The block number to look at
   */
  getSnapshot(block: number): MerkleTreeReadOperations;
}
