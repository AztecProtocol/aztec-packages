import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { CheckpointId, L2BlockId, L2TipId, L2Tips } from '@aztec/stdlib/block';
import type { InboxBucket, L1ToL2MessageSource } from '@aztec/stdlib/messaging';

/**
 * A mocked implementation of L1ToL2MessageSource to be used in tests.
 */
export class MockL1ToL2MessageSource implements L1ToL2MessageSource {
  private buckets = new Map<bigint, InboxBucket>();
  private messagesPerBucket = new Map<bigint, Fr[]>();
  /**
   * The canonical message log, keyed by compact global index. Kept apart from the bucket partition so a test can
   * repartition the buckets (as an L1 reorg does) while the indexed leaves stay exactly as they were.
   */
  private leavesByIndex = new Map<bigint, Fr>();

  constructor(private blockNumber: number) {}

  public setInboxBucket(bucket: InboxBucket, msgs: Fr[] = []) {
    this.buckets.set(bucket.seq, bucket);
    this.messagesPerBucket.set(bucket.seq, msgs);
    // Index from the bucket's own cumulative total rather than call order, so re-registering a bucket or setting them
    // out of order keeps every leaf at the index the archiver would give it.
    const firstIndex = bucket.totalMsgCount - BigInt(msgs.length);
    msgs.forEach((msg, i) => this.leavesByIndex.set(firstIndex + BigInt(i), msg));
  }

  /**
   * Replaces the current bucket partition without touching the indexed leaf log, modelling an L1 reorg that re-mines
   * the same messages under different bucket boundaries.
   */
  public replaceInboxBuckets(buckets: { bucket: InboxBucket; msgs: Fr[] }[]) {
    this.buckets = new Map();
    this.messagesPerBucket = new Map();
    for (const { bucket, msgs } of buckets) {
      this.buckets.set(bucket.seq, bucket);
      this.messagesPerBucket.set(bucket.seq, msgs);
    }
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

  getInboxBucketByRollingHash(inboxRollingHash: Fr): Promise<InboxBucket | undefined> {
    if (inboxRollingHash.isZero()) {
      return Promise.resolve(this.buckets.get(0n));
    }
    return Promise.resolve([...this.buckets.values()].find(bucket => bucket.inboxRollingHash.equals(inboxRollingHash)));
  }

  getLatestInboxBucketAtOrBefore(timestamp: bigint): Promise<InboxBucket | undefined> {
    const atOrBefore = [...this.buckets.values()]
      .filter(bucket => bucket.timestamp <= timestamp)
      .sort((a, b) => Number(a.seq - b.seq));
    return Promise.resolve(atOrBefore.at(-1));
  }

  getL1ToL2MessagesBetweenBuckets(fromExclusive: bigint, toInclusive: bigint): Promise<Fr[]> {
    const seqs = [...this.messagesPerBucket.keys()]
      .filter(seq => seq > fromExclusive && seq <= toInclusive)
      .sort((a, b) => Number(a - b));
    return Promise.resolve(seqs.flatMap(seq => this.messagesPerBucket.get(seq) ?? []));
  }

  /**
   * Slices the indexed leaf log, enforcing the same range contract as the archiver's message store. Every failure is
   * a rejection rather than a synchronous throw, so callers see this stand-in behave like the async source it mocks.
   */
  getL1ToL2MessagesBetweenLeafCounts(startLeafCount: bigint, endLeafCount: bigint): Promise<Fr[]> {
    if (startLeafCount < 0n || endLeafCount < 0n || startLeafCount > endLeafCount) {
      return Promise.reject(new Error(`Invalid Inbox leaf count range [${startLeafCount}, ${endLeafCount})`));
    }
    const leaves: Fr[] = [];
    for (let index = startLeafCount; index < endLeafCount; index++) {
      const leaf = this.leavesByIndex.get(index);
      if (leaf === undefined) {
        return Promise.reject(
          new Error(
            `Inbox message range [${startLeafCount}, ${endLeafCount}) is not fully mocked (missing index ${index})`,
          ),
        );
      }
      leaves.push(leaf);
    }
    return Promise.resolve(leaves);
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
