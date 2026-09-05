import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type InboxBucket, updateInboxRollingHash } from '@aztec/stdlib/messaging';

import { InboxMessageRangeNotSyncedError } from '../errors.js';
import { MockL1ToL2MessageSource } from './mock_l1_to_l2_message_source.js';

/** A single-message bucket at the start of the Inbox; only its total matters to the leaf index. */
const singleMessageBucket: InboxBucket = {
  seq: 1n,
  inboxRollingHash: Fr.ZERO,
  totalMsgCount: 1n,
  timestamp: 1n,
  msgCount: 1,
  lastMessageIndex: 0n,
  l1BlockNumber: 1n,
  l1BlockHash: Buffer32.ZERO,
};

describe('MockL1ToL2MessageSource', () => {
  let source: MockL1ToL2MessageSource;

  beforeEach(() => {
    source = new MockL1ToL2MessageSource(0);
  });

  it('derives positions from the indexed leaves', async () => {
    const leaves = [new Fr(11), new Fr(12), new Fr(13)];
    source.appendL1ToL2Messages(leaves);
    const hashAfterTwo = updateInboxRollingHash(updateInboxRollingHash(Fr.ZERO, leaves[0]), leaves[1]);

    expect(await source.getMessagePosition(0n)).toEqual({ totalMessageCount: 0n, rollingHash: Fr.ZERO });
    expect(await source.getMessagePosition(2n)).toEqual({ totalMessageCount: 2n, rollingHash: hashAfterTwo });
    expect(await source.getMessagePosition(4n)).toBeUndefined();
    expect((await source.getSyncedMessagePosition()).totalMessageCount).toEqual(3n);
    expect(await source.getL1ToL2MessageRange(1n, 2n)).toEqual({
      messages: [leaves[1]],
      start: { totalMessageCount: 1n, rollingHash: updateInboxRollingHash(Fr.ZERO, leaves[0]) },
      end: { totalMessageCount: 2n, rollingHash: hashAfterTwo },
    });
  });

  it('rejects ranges past the mocked tip with the archiver error, empty ones included', async () => {
    await expect(source.getL1ToL2MessagesBetweenLeafCounts(7n, 7n)).rejects.toThrow(InboxMessageRangeNotSyncedError);
    await expect(source.getL1ToL2MessageRange(7n, 7n)).rejects.toThrow(InboxMessageRangeNotSyncedError);
    await expect(source.getL1ToL2MessageRange(0n, 1n)).rejects.toThrow(InboxMessageRangeNotSyncedError);
    await expect(source.getL1ToL2MessageRange(2n, 1n)).rejects.toThrow(/Invalid Inbox leaf count range/);
    expect(await source.getL1ToL2MessagesBetweenLeafCounts(0n, 0n)).toEqual([]);
  });

  it('reads the leaves and the ending hash of a range from the same version of the log', async () => {
    source.setInboxBucket(singleMessageBucket, [new Fr(11)]);

    // Replace the leaf while the read is pending: the result must describe one version, not a mix of both.
    const pending = source.getL1ToL2MessageRange(0n, 1n);
    source.setInboxBucket(singleMessageBucket, [new Fr(22)]);

    const range = await pending;
    expect(range.messages).toEqual([new Fr(11)]);
    expect(range.end.rollingHash).toEqual(updateInboxRollingHash(Fr.ZERO, new Fr(11)));
  });
});
