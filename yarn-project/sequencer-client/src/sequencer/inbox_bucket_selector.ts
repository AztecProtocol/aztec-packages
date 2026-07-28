import type { Fr } from '@aztec/foundation/curves/bn254';
import type { InboxBucket, L1ToL2MessageSource } from '@aztec/stdlib/messaging';

/** The subset of the archiver's Inbox-bucket queries the selector needs. */
export type InboxBucketSource = Pick<
  L1ToL2MessageSource,
  'getInboxBucket' | 'getLatestInboxBucketAtOrBefore' | 'getL1ToL2MessagesBetweenBuckets'
>;

/**
 * The last-consumed Inbox bucket a block streams from. Only the sequence number and cumulative message count are
 * needed: the sequence number bounds the derived bundle, and the count is the per-block/per-checkpoint cap origin.
 * At a checkpoint's first block this is the parent checkpoint's last-consumed bucket; the genesis base case is
 * `{ seq: 0, totalMsgCount: 0 }` (bundles derive from the start of the Inbox).
 */
export type ConsumedBucketCursor = Pick<InboxBucket, 'seq' | 'totalMsgCount'>;

/** Inputs to a single block's streaming Inbox-bucket selection. */
export type SelectInboxBucketInput = {
  /** Archiver Inbox-bucket queries. */
  messageSource: InboxBucketSource;
  /** Wall-clock time of this sub-slot, in seconds; the lag-eligibility anchor. */
  now: bigint;
  /** Minimum bucket age in seconds (`INBOX_LAG_SECONDS`) for a bucket to be lag-eligible this sub-slot. */
  lagSeconds: bigint;
  /** The last bucket consumed by this checkpoint so far (parent checkpoint's at the first block). */
  parent: ConsumedBucketCursor;
  /** Cumulative Inbox message count consumed as of the parent checkpoint; the per-checkpoint cap origin. */
  checkpointStartTotalMsgCount: bigint;
  /** Maximum number of messages this block may consume. */
  perBlockCap: number;
  /** Maximum number of messages the checkpoint may consume in total. */
  perCheckpointCap: number;
  /** True on the checkpoint's final block, where the censorship cutoff becomes a consumption floor. */
  isLastBlock: boolean;
  /**
   * Censorship cutoff timestamp, `toTimestamp(slot - 1) - lagSeconds` (mirrors `ProposeLib.validateInboxConsumption`).
   * Buckets opened at or before it are mandatory to consume by the checkpoint's last block.
   */
  cutoffTimestamp: bigint;
};

/** Result of a block's streaming Inbox-bucket selection. */
export type InboxBucketSelection =
  | {
      /** The block consumes messages, advancing to `bucket`. */
      consume: true;
      /** The newest bucket this block consumes through. */
      bucket: InboxBucket;
      /** The message leaves consumed this block, in insertion order (may be empty for an empty bucket). */
      bundle: Fr[];
    }
  | {
      /** The block consumes nothing; it reuses the parent bucket reference. */
      consume: false;
    };

/**
 * Selects the newest Inbox bucket a block streams from, mirroring the L1 consumption predicate in
 * `ProposeLib.validateInboxConsumption`. The policy, per block:
 *
 * 1. Pick the newest lag-eligible bucket: the newest bucket opened at or before `now - lagSeconds`. On the
 *    checkpoint's last block, also consider the cutoff bucket (newest opened at or before `cutoffTimestamp`) and take
 *    whichever is newer, so the checkpoint reaches the censorship floor even if the sub-slot lag preferred less.
 * 2. If nothing is newer than the parent bucket, consume nothing.
 * 3. Otherwise walk back from the candidate to the newest bucket whose consumption fits both the per-block cap
 *    (`bucket.totalMsgCount - parent.totalMsgCount`) and the per-checkpoint cap
 *    (`bucket.totalMsgCount - checkpointStartTotalMsgCount`). If even the first bucket past the parent overshoots the
 *    per-checkpoint cap, consume nothing — the L1 cap-escape (`ProposeLib` allows leaving a bucket unconsumed when
 *    consuming through it would exceed the per-checkpoint cap).
 *
 * The `<=` comparisons make a bucket exactly `lagSeconds` old lag-eligible and a bucket exactly at the cutoff
 * mandatory, matching the strict `>` "past cutoff" test on L1 (`next.timestamp > cutoff` leaves it optional).
 *
 * A single bucket never exceeds the per-block cap by construction (the Inbox bucket size is at most the per-block cap),
 * so per-block walk-back always lands on at least one bucket; only the per-checkpoint cap can force consuming nothing.
 */
export async function selectInboxBucketForBlock(input: SelectInboxBucketInput): Promise<InboxBucketSelection> {
  const {
    messageSource,
    now,
    lagSeconds,
    parent,
    checkpointStartTotalMsgCount,
    perBlockCap,
    perCheckpointCap,
    isLastBlock,
    cutoffTimestamp,
  } = input;

  let candidate = await messageSource.getLatestInboxBucketAtOrBefore(now - lagSeconds);

  if (isLastBlock) {
    const cutoffBucket = await messageSource.getLatestInboxBucketAtOrBefore(cutoffTimestamp);
    if (cutoffBucket !== undefined && (candidate === undefined || cutoffBucket.seq > candidate.seq)) {
      candidate = cutoffBucket;
    }
  }

  if (candidate === undefined || candidate.seq <= parent.seq) {
    return { consume: false };
  }

  const perBlockCapBig = BigInt(perBlockCap);
  const perCheckpointCapBig = BigInt(perCheckpointCap);

  let selected: InboxBucket | undefined = candidate;
  while (selected !== undefined && selected.seq > parent.seq) {
    const blockCount = selected.totalMsgCount - parent.totalMsgCount;
    const checkpointCount = selected.totalMsgCount - checkpointStartTotalMsgCount;
    if (blockCount <= perBlockCapBig && checkpointCount <= perCheckpointCapBig) {
      const bundle = await messageSource.getL1ToL2MessagesBetweenBuckets(parent.seq, selected.seq);
      return { consume: true, bucket: selected, bundle };
    }
    if (selected.seq - 1n <= parent.seq) {
      break;
    }
    selected = await messageSource.getInboxBucket(selected.seq - 1n);
  }

  return { consume: false };
}
