import type { InboxContract } from '@aztec/ethereum/contracts';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type MockStreamingInbox, mockStreamingInbox } from '../test/utils.js';
import { resolveCompletionTarget } from './inbox_message_selection.js';

describe('resolveCompletionTarget', () => {
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

    const resolved = await resolveCompletionTarget({
      inbox,
      messageSource,
      cursor: streamingInbox.positionAt(2n),
      upperBound: 8n,
    });

    expect(resolved).toEqual(
      expect.objectContaining({ ok: true, bucketSeq: 2n, target: streamingInbox.positionAt(7n) }),
    );
    expect(resolved.ok && resolved.range.messages).toEqual(leaves(10).slice(2, 7));
  });

  it('reports no live endpoint when no bucket ends at or below the upper bound', async () => {
    streamingInbox.set(leaves(10), [7n, 10n]);

    const resolved = await resolveCompletionTarget({
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

    const resolved = await resolveCompletionTarget({
      inbox,
      messageSource,
      cursor: streamingInbox.positionAt(2n),
      upperBound: 8n,
    });

    expect(resolved).toEqual({ ok: false, reason: 'no_live_endpoint', upperBound: 8n });
  });

  it('reports the endpoint as unavailable locally when the archiver has not synced up to it', async () => {
    streamingInbox.set(leaves(5), [7n]);

    const resolved = await resolveCompletionTarget({
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

    const resolved = await resolveCompletionTarget({ inbox, messageSource, cursor, upperBound: 8n });

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

    const resolved = await resolveCompletionTarget({
      inbox,
      messageSource,
      cursor: streamingInbox.positionAt(2n),
      upperBound: 8n,
    });

    expect(resolved).toEqual({ ok: false, reason: 'endpoint_hash_mismatch', upperBound: 8n, endpointTotal: 7n });
  });
});
