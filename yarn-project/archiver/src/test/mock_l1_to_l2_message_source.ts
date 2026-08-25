import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { compactArray } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { CheckpointId, L2BlockId, L2TipId, L2Tips } from '@aztec/stdlib/block';
import type { InboxBucket, InboxMessageBundle, L1ToL2MessageSource } from '@aztec/stdlib/messaging';

/**
 * A mocked implementation of L1ToL2MessageSource to be used in tests.
 */
export class MockL1ToL2MessageSource implements L1ToL2MessageSource {
  private buckets = new Map<bigint, InboxBucket>();
  private messagesPerBucket = new Map<bigint, Fr[]>();

  constructor(private blockNumber: number) {}

  public setInboxBucket(bucket: InboxBucket, msgs: Fr[] = []) {
    this.buckets.set(bucket.seq, bucket);
    this.messagesPerBucket.set(bucket.seq, msgs);
  }

  public setBlockNumber(blockNumber: number) {
    this.blockNumber = blockNumber;
  }

  getL1ToL2MessageIndex(_l1ToL2Message: Fr): Promise<bigint | undefined> {
    throw new Error('Method not implemented.');
  }

  getInboxBucket(seq: bigint): Promise<InboxBucket | undefined> {
    return Promise.resolve(this.buckets.get(seq));
  }

  getInboxBucketByTotalMsgCount(totalMsgCount: bigint): Promise<InboxBucket | undefined> {
    if (totalMsgCount === 0n) {
      return Promise.resolve(this.buckets.get(0n));
    }
    return Promise.resolve([...this.buckets.values()].find(bucket => bucket.totalMsgCount === totalMsgCount));
  }

  getLatestInboxBucketAtOrBefore(timestamp: bigint): Promise<InboxBucket | undefined> {
    const atOrBefore = [...this.buckets.values()]
      .filter(bucket => bucket.timestamp <= timestamp)
      .sort((a, b) => Number(a.seq - b.seq));
    return Promise.resolve(atOrBefore.at(-1));
  }

  getL1ToL2MessagesBetweenBuckets(fromExclusive: bigint, toInclusive: bigint): Promise<InboxMessageBundle> {
    const seqs = [...this.messagesPerBucket.keys()]
      .filter(seq => seq > fromExclusive && seq <= toInclusive)
      .sort((a, b) => Number(a - b));
    return Promise.resolve(compactArray(seqs.map(seq => this.messagesPerBucket.get(seq))).filter(m => m.length > 0));
  }

  async getL1ToL2MessagesBetweenLeafCounts(startLeafCount: bigint, endLeafCount: bigint): Promise<InboxMessageBundle> {
    const startBucket = await this.getInboxBucketByTotalMsgCount(startLeafCount);
    const endBucket = await this.getInboxBucketByTotalMsgCount(endLeafCount);
    if (startBucket === undefined || endBucket === undefined) {
      throw new Error(`No mocked Inbox bucket boundary at ${startLeafCount} or ${endLeafCount}`);
    }
    return this.getL1ToL2MessagesBetweenBuckets(startBucket.seq, endBucket.seq);
  }

  getBlockNumber() {
    return Promise.resolve(BlockNumber(this.blockNumber));
  }

  getL2Tips(): Promise<L2Tips> {
    const number = this.blockNumber;
    const blockId: L2BlockId = { number: BlockNumber(number), hash: new Fr(number).toString() };
    const checkpointId: CheckpointId = {
      number: CheckpointNumber(number),
      hash: new Fr(number + 1).toString(),
    };
    const tip: L2TipId = { block: blockId, checkpoint: checkpointId };
    return Promise.resolve({
      proposed: blockId,
      checkpointed: tip,
      proven: tip,
      finalized: tip,
    });
  }
}
