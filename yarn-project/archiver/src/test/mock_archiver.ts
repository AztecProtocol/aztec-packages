import { Fr } from '@aztec/foundation/curves/bn254';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import type { InboxMessagePosition, InboxMessageRange, L1ToL2MessageSource } from '@aztec/stdlib/messaging';

import { MockL1ToL2MessageSource } from './mock_l1_to_l2_message_source.js';
import { MockL2BlockSource } from './mock_l2_block_source.js';

/**
 * A mocked implementation of the archiver that implements L2BlockSource and L1ToL2MessageSource.
 */
export class MockArchiver extends MockL2BlockSource implements L2BlockSource, L1ToL2MessageSource {
  private messageSource = new MockL1ToL2MessageSource(0);

  public setL1ToL2Messages(msgs: Fr[]) {
    this.messageSource.setL1ToL2Messages(msgs);
  }

  public removeL1ToL2MessagesFrom(index: bigint) {
    this.messageSource.removeL1ToL2MessagesFrom(index);
  }

  public appendL1ToL2Messages(msgs: Fr[]) {
    this.messageSource.appendL1ToL2Messages(msgs);
  }

  getL1ToL2MessageIndex(_l1ToL2Message: Fr): Promise<bigint | undefined> {
    return this.messageSource.getL1ToL2MessageIndex(_l1ToL2Message);
  }

  getL1ToL2MessagesBetweenLeafCounts(startLeafCount: bigint, endLeafCount: bigint): Promise<Fr[]> {
    return this.messageSource.getL1ToL2MessagesBetweenLeafCounts(startLeafCount, endLeafCount);
  }

  getMessagePosition(totalMessageCount: bigint): Promise<InboxMessagePosition | undefined> {
    return this.messageSource.getMessagePosition(totalMessageCount);
  }

  getSyncedMessagePosition(): Promise<InboxMessagePosition> {
    return this.messageSource.getSyncedMessagePosition();
  }

  getL1ToL2MessageRange(startLeafCount: bigint, endLeafCount: bigint): Promise<InboxMessageRange> {
    return this.messageSource.getL1ToL2MessageRange(startLeafCount, endLeafCount);
  }
}

/**
 * A mocked implementation of the archiver with a set of precomputed blocks and messages.
 */
export class MockPrefilledArchiver extends MockArchiver {
  private prefilled: Checkpoint[] = [];
  private prefilledMessages: Fr[][] = [];

  constructor(prefilled: { checkpoint: Checkpoint; messages: Fr[] }[]) {
    super();
    this.setPrefilled(prefilled);
  }

  public setPrefilled(prefilled: { checkpoint: Checkpoint; messages: Fr[] }[]) {
    for (const { checkpoint } of prefilled) {
      this.prefilled[checkpoint.number - 1] = checkpoint;
      if (checkpoint.blocks.length !== 1) {
        throw new Error('Prefilled checkpoint must only have 1 block at the moment.');
      }
    }

    for (const { checkpoint, messages } of prefilled) {
      this.prefilledMessages[checkpoint.number - 1] = messages;
    }

    // Index every message-carrying checkpoint's leaves at the compact positions the archiver would give them, which is
    // what published-block replay reads by count. Rebuilt from the full prefilled chain (not just this call's
    // checkpoints) so a reorg re-prefill that replaces a suffix keeps the cumulative counts aligned.
    this.setL1ToL2Messages(this.prefilledMessages.flatMap(messages => messages ?? []));
  }

  public override createBlocks(numBlocks: number) {
    const flattenedBlocks = this.prefilled.flatMap(c => c.blocks);
    if (this.l2Blocks.length + numBlocks > flattenedBlocks.length) {
      throw new Error(
        `Not enough precomputed blocks to create ${numBlocks} more blocks (already at ${this.l2Blocks.length})`,
      );
    }

    const fromBlock = this.l2Blocks.length;
    const checkpointsToAdd = this.prefilled.slice(fromBlock, fromBlock + numBlocks);
    this.addProposedBlocks(checkpointsToAdd.flatMap(c => c.blocks));
    this.checkpointList.push(...checkpointsToAdd);
    return Promise.resolve();
  }
}
