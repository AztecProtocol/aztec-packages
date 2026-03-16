import type { Fr } from '@aztec/foundation/schemas';

export class NoBlobBodiesFoundError extends Error {
  constructor(l2BlockNum: number) {
    super(`No blob bodies found for block ${l2BlockNum}`);
  }
}

export class BlockNumberNotSequentialError extends Error {
  constructor(newBlockNumber: number, previous: number | undefined) {
    super(`Cannot insert new block ${newBlockNumber} given previous block number is ${previous ?? 'undefined'}`);
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
  }
}

export class CheckpointNumberNotSequentialError extends Error {
  constructor(newCheckpointNumber: number, previous: number | undefined) {
    super(
      `Cannot insert new checkpoint ${newCheckpointNumber} given previous checkpoint number in batch is ${previous ?? 'undefined'}`,
    );
  }
}

export class BlockIndexNotSequentialError extends Error {
  constructor(newBlockIndex: number, previousBlockIndex: number | undefined) {
    super(
      `Cannot insert new block at checkpoint index ${newBlockIndex} given previous block index is ${previousBlockIndex ?? 'undefined'}`,
    );
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
  }
}

export class CheckpointNotFoundError extends Error {
  constructor(checkpointNumber: number) {
    super(`Failed to find expected checkpoint number ${checkpointNumber}`);
  }
}

export class BlockNotFoundError extends Error {
  constructor(blockNumber: number) {
    super(`Failed to find expected block number ${blockNumber}`);
  }
}

/** Thrown when a proposed block matches a block that was already checkpointed. This is expected for late proposals. */
export class BlockAlreadyCheckpointedError extends Error {
  constructor(public readonly blockNumber: number) {
    super(`Block ${blockNumber} has already been checkpointed with the same content`);
    this.name = 'BlockAlreadyCheckpointedError';
  }
}

/** Thrown when logs are added for a tag whose last stored log has a higher block number than the new log. */
export class OutOfOrderLogInsertionError extends Error {
  constructor(
    public readonly logType: 'private' | 'public',
    public readonly tag: string,
    public readonly lastBlockNumber: number,
    public readonly newBlockNumber: number,
  ) {
    super(
      `Out-of-order ${logType} log insertion for tag ${tag}: ` +
        `last existing log is from block ${lastBlockNumber} but new log is from block ${newBlockNumber}`,
    );
    this.name = 'OutOfOrderLogInsertionError';
  }
}

/** Thrown when L1 to L2 messages are requested for a checkpoint whose message tree hasn't been sealed yet. */
export class L1ToL2MessagesNotReadyError extends Error {
  constructor(
    public readonly checkpointNumber: number,
    public readonly inboxTreeInProgress: bigint,
  ) {
    super(
      `Cannot get L1 to L2 messages for checkpoint ${checkpointNumber}: ` +
        `inbox tree in progress is ${inboxTreeInProgress}, messages not yet sealed`,
    );
    this.name = 'L1ToL2MessagesNotReadyError';
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
