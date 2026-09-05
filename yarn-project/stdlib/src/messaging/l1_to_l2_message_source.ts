import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import type { L2Tips } from '../block/l2_block_source.js';
import type { InboxBucket } from './inbox_bucket.js';

/**
 * A position in the ordered Inbox message sequence: the number of messages up to it, which is also the compact index
 * of the next message, and the consensus rolling hash over exactly those messages. Position zero has a zero hash.
 * Block headers commit to the count (the L1-to-L2 tree leaf count) and checkpoint headers to the hash, so a position
 * identifies a message prefix independently of how L1 partitioned the messages into buckets.
 */
export type InboxMessagePosition = {
  /** Number of messages in the sequence up to this position. */
  totalMessageCount: bigint;
  /** Consensus rolling hash (truncated sha256 chain) over the messages up to this position; zero at position zero. */
  rollingHash: Fr;
};

export const InboxMessagePositionSchema = z.object({
  totalMessageCount: schemas.BigInt,
  rollingHash: Fr.schema,
}) satisfies z.ZodType<InboxMessagePosition>;

/**
 * The messages in a compact count range together with the positions the range starts and ends at, all read from one
 * snapshot of the source, so `end.rollingHash` authenticates exactly `messages` appended after `start`.
 */
export type InboxMessageRange = {
  /** The message leaves in the range, in insertion order. */
  messages: Fr[];
  /** The position the range starts at, inclusive. */
  start: InboxMessagePosition;
  /** The position the range ends at, exclusive; equal to `start` for an empty range. */
  end: InboxMessagePosition;
};

export const InboxMessageRangeSchema = z.object({
  messages: z.array(schemas.Fr),
  start: InboxMessagePositionSchema,
  end: InboxMessagePositionSchema,
}) satisfies z.ZodType<InboxMessageRange>;

/**
 * Interface of classes allowing for the retrieval of L1 to L2 messages.
 */
export interface L1ToL2MessageSource {
  /**
   * Gets the L1 to L2 message index in the L1 to L2 message tree.
   * @param l1ToL2Message - The L1 to L2 message.
   * @returns The index of the L1 to L2 message in the L1 to L2 message tree (undefined if not found).
   */
  getL1ToL2MessageIndex(l1ToL2Message: Fr): Promise<bigint | undefined>;

  /**
   * Returns the latest Inbox bucket opened at or before the given L1 timestamp, or undefined if no such bucket
   * exists (i.e., every synced bucket was opened strictly after the timestamp). Used by the sequencer/validator
   * to resolve the censorship cutoff and message-lag boundaries.
   * @param timestamp - The L1 timestamp (in seconds) to look up at-or-before.
   */
  getLatestInboxBucketAtOrBefore(timestamp: bigint): Promise<InboxBucket | undefined>;

  /**
   * Returns the Inbox bucket with the given sequence number, or undefined if it has not been synced. Validators use
   * this to resolve the bucket a proposal references and check its rolling hash.
   * @param seq - The bucket sequence number.
   */
  getInboxBucket(seq: bigint): Promise<InboxBucket | undefined>;

  /**
   * Returns the Inbox bucket whose cumulative message total equals `totalMsgCount`, or undefined if no synced bucket
   * sits on that boundary. A block's or checkpoint's L1-to-L2 tree leaf count equals the cumulative total of the last
   * bucket it consumed (messages are indexed compactly, with no padding), so validators use this to resolve the
   * bucket a block consumed through from the block's leaf count, without trusting a wire hint. `totalMsgCount === 0`
   * resolves the genesis sentinel bucket (sequence 0); a total that does not land on a bucket boundary returns
   * undefined.
   * @param totalMsgCount - The cumulative Inbox message count (leaf count) to resolve to a bucket boundary.
   */
  getInboxBucketByTotalMsgCount(totalMsgCount: bigint): Promise<InboxBucket | undefined>;

  /**
   * Returns the message leaves absorbed into buckets in the range `(fromExclusive, toInclusive]`, in insertion
   * order, for streaming message-bundle derivation. Both bounds must name buckets the source
   * has synced; it throws otherwise, so that an empty result means the range holds no messages instead of hiding an
   * unsynced bound. Callers that can tolerate an unsynced source resolve both bounds first, or map the failure to
   * their own catch-up handling.
   * @param fromExclusive - The lower bucket sequence bound, exclusive (0 means from the start of the Inbox).
   * @param toInclusive - The upper bucket sequence bound, inclusive.
   */
  getL1ToL2MessagesBetweenBuckets(fromExclusive: bigint, toInclusive: bigint): Promise<Fr[]>;

  /**
   * Returns the message leaves in the cumulative Inbox message-count range `[startLeafCount, endLeafCount)`, in
   * insertion order. The bounds are compact L1-to-L2 tree leaf counts, which every block header carries, so a
   * consumer can ask for the messages a block or checkpoint consumed without resolving Inbox buckets itself.
   *
   * The bounds address canonical compact message indices and need not land on a boundary of the bucket partition the
   * source currently holds, so a published block's committed leaf counts stay resolvable after an L1 reorg has merged
   * the bucket that ended at one of them. An invalid range, one past the synced tip, or one the source cannot serve
   * whole throws, so an empty result always means the range holds no messages.
   * @param startLeafCount - The cumulative Inbox message count the range starts at, inclusive.
   * @param endLeafCount - The cumulative Inbox message count the range ends at, exclusive.
   */
  getL1ToL2MessagesBetweenLeafCounts(startLeafCount: bigint, endLeafCount: bigint): Promise<Fr[]>;

  /**
   * Returns the position of the Inbox message sequence after `totalMessageCount` messages: that count and the rolling
   * hash over them. Position zero always resolves, with a zero hash; a count past the synced tip returns undefined,
   * and a negative one throws.
   * @param totalMessageCount - The cumulative Inbox message count (leaf count) whose position to resolve.
   */
  getMessagePosition(totalMessageCount: bigint): Promise<InboxMessagePosition | undefined>;

  /** Returns the position at the source's synced tip: how many messages it holds and the rolling hash over them. */
  getSyncedMessagePosition(): Promise<InboxMessagePosition>;

  /**
   * Returns the messages in the cumulative Inbox message-count range `[startLeafCount, endLeafCount)` together with
   * the positions at both bounds, all read from one snapshot of the source, so the ending hash authenticates exactly
   * the returned messages and cannot describe a different version of the sequence than they do. An empty range is
   * valid and returns equal positions. The range contract is that of `getL1ToL2MessagesBetweenLeafCounts`: an
   * invalid range, or one the source cannot serve whole (including its starting position), throws rather than
   * returning a partial or empty result.
   * @param startLeafCount - The cumulative Inbox message count the range starts at, inclusive.
   * @param endLeafCount - The cumulative Inbox message count the range ends at, exclusive.
   */
  getL1ToL2MessageRange(startLeafCount: bigint, endLeafCount: bigint): Promise<InboxMessageRange>;

  /**
   * Returns the tips of the L2 chain.
   */
  getL2Tips(): Promise<L2Tips>;
}
