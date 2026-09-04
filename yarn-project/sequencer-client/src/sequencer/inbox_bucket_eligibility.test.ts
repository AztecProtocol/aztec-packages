import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { InboxBucket } from '@aztec/stdlib/messaging';

import { describe, expect, it } from '@jest/globals';
import { BlockNotFoundError } from 'viem';

import {
  InboxBucketConfirmationTracker,
  type L1BlockReader,
  type L1BlockRef,
  immediateEligibility,
} from './inbox_bucket_eligibility.js';

const ETHEREUM_SLOT_DURATION = 12;
const OPENED_AT = 1_000n;
const BLOCK_NUMBER = 500n;

/** An L1 block as far as the tracker is concerned: only its hash and parent hash are read. */
type FakeL1Block = L1BlockRef & { number: bigint };

const hashOf = (blockNumber: bigint) => Buffer32.fromBigInt(blockNumber).toString();

function makeBucket(overrides: Partial<InboxBucket> = {}): InboxBucket {
  return {
    seq: 3n,
    inboxRollingHash: new Fr(7),
    totalMsgCount: 5n,
    timestamp: OPENED_AT,
    msgCount: 2,
    lastMessageIndex: 4n,
    l1BlockNumber: BLOCK_NUMBER,
    l1BlockHash: Buffer32.fromString(hashOf(BLOCK_NUMBER)),
    ...overrides,
  };
}

/** An L1 client serving a fixed set of blocks by number, counting the reads the tracker makes. */
function makeL1Client(blocks: FakeL1Block[]): L1BlockReader & { calls: bigint[] } {
  const byNumber = new Map(blocks.map(block => [block.number, block]));
  const calls: bigint[] = [];
  return {
    calls,
    getBlock({ blockNumber }) {
      calls.push(blockNumber);
      const block = byNumber.get(blockNumber);
      return block === undefined ? Promise.reject(new BlockNotFoundError({ blockNumber })) : Promise.resolve(block);
    },
  };
}

/** A canonical child of the bucket's opening block. */
const canonicalChild: FakeL1Block = {
  number: BLOCK_NUMBER + 1n,
  hash: hashOf(BLOCK_NUMBER + 1n),
  parentHash: hashOf(BLOCK_NUMBER),
};

/** The opening block itself, still canonical. */
const canonicalSelf: FakeL1Block = {
  number: BLOCK_NUMBER,
  hash: hashOf(BLOCK_NUMBER),
  parentHash: hashOf(BLOCK_NUMBER - 1n),
};

function makeTracker(blocks: FakeL1Block[], clockToleranceSeconds = 0) {
  const l1Client = makeL1Client(blocks);
  const tracker = new InboxBucketConfirmationTracker({
    l1Client,
    ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
    clockToleranceSeconds,
  });
  return { tracker, l1Client };
}

describe('immediateEligibility', () => {
  it('accepts any bucket at any time', async () => {
    await expect(immediateEligibility(makeBucket(), 0n)).resolves.toBe(true);
  });
});

describe('InboxBucketConfirmationTracker', () => {
  it('does not read L1 before the next Ethereum slot has started', async () => {
    const { tracker, l1Client } = makeTracker([canonicalChild]);
    await expect(tracker.isEligible(makeBucket(), OPENED_AT + 11n)).resolves.toBe(false);
    expect(l1Client.calls).toEqual([]);
  });

  it('confirms a bucket whose opening block has a canonical child', async () => {
    const { tracker, l1Client } = makeTracker([canonicalChild]);
    await expect(tracker.isEligible(makeBucket(), OPENED_AT + 12n)).resolves.toBe(true);
    expect(l1Client.calls).toEqual([BLOCK_NUMBER + 1n]);
  });

  it('caches a confirmation for the tracker lifetime', async () => {
    const { tracker, l1Client } = makeTracker([canonicalChild]);
    await expect(tracker.isEligible(makeBucket(), OPENED_AT + 12n)).resolves.toBe(true);
    await expect(tracker.isEligible(makeBucket(), OPENED_AT + 15n)).resolves.toBe(true);
    expect(l1Client.calls).toEqual([BLOCK_NUMBER + 1n]);
  });

  it('rejects a bucket whose opening block was replaced, seen through the child parent hash', async () => {
    const orphaningChild: FakeL1Block = {
      number: BLOCK_NUMBER + 1n,
      hash: hashOf(BLOCK_NUMBER + 1n),
      // Built on the replacement of the bucket's block, not on the bucket's block itself.
      parentHash: hashOf(999n),
    };
    const { tracker, l1Client } = makeTracker([orphaningChild]);
    await expect(tracker.isEligible(makeBucket(), OPENED_AT + 14n)).resolves.toBe(false);
    expect(l1Client.calls).toEqual([BLOCK_NUMBER + 1n]);
  });

  it('reads L1 once per second, reusing the rejection within the same one', async () => {
    const { tracker, l1Client } = makeTracker([]);
    await expect(tracker.isEligible(makeBucket(), OPENED_AT + 14n)).resolves.toBe(false);
    await expect(tracker.isEligible(makeBucket(), OPENED_AT + 14n)).resolves.toBe(false);
    expect(l1Client.calls).toEqual([BLOCK_NUMBER + 1n]);

    // A later second re-checks, still before the missed-slot fallback opens.
    await expect(tracker.isEligible(makeBucket(), OPENED_AT + 17n)).resolves.toBe(false);
    expect(l1Client.calls).toEqual([BLOCK_NUMBER + 1n, BLOCK_NUMBER + 1n]);
  });

  it('falls back to the opening block itself once the next Ethereum slot has fully elapsed', async () => {
    const { tracker, l1Client } = makeTracker([canonicalSelf]);
    await expect(tracker.isEligible(makeBucket(), OPENED_AT + 24n)).resolves.toBe(true);
    expect(l1Client.calls).toEqual([BLOCK_NUMBER + 1n, BLOCK_NUMBER]);
  });

  it('rejects when the fallback finds a different block at the same height', async () => {
    const replacement: FakeL1Block = {
      number: BLOCK_NUMBER,
      hash: hashOf(999n),
      parentHash: hashOf(BLOCK_NUMBER - 1n),
    };
    const { tracker, l1Client } = makeTracker([replacement]);
    await expect(tracker.isEligible(makeBucket(), OPENED_AT + 24n)).resolves.toBe(false);
    expect(l1Client.calls).toEqual([BLOCK_NUMBER + 1n, BLOCK_NUMBER]);
  });

  it('applies the clock tolerance in the permissive direction', async () => {
    const { tracker, l1Client } = makeTracker([canonicalSelf], 2);
    await expect(tracker.isEligible(makeBucket(), OPENED_AT + 22n)).resolves.toBe(true);
    expect(l1Client.calls).toEqual([BLOCK_NUMBER + 1n, BLOCK_NUMBER]);
  });

  it('treats the genesis sentinel bucket as eligible without reading L1', async () => {
    const { tracker, l1Client } = makeTracker([]);
    const genesis = makeBucket({
      seq: 0n,
      totalMsgCount: 0n,
      msgCount: 0,
      timestamp: 0n,
      l1BlockNumber: 0n,
      l1BlockHash: Buffer32.ZERO,
    });
    await expect(tracker.isEligible(genesis, 0n)).resolves.toBe(true);
    expect(l1Client.calls).toEqual([]);
  });

  it('leaves a bucket ineligible when the L1 read fails outright, without retrying in the same second', async () => {
    const calls: bigint[] = [];
    const l1Client: L1BlockReader = {
      getBlock({ blockNumber }) {
        calls.push(blockNumber);
        return Promise.reject(new Error('connection reset'));
      },
    };
    const tracker = new InboxBucketConfirmationTracker({ l1Client, ethereumSlotDuration: ETHEREUM_SLOT_DURATION });

    await expect(tracker.isEligible(makeBucket(), OPENED_AT + 14n)).resolves.toBe(false);
    await expect(tracker.isEligible(makeBucket(), OPENED_AT + 14n)).resolves.toBe(false);
    expect(calls).toEqual([BLOCK_NUMBER + 1n]);

    // The failure is not sticky: the next second tries again.
    await expect(tracker.isEligible(makeBucket(), OPENED_AT + 15n)).resolves.toBe(false);
    expect(calls).toEqual([BLOCK_NUMBER + 1n, BLOCK_NUMBER + 1n]);
  });

  it('leaves a bucket ineligible when the L1 read does not answer in time', async () => {
    const l1Client: L1BlockReader = { getBlock: () => new Promise<L1BlockRef>(() => {}) };
    const tracker = new InboxBucketConfirmationTracker({
      l1Client,
      ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
      l1ReadTimeoutMs: 20,
    });
    await expect(tracker.isEligible(makeBucket(), OPENED_AT + 14n)).resolves.toBe(false);
  });
});
