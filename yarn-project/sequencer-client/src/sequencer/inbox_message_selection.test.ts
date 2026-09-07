import type { InboxContract } from '@aztec/ethereum/contracts';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type MockStreamingInbox, mockStreamingInbox } from '../test/utils.js';
import {
  PROTOCOL_INBOX_CONSUMPTION_CAPS,
  getEndpointUpperBound,
  getOrdinaryCeiling,
  mustQueryEndpoint,
  resolveEndpoint,
  selectOrdinaryMessageEnd,
  selectSafeLocalEnd,
} from './inbox_message_selection.js';

describe('resolveEndpoint', () => {
  let messageSource: MockProxy<L1ToL2MessageSource>;
  let inbox: MockProxy<InboxContract>;
  let streamingInbox: MockStreamingInbox;

  const leaves = (count: number) => Array.from({ length: count }, (_, i) => new Fr(i + 1));

  beforeEach(() => {
    messageSource = mock<L1ToL2MessageSource>();
    inbox = mock<InboxContract>();
    streamingInbox = mockStreamingInbox(messageSource, inbox);
  });

  it('resolves the live bucket end at or below the upper bound and reads the range from the cursor to it', async () => {
    streamingInbox.set(leaves(10), [4n, 7n, 10n]);

    const resolved = await resolveEndpoint({
      inbox,
      messageSource,
      cursor: streamingInbox.positionAt(2n),
      upperBound: 8n,
    });

    expect(resolved).toEqual(
      expect.objectContaining({ ok: true, bucketSeq: 2n, endpoint: streamingInbox.positionAt(7n) }),
    );
    expect(resolved.ok && resolved.range.messages).toEqual(leaves(10).slice(2, 7));
  });

  it('reports no live endpoint when no bucket ends at or below the upper bound', async () => {
    streamingInbox.set(leaves(10), [7n, 10n]);

    const resolved = await resolveEndpoint({
      inbox,
      messageSource,
      cursor: streamingInbox.positionAt(2n),
      upperBound: 6n,
    });

    // Only the genesis position (total zero) is at or below the bound, and it is behind the cursor.
    expect(resolved).toEqual({ ok: false, reason: 'endpoint_behind_cursor', upperBound: 6n, endpointTotal: 0n });
  });

  it('reports no live endpoint when the Inbox has evicted every bucket at or below the upper bound', async () => {
    streamingInbox.set(leaves(10), [7n, 10n]);
    inbox.getBucketAtOrBeforeTotal.mockResolvedValue(undefined);

    const resolved = await resolveEndpoint({
      inbox,
      messageSource,
      cursor: streamingInbox.positionAt(2n),
      upperBound: 8n,
    });

    expect(resolved).toEqual({ ok: false, reason: 'no_live_endpoint', upperBound: 8n });
  });

  it('reports the endpoint as unavailable locally when the archiver has not synced up to it', async () => {
    streamingInbox.set(leaves(5), [7n]);

    const resolved = await resolveEndpoint({
      inbox,
      messageSource,
      cursor: streamingInbox.positionAt(2n),
      upperBound: 8n,
    });

    expect(resolved).toEqual({ ok: false, reason: 'endpoint_unavailable_locally', upperBound: 8n, endpointTotal: 7n });
  });

  it('reports a changed local prefix when the range no longer starts at the cursor hash', async () => {
    streamingInbox.set(leaves(10), [7n]);
    const cursor = streamingInbox.positionAt(2n);
    streamingInbox.set([new Fr(100), new Fr(101), ...leaves(10).slice(2)], [7n]);

    const resolved = await resolveEndpoint({ inbox, messageSource, cursor, upperBound: 8n });

    expect(resolved).toEqual({ ok: false, reason: 'local_prefix_changed', upperBound: 8n, endpointTotal: 7n });
  });

  // The local log and the Inbox can disagree at the endpoint itself: the archiver holds a stale suffix (an L1 reorg it
  // has not followed yet) whose prefix hash at the bucket end differs from the live bucket's. Such an endpoint must not
  // be signed: the checkpoint header would commit to a rolling hash L1 does not hold.
  it('reports an endpoint hash mismatch when the local prefix at the bucket end differs from the live bucket', async () => {
    streamingInbox.set(leaves(10), [7n]);
    const resolveBucket = inbox.getBucketAtOrBeforeTotal.getMockImplementation()!;
    inbox.getBucketAtOrBeforeTotal.mockImplementation(async upperBound => {
      const found = await resolveBucket(upperBound);
      return found && { ...found, bucket: { ...found.bucket, rollingHash: Fr.random() } };
    });

    const resolved = await resolveEndpoint({
      inbox,
      messageSource,
      cursor: streamingInbox.positionAt(2n),
      upperBound: 8n,
    });

    expect(resolved).toEqual({ ok: false, reason: 'endpoint_hash_mismatch', upperBound: 8n, endpointTotal: 7n });
  });
});

describe('ordinary message selection', () => {
  const caps = PROTOCOL_INBOX_CONSUMPTION_CAPS;
  // 1024 - 256: the last position from which one block always reaches the end of the bucket the cursor sits in.
  const threshold = 768n;

  it.each([0n, 5_000n])('takes everything observed within the caps from checkpoint start %s', start => {
    expect(getOrdinaryCeiling(start, caps)).toEqual(start + threshold);
    // The greedy end is not held down to the threshold; the threshold only decides whether L1 has to be consulted.
    expect(
      selectOrdinaryMessageEnd({
        cursorCount: start + 700n,
        localSyncedCount: start + 1000n,
        checkpointStartCount: start,
        caps,
      }),
    ).toEqual(start + 956n);
    // The per-block cap and the checkpoint cap both bound it.
    expect(
      selectOrdinaryMessageEnd({
        cursorCount: start,
        localSyncedCount: start + 700n,
        checkpointStartCount: start,
        caps,
      }),
    ).toEqual(start + 256n);
    expect(
      selectOrdinaryMessageEnd({
        cursorCount: start + 900n,
        localSyncedCount: start + 1300n,
        checkpointStartCount: start,
        caps,
      }),
    ).toEqual(start + 1024n);
  });

  it.each([0n, 5_000n])('holds the safe local step at the threshold from checkpoint start %s', start => {
    expect(
      selectSafeLocalEnd({
        cursorCount: start + 700n,
        localSyncedCount: start + 1000n,
        checkpointStartCount: start,
        caps,
      }),
    ).toEqual(start + threshold);
    // Never below the cursor, even once the cursor is past the threshold.
    for (const cursorCount of [start + threshold, start + 900n]) {
      expect(
        selectSafeLocalEnd({ cursorCount, localSyncedCount: start + 1024n, checkpointStartCount: start, caps }),
      ).toEqual(cursorCount);
    }
  });

  it('rejects caps whose checkpoint budget is below one bucket', () => {
    expect(() => getOrdinaryCeiling(0n, { perCheckpointCap: 128, maxMessagesPerBucket: 256 })).toThrow(
      'below the bucket size',
    );
  });
});

describe('mustQueryEndpoint', () => {
  const caps = PROTOCOL_INBOX_CONSUMPTION_CAPS;

  it.each([0n, 5_000n])('triggers strictly above the threshold, from checkpoint start %s', start => {
    const at = (prospectiveEnd: bigint, isFinalBlock = false) =>
      mustQueryEndpoint({ prospectiveEnd, checkpointStartCount: start, isFinalBlock, caps });

    // A step ending exactly on the threshold is still local-only.
    expect(at(start + 768n)).toBe(false);
    expect(at(start + 769n)).toBe(true);
    // A large backlog does not trigger a lookup while the step itself stays clear of the threshold.
    expect(at(start + 256n)).toBe(false);
    // The final block always lands on a live bucket end, however little it consumes.
    expect(at(start, true)).toBe(true);
  });
});

describe('getEndpointUpperBound', () => {
  const caps = PROTOCOL_INBOX_CONSUMPTION_CAPS;

  it.each([0n, 5_000n])('bounds a non-final lookup by the checkpoint, from start %s', start => {
    const bound = (cursorCount: bigint, localSyncedCount: bigint) =>
      getEndpointUpperBound({
        cursorCount,
        localSyncedCount,
        checkpointStartCount: start,
        isFinalBlock: false,
        caps,
      });

    // The whole checkpoint cap, not this block's reach: a mandatory bucket past 956 must not be stranded.
    expect(bound(start + 700n, start + 1_300n)).toEqual(start + 1024n);
    // What the archiver holds, when that is less.
    expect(bound(start + 700n, start + 800n)).toEqual(start + 800n);
  });

  it.each([0n, 5_000n])('bounds a final lookup by one block as well, from start %s', start => {
    const bound = (cursorCount: bigint, localSyncedCount: bigint) =>
      getEndpointUpperBound({ cursorCount, localSyncedCount, checkpointStartCount: start, isFinalBlock: true, caps });

    expect(bound(start + 700n, start + 1_300n)).toEqual(start + 956n);
    expect(bound(start + 768n, start + 1_300n)).toEqual(start + 1024n);
    expect(bound(start + 700n, start + 800n)).toEqual(start + 800n);
  });
});
