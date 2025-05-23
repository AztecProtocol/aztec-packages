import type { PromiseWithResolvers } from '@aztec/foundation/promise';

import { z } from 'zod';

import type { SnapshotDataKeys } from '../snapshots/types.js';
import type { MerkleTreeReadOperations, MerkleTreeWriteOperations } from './merkle_tree_operations.js';

export type { SnapshotDataKeys };

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

  /** Backups the db to the target path. */
  backupTo(dstPath: string, compact?: boolean): Promise<Record<Exclude<SnapshotDataKeys, 'archiver'>, string>>;
}

/** Defines the interface for a world state synchronizer. */
export interface WorldStateSynchronizer extends ForkMerkleTreeOperations {
  /** Starts the synchronizer. */
  start(): Promise<void | PromiseWithResolvers<void>>;

  /** Returns the current status of the synchronizer. */
  status(): Promise<WorldStateSynchronizerStatus>;

  /** Stops the synchronizer and its database. */
  stop(): Promise<void>;

  /** Stops the synchronizer from syncing, but keeps the database online. */
  stopSync(): Promise<void>;

  /** Resumes synching after a stopSync call. */
  resumeSync(): void;

  /**
   * Forces an immediate sync to an optionally provided minimum block number
   * @param targetBlockNumber - The target block number that we must sync to. Will download unproven blocks if needed to reach it.
   * @param skipThrowIfTargetNotReached - Whether to skip throwing if the target block number is not reached.
   * @returns A promise that resolves with the block number the world state was synced to
   */
  syncImmediate(minBlockNumber?: number, skipThrowIfTargetNotReached?: boolean): Promise<number>;

  /** Returns an instance of MerkleTreeAdminOperations that will not include uncommitted data. */
  getCommitted(): MerkleTreeReadOperations;

  /** Deletes the db */
  clear(): Promise<void>;
}

export const WorldStateSyncStatusSchema = z.object({
  finalisedBlockNumber: z.number().int().nonnegative(),
  latestBlockNumber: z.number().int().nonnegative(),
  latestBlockHash: z.string(),
  oldestHistoricBlockNumber: z.number().int().nonnegative(),
  treesAreSynched: z.boolean(),
}) satisfies z.ZodType<WorldStateSyncStatus>;
