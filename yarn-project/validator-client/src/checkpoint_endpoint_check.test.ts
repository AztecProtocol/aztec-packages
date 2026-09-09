import { Fr } from '@aztec/foundation/curves/bn254';

import { describe, expect, it } from '@jest/globals';

import { type InboxEndpointReader, checkInboxEndpoint } from './checkpoint_endpoint_check.js';

/** A live bucket of the fake Inbox ring: the cumulative total it ends at and the prefix hash it commits to. */
type LiveBucket = { seq: bigint; total: bigint; rollingHash: Fr };

/** Records what each endpoint read asked for, so a verdict can be checked against the L1 view it was made in. */
type EndpointRead = { upperBound: bigint; blockNumber: bigint | undefined };

/**
 * An Inbox holding the given live buckets, resolving an upper bound the way the contract does: the newest live
 * bucket ending at or below it, or nothing at all once the ring has evicted every bucket that could have matched.
 */
function makeInbox(
  buckets: LiveBucket[],
  opts: { head?: bigint; failHead?: Error; failBucket?: Error } = {},
): InboxEndpointReader & { reads: EndpointRead[] } {
  const head = opts.head ?? 900n;
  const ordered = [...buckets].sort((a, b) => Number(a.total - b.total));
  const reads: EndpointRead[] = [];
  return {
    reads,
    client: {
      getBlockNumber: () => (opts.failHead ? Promise.reject(opts.failHead) : Promise.resolve(head)),
    },
    getBucketAtOrBeforeTotal: (upperBound, readOpts) => {
      reads.push({ upperBound, blockNumber: readOpts?.blockNumber });
      if (opts.failBucket) {
        return Promise.reject(opts.failBucket);
      }
      const match = ordered.filter(bucket => bucket.total <= upperBound).pop();
      return Promise.resolve(
        match && {
          seq: match.seq,
          bucket: { rollingHash: match.rollingHash, totalMsgCount: match.total, timestamp: 1n, msgCount: 1 },
        },
      );
    },
  };
}

describe('checkInboxEndpoint', () => {
  const hashAt200 = Fr.random();
  const hashAt400 = Fr.random();
  const ring: LiveBucket[] = [
    { seq: 7n, total: 200n, rollingHash: hashAt200 },
    { seq: 8n, total: 400n, rollingHash: hashAt400 },
  ];

  it('verifies a position where a live bucket ends with the signed rolling hash', async () => {
    const inbox = makeInbox(ring);

    await expect(checkInboxEndpoint(inbox, 200n, hashAt200)).resolves.toEqual({
      verified: true,
      l1BlockNumber: 900n,
      bucketSeq: 7n,
    });
  });

  it('resolves the bucket at the captured head rather than at a moving latest view', async () => {
    const inbox = makeInbox(ring, { head: 1234n });

    const result = await checkInboxEndpoint(inbox, 400n, hashAt400);

    expect(inbox.reads).toEqual([{ upperBound: 400n, blockNumber: 1234n }]);
    expect(result).toEqual({ verified: true, l1BlockNumber: 1234n, bucketSeq: 8n });
  });

  // The resolver answers with the closest boundary below the bound, so a lower result is a miss, not a match.
  it('rejects a position inside a bucket, even though a lower boundary resolves', async () => {
    const inbox = makeInbox(ring);

    await expect(checkInboxEndpoint(inbox, 256n, hashAt200)).resolves.toEqual({
      verified: false,
      reason: 'interior_position',
      l1BlockNumber: 900n,
      endpointTotal: 200n,
    });
  });

  it('rejects a boundary that commits to a different message prefix than the one signed', async () => {
    const inbox = makeInbox(ring);

    await expect(checkInboxEndpoint(inbox, 200n, Fr.random())).resolves.toEqual({
      verified: false,
      reason: 'rolling_hash_mismatch',
      l1BlockNumber: 900n,
      endpointTotal: 200n,
    });
  });

  it('rejects a position no live bucket reaches any more', async () => {
    const inbox = makeInbox([{ seq: 20n, total: 5000n, rollingHash: Fr.random() }]);

    await expect(checkInboxEndpoint(inbox, 200n, hashAt200)).resolves.toEqual({
      verified: false,
      reason: 'no_live_endpoint',
      l1BlockNumber: 900n,
    });
  });

  // An empty Inbox still has a genesis bucket ending at zero, so a checkpoint consuming nothing at the start of
  // the chain is verified by the same rule as any other, without special-casing a missing endpoint into success.
  it('verifies the genesis position of an Inbox that never received a message', async () => {
    const inbox = makeInbox([{ seq: 0n, total: 0n, rollingHash: Fr.ZERO }]);

    await expect(checkInboxEndpoint(inbox, 0n, Fr.ZERO)).resolves.toEqual({
      verified: true,
      l1BlockNumber: 900n,
      bucketSeq: 0n,
    });
  });

  it('reports an unreadable view when the head cannot be read', async () => {
    const err = new Error('l1 rpc request failed');
    const inbox = makeInbox(ring, { failHead: err });

    await expect(checkInboxEndpoint(inbox, 200n, hashAt200)).resolves.toEqual({
      verified: false,
      reason: 'unreadable',
      err,
    });
  });

  it('reports an unreadable view when the bucket read fails at the captured head', async () => {
    const err = new Error('header not found');
    const inbox = makeInbox(ring, { failBucket: err });

    await expect(checkInboxEndpoint(inbox, 200n, hashAt200)).resolves.toEqual({
      verified: false,
      reason: 'unreadable',
      err,
    });
  });
});
