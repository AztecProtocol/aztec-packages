import type { Buffer32 } from '@aztec/foundation/buffer';

export type L1BlockId = {
  l1BlockNumber: bigint;
  l1BlockHash: Buffer32;
};

/**
 * Atomic view of the L1 head an in-memory consumer (e.g. the fee snapshot service) can pin reads to.
 * The three fields are always published together after a completed sync pass so that a synchronous read
 * never observes a torn `(blockNumber, blockHash, blockTimestamp)` triple.
 */
export type L1SyncSnapshot = {
  /** L1 block number the archiver has fully synced to. */
  blockNumber: bigint;
  /** Hash of that L1 block, used to label pinned reads and detect reorgs. */
  blockHash: Buffer32;
  /** Timestamp of that L1 block, used for L1-head staleness checks. */
  blockTimestamp: bigint;
};

/** Exposes the last fully-synced L1 identity as a synchronous, in-memory, atomic snapshot. */
export interface L1SyncSnapshotProvider {
  /** Returns the last published L1 sync snapshot, or undefined before the first sync completes. */
  getL1SyncSnapshot(): L1SyncSnapshot | undefined;
}
