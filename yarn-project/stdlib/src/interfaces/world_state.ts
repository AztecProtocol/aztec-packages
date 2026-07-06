import { BlockNumber, BlockNumberSchema } from '@aztec/foundation/branded-types';
import type { PromiseWithResolvers } from '@aztec/foundation/promise';

import { z } from 'zod';

import type { BlockHash } from '../block/block_hash.js';
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
  latestBlockNumber: BlockNumber;
  latestBlockHash: string;
  finalizedBlockNumber: BlockNumber;
  oldestHistoricBlockNumber: BlockNumber;
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
  /**
   * Forks the world state at the given block number, defaulting to the latest one.
   * @param block - The block number to fork at.
   * @param opts - Optional parameters:
   *  - closeDelayMs: number of milliseconds to wait before closing the fork on dispose.
   */
  fork(block?: BlockNumber, opts?: { closeDelayMs?: number }): Promise<MerkleTreeWriteOperations>;

  /** Backups the db to the target path. */
  backupTo(dstPath: string, compact?: boolean): Promise<Record<Exclude<SnapshotDataKeys, 'archiver'>, string>>;
}

export interface ReadonlyWorldStateAccess {
  /** Returns an instance of MerkleTreeAdminOperations that will not include uncommitted data. */
  getCommitted(): MerkleTreeReadOperations;

  /** Gets a handle that allows reading the state as it was at the given block number. */
  getSnapshot(blockNumber: number): MerkleTreeReadOperations;
}

/** Defines the interface for a world state synchronizer. */
export interface WorldStateSynchronizer extends ReadonlyWorldStateAccess, ForkMerkleTreeOperations {
  /**
   * Returns a read handle to the world state at `blockNumber`, but only after verifying that the block at that
   * height is on the fork identified by `blockHash`. This pins the returned view to a specific fork so a reorg
   * that replaced the block at `blockNumber` cannot be served silently, closing the gap between resolving a query
   * and reading its snapshot.
   *
   * Rejects if the block at `blockNumber` does not match `blockHash` (a reorg), or if the block's hash cannot be
   * read from the requested view. Both are transient from a caller's perspective: re-resolving the query against
   * the current chain and retrying may succeed or produce a more precise error. However, if the block's history
   * has been pruned away (it predates the oldest historical block kept by world state), the rejection is terminal:
   * retrying cannot bring the data back.
   */
  getVerifiedSnapshot(blockNumber: BlockNumber, blockHash: BlockHash): Promise<MerkleTreeReadOperations>;

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
   * Forces an immediate sync to an optionally provided minimum block number.
   * @param targetBlockNumber - The target block number that we must sync to. Will download unproven blocks if needed to reach it.
   * @param blockHash - If provided, verifies the block at targetBlockNumber matches this hash. On mismatch, triggers a resync (reorg detection).
   * @returns A promise that resolves with the block number the world state was synced to
   */
  syncImmediate(minBlockNumber?: BlockNumber, blockHash?: BlockHash): Promise<BlockNumber>;

  /** Deletes the db */
  clear(): Promise<void>;
}

export const WorldStateSyncStatusSchema: z.ZodType<WorldStateSyncStatus, any> = z.object({
  finalizedBlockNumber: BlockNumberSchema,
  latestBlockNumber: BlockNumberSchema,
  latestBlockHash: z.string(),
  oldestHistoricBlockNumber: BlockNumberSchema,
  treesAreSynched: z.boolean(),
});
