import { Fr } from '@aztec/foundation/curves/bn254';
import type { InboxBucket, InboxMessageBundle } from '@aztec/stdlib/messaging';
import { InboxBucketRef, accumulateInboxRollingHash } from '@aztec/stdlib/messaging';

import { describe, expect, it } from '@jest/globals';

import {
  type StreamingBlockCheckInput,
  type StreamingInboxBucketSource,
  checkStreamingBlockProposal,
} from './streaming_inbox_checks.js';

const MIN_BUCKET_AGE_SECONDS = 12;
const PER_BLOCK_CAP = 1024;
const PER_CHECKPOINT_CAP = 1024;
const NOW = 10_000n;

/**
 * In-memory Inbox-bucket view mirroring the archiver store's index semantics: buckets keyed by sequence number, a flat
 * leaves array indexed by global message index, and `getL1ToL2MessagesBetweenBuckets` slicing that array by the
 * `(from, to]` bucket range (start = fromBucket.lastMessageIndex + 1, genesis when from == 0).
 */
class FakeInboxView implements StreamingInboxBucketSource {
  private readonly buckets = new Map<bigint, InboxBucket>();
  private readonly leaves: Fr[] = [];

  constructor() {
    // Genesis sentinel bucket 0 {total 0}, as the archiver store holds it (the "consumed nothing" base case).
    this.buckets.set(0n, {
      seq: 0n,
      inboxRollingHash: Fr.ZERO,
      totalMsgCount: 0n,
      timestamp: 0n,
      msgCount: 0,
      lastMessageIndex: 0n,
    });
  }

  /** Appends a bucket of `msgCount` leaves opened at `timestamp`, with a rolling hash derived from `seq`. */
  addBucket(seq: number, msgCount: number, timestamp: number, rollingHash?: Fr): InboxBucket {
    const priorTotal = this.leaves.length;
    for (let i = 0; i < msgCount; i++) {
      this.leaves.push(new Fr(1000 + priorTotal + i));
    }
    const totalMsgCount = BigInt(this.leaves.length);
    const bucket: InboxBucket = {
      seq: BigInt(seq),
      inboxRollingHash: rollingHash ?? new Fr(500 + seq),
      totalMsgCount,
      timestamp: BigInt(timestamp),
      msgCount,
      lastMessageIndex: totalMsgCount - 1n,
    };
    this.buckets.set(BigInt(seq), bucket);
    return bucket;
  }

  getInboxBucket(seq: bigint): Promise<InboxBucket | undefined> {
    return Promise.resolve(this.buckets.get(seq));
  }

  getInboxBucketByTotalMsgCount(totalMsgCount: bigint): Promise<InboxBucket | undefined> {
    if (totalMsgCount === 0n) {
      return Promise.resolve(this.buckets.get(0n));
    }
    return Promise.resolve([...this.buckets.values()].find(b => b.totalMsgCount === totalMsgCount));
  }

  getL1ToL2MessagesBetweenBuckets(fromExclusive: bigint, toInclusive: bigint): Promise<InboxMessageBundle> {
    const toBucket = this.buckets.get(toInclusive);
    if (toBucket === undefined) {
      return Promise.resolve([]);
    }
    if (fromExclusive > 0n && this.buckets.get(fromExclusive) === undefined) {
      return Promise.resolve([]);
    }
    // One group per bucket in the range, mirroring the archiver's per-bucket grouping.
    const inRange = [...this.buckets.values()]
      .filter(b => b.seq > fromExclusive && b.seq <= toInclusive && b.msgCount > 0)
      .sort((a, b) => Number(a.seq - b.seq));
    return Promise.resolve(
      inRange.map(b => ({
        timestamp: b.timestamp,
        leaves: this.leaves.slice(Number(b.lastMessageIndex + 1n) - b.msgCount, Number(b.lastMessageIndex + 1n)),
      })),
    );
  }
}

function refFor(bucket: InboxBucket, rollingHash = bucket.inboxRollingHash): InboxBucketRef {
  return new InboxBucketRef(bucket.seq, bucket.timestamp, rollingHash);
}

function baseInput(overrides: Partial<StreamingBlockCheckInput>): StreamingBlockCheckInput {
  return {
    messageSource: new FakeInboxView(),
    bucketRef: undefined,
    parentTotalMsgCount: 0n,
    checkpointStartTotalMsgCount: 0n,
    nowSeconds: NOW,
    minBucketAgeSeconds: MIN_BUCKET_AGE_SECONDS,
    perBlockCap: PER_BLOCK_CAP,
    perCheckpointCap: PER_CHECKPOINT_CAP,
    ...overrides,
  };
}

describe('checkStreamingBlockProposal', () => {
  describe('check 1: bucket exists and hash matches', () => {
    it('rejects a proposal with no bucket reference', async () => {
      const result = await checkStreamingBlockProposal(baseInput({ bucketRef: undefined }));
      expect(result).toEqual({ accepted: false, reason: 'bucket_unknown' });
    });

    it('rejects promptly when the referenced bucket is unknown (no waiting)', async () => {
      const view = new FakeInboxView();
      const start = Date.now();
      const result = await checkStreamingBlockProposal(
        baseInput({ messageSource: view, bucketRef: new InboxBucketRef(7n, 100n, new Fr(1)) }),
      );
      expect(result).toEqual({ accepted: false, reason: 'bucket_unknown' });
      // The happy path rejects immediately; there is no bounded wait yet. Assert it did not sleep.
      expect(Date.now() - start).toBeLessThan(500);
    });

    it('rejects when the resolved bucket hash differs from the reference', async () => {
      const view = new FakeInboxView();
      const bucket = view.addBucket(1, 3, 100);
      const result = await checkStreamingBlockProposal(
        baseInput({ messageSource: view, bucketRef: refFor(bucket, new Fr(999)) }),
      );
      expect(result).toEqual({ accepted: false, reason: 'bucket_hash_mismatch' });
    });

    it('rejects a proposal built on a stale bucket timestamp', async () => {
      // The rolling hash absorbs the bucket's L1 timestamp, so a proposer whose view of the bucket is stale after an
      // L1 reorg that only re-timed the block computes a different hash over the very same leaves. That disagreement
      // is what makes a stale-timestamp proposal rejectable rather than silently accepted.
      const view = new FakeInboxView();
      const leaves = [new Fr(1000), new Fr(1001)];
      const bucket = view.addBucket(1, 2, 100, accumulateInboxRollingHash(Fr.ZERO, [{ timestamp: 100n, leaves }]));

      const staleHash = accumulateInboxRollingHash(Fr.ZERO, [{ timestamp: 95n, leaves }]);
      expect(staleHash).not.toEqual(bucket.inboxRollingHash);

      const result = await checkStreamingBlockProposal(
        baseInput({ messageSource: view, bucketRef: new InboxBucketRef(bucket.seq, 95n, staleHash) }),
      );
      expect(result).toEqual({ accepted: false, reason: 'bucket_hash_mismatch' });
    });

    it('accepts a proposal whose bucket timestamp matches the local snapshot', async () => {
      const view = new FakeInboxView();
      const leaves = [new Fr(1000), new Fr(1001)];
      const bucket = view.addBucket(1, 2, 100, accumulateInboxRollingHash(Fr.ZERO, [{ timestamp: 100n, leaves }]));

      const result = await checkStreamingBlockProposal(baseInput({ messageSource: view, bucketRef: refFor(bucket) }));
      expect(result).toEqual({ accepted: true, bundle: [{ timestamp: 100n, leaves }] });
    });
  });

  describe('check 2: consumption moves forward', () => {
    it('rejects when the bucket total is behind the parent block', async () => {
      const view = new FakeInboxView();
      const bucket = view.addBucket(1, 3, 100); // total 3
      const result = await checkStreamingBlockProposal(
        baseInput({ messageSource: view, bucketRef: refFor(bucket), parentTotalMsgCount: 5n }),
      );
      expect(result).toEqual({ accepted: false, reason: 'bucket_moves_backwards' });
    });

    it('accepts an empty-consumption block that reuses the parent bucket (empty bundle)', async () => {
      const view = new FakeInboxView();
      const bucket = view.addBucket(1, 3, 100); // total 3
      const result = await checkStreamingBlockProposal(
        baseInput({ messageSource: view, bucketRef: refFor(bucket), parentTotalMsgCount: 3n }),
      );
      expect(result).toEqual({ accepted: true, bundle: [] });
    });
  });

  describe('check 3: bucket is at least one Ethereum slot old', () => {
    it('accepts a bucket exactly at the minimum age (inclusive boundary)', async () => {
      const view = new FakeInboxView();
      const bucket = view.addBucket(1, 2, Number(NOW) - MIN_BUCKET_AGE_SECONDS); // timestamp == now - minBucketAgeSeconds
      const result = await checkStreamingBlockProposal(baseInput({ messageSource: view, bucketRef: refFor(bucket) }));
      expect(result.accepted).toBe(true);
    });

    it('rejects a bucket one second too new', async () => {
      const view = new FakeInboxView();
      const bucket = view.addBucket(1, 2, Number(NOW) - MIN_BUCKET_AGE_SECONDS + 1);
      const result = await checkStreamingBlockProposal(baseInput({ messageSource: view, bucketRef: refFor(bucket) }));
      expect(result).toEqual({ accepted: false, reason: 'bucket_too_new' });
    });

    it('accepts a bucket one second too new when the tolerated clock disparity covers it', async () => {
      const view = new FakeInboxView();
      const bucket = view.addBucket(1, 2, Number(NOW) - MIN_BUCKET_AGE_SECONDS + 1);
      const result = await checkStreamingBlockProposal(
        baseInput({ messageSource: view, bucketRef: refFor(bucket), clockDisparityMs: 500 }),
      );
      expect(result.accepted).toBe(true);
    });

    it('rejects a bucket two seconds too new for a sub-second tolerance', async () => {
      const view = new FakeInboxView();
      const bucket = view.addBucket(1, 2, Number(NOW) - MIN_BUCKET_AGE_SECONDS + 2);
      const result = await checkStreamingBlockProposal(
        baseInput({ messageSource: view, bucketRef: refFor(bucket), clockDisparityMs: 500 }),
      );
      expect(result).toEqual({ accepted: false, reason: 'bucket_too_new' });
    });

    it('rounds a non-multiple tolerance up to whole seconds', async () => {
      const view = new FakeInboxView();
      const accepted = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: refFor(view.addBucket(1, 2, Number(NOW) - MIN_BUCKET_AGE_SECONDS + 2)),
          clockDisparityMs: 1500,
        }),
      );
      expect(accepted.accepted).toBe(true);

      const rejectedView = new FakeInboxView();
      const rejected = await checkStreamingBlockProposal(
        baseInput({
          messageSource: rejectedView,
          bucketRef: refFor(rejectedView.addBucket(1, 2, Number(NOW) - MIN_BUCKET_AGE_SECONDS + 3)),
          clockDisparityMs: 1500,
        }),
      );
      expect(rejected).toEqual({ accepted: false, reason: 'bucket_too_new' });
    });

    it('rejects a bucket opened right now regardless of the tolerance', async () => {
      const view = new FakeInboxView();
      const bucket = view.addBucket(1, 2, Number(NOW));
      const result = await checkStreamingBlockProposal(
        baseInput({ messageSource: view, bucketRef: refFor(bucket), clockDisparityMs: 500 }),
      );
      expect(result).toEqual({ accepted: false, reason: 'bucket_too_new' });
    });

    it('applies no tolerance when the clock disparity is zero', async () => {
      const view = new FakeInboxView();
      const bucket = view.addBucket(1, 2, Number(NOW) - MIN_BUCKET_AGE_SECONDS + 1);
      const result = await checkStreamingBlockProposal(
        baseInput({ messageSource: view, bucketRef: refFor(bucket), clockDisparityMs: 0 }),
      );
      expect(result).toEqual({ accepted: false, reason: 'bucket_too_new' });
    });
  });

  describe('check 4: caps', () => {
    it('accepts a block consuming exactly the per-block cap', async () => {
      const view = new FakeInboxView();
      const bucket = view.addBucket(1, PER_BLOCK_CAP, 100);
      const result = await checkStreamingBlockProposal(
        baseInput({ messageSource: view, bucketRef: refFor(bucket), perBlockCap: PER_BLOCK_CAP }),
      );
      expect(result.accepted).toBe(true);
    });

    it('rejects a block consuming one over the per-block cap', async () => {
      const view = new FakeInboxView();
      const bucket = view.addBucket(1, 4, 100);
      const result = await checkStreamingBlockProposal(
        baseInput({ messageSource: view, bucketRef: refFor(bucket), perBlockCap: 3 }),
      );
      expect(result).toEqual({ accepted: false, reason: 'bundle_over_block_cap' });
    });

    it('rejects when the running checkpoint total exceeds the per-checkpoint cap', async () => {
      const view = new FakeInboxView();
      view.addBucket(1, 3, 100); // total 3, the checkpoint's earlier consumption
      const bucket = view.addBucket(2, 3, 100); // total 6
      const result = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: refFor(bucket),
          parentTotalMsgCount: 3n,
          checkpointStartTotalMsgCount: 0n,
          perCheckpointCap: 5, // 6 - 0 = 6 > 5
        }),
      );
      expect(result).toEqual({ accepted: false, reason: 'checkpoint_over_msg_cap' });
    });
  });

  describe('bundle derivation', () => {
    it('derives the bundle for a genesis-parent first block', async () => {
      const view = new FakeInboxView();
      const bucket = view.addBucket(1, 3, 100); // leaves at global indices 0..2
      const result = await checkStreamingBlockProposal(
        baseInput({ messageSource: view, bucketRef: refFor(bucket), parentTotalMsgCount: 0n }),
      );
      expect(result).toEqual({
        accepted: true,
        bundle: [{ timestamp: 100n, leaves: [new Fr(1000), new Fr(1001), new Fr(1002)] }],
      });
    });

    it('derives the bundle spanning multiple buckets since the parent', async () => {
      const view = new FakeInboxView();
      view.addBucket(1, 2, 100); // parent consumed through here, total 2
      view.addBucket(2, 2, 100); // total 4
      const proposed = view.addBucket(3, 1, 100); // total 5
      const result = await checkStreamingBlockProposal(
        baseInput({ messageSource: view, bucketRef: refFor(proposed), parentTotalMsgCount: 2n }),
      );
      // Bundle = leaves at global indices 2,3,4 (buckets 2 and 3), derived after resolving the parent bucket (seq 1),
      // grouped per bucket.
      expect(result).toEqual({
        accepted: true,
        bundle: [
          { timestamp: 100n, leaves: [new Fr(1002), new Fr(1003)] },
          { timestamp: 100n, leaves: [new Fr(1004)] },
        ],
      });
    });

    it('rejects when the parent leaf count does not sit on a bucket boundary (padded legacy parent)', async () => {
      const view = new FakeInboxView();
      view.addBucket(1, 2, 100); // total 2
      const proposed = view.addBucket(2, 2, 100); // total 4
      // Parent leaf count 3 is between bucket boundaries (2 and 4): unresolvable.
      const result = await checkStreamingBlockProposal(
        baseInput({ messageSource: view, bucketRef: refFor(proposed), parentTotalMsgCount: 3n }),
      );
      expect(result).toEqual({ accepted: false, reason: 'parent_bucket_unresolved' });
    });
  });

  describe('running-total accumulation across a checkpoint', () => {
    it('accumulates the per-checkpoint total across three blocks against a fixed start', async () => {
      // Checkpoint starts after bucket 1 (total 2). Three blocks each consume 2 messages: totals 4, 6, 8.
      const view = new FakeInboxView();
      view.addBucket(1, 2, 100); // checkpoint start total 2
      const b2 = view.addBucket(2, 2, 100); // total 4
      const b3 = view.addBucket(3, 2, 100); // total 6
      const b4 = view.addBucket(4, 2, 100); // total 8
      const checkpointStart = 2n;

      // Block 1 (parent = bucket 1): checkpoint delta 4 - 2 = 2.
      const r1 = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: refFor(b2),
          parentTotalMsgCount: 2n,
          checkpointStartTotalMsgCount: checkpointStart,
          perCheckpointCap: 6,
        }),
      );
      expect(r1.accepted).toBe(true);

      // Block 3 (parent = bucket 3): checkpoint delta 8 - 2 = 6, exactly at the cap.
      const r3 = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: refFor(b4),
          parentTotalMsgCount: 6n,
          checkpointStartTotalMsgCount: checkpointStart,
          perCheckpointCap: 6,
        }),
      );
      expect(r3.accepted).toBe(true);

      // Same block against a tighter cap of 5: the accumulated delta 6 now exceeds it.
      const r3Tight = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: refFor(b4),
          parentTotalMsgCount: 6n,
          checkpointStartTotalMsgCount: checkpointStart,
          perCheckpointCap: 5,
        }),
      );
      expect(r3Tight).toEqual({ accepted: false, reason: 'checkpoint_over_msg_cap' });
      void b3;
    });
  });
});
