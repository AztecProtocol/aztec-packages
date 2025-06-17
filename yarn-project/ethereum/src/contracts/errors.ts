export class BlockTagTooOldError extends Error {
  constructor(blockTag: bigint | number, latestBlock: bigint | number) {
    super(`Block tag ${blockTag} is more than 128 blocks behind the latest block ${latestBlock}`);
    this.name = 'BlockTagTooOldError';
  }
}

export class NoCommitteeError extends Error {
  constructor() {
    super('The committee does not exist on L1');
    this.name = 'NoCommitteeError';
  }
}
