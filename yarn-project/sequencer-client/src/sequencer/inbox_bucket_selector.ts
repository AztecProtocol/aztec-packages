import type { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type InboxBucket, type L1ToL2MessageSource, isInboxConsumptionSufficient } from '@aztec/stdlib/messaging';

import type { InboxBucketEligibility } from './inbox_bucket_eligibility.js';

/**
 * How many distinct L1 blocks back from the archiver's head the eligibility walk looks before falling back. The bound
 * counts L1 blocks rather than buckets because eligibility is a property of the opening block: a busy L1 block that
 * rolls the Inbox over several times yields many buckets that all resolve from a single L1 read, and bounding by
 * buckets would let one such block hide every older, already-confirmed bucket behind it.
 */
const MAX_ELIGIBILITY_WALK_L1_BLOCKS = 8;

const log: Logger = createLogger('sequencer:inbox-bucket-selector');

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
  /** Wall-clock time of this sub-slot, in seconds; the anchor eligibility is evaluated at. */
  now: bigint;
  /**
   * Whether a bucket may be consumed in this sub-slot. The live sequencer passes an
   * `InboxBucketConfirmationTracker`, which waits for the bucket's opening L1 block to gain a canonical descendant;
   * automine passes `immediateEligibility`. Eligibility is proposer policy: L1 and validators accept whatever the
   * censorship cutoff and the caps allow, whenever it is proposed.
   */
  isEligible: InboxBucketEligibility;
  /**
   * Ethereum slot duration in seconds. Only used to pick the fallback bucket when the eligibility walk hits its
   * bound: a bucket opened at or before `now - 2 * ethereumSlotDuration` can be decided outright, without waiting
   * for a descendant to appear.
   */
  ethereumSlotDuration: number;
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
   * Censorship cutoff timestamp from `getInboxCutoffTimestamp` (mirrors `ProposeLib.validateInboxConsumption`).
   * Buckets opened at or before it are mandatory to consume by the checkpoint's last block.
   */
  cutoffTimestamp: bigint;
};

/** Whether and through which bucket a block consumes. */
type InboxBucketConsumption =
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

/** Result of a block's streaming Inbox-bucket selection. */
export type InboxBucketSelection = InboxBucketConsumption & {
  /**
   * Set on the checkpoint's final block when the selected position still leaves a mandatory bucket unconsumed, so no
   * checkpoint ending on this block can satisfy the censorship floor. The consumption fields still describe the best
   * reachable prefix, but proposing it would produce a checkpoint every honest validator refuses to attest and that
   * L1 `propose` would revert, so the caller is expected to abandon the checkpoint rather than build on it.
   */
  insufficientFinalBlockCapacity?: true;
};

/**
 * Selects the newest Inbox bucket a block streams from, mirroring the L1 consumption predicate in
 * `ProposeLib.validateInboxConsumption`. The policy, per block:
 *
 * 1. Pick the newest eligible bucket per the caller's eligibility rule (descendant-confirmed for the live sequencer,
 *    immediate for automine), walking back from the archiver's head bucket and stopping at the first eligible one.
 *    The walk spans a bounded number of distinct opening L1 blocks, past which it jumps straight to the newest bucket
 *    old enough to decide without waiting for a descendant. On
 *    the checkpoint's last block, also consider the cutoff bucket (newest opened at or before `cutoffTimestamp`) and
 *    take whichever is newer, so the checkpoint reaches the censorship floor even when eligibility preferred less: a
 *    mandatory bucket is consumed whether or not it is confirmed.
 * 2. If nothing is newer than the parent bucket, consume nothing.
 * 3. Otherwise walk back from the candidate to the newest bucket whose consumption fits both the per-block cap
 *    (`bucket.totalMsgCount - parent.totalMsgCount`) and the per-checkpoint cap
 *    (`bucket.totalMsgCount - checkpointStartTotalMsgCount`). If even the first bucket past the parent overshoots the
 *    per-checkpoint cap, consume nothing — the L1 cap-escape (`ProposeLib` allows leaving a bucket unconsumed when
 *    consuming through it would exceed the per-checkpoint cap).
 * 4. On the last block only, check the resulting position against the censorship floor with the shared
 *    `isInboxConsumptionSufficient` predicate. Because buckets are indivisible, the walk-back in step 3 can be forced
 *    onto a prefix that still leaves a mandatory bucket behind; that is reported as
 *    `insufficientFinalBlockCapacity` rather than passed off as a usable selection.
 *
 * The `<=` comparison on the cutoff makes a bucket exactly at the cutoff mandatory, matching the strict `>` "past
 * cutoff" test on L1 (`next.timestamp > cutoff` leaves it optional).
 *
 * A single bucket never exceeds the per-block cap by construction (the Inbox bucket size is at most the per-block cap),
 * so per-block walk-back always lands on at least one bucket; only the per-checkpoint cap can force consuming nothing.
 */
export async function selectInboxBucketForBlock(input: SelectInboxBucketInput): Promise<InboxBucketSelection> {
  const consumption = await selectConsumption(input);
  if (!input.isLastBlock) {
    return consumption;
  }

  const { messageSource, parent, checkpointStartTotalMsgCount, perCheckpointCap, cutoffTimestamp } = input;
  const finalSeq = consumption.consume ? consumption.bucket.seq : parent.seq;
  const nextBucket = await messageSource.getInboxBucket(finalSeq + 1n);
  const sufficient = isInboxConsumptionSufficient({
    nextBucket,
    cutoffTimestamp,
    checkpointStartTotalMsgCount,
    perCheckpointCap,
  });
  return sufficient ? consumption : { ...consumption, insufficientFinalBlockCapacity: true };
}

/** Steps 1 to 3 of {@link selectInboxBucketForBlock}: the cap-bounded walk back from the newest eligible bucket. */
async function selectConsumption(input: SelectInboxBucketInput): Promise<InboxBucketConsumption> {
  const {
    messageSource,
    parent,
    checkpointStartTotalMsgCount,
    perBlockCap,
    perCheckpointCap,
    isLastBlock,
    cutoffTimestamp,
  } = input;

  let candidate = await selectEligibleBucket(input);

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

/** Identity of the L1 block a bucket was opened in; buckets sharing it also share their eligibility answer. */
const openingL1Block = (bucket: InboxBucket) => `${bucket.l1BlockNumber}:${bucket.l1BlockHash.toString()}`;

/**
 * Step 1 of {@link selectInboxBucketForBlock}: the newest bucket the caller's eligibility rule admits, found by
 * walking back from the archiver's head bucket. The walk is bounded by {@link MAX_ELIGIBILITY_WALK_L1_BLOCKS} distinct
 * opening L1 blocks; hitting the bound means the whole visible tail is unconfirmed, which on a healthy chain does not
 * happen, and the walk then falls back to the newest bucket old enough to be decided outright
 * ({@link selectSettledBucket}) rather than consuming nothing.
 */
async function selectEligibleBucket(input: SelectInboxBucketInput): Promise<InboxBucket | undefined> {
  const { messageSource, now, isEligible, parent } = input;

  const walkedL1Blocks = new Set<string>();
  let candidate = await messageSource.getLatestInboxBucketAtOrBefore(now);
  while (candidate !== undefined && candidate.seq > parent.seq) {
    walkedL1Blocks.add(openingL1Block(candidate));
    if (walkedL1Blocks.size > MAX_ELIGIBILITY_WALK_L1_BLOCKS) {
      const settled = await selectSettledBucket(input);
      log.warn(
        `No eligible Inbox bucket within ${MAX_ELIGIBILITY_WALK_L1_BLOCKS} L1 blocks of the head bucket; ` +
          (settled === undefined ? 'consuming nothing' : `falling back to bucket ${settled.seq}`),
        { headBucketSeq: candidate.seq, parentBucketSeq: parent.seq, fallbackBucketSeq: settled?.seq, now },
      );
      return settled;
    }
    if (await isEligible(candidate, now)) {
      return candidate;
    }
    candidate = await messageSource.getInboxBucket(candidate.seq - 1n);
  }
  return candidate;
}

/**
 * The newest bucket whose opening L1 block is old enough that eligibility no longer depends on a descendant showing
 * up: past `now - 2 * ethereumSlotDuration` the descendant-confirmed rule decides from the opening block alone, so
 * one read settles it. Used only when the eligibility walk gives up, so a long tail of unconfirmed buckets still
 * lets a checkpoint consume the messages behind it.
 */
async function selectSettledBucket(input: SelectInboxBucketInput): Promise<InboxBucket | undefined> {
  const { messageSource, now, isEligible, parent, ethereumSlotDuration } = input;

  const settledBy = now - 2n * BigInt(ethereumSlotDuration);
  const settled = await messageSource.getLatestInboxBucketAtOrBefore(settledBy);
  if (settled === undefined || settled.seq <= parent.seq) {
    return undefined;
  }
  return (await isEligible(settled, now)) ? settled : undefined;
}
