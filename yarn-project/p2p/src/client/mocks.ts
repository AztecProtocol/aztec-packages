import { L2Block, L2BlockSource } from '@aztec/types';

/**
 * A mocked implementation of L2BlockSource to be used in p2p tests.
 */
export class MockBlockSource implements L2BlockSource {
  private l2Blocks: L2Block[];

  constructor(private numBlocks = 100) {
    this.l2Blocks = [];
    for (let i = 0; i < this.numBlocks; i++) {
      this.l2Blocks.push(L2Block.random(i));
    }
  }

  /**
   * Gets the number of the latest L2 block processed by the block source implementation.
   * @returns In this mock instance, returns the number of L2 blocks that we've mocked.
   */
  public getBlockHeight() {
    return Promise.resolve(this.l2Blocks.length - 1);
  }

  /**
   * Gets the `take` amount of L2 blocks starting from `from`.
   * @param from - Number of the first block to return (inclusive).
   * @param take - The number of blocks to return.
   * @returns The requested mocked L2 blocks.
   */
  public getL2Blocks(from: number, take: number) {
    return Promise.resolve(this.l2Blocks.slice(from, from + take));
  }

  /**
   * Starts the block source. In this mock implementation, this is a noop.
   * @returns A promise that signals the initialization of the l2 block source on compmletion.
   */
  public start(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Stops the block source. In this mock implementation, this is a noop.
   * @returns A promise that signals the l2 block source is now stopped.
   */
  public stop(): Promise<void> {
    return Promise.resolve();
  }
}
