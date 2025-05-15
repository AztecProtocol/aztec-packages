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
