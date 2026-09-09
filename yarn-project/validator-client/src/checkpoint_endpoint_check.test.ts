import { Fr } from '@aztec/foundation/curves/bn254';

import { describe, expect, it } from '@jest/globals';

import { checkInboxEndpoint } from './checkpoint_endpoint_check.js';
import { type LiveBucket, makeFakeInbox } from './fake_inbox_test_helper.js';

describe('checkInboxEndpoint', () => {
  const hashAt200 = Fr.random();
  const hashAt400 = Fr.random();
  const ring: LiveBucket[] = [
    { seq: 7n, total: 200n, rollingHash: hashAt200 },
    { seq: 8n, total: 400n, rollingHash: hashAt400 },
  ];

  it('verifies a position where a live bucket ends with the signed rolling hash', async () => {
    const inbox = makeFakeInbox(ring);

    await expect(checkInboxEndpoint(inbox, 200n, hashAt200)).resolves.toEqual({
      verified: true,
      l1BlockNumber: 900n,
      bucketSeq: 7n,
    });
  });

  it('resolves the bucket at the captured head rather than at a moving latest view', async () => {
    const inbox = makeFakeInbox(ring, { head: 1234n });

    const result = await checkInboxEndpoint(inbox, 400n, hashAt400);

    expect(inbox.reads).toEqual([{ upperBound: 400n, blockNumber: 1234n }]);
    expect(result).toEqual({ verified: true, l1BlockNumber: 1234n, bucketSeq: 8n });
  });

  // The resolver answers with the closest boundary below the bound, so a lower result is a miss, not a match.
  it('rejects a position inside a bucket, even though a lower boundary resolves', async () => {
    const inbox = makeFakeInbox(ring);

    await expect(checkInboxEndpoint(inbox, 256n, hashAt200)).resolves.toEqual({
      verified: false,
      reason: 'interior_position',
      l1BlockNumber: 900n,
      endpointTotal: 200n,
    });
  });

  it('rejects a boundary that commits to a different message prefix than the one signed', async () => {
    const inbox = makeFakeInbox(ring);

    await expect(checkInboxEndpoint(inbox, 200n, Fr.random())).resolves.toEqual({
      verified: false,
      reason: 'rolling_hash_mismatch',
      l1BlockNumber: 900n,
      endpointTotal: 200n,
    });
  });

  it('rejects a position no live bucket reaches any more', async () => {
    const inbox = makeFakeInbox([{ seq: 20n, total: 5000n, rollingHash: Fr.random() }]);

    await expect(checkInboxEndpoint(inbox, 200n, hashAt200)).resolves.toEqual({
      verified: false,
      reason: 'no_live_endpoint',
      l1BlockNumber: 900n,
    });
  });

  // An empty Inbox still has a genesis bucket ending at zero, so a checkpoint consuming nothing at the start of
  // the chain is verified by the same rule as any other, without special-casing a missing endpoint into success.
  it('verifies the genesis position of an Inbox that never received a message', async () => {
    const inbox = makeFakeInbox([{ seq: 0n, total: 0n, rollingHash: Fr.ZERO }]);

    await expect(checkInboxEndpoint(inbox, 0n, Fr.ZERO)).resolves.toEqual({
      verified: true,
      l1BlockNumber: 900n,
      bucketSeq: 0n,
    });
  });

  it('reports an unreadable view when the head cannot be read', async () => {
    const err = new Error('l1 rpc request failed');
    const inbox = makeFakeInbox(ring, { failHead: err });

    await expect(checkInboxEndpoint(inbox, 200n, hashAt200)).resolves.toEqual({
      verified: false,
      reason: 'unreadable',
      err,
    });
  });

  it('reports an unreadable view when the bucket read fails at the captured head', async () => {
    const err = new Error('header not found');
    const inbox = makeFakeInbox(ring, { failBucket: err });

    await expect(checkInboxEndpoint(inbox, 200n, hashAt200)).resolves.toEqual({
      verified: false,
      reason: 'unreadable',
      err,
    });
  });
});
