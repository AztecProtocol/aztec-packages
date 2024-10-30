import { type L2BlockId } from '../l2_block_source.js';
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
export interface WorldStateSynchronizerStatus {
  /**
   * The current state of the world state synchronizer.
   */
  state: WorldStateRunningState;
  /**
   * The block number that the world state synchronizer is synced to.
   */
  syncedToL2Block: L2BlockId;
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
  status(): Promise<WorldStateSynchronizerStatus>;

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
