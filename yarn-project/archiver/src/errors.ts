import type { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/schemas';

export class NoBlobBodiesFoundError extends Error {
  constructor(l2BlockNum: number) {
    super(`No blob bodies found for block ${l2BlockNum}`);
    this.name = 'NoBlobBodiesFoundError';
  }
}

export class BlockNumberNotSequentialError extends Error {
  constructor(newBlockNumber: number, previous: number | undefined) {
    super(`Cannot insert new block ${newBlockNumber} given previous block number is ${previous ?? 'undefined'}`);
    this.name = 'BlockNumberNotSequentialError';
  }
}

export class InitialCheckpointNumberNotSequentialError extends Error {
  constructor(
    public readonly newCheckpointNumber: number,
    public readonly previousCheckpointNumber: number | undefined,
  ) {
    super(
      `Cannot insert new checkpoint ${newCheckpointNumber} given previous checkpoint number in store is ${
        previousCheckpointNumber ?? 'undefined'
      }`,
    );
    this.name = 'InitialCheckpointNumberNotSequentialError';
  }
}

export class CheckpointNumberNotSequentialError extends Error {
  constructor(
    public readonly newCheckpointNumber: CheckpointNumber,
    public readonly previousCheckpointNumber: CheckpointNumber | undefined,
    source?: 'proposed' | 'confirmed',
  ) {
    const qualifier = source ? `${source} ` : '';
    super(
      `Cannot insert new checkpoint ${newCheckpointNumber} given previous ${qualifier}checkpoint number is ${previousCheckpointNumber ?? 'undefined'}`,
    );
    this.name = 'CheckpointNumberNotSequentialError';
  }
}

/** Thrown when a proposed block carries a checkpoint number that does not follow the latest one. */
export class BlockCheckpointNumberNotSequentialError extends Error {
  constructor(
    blockNumber: BlockNumber,
    blockCheckpointNumber: CheckpointNumber,
    previous: CheckpointNumber | undefined,
  ) {
    super(
      `Cannot insert new block ${blockNumber} for checkpoint ${blockCheckpointNumber} given previous checkpoint number is ${previous ?? 'undefined'}`,
    );
    this.name = 'BlockCheckpointNumberNotSequentialError';
  }
}

export class BlockIndexNotSequentialError extends Error {
  constructor(newBlockIndex: number, previousBlockIndex: number | undefined) {
    super(
      `Cannot insert new block at checkpoint index ${newBlockIndex} given previous block index is ${previousBlockIndex ?? 'undefined'}`,
    );
    this.name = 'BlockIndexNotSequentialError';
  }
}

export class BlockArchiveNotConsistentError extends Error {
  constructor(
    newBlockNumber: number,
    previousBlockNumber: number | undefined,
    newBlockArchive: Fr,
    previousBlockArchive: Fr,
  ) {
    super(
      `Cannot insert new block number ${newBlockNumber} with archive ${newBlockArchive.toString()} previous block number is ${previousBlockNumber ?? 'undefined'}, previous archive is ${previousBlockArchive?.toString() ?? 'undefined'}`,
    );
    this.name = 'BlockArchiveNotConsistentError';
  }
}

export class CheckpointNotFoundError extends Error {
  constructor(checkpointNumber: number) {
    super(`Failed to find expected checkpoint number ${checkpointNumber}`);
    this.name = 'CheckpointNotFoundError';
  }
}

export class BlockNotFoundError extends Error {
  constructor(blockNumber: number) {
    super(`Failed to find expected block number ${blockNumber}`);
    this.name = 'BlockNotFoundError';
  }
}

/** Thrown when a proposed block matches a block that was already checkpointed. This is expected for late proposals. */
export class BlockAlreadyCheckpointedError extends Error {
  constructor(public readonly blockNumber: number) {
    super(`Block ${blockNumber} has already been checkpointed with the same content`);
    this.name = 'BlockAlreadyCheckpointedError';
  }
}

/**
 * Thrown when a query names an Inbox bucket this archiver has not synced. Distinguishes "not synced yet, retry once
 * L1 sync catches up" from a genuinely empty result.
 */
export class InboxBucketNotSyncedError extends Error {
  constructor(public readonly bucketSeq: bigint) {
    super(`Inbox bucket ${bucketSeq} has not been synced`);
    this.name = 'InboxBucketNotSyncedError';
  }
}

/**
 * Thrown when a cumulative Inbox message-count range is not fully backed by the messages this archiver has synced,
 * either because it reaches past the synced tip or because the store is missing an index inside it.
 */
export class InboxMessageRangeNotSyncedError extends Error {
  constructor(
    public readonly startLeafCount: bigint,
    public readonly endLeafCount: bigint,
    public readonly actualCount: bigint,
  ) {
    super(
      `Inbox message range [${startLeafCount}, ${endLeafCount}) is not fully synced ` +
        `(got ${actualCount} of ${endLeafCount - startLeafCount} messages)`,
    );
    this.name = 'InboxMessageRangeNotSyncedError';
  }
}

/** Thrown when a proposed checkpoint number is stale (already processed). */
export class ProposedCheckpointStaleError extends Error {
  constructor(
    public readonly proposedCheckpointNumber: number,
    public readonly currentProposedNumber: number,
  ) {
    super(`Stale proposed checkpoint ${proposedCheckpointNumber}: current proposed is ${currentProposedNumber}`);
    this.name = 'ProposedCheckpointStaleError';
  }
}

/** Thrown when a proposed checkpoint number is not the expected latestTip + 1. */
export class ProposedCheckpointNotSequentialError extends Error {
  constructor(
    public readonly proposedCheckpointNumber: number,
    public readonly latestTipNumber: number,
  ) {
    super(
      `Proposed checkpoint ${proposedCheckpointNumber} is not sequential: expected ${latestTipNumber + 1} (latest tip + 1, where tip is highest of confirmed or pending)`,
    );
    this.name = 'ProposedCheckpointNotSequentialError';
  }
}

/** Thrown when a proposed checkpoint or block L2 slot has already expired on L1. */
export class BlockOrCheckpointSlotExpiredError extends Error {
  constructor(
    public readonly slot: number,
    public readonly nextSlotStart: bigint,
    public readonly l1TimestampSynced: bigint | undefined,
  ) {
    super(
      `Checkpoint or block for slot ${slot} is expired: L1 synced to ${l1TimestampSynced} which is past the next slot start ${nextSlotStart}. ` +
        `If the checkpoint still lands via a late L1 tx, the archiver will pick it up via normal L1-sync (not the pending-queue shortcut).`,
    );
    this.name = 'BlockOrCheckpointSlotExpiredError';
  }
}

/** Thrown when attempting to promote a proposed checkpoint but no proposed checkpoint exists in the store. */
export class NoProposedCheckpointToPromoteError extends Error {
  constructor() {
    super('Cannot promote proposed checkpoint: no proposed checkpoint exists');
    this.name = 'NoProposedCheckpointToPromoteError';
  }
}

/** Thrown when the archive root of the proposed checkpoint does not match the expected one. */
export class ProposedCheckpointArchiveRootMismatchError extends Error {
  constructor(
    public readonly expectedArchiveRoot: Fr,
    public readonly actualArchiveRoot: Fr,
  ) {
    super(
      `Cannot promote proposed checkpoint: archive root mismatch (expected ${expectedArchiveRoot}, got ${actualArchiveRoot})`,
    );
    this.name = 'ProposedCheckpointArchiveRootMismatchError';
  }
}

/** Thrown when the proposed checkpoint does not directly follow the latest confirmed checkpoint. */
export class ProposedCheckpointPromotionNotSequentialError extends Error {
  constructor(
    public readonly proposedCheckpointNumber: number,
    public readonly latestCheckpointNumber: number,
  ) {
    super(
      `Cannot promote proposed checkpoint: not sequential (latest ${latestCheckpointNumber}, proposed ${proposedCheckpointNumber})`,
    );
    this.name = 'ProposedCheckpointPromotionNotSequentialError';
  }
}

/** Thrown when a proposed block conflicts with an already checkpointed block (different content). */
export class CannotOverwriteCheckpointedBlockError extends Error {
  constructor(
    public readonly blockNumber: number,
    public readonly lastCheckpointedBlock: number,
  ) {
    super(
      `Cannot add block ${blockNumber}: would overwrite checkpointed data (checkpointed up to block ${lastCheckpointedBlock})`,
    );
    this.name = 'CannotOverwriteCheckpointedBlockError';
  }
}
