import type { Fr } from '@aztec/foundation/schemas';

export class NoBlobBodiesFoundError extends Error {
  constructor(l2BlockNum: number) {
    super(`No blob bodies found for block ${l2BlockNum}`);
  }
}

export class InitialBlockNumberNotSequentialError extends Error {
  constructor(
    public readonly newBlockNumber: number,
    public readonly previousBlockNumber: number | undefined,
  ) {
    super(
      `Cannot insert new block ${newBlockNumber} given previous block number in store is ${
        previousBlockNumber ?? 'undefined'
      }`,
    );
  }
}

export class BlockNumberNotSequentialError extends Error {
  constructor(newBlockNumber: number, previous: number | undefined) {
    super(
      `Cannot insert new block ${newBlockNumber} given previous block number in batch is ${previous ?? 'undefined'}`,
    );
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

export class CheckpointNumberNotConsistentError extends Error {
  constructor(newCheckpointNumber: number, previous: number | undefined) {
    super(
      `Cannot insert block for new checkpoint ${newCheckpointNumber} given previous block was checkpoint ${previous ?? 'undefined'}`,
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
