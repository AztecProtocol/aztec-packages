export class BlockTagTooOldError extends Error {
  constructor(blockTag: bigint | number, latestBlock: bigint | number) {
    super(`Block tag ${blockTag} is more than 128 blocks behind the latest block ${latestBlock}`);
    this.name = 'BlockTagTooOldError';
  }
}
