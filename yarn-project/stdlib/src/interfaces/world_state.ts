import { z } from 'zod';

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

export interface WorldStateSyncStatus {
  latestBlockNumber: number;
  latestBlockHash: string;
  finalisedBlockNumber: number;
  oldestHistoricBlockNumber: number;
  treesAreSynched: boolean;
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
   * The block numbers that the world state synchronizer is synced to.
   */
  syncSummary: WorldStateSyncStatus;
}

/** Provides writeable forks of the world state at a given block number. */
export interface ForkMerkleTreeOperations {
  /** Forks the world state at the given block number, defaulting to the latest one. */
  fork(block?: number): Promise<MerkleTreeWriteOperations>;

  /** Gets a handle that allows reading the state as it was at the given block number. */
  getSnapshot(blockNumber: number): MerkleTreeReadOperations;
}

/** Defines the interface for a world state synchronizer. */
export interface WorldStateSynchronizer extends ForkMerkleTreeOperations {
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
   * Returns an instance of MerkleTreeAdminOperations that will not include uncommitted data.
   */
  getCommitted(): MerkleTreeReadOperations;
}

export const WorldStateSyncStatusSchema = z.object({
  finalisedBlockNumber: z.number(),
  latestBlockNumber: z.number(),
  latestBlockHash: z.string(),
  oldestHistoricBlockNumber: z.number(),
  treesAreSynched: z.boolean(),
}) satisfies z.ZodType<WorldStateSyncStatus>;
