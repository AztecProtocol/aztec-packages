import { Fr } from '@aztec/foundation/curves/bn254';

import type { InboxEndpointReader } from './checkpoint_endpoint_check.js';

/** A live bucket of the fake Inbox ring: the cumulative total it ends at and the prefix hash it commits to. */
export type LiveBucket = { seq: bigint; total: bigint; rollingHash: Fr };

/** A fake live Inbox ring for the endpoint check, whose contents and readability tests can move between reads. */
export type FakeInbox = InboxEndpointReader & {
  /** What each endpoint read asked for, and the L1 view it was made in. */
  reads: { upperBound: bigint; blockNumber: bigint | undefined }[];
  /** Replaces the live ring, the way an eviction or a reorg moves it between two reads. */
  setBuckets(buckets: LiveBucket[]): void;
  /** Makes every read fail, the way an unreachable provider does. */
  setUnreadable(err: Error | undefined): void;
  /** Makes every bucket read hang, the way a provider that accepts a call and never answers does. */
  setUnresponsive(): void;
  /** Replaces the block reported at the head's height, the way a provider answering from a stale fork does. */
  setViewHash(hash: string | null): void;
  /** Runs before each bucket read with its index, so a test can move the L1 view between two attempts. */
  onRead(hook: (readIndex: number) => void): void;
};

/** The L1 head fake reads are pinned to, unless a test asks for another one. */
const DEFAULT_HEAD = 900n;

/** The hash of the block at the head's height, unless a test replaces it mid-check. */
const DEFAULT_HEAD_HASH = '0xhead';

/**
 * An Inbox holding the given live buckets, resolving an upper bound the way the contract does: the newest live
 * bucket ending at or below it, or nothing at all once the ring has evicted every bucket that could have matched.
 * Defaults to the genesis bucket of an Inbox that never received a message.
 */
export function makeFakeInbox(
  buckets: LiveBucket[] = [{ seq: 0n, total: 0n, rollingHash: Fr.ZERO }],
  opts: { head?: bigint; failHead?: Error; failBucket?: Error } = {},
): FakeInbox {
  let live = buckets;
  let failHead = opts.failHead;
  let failBucket = opts.failBucket;
  let unresponsive = false;
  let viewHash: string | null = DEFAULT_HEAD_HASH;
  let beforeRead: (readIndex: number) => void = () => {};
  const head = opts.head ?? DEFAULT_HEAD;
  const reads: FakeInbox['reads'] = [];
  return {
    reads,
    setBuckets: next => {
      live = next;
    },
    setUnreadable: err => {
      failHead = err;
      failBucket = err;
    },
    setUnresponsive: () => {
      unresponsive = true;
    },
    setViewHash: hash => {
      viewHash = hash;
    },
    onRead: hook => {
      beforeRead = hook;
    },
    client: {
      getBlock: ({ blockNumber }) =>
        failHead ? Promise.reject(failHead) : Promise.resolve({ number: blockNumber ?? head, hash: viewHash }),
    },
    getBucketAtOrBeforeTotal: (upperBound, readOpts) => {
      beforeRead(reads.length);
      reads.push({ upperBound, blockNumber: readOpts?.blockNumber });
      if (failBucket) {
        return Promise.reject(failBucket);
      }
      if (unresponsive) {
        return new Promise(() => {});
      }
      const match = [...live].sort((a, b) => Number(a.total - b.total)).findLast(bucket => bucket.total <= upperBound);
      return Promise.resolve(
        match && {
          seq: match.seq,
          bucket: { rollingHash: match.rollingHash, totalMsgCount: match.total, timestamp: 1n, msgCount: 1 },
        },
      );
    },
  };
}
