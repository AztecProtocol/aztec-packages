import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type InboxBucket, MIN_BLOCKS_FOR_INBOX_CATCHUP, isInboxConsumptionSufficient } from '@aztec/stdlib/messaging';

import { BlockNotFoundError } from 'viem';

import {
  InboxBucketConfirmationTracker,
  type InboxBucketEligibility,
  type L1BlockReader,
  immediateEligibility,
} from './inbox_bucket_eligibility.js';
import { type InboxBucketSource, selectInboxBucketForBlock } from './inbox_bucket_selector.js';

/** A test bucket: its cumulative totals and leaves are derived from a running message count. */
type TestBucketSpec = { seq: bigint; timestamp: bigint; msgCount: number };

/**
 * Builds an in-memory {@link InboxBucketSource} from a list of bucket specs, mirroring the archiver's dense,
 * timestamp-ordered buckets. Bucket seq 0 is the genesis sentinel (never a real bucket); real buckets start at 1.
 */
function makeSource(specs: TestBucketSpec[]): {
  source: InboxBucketSource;
  buckets: Map<bigint, InboxBucket>;
  leaves: Fr[];
} {
  const leaves: Fr[] = [];
  const buckets = new Map<bigint, InboxBucket>();
  let total = 0n;
  for (const spec of specs) {
    for (let i = 0; i < spec.msgCount; i++) {
      leaves.push(new Fr(spec.seq * 1000n + BigInt(i)));
    }
    total += BigInt(spec.msgCount);
    buckets.set(spec.seq, {
      seq: spec.seq,
      inboxRollingHash: new Fr(spec.seq),
      totalMsgCount: total,
      timestamp: spec.timestamp,
      msgCount: spec.msgCount,
      lastMessageIndex: total - 1n,
      l1BlockNumber: spec.seq,
      l1BlockHash: Buffer32.fromBigInt(spec.seq),
    });
  }

  const ordered = [...buckets.values()].sort((a, b) => Number(a.seq - b.seq));
  const source: InboxBucketSource = {
    getInboxBucket: (seq: bigint) => Promise.resolve(buckets.get(seq)),
    getLatestInboxBucketAtOrBefore: (timestamp: bigint) => {
      const eligible = ordered.filter(b => b.timestamp <= timestamp);
      return Promise.resolve(eligible.length === 0 ? undefined : eligible[eligible.length - 1]);
    },
    getL1ToL2MessagesBetweenBuckets: (fromExclusive: bigint, toInclusive: bigint) => {
      const toBucket = buckets.get(toInclusive);
      if (toBucket === undefined) {
        return Promise.resolve([]);
      }
      let startIndex = 0n;
      if (fromExclusive > 0n) {
        const fromBucket = buckets.get(fromExclusive);
        if (fromBucket === undefined) {
          return Promise.resolve([]);
        }
        startIndex = fromBucket.lastMessageIndex + 1n;
      }
      return Promise.resolve(leaves.slice(Number(startIndex), Number(toBucket.lastMessageIndex + 1n)));
    },
  };

  return { source, buckets, leaves };
}

const GENESIS_PARENT = { seq: 0n, totalMsgCount: 0n };

// Pinned cross-layer values shared with the L1 Foundry harness: genesisTime=100000, slotDuration=36,
// ethereumSlotDuration=12.
const GENESIS_TIME = 100000n;
const SLOT_DURATION = 36n;
const ETHEREUM_SLOT_DURATION = 12n;
const cutoffForSlot = (slot: bigint) => GENESIS_TIME + (slot - 1n) * SLOT_DURATION - ETHEREUM_SLOT_DURATION;

/**
 * Stands in for the descendant-confirmed rule without an L1 client: a bucket is eligible once one Ethereum slot has
 * passed since it was opened, which is when its child block would be visible.
 */
const eligibleAfterOneEthereumSlot: InboxBucketEligibility = (bucket, now) =>
  Promise.resolve(bucket.timestamp + ETHEREUM_SLOT_DURATION <= now);

/** Records which buckets the eligibility rule was asked about, for the walk-bound assertions. */
function trackingEligibility(inner: InboxBucketEligibility): InboxBucketEligibility & { asked: bigint[] } {
  const asked: bigint[] = [];
  const fn = async (bucket: InboxBucket, now: bigint) => {
    asked.push(bucket.seq);
    return await inner(bucket, now);
  };
  return Object.assign(fn, { asked });
}

describe('selectInboxBucketForBlock', () => {
  const baseInput = {
    isEligible: eligibleAfterOneEthereumSlot,
    checkpointStartTotalMsgCount: 0n,
    perBlockCap: 1024,
    perCheckpointCap: 1024,
    isLastBlock: false,
    cutoffTimestamp: 0n,
  };

  it('consumes nothing from an empty Inbox', async () => {
    const { source } = makeSource([]);
    const result = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: 1_000_000n,
      parent: GENESIS_PARENT,
    });
    expect(result.consume).toBe(false);
  });

  it('picks the newest eligible bucket and derives its bundle from genesis', async () => {
    const { source } = makeSource([
      { seq: 1n, timestamp: 100n, msgCount: 3 },
      { seq: 2n, timestamp: 200n, msgCount: 2 },
      { seq: 3n, timestamp: 300n, msgCount: 4 },
    ]);
    // At now=262 buckets 1 and 2 are confirmed but bucket 3 (opened at 300) is still in the future.
    const result = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: 250n + ETHEREUM_SLOT_DURATION,
      parent: GENESIS_PARENT,
    });
    expect(result).toMatchObject({ consume: true });
    if (result.consume) {
      expect(result.bucket.seq).toBe(2n);
      expect(result.bundle).toHaveLength(5); // buckets 1 (3) + 2 (2)
    }
  });

  it('skips an unconfirmed newest bucket and consumes through the newest confirmed one', async () => {
    const { source } = makeSource([
      { seq: 1n, timestamp: 100n, msgCount: 3 },
      { seq: 2n, timestamp: 200n, msgCount: 2 },
      { seq: 3n, timestamp: 300n, msgCount: 4 },
    ]);
    const isEligible = trackingEligibility(bucket => Promise.resolve(bucket.seq <= 2n));
    const result = await selectInboxBucketForBlock({
      ...baseInput,
      isEligible,
      messageSource: source,
      now: 1_000n,
      parent: GENESIS_PARENT,
    });
    expect(result).toMatchObject({ consume: true });
    if (result.consume) {
      expect(result.bucket.seq).toBe(2n);
      expect(result.bundle).toHaveLength(5);
    }
    // The walk starts at the archiver's head bucket and stops at the first eligible one.
    expect(isEligible.asked).toEqual([3n, 2n]);
  });

  it('consumes nothing when no bucket past the parent is eligible', async () => {
    const { source } = makeSource([
      { seq: 1n, timestamp: 100n, msgCount: 3 },
      { seq: 2n, timestamp: 200n, msgCount: 2 },
    ]);
    const result = await selectInboxBucketForBlock({
      ...baseInput,
      isEligible: () => Promise.resolve(false),
      messageSource: source,
      now: 1_000n,
      parent: GENESIS_PARENT,
    });
    expect(result.consume).toBe(false);
  });

  it('stops the eligibility walk after a bounded number of buckets', async () => {
    const { source } = makeSource(
      Array.from({ length: 12 }, (_, i) => ({ seq: BigInt(i + 1), timestamp: BigInt((i + 1) * 10), msgCount: 1 })),
    );
    // Only the oldest bucket is eligible, which is well past the walk bound from the head.
    const isEligible = trackingEligibility(bucket => Promise.resolve(bucket.seq === 1n));
    const result = await selectInboxBucketForBlock({
      ...baseInput,
      isEligible,
      messageSource: source,
      now: 1_000n,
      parent: GENESIS_PARENT,
    });
    expect(result.consume).toBe(false);
    expect(isEligible.asked).toEqual([12n, 11n, 10n, 9n, 8n, 7n, 6n, 5n]);
  });

  it('consumes every bucket the archiver has under immediate eligibility', async () => {
    const { source } = makeSource([
      { seq: 1n, timestamp: 100n, msgCount: 3 },
      { seq: 2n, timestamp: 999n, msgCount: 2 },
    ]);
    const result = await selectInboxBucketForBlock({
      ...baseInput,
      isEligible: immediateEligibility,
      messageSource: source,
      now: 1_000n,
      parent: GENESIS_PARENT,
    });
    expect(result).toMatchObject({ consume: true });
    if (result.consume) {
      expect(result.bucket.seq).toBe(2n);
    }
  });

  it('walks back to the newest bucket that fits the per-block cap', async () => {
    const { source } = makeSource([
      { seq: 1n, timestamp: 100n, msgCount: 200 },
      { seq: 2n, timestamp: 200n, msgCount: 200 },
      { seq: 3n, timestamp: 300n, msgCount: 200 },
    ]);
    // Newest eligible is seq 3 (600 msgs from genesis), but perBlockCap=400 only fits through seq 2.
    const result = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: 300n + ETHEREUM_SLOT_DURATION,
      parent: GENESIS_PARENT,
      perBlockCap: 400,
    });
    expect(result).toMatchObject({ consume: true });
    if (result.consume) {
      expect(result.bucket.seq).toBe(2n);
      expect(result.bundle).toHaveLength(400);
    }
  });

  it('accumulates the per-checkpoint cap across blocks', async () => {
    const { source, buckets } = makeSource([
      { seq: 1n, timestamp: 100n, msgCount: 600 },
      { seq: 2n, timestamp: 200n, msgCount: 600 },
    ]);
    // Block 1 already consumed bucket 1 (600 msgs). perCheckpointCap=1000 leaves only 400 headroom, but bucket 2
    // would bring the checkpoint total to 1200 > 1000, so block 2 consumes nothing (cap-escape).
    const result = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: 200n + ETHEREUM_SLOT_DURATION,
      parent: { seq: 1n, totalMsgCount: buckets.get(1n)!.totalMsgCount },
      checkpointStartTotalMsgCount: 0n,
      perCheckpointCap: 1000,
    });
    expect(result.consume).toBe(false);
  });

  it('advances across sub-slots as buckets arrive', async () => {
    const { source } = makeSource([
      { seq: 1n, timestamp: 100n, msgCount: 2 },
      { seq: 2n, timestamp: 260n, msgCount: 3 },
    ]);
    // Block 1 at now=162: only bucket 1 is confirmed.
    const first = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: 150n + ETHEREUM_SLOT_DURATION,
      parent: GENESIS_PARENT,
    });
    expect(first).toMatchObject({ consume: true });
    if (!first.consume) {
      return;
    }
    expect(first.bucket.seq).toBe(1n);

    // Block 2, later sub-slot (now=312): bucket 2 is now confirmed too; parent is block 1's bucket.
    const second = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: 300n + ETHEREUM_SLOT_DURATION,
      parent: { seq: first.bucket.seq, totalMsgCount: first.bucket.totalMsgCount },
      checkpointStartTotalMsgCount: 0n,
    });
    expect(second).toMatchObject({ consume: true });
    if (second.consume) {
      expect(second.bucket.seq).toBe(2n);
      expect(second.bundle).toHaveLength(3); // only bucket 2's messages, not bucket 1's
      expect(second.bundle).toEqual(await source.getL1ToL2MessagesBetweenBuckets(1n, 2n));
    }
  });

  it('applies the cutoff as a consumption floor on the last block', async () => {
    // Bucket sits at the cutoff for slot 10 but is not yet confirmed, so a non-last block skips it.
    const cutoff = cutoffForSlot(10n);
    const { source } = makeSource([{ seq: 1n, timestamp: cutoff, msgCount: 5 }]);

    const nonLast = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: cutoff + ETHEREUM_SLOT_DURATION - 1n, // bucket's opening block has no descendant yet
      parent: GENESIS_PARENT,
      isLastBlock: false,
      cutoffTimestamp: cutoff,
    });
    expect(nonLast.consume).toBe(false);

    const last = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: cutoff + ETHEREUM_SLOT_DURATION - 1n,
      parent: GENESIS_PARENT,
      isLastBlock: true,
      cutoffTimestamp: cutoff,
    });
    expect(last).toMatchObject({ consume: true });
    if (last.consume) {
      expect(last.bucket.seq).toBe(1n);
    }
  });

  it('makes a bucket exactly at the cutoff mandatory and one past it optional (§13 boundary)', async () => {
    const cutoff = cutoffForSlot(10n); // 100312
    // A bucket AT the cutoff must be consumed by the last block; a bucket one second past it need not be.
    const atCutoff = makeSource([{ seq: 1n, timestamp: cutoff, msgCount: 1 }]);
    const pastCutoff = makeSource([{ seq: 1n, timestamp: cutoff + 1n, msgCount: 1 }]);

    const mustConsume = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: atCutoff.source,
      now: cutoff, // before eligibility would admit it, forcing reliance on the cutoff floor
      parent: GENESIS_PARENT,
      isLastBlock: true,
      cutoffTimestamp: cutoff,
    });
    expect(mustConsume.consume).toBe(true);

    const mayskip = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: pastCutoff.source,
      now: cutoff,
      parent: GENESIS_PARENT,
      isLastBlock: true,
      cutoffTimestamp: cutoff,
    });
    expect(mayskip.consume).toBe(false);
  });

  it('reports insufficiency when the final block cannot reach the censorship floor', async () => {
    // Two mandatory buckets holding 256 and 1 messages, one block of capacity left. Consuming through the second
    // needs 257 messages, one over the per-block cap, and 257 is under the per-checkpoint cap so there is no
    // cap-escape: no position this block can reach satisfies the floor.
    const cutoff = cutoffForSlot(10n);
    const { source } = makeSource([
      { seq: 1n, timestamp: cutoff - 20n, msgCount: 256 },
      { seq: 2n, timestamp: cutoff - 10n, msgCount: 1 },
    ]);

    const result = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: cutoff + ETHEREUM_SLOT_DURATION,
      parent: GENESIS_PARENT,
      perBlockCap: 256,
      perCheckpointCap: 1024,
      isLastBlock: true,
      cutoffTimestamp: cutoff,
    });

    expect(result.insufficientFinalBlockCapacity).toBe(true);
    // The best reachable prefix is still reported, so a caller can log what it would have consumed.
    expect(result).toMatchObject({ consume: true });
    if (result.consume) {
      expect(result.bucket.seq).toBe(1n);
    }
  });

  it('does not report insufficiency on a non-final block that leaves a mandatory bucket', async () => {
    const cutoff = cutoffForSlot(10n);
    const { source } = makeSource([
      { seq: 1n, timestamp: cutoff - 20n, msgCount: 256 },
      { seq: 2n, timestamp: cutoff - 10n, msgCount: 1 },
    ]);

    const result = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: cutoff + ETHEREUM_SLOT_DURATION,
      parent: GENESIS_PARENT,
      perBlockCap: 256,
      perCheckpointCap: 1024,
      isLastBlock: false,
      cutoffTimestamp: cutoff,
    });

    expect(result.insufficientFinalBlockCapacity).toBeUndefined();
    expect(result.consume).toBe(true);
  });

  it('clears the worst-case alternating backlog in exactly MIN_BLOCKS_FOR_INBOX_CATCHUP blocks', async () => {
    // The bound's witness: alternating 1 and 256-message buckets. Each pair needs two blocks, because consuming
    // through both would take 257 messages, one over the per-block cap.
    const counts = [1, 256, 1, 256, 1, 256, 1];
    const cutoff = cutoffForSlot(10n);
    const { source } = makeSource(
      counts.map((msgCount, i) => ({ seq: BigInt(i + 1), timestamp: cutoff - BigInt(counts.length - i), msgCount })),
    );
    const caps = { perBlockCap: 256, perCheckpointCap: 1024 };
    const sufficiencyAt = async (parent: { seq: bigint; totalMsgCount: bigint }) =>
      isInboxConsumptionSufficient({
        nextBucket: await source.getInboxBucket(parent.seq + 1n),
        cutoffTimestamp: cutoff,
        checkpointStartTotalMsgCount: 0n,
        perCheckpointCap: caps.perCheckpointCap,
      });

    let parent = GENESIS_PARENT;
    for (let block = 1; block <= MIN_BLOCKS_FOR_INBOX_CATCHUP; block++) {
      const isLastBlock = block === MIN_BLOCKS_FOR_INBOX_CATCHUP;
      const result = await selectInboxBucketForBlock({
        ...baseInput,
        ...caps,
        messageSource: source,
        now: cutoff + ETHEREUM_SLOT_DURATION,
        parent,
        isLastBlock,
        cutoffTimestamp: cutoff,
      });
      expect(result).toMatchObject({ consume: true });
      if (!result.consume) {
        return;
      }
      // Each block advances by exactly one bucket, which is what makes the bound tight.
      expect(result.bucket.seq).toBe(BigInt(block));
      expect(result.insufficientFinalBlockCapacity).toBeUndefined();
      parent = { seq: result.bucket.seq, totalMsgCount: result.bucket.totalMsgCount };
    }

    expect(parent.totalMsgCount).toBe(772n);
    expect(await sufficiencyAt(parent)).toBe(true);
    // One block short of the bound the backlog is still mandatory, so the floor really needs all of them.
    expect(await sufficiencyAt({ seq: 6n, totalMsgCount: 771n })).toBe(false);
  });

  it('makes a bucket opened at the cutoff confirmable within the build frame', async () => {
    // The censorship floor is only satisfiable if a bucket opened at the very last moment L1 makes mandatory still
    // becomes eligible while the checkpoint is being built. Slot S's cutoff is one Ethereum slot before the build
    // frame opens, so the bucket's child block lands ~2s into the frame, before the first block is proposed.
    const cutoff = cutoffForSlot(10n);
    const buildFrameStart = GENESIS_TIME + 9n * SLOT_DURATION;
    expect(cutoff).toBe(buildFrameStart - ETHEREUM_SLOT_DURATION);

    const { source } = makeSource([{ seq: 1n, timestamp: cutoff, msgCount: 2 }]);
    const childVisibleAt = cutoff + 14n;
    let now = buildFrameStart;
    const l1Client = {
      getBlock: ({ blockNumber }: { blockNumber: bigint }) =>
        blockNumber === 2n && now >= childVisibleAt
          ? Promise.resolve({ parentHash: Buffer32.fromBigInt(1n).toString() })
          : Promise.reject(new BlockNotFoundError({ blockNumber })),
    } as unknown as L1BlockReader;
    const tracker = new InboxBucketConfirmationTracker({ l1Client, ethereumSlotDuration: 12 });

    // First sub-slot of the build frame: the child is already visible, so the mandatory bucket is consumable
    // without falling back on the cutoff override.
    now = buildFrameStart + 3n;
    const result = await selectInboxBucketForBlock({
      ...baseInput,
      isEligible: tracker.isEligible,
      messageSource: source,
      now,
      parent: GENESIS_PARENT,
      isLastBlock: false,
      cutoffTimestamp: cutoff,
    });
    expect(result).toMatchObject({ consume: true });
    if (result.consume) {
      expect(result.bucket.seq).toBe(1n);
    }
  });

  it('consumes nothing when even the first bucket past the parent exceeds the per-checkpoint cap (cap-escape)', async () => {
    const { source } = makeSource([{ seq: 1n, timestamp: 100n, msgCount: 2000 }]);
    const result = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: 100n + ETHEREUM_SLOT_DURATION,
      parent: GENESIS_PARENT,
      perBlockCap: 4096,
      perCheckpointCap: 1024,
    });
    expect(result.consume).toBe(false);
  });
});
