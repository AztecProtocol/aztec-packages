import { Fr } from '@aztec/foundation/curves/bn254';
import type { InboxBucket } from '@aztec/stdlib/messaging';

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
      isOpen: false,
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

// Pinned cross-layer values from A-1371-resolution §13: genesisTime=100000, slotDuration=36, INBOX_LAG_SECONDS=12.
const GENESIS_TIME = 100000n;
const SLOT_DURATION = 36n;
const LAG = 12n;
const cutoffForSlot = (slot: bigint) => GENESIS_TIME + (slot - 1n) * SLOT_DURATION - LAG;

describe('selectInboxBucketForBlock', () => {
  const baseInput = {
    lagSeconds: LAG,
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

  it('picks the newest lag-eligible bucket and derives its bundle from genesis', async () => {
    const { source } = makeSource([
      { seq: 1n, timestamp: 100n, msgCount: 3 },
      { seq: 2n, timestamp: 200n, msgCount: 2 },
      { seq: 3n, timestamp: 300n, msgCount: 4 },
    ]);
    // now - lag = 250 -> newest bucket at-or-before 250 is seq 2.
    const result = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: 250n + LAG,
      parent: GENESIS_PARENT,
    });
    expect(result).toMatchObject({ consume: true });
    if (result.consume) {
      expect(result.bucket.seq).toBe(2n);
      expect(result.bundle).toHaveLength(5); // buckets 1 (3) + 2 (2)
    }
  });

  it('treats a bucket exactly lagSeconds old as eligible (inclusive lag boundary)', async () => {
    const { source } = makeSource([{ seq: 1n, timestamp: 500n, msgCount: 1 }]);
    // Bucket age exactly == lag: timestamp == now - lag.
    const result = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: 500n + LAG,
      parent: GENESIS_PARENT,
    });
    expect(result.consume).toBe(true);

    // One second younger than the lag boundary: not yet eligible.
    const tooYoung = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: 500n + LAG - 1n,
      parent: GENESIS_PARENT,
    });
    expect(tooYoung.consume).toBe(false);
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
      now: 300n + LAG,
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
      now: 200n + LAG,
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
    // Block 1 at now-lag=150: only bucket 1 eligible.
    const first = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: 150n + LAG,
      parent: GENESIS_PARENT,
    });
    expect(first).toMatchObject({ consume: true });
    if (!first.consume) {
      return;
    }
    expect(first.bucket.seq).toBe(1n);

    // Block 2, later sub-slot (now-lag=300): bucket 2 has now aged in; parent is block 1's bucket.
    const second = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: 300n + LAG,
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
    // Bucket sits at the cutoff for slot 10 but is younger than now-lag, so a non-last block skips it.
    const cutoff = cutoffForSlot(10n);
    const { source } = makeSource([{ seq: 1n, timestamp: cutoff, msgCount: 5 }]);

    const nonLast = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: cutoff + LAG - 1n, // bucket is one second too young for lag eligibility
      parent: GENESIS_PARENT,
      isLastBlock: false,
      cutoffTimestamp: cutoff,
    });
    expect(nonLast.consume).toBe(false);

    const last = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: cutoff + LAG - 1n,
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
      now: cutoff, // before lag would make it eligible, forcing reliance on the cutoff floor
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

  it('consumes nothing when even the first bucket past the parent exceeds the per-checkpoint cap (cap-escape)', async () => {
    const { source } = makeSource([{ seq: 1n, timestamp: 100n, msgCount: 2000 }]);
    const result = await selectInboxBucketForBlock({
      ...baseInput,
      messageSource: source,
      now: 100n + LAG,
      parent: GENESIS_PARENT,
      perBlockCap: 4096,
      perCheckpointCap: 1024,
    });
    expect(result.consume).toBe(false);
  });
});
