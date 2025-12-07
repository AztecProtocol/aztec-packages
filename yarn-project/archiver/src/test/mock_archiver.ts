import type { CheckpointNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { L2Block, type L2BlockSource } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';

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

  getL1ToL2Messages(blockNumber: number): Promise<Fr[]> {
    return this.messageSource.getL1ToL2Messages(blockNumber);
  }

  getL1ToL2MessageIndex(_l1ToL2Message: Fr): Promise<bigint | undefined> {
    return this.messageSource.getL1ToL2MessageIndex(_l1ToL2Message);
  }

  getL1ToL2MessagesForCheckpoint(checkpointNumber: CheckpointNumber): Promise<Fr[]> {
    // TODO: Implement this properly. This only works when we have one block per checkpoint.
    return this.messageSource.getL1ToL2Messages(checkpointNumber);
  }
}

/**
 * A mocked implementation of the archiver with a set of precomputed blocks and messages.
 */
export class MockPrefilledArchiver extends MockArchiver {
  private prefilled: Checkpoint[] = [];

  constructor(prefilled: { checkpoint: Checkpoint; messages: Fr[] }[]) {
    super();
    this.setPrefilled(prefilled);
  }

  public setPrefilled(prefilled: { checkpoint: Checkpoint; messages: Fr[] }[]) {
    for (const { checkpoint, messages } of prefilled) {
      this.prefilled[checkpoint.number - 1] = checkpoint;
      if (checkpoint.blocks.length !== 1) {
        throw new Error('Prefilled checkpoint must only have 1 block at the moment.');
      }
      this.setL1ToL2Messages(checkpoint.blocks[0].number, messages);
    }
  }

  public override createBlocks(numBlocks: number) {
    const flattenedBlocks = this.prefilled.flatMap(c => c.blocks);
    if (this.l2Blocks.length + numBlocks > flattenedBlocks.length) {
      throw new Error(
        `Not enough precomputed blocks to create ${numBlocks} more blocks (already at ${this.l2Blocks.length})`,
      );
    }

    const fromBlock = this.l2Blocks.length;
    // TODO: Add L2 blocks and checkpoints separately once archiver has the apis for that.
    this.addBlocks(this.prefilled.slice(fromBlock, fromBlock + numBlocks).map(c => L2Block.fromCheckpoint(c)));
    return Promise.resolve();
  }
}
