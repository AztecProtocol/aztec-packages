import { type L1ToL2MessageSource, type L2Block, type L2BlockSource } from '@aztec/circuit-types';
import { type Fr } from '@aztec/circuits.js';

import { MockL1ToL2MessageSource } from './mock_l1_to_l2_message_source.js';
import { MockL2BlockSource } from './mock_l2_block_source.js';

/**
 * A mocked implementation of the archiver that implements L2BlockSource and L1ToL2MessageSource.
 */
export class MockArchiver extends MockL2BlockSource implements L2BlockSource, L1ToL2MessageSource {
  private messageSource = new MockL1ToL2MessageSource(0);

  public setL1ToL2Messages(blockNumber: number, msgs: Fr[]) {
    this.messageSource.setL1ToL2Messages(blockNumber, msgs);
  }

  getL1ToL2Messages(blockNumber: bigint): Promise<Fr[]> {
    return this.messageSource.getL1ToL2Messages(blockNumber);
  }

  getL1ToL2MessageIndex(_l1ToL2Message: Fr): Promise<bigint | undefined> {
    return this.messageSource.getL1ToL2MessageIndex(_l1ToL2Message);
  }
}

/**
 * A mocked implementation of the archiver with a set of precomputed blocks and messages.
 */
export class MockPrefilledArchiver extends MockArchiver {
  private precomputed: L2Block[];

  constructor(precomputed: L2Block[], messages: Fr[][]) {
    super();
    this.precomputed = precomputed.slice();
    messages.forEach((msgs, i) => this.setL1ToL2Messages(i + 1, msgs));
  }

  public setPrefilledBlocks(blocks: L2Block[], messages: Fr[][]) {
    for (const block of blocks) {
      this.precomputed[block.number - 1] = block;
    }
    messages.forEach((msgs, i) => this.setL1ToL2Messages(blocks[i].number, msgs));
  }

  public override createBlocks(numBlocks: number) {
    if (this.l2Blocks.length + numBlocks > this.precomputed.length) {
      throw new Error(
        `Not enough precomputed blocks to create ${numBlocks} more blocks (already at ${this.l2Blocks.length})`,
      );
    }

    const fromBlock = this.l2Blocks.length;
    this.addBlocks(this.precomputed.slice(fromBlock, fromBlock + numBlocks));
  }
}
